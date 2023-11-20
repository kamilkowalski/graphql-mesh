import {
  buildASTSchema,
  buildSchema,
  isSchema,
  type DocumentNode,
  type GraphQLSchema,
} from 'graphql';
import {
  createYoga,
  FetchAPI,
  YogaLogger,
  YogaServerInstance,
  YogaServerOptions,
  type BatchingOptions,
  type Plugin,
} from 'graphql-yoga';
import type { GraphiQLOptionsOrFactory } from 'graphql-yoga/typings/plugins/use-graphiql';
import { useSupergraph, type SupergraphPlugin } from '@graphql-mesh/fusion-runtime';
// eslint-disable-next-line import/no-extraneous-dependencies
import { Logger } from '@graphql-mesh/types';
// eslint-disable-next-line import/no-extraneous-dependencies
import { DefaultLogger, getHeadersObj } from '@graphql-mesh/utils';
import { getStitchedSchemaFromSupergraphSdl } from '@graphql-tools/federation';
import { getDocumentNodeFromSchema } from '@graphql-tools/utils';
import { isPromise } from '@whatwg-node/server';
import type { CORSPluginOptions } from '@whatwg-node/server/typings/plugins/useCors';

export type MeshHTTPPlugin<TServerContext> = Plugin<TServerContext> & SupergraphPlugin;

export interface MeshHTTPHandlerConfiguration<TServerContext> {
  /**
   * Path to the Supergraph Schema
   */
  supergraph?:
    | string
    | DocumentNode
    | GraphQLSchema
    | (() => Promise<string | DocumentNode | GraphQLSchema>);
  /**
   * Supergraph spec
   *
   * @default 'fusion'
   */
  spec?: 'federation' | 'fusion';
  /**
   * Headers to be sent to the Supergraph Schema endpoint
   */
  schemaHeaders?: Record<string, string>;
  /**
   * Polling interval in milliseconds
   */
  polling?: number;
  /**
   * Plugins
   */
  plugins?: MeshHTTPPlugin<TServerContext>[];
  /**
   * Configuration for CORS
   */
  cors?: CORSPluginOptions<TServerContext>;
  /**
   * Show GraphiQL
   */
  graphiql?: GraphiQLOptionsOrFactory<TServerContext>;
  /**
   *  Enable and define a limit for [Request Batching](https://github.com/graphql/graphql-over-http/blob/main/rfcs/Batching.md)
   */
  batching?: BatchingOptions;
  /**
   * Imported handlers
   */
  handlers?: Record<string, any> | ((handlerName: string) => Promise<any> | any);
  /**
   * WHATWG compatible Fetch implementation
   */
  fetchAPI?: FetchAPI;
  /**
   * Logger
   */
  logging?: YogaServerOptions<TServerContext, {}>['logging'] | Logger;
}

