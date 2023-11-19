import {
  buildASTSchema,
  buildSchema,
  DocumentNode,
  execute,
  ExecutionResult,
  GraphQLSchema,
  introspectionFromSchema,
  isSchema,
} from 'graphql';
import { Plugin } from 'graphql-yoga';
import { executeOperation, extractSubgraphFromSupergraph } from '@graphql-mesh/fusion-execution';
import { ExecutionRequest, Executor, getDirective, isPromise } from '@graphql-tools/utils';

export type ExecutionHandlerEntry = {
  name: string;
  options: Record<string, any>;
};

export function getSubgraphHandlerMapFromSupergraph(supergraph: GraphQLSchema) {
  const queryType = supergraph.getQueryType();
  if (!queryType) {
    throw new Error('Query type is missing');
  }
  const handlerDirectives = getDirective(supergraph, queryType, 'handler');
  const subgraphHandlerMap: Record<string, ExecutionHandlerEntry> = {};
  for (const { name: handlerName, options: handlerOptions, subgraph } of handlerDirectives) {
    subgraphHandlerMap[subgraph] = {
      name: handlerName,
      options: handlerOptions,
    };
  }

  return subgraphHandlerMap;
}

export function getExecutorForSupergraph(
  supergraph: GraphQLSchema,
  getExecutorFromHandler: (
    handlerName: string,
    handlerOptions: any,
    getSubgraph: () => GraphQLSchema,
  ) => Executor | Promise<Executor>,
  plugins?: SupergraphPlugin[],
): Executor {
  const onSubgraphExecuteHooks: OnSubgraphExecuteHook[] = [];
  if (plugins) {
    for (const plugin of plugins) {
      if (plugin.onSubgraphExecute) {
        onSubgraphExecuteHooks.push(plugin.onSubgraphExecute);
      }
    }
  }
  const handlerOptsMap = getSubgraphHandlerMapFromSupergraph(supergraph);
  const executorMap: Record<string, Executor> = {};
  return function supergraphExecutor(execReq: ExecutionRequest) {
    function onSubgraphExecute(subgraphName: string, document: DocumentNode, variables: any) {
      let executor: Executor = executorMap[subgraphName];
      if (executor == null) {
        const handlerOpts = handlerOptsMap[subgraphName];
        // eslint-disable-next-line no-inner-declarations
        function wrapExecutorWithHooks(currentExecutor: Executor) {
          if (onSubgraphExecuteHooks.length) {
            return async function executorWithHooks(subgraphExecReq: ExecutionRequest) {
              const onSubgraphExecuteDoneHooks: OnSubgraphExecuteDoneHook[] = [];
              for (const onSubgraphExecute of onSubgraphExecuteHooks) {
                const onSubgraphExecuteDoneHook = await onSubgraphExecute({
                  supergraph,
                  subgraphName,
                  handlerName: handlerOpts.name,
                  handlerOptions: handlerOpts.options,
                  executionRequest: subgraphExecReq,
                  executor: currentExecutor,
                  setExecutor(newExecutor: Executor) {
                    currentExecutor = newExecutor;
                  },
                });
                if (onSubgraphExecuteDoneHook) {
                  onSubgraphExecuteDoneHooks.push(onSubgraphExecuteDoneHook);
                }
              }
              if (onSubgraphExecuteDoneHooks.length) {
                let currentResult = await currentExecutor(subgraphExecReq);
                for (const onSubgraphExecuteDoneHook of onSubgraphExecuteDoneHooks) {
                  await onSubgraphExecuteDoneHook({
                    result: currentResult as ExecutionResult,
                    setResult(newResult: ExecutionResult) {
                      currentResult = newResult;
                    },
                  });
                }
                return currentResult;
              }
              return currentExecutor(subgraphExecReq);
            };
          }
          return currentExecutor;
        }
        executor = function lazyExecutor(subgraphExecReq: ExecutionRequest) {
          const executor$ = getExecutorFromHandler(handlerOpts.name, handlerOpts.options, () =>
            extractSubgraphFromSupergraph(subgraphName, supergraph),
          );
          if (isPromise(executor$)) {
            return executor$.then(executor_ => {
              executor = wrapExecutorWithHooks(executor_);
              executorMap[subgraphName] = executor;
              return executor(subgraphExecReq);
            });
          }
          executor = wrapExecutorWithHooks(executor$);
          executorMap[subgraphName] = executor;
          return executor(subgraphExecReq);
        };
      }
      return executor({ document, variables });
    }
    const opExecRes$ = executeOperation({
      supergraph,
      onExecute: onSubgraphExecute,
      document: execReq.document,
      operationName: execReq.operationName,
    });
    function handleOpExecResult(opExecRes: { exported: any; outputVariableMap: Map<string, any> }) {
      return {
        data: opExecRes.exported,
      };
    }

    if (isPromise(opExecRes$)) {
      return opExecRes$.then(handleOpExecResult);
    }
    return handleOpExecResult(opExecRes$);
  };
}

