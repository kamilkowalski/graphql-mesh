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
  YogaServerOptions,
  type BatchingOptions,
  type Plugin,
} from 'graphql-yoga';
import type { GraphiQLOptionsOrFactory } from 'graphql-yoga/typings/plugins/use-graphiql';
import { useSupergraph, type SupergraphPlugin } from '@graphql-mesh/fusion-runtime';
import { isPromise } from '@whatwg-node/server';
import type { CORSPluginOptions } from '@whatwg-node/server/typings/plugins/useCors';

export type MeshHTTPPlugin<TServerContext> = Plugin<TServerContext> & SupergraphPlugin;

export interface MeshHTTPHandlerConfiguration<TServerContext> {
  /**
   * Path to the Supergraph Schema
   */
  supergraph:
    | string
    | DocumentNode
    | GraphQLSchema
    | (() => Promise<string | DocumentNode | GraphQLSchema>);
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
  logging?: YogaServerOptions<TServerContext, {}>['logging'];
}

export function createMeshHTTPHandler<TServerContext>(
  config: MeshHTTPHandlerConfiguration<TServerContext>,
) {
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

  const yoga = createYoga<TServerContext>({
    fetchAPI: config.fetchAPI,
    logging: config.logging,
    plugins: [
      ...(config.plugins || []),
      useSupergraph({
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
              throw new Error(
                `getSubgraphExecutor is not exported from the handler: ${handlerName}`,
              );
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
      }),
    ],
    cors: config.cors,
    graphiql: config.graphiql,
    batching: config.batching,
  });

  fetchAPI ||= yoga.fetchAPI;
  logger = yoga.logger;

  return yoga;
}