export function createMeshHTTPHandler<TServerContext>(
  config: MeshHTTPHandlerConfiguration<TServerContext>,
): YogaServerInstance<TServerContext, {}> & { invalidateSupergraph(): void } {
  let handlerImportFn: (handlerName: string) => Promise<any> | any;
  if (config.handlers != null) {
    if (typeof config.handlers === 'function') {
      handlerImportFn = config.handlers as any;
    } else {
      handlerImportFn = (handlerName: string) => (config.handlers as any)[handlerName];
    }
  } else {
    handlerImportFn = defaultHandlerImport;
  }

  let fetchAPI: FetchAPI = config.fetchAPI;
  // eslint-disable-next-line prefer-const
  let logger: YogaLogger;

  function defaultHandlerImport(handlerName: string) {
    const omnigraphPackageName = `@omnigraph/${handlerName}`;
    logger.info(`Loading ${omnigraphPackageName}`);
    return import(omnigraphPackageName);
  }

  const supergraphSpec = config.spec || 'fusion';

  let supergraphYogaPlugin: Plugin<TServerContext> & { invalidateSupergraph: () => void };

  if (supergraphSpec === 'fusion') {
    supergraphYogaPlugin = useSupergraph({
      getSupergraph() {
        if (typeof config.supergraph === 'function') {
          return config.supergraph();
        }
        if (isSchema(config.supergraph)) {
          return config.supergraph;
        }
        if (typeof config.supergraph === 'string') {
          let url = config.supergraph;
          if (url.startsWith('.')) {
            url = `file:///${url}`;
          }
          yoga.logger.info(`Fetching Supergraph from ${url}`);
          return fetchAPI
            .fetch(config.supergraph, {
              headers: config.schemaHeaders,
            })
            .then(res => res.text())
            .then(schemaString =>
              buildSchema(schemaString, {
                assumeValid: true,
                assumeValidSDL: true,
                noLocation: true,
              }),
            );
        }
        return buildASTSchema(config.supergraph, {
          assumeValid: true,
          assumeValidSDL: true,
        });
      },
      getExecutorFromHandler(handlerName, handlerOptions, getSubgraph) {
        function handleImportResult(importRes: any) {
          const getSubgraphExecutor = importRes.getSubgraphExecutor;
          if (!getSubgraphExecutor) {
            logger.error(`getSubgraphExecutor is not exported from the handler: ${handlerName}`);
            throw new Error(`getSubgraphExecutor is not exported from the handler: ${handlerName}`);
          }
          return getSubgraphExecutor({
            getSubgraph,
            options: handlerOptions,
          });
        }
        const importRes$ = handlerImportFn(handlerName);
        if (isPromise(importRes$)) {
          return importRes$.then(handleImportResult);
        }
        return handleImportResult(importRes$);
      },
      polling: config.polling,
    });
  } else if (supergraphSpec === 'federation') {
    let supergraph: GraphQLSchema;
    // eslint-disable-next-line no-inner-declarations
    function getAndSetSupergraph(): Promise<void> | void {
      function handleSupergraphInput(supergraphSdl: DocumentNode | string | GraphQLSchema) {
        supergraph = getStitchedSchemaFromSupergraphSdl({
          supergraphSdl: isSchema(supergraphSdl)
            ? getDocumentNodeFromSchema(supergraphSdl)
            : supergraphSdl,
        });
      }
      if (typeof config.supergraph === 'function') {
        const supergraph$ = config.supergraph();
        if (isPromise(supergraph$)) {
          return supergraph$.then(handleSupergraphInput);
        }
        return handleSupergraphInput(supergraph$);
      }
      if (isPromise(config.supergraph)) {
        return config.supergraph.then(handleSupergraphInput);
      }

      return handleSupergraphInput(config.supergraph);
    }
    let initialSupergraph$: Promise<void> | void;
    supergraphYogaPlugin = {
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
      invalidateSupergraph() {
        return getAndSetSupergraph();
      },
    };
  }

  const yoga = createYoga<TServerContext>({
    fetchAPI: config.fetchAPI,
    logging: config.logging == null ? new DefaultLogger() : config.logging,
    plugins: [...(config.plugins || []), supergraphYogaPlugin],
    context({ request, req, connectionParams }: any) {
      // Maybe Node-like environment
      if (req?.headers) {
        return {
          fetch: fetchAPI.fetch,
          logger,
          headers: getHeadersObj(req.headers),
          connectionParams,
        };
      }
      // Fetch environment
      if (request?.headers) {
        return {
          fetch: fetchAPI.fetch,
          logger,
          headers: getHeadersObj(request.headers),
          connectionParams,
        };
      }
      return {};
    },
    cors: config.cors,
    graphiql: config.graphiql,
    batching: config.batching,
  });

  fetchAPI ||= yoga.fetchAPI;
  logger = yoga.logger;

  Object.defineProperty(yoga, 'invalidateSupergraph', {
    value: supergraphYogaPlugin.invalidateSupergraph,
    configurable: true,
  });

  return yoga as any;
}