export interface YogaSupergraphPluginOptions {
  getSupergraph():
    | GraphQLSchema
    | DocumentNode
    | string
    | Promise<GraphQLSchema | string | DocumentNode>;
  getExecutorFromHandler(
    handlerName: string,
    handlerOptions: any,
    getSubgraph: () => GraphQLSchema,
  ): Executor | Promise<Executor>;
  polling?: number;
}

function ensureSchema(source: GraphQLSchema | DocumentNode | string) {
  if (isSchema(source)) {
    return source;
  }
  if (typeof source === 'string') {
    return buildSchema(source, { noLocation: true, assumeValidSDL: true, assumeValid: true });
  }
  return buildASTSchema(source);
}

function getExecuteFnFromExecutor(executor: Executor): typeof execute {
  return function executeFnFromExecutor({
    document,
    variableValues,
    contextValue,
    rootValue,
    operationName,
  }) {
    return executor({
      document,
      variables: variableValues,
      context: contextValue,
      operationName,
      rootValue,
    }) as Promise<ExecutionResult>;
  };
}

export function useSupergraph(opts: YogaSupergraphPluginOptions): Plugin {
  let supergraph: GraphQLSchema;
  let executeFn: typeof execute;
  let plugins: SupergraphPlugin[];
  function getAndSetSupergraph(): Promise<void> | void {
    const supergraph$ = opts.getSupergraph();
    if (isPromise(supergraph$)) {
      return supergraph$.then(supergraph_ => {
        supergraph = ensureSchema(supergraph_);
        const executor = getExecutorForSupergraph(supergraph, opts.getExecutorFromHandler, plugins);
        executeFn = getExecuteFnFromExecutor(executor);
      });
    } else {
      supergraph = ensureSchema(supergraph$);
      const executor = getExecutorForSupergraph(supergraph, opts.getExecutorFromHandler, plugins);
      executeFn = getExecuteFnFromExecutor(executor);
    }
  }
  if (opts.polling) {
    setInterval(getAndSetSupergraph, opts.polling);
  }

  let initialSupergraph$: Promise<void> | void;

  return {
    onYogaInit({ yoga }) {
      plugins = yoga.getEnveloped._plugins as SupergraphPlugin[];
    },
    onRequestParse() {
      return {
        onRequestParseDone() {
          initialSupergraph$ ||= getAndSetSupergraph();
          return initialSupergraph$;
        },
      };
    },
    onEnveloped({ setSchema }: { setSchema: (schema: GraphQLSchema) => void }) {
      setSchema(supergraph);
    },
    onExecute({ setExecuteFn, args, setResultAndStopExecution }) {
      if (args.operationName === 'IntrospectionQuery') {
        setResultAndStopExecution({
          data: introspectionFromSchema(supergraph) as any,
        });
        return;
      }
      setExecuteFn(executeFn);
    },
  };
}

export interface SupergraphPlugin {
  onSubgraphExecute?: OnSubgraphExecuteHook;
}

export type OnSubgraphExecuteHook = (
  payload: OnSupergraphExecutePayload,
) => Promise<OnSubgraphExecuteDoneHook> | OnSubgraphExecuteDoneHook;

export interface OnSupergraphExecutePayload {
  supergraph: GraphQLSchema;
  subgraphName: string;
  handlerName: string;
  handlerOptions: any;
  executionRequest: ExecutionRequest;
  executor: Executor;
  setExecutor(executor: Executor): void;
}

export interface OnSubgraphExecuteDonePayload {
  result: ExecutionResult;
  setResult(result: ExecutionResult): void;
}

export type OnSubgraphExecuteDoneHook = (
  payload: OnSubgraphExecuteDonePayload,
) => Promise<void> | void;
