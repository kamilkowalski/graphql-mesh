import {
  buildASTSchema,
  buildSchema,
  isSchema,
  type DocumentNode,
  type GraphQLSchema,
} from 'graphql';
import { createYoga, FetchAPI, YogaLogger, YogaServerInstance, type Plugin } from 'graphql-yoga';
import { useSupergraph } from '@graphql-mesh/fusion-runtime';
// eslint-disable-next-line import/no-extraneous-dependencies
import { DefaultLogger, getHeadersObj } from '@graphql-mesh/utils';
import { getStitchedSchemaFromSupergraphSdl } from '@graphql-tools/federation';
import { createGraphQLError, getDocumentNodeFromSchema } from '@graphql-tools/utils';
import { isPromise } from '@whatwg-node/server';
import { httpTransport } from './http-transport';
import { MeshHTTPHandlerConfiguration } from './types';

export function createMeshHTTPHandler<TServerContext>(
  config: MeshHTTPHandlerConfiguration<TServerContext>,
): YogaServerInstance<TServerContext, {}> & { invalidateSupergraph(): void } {
  let transportImportFn: (handlerName: string) => Promise<any> | any;
  if (config.transports != null) {
    if (typeof config.transports === 'function') {
      transportImportFn = config.transports as any;
    } else {
      transportImportFn = (handlerName: string) => (config.transports as any)[handlerName];
    }
  } else {
    transportImportFn = defaultTransportImport;
  }

  let fetchAPI: FetchAPI = config.fetchAPI;
  // eslint-disable-next-line prefer-const
  let logger: YogaLogger;

  // TODO: Move these to other packages later

  function defaultTransportImport(handlerName: string) {
    if (handlerName === 'http') {
      return httpTransport;
    }
    if (handlerName === 'rest') {
      const omnigraphPackageName = '@omnigraph/json-schema';
      return import(omnigraphPackageName);
    }
    const omnigraphPackageName = `@omnigraph/${handlerName}`;
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
      getTransportExecutor(transportEntry, getSubgraph) {
        function handleImportResult(importRes: any) {
          const getSubgraphExecutor = importRes.getSubgraphExecutor;
          if (!getSubgraphExecutor) {
            throw createGraphQLError(
              `getSubgraphExecutor is not exported from the transport: ${transportEntry.kind}`,
            );
          }
          return getSubgraphExecutor(transportEntry, getSubgraph);
        }
        logger.info(`Loading ${transportEntry.kind} transport`);
        const importRes$ = transportImportFn(transportEntry.kind);
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
