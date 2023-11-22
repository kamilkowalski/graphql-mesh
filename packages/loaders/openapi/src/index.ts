import { GraphQLSchema } from 'graphql';
import { ProcessDirectiveArgs } from 'packages/loaders/json-schema/src/directives.js';
import { createDefaultExecutor } from '@graphql-tools/delegate';
import {
  loadNonExecutableGraphQLSchemaFromOpenAPI,
  processDirectives,
} from './loadGraphQLSchemaFromOpenAPI.js';
import { OpenAPILoaderOptions } from './types.js';

export { loadGraphQLSchemaFromOpenAPI as default } from './loadGraphQLSchemaFromOpenAPI.js';
export * from './loadGraphQLSchemaFromOpenAPI.js';
export { getJSONSchemaOptionsFromOpenAPIOptions } from './getJSONSchemaOptionsFromOpenAPIOptions.js';
export { OpenAPILoaderOptions } from './types.js';

export function loadOpenAPISubgraph(
  name: string,
  options: OpenAPILoaderOptions,
): () => { name: string; schema$: Promise<GraphQLSchema> } {
  return () => ({
    name,
    schema$: loadNonExecutableGraphQLSchemaFromOpenAPI(name, options),
  });
}

export interface OpenAPITransportEntry {
  kind: '@omnigraph/openapi';
  location: string;
  headers: Record<string, string>;
  options: ProcessDirectiveArgs;
}

export function getSubgraphExecutor(
  transportEntry: OpenAPITransportEntry,
  getSubgraph: () => GraphQLSchema,
) {
  return createDefaultExecutor(
    processDirectives(getSubgraph(), {
      endpoint: transportEntry.location,
      operationHeaders: transportEntry.headers,
      ...transportEntry.options,
    }),
  );
}
