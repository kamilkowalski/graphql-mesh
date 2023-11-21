import { GraphQLSchema } from 'graphql';
import { createDefaultExecutor } from '@graphql-tools/delegate';
import { processDirectives } from './directives.js';
import {
  loadGraphQLSchemaFromJSONSchemas,
  loadNonExecutableGraphQLSchemaFromJSONSchemas,
} from './loadGraphQLSchemaFromJSONSchemas.js';
import { JSONSchemaLoaderOptions } from './types.js';

export default loadGraphQLSchemaFromJSONSchemas;
export * from './loadGraphQLSchemaFromJSONSchemas.js';
export * from './getComposerFromJSONSchema.js';
export * from './getDereferencedJSONSchemaFromOperations.js';
export * from './getGraphQLSchemaFromDereferencedJSONSchema.js';
export * from './types.js';
export { processDirectives } from './directives.js';

export function loadJSONSchemaSubgraph(
  name: string,
  options: JSONSchemaLoaderOptions,
): { name: string; schema$: Promise<GraphQLSchema> } {
  return {
    name,
    schema$: loadNonExecutableGraphQLSchemaFromJSONSchemas(name, options),
  };
}

export interface JSONSchemaTransportEntry {
  kind: 'json-schema';
  location: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
}

export function getSubgraphExecutor(
  options: JSONSchemaTransportEntry,
  getSubgraph: () => GraphQLSchema,
) {
  return createDefaultExecutor(
    processDirectives(getSubgraph(), {
      endpoint: options.location,
      operationHeaders: options.headers,
      queryParams: options.queryParams,
    }),
  );
}
