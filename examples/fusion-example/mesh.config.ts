import {
  camelCase,
  createFilterTransform,
  createNamingConventionTransform,
  createPrefixTransform,
  loadGraphQLHTTPSubgraph,
  MeshDevCLIConfig,
} from '@graphql-mesh/dev-cli';
/**
 * The configuration to serve the supergraph
 */

import { MeshServeCLIConfig } from '@graphql-mesh/serve-cli';
import { useResponseCache } from '@graphql-yoga/plugin-response-cache';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

/**
 * The configuration to build a supergraph
 */

export const devConfig: MeshDevCLIConfig = {
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('petstore', {
        source: 'https://petstore.swagger.io/v2/swagger.json',
      }),
      transforms: [
        createFilterTransform({
          rootFieldFilter: (typeName, fieldName) =>
            typeName === 'Query' && fieldName === 'getPetById',
        }),
      ],
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('vaccination', {
        endpoint: 'http://localhost:4001/graphql',
      }),
      transforms: [
        createPrefixTransform({
          includeTypes: false,
          includeRootOperations: true,
          value: 'Vaccination_',
        }),
        createNamingConventionTransform({
          fieldNames: camelCase,
        }),
      ],
    },
  ],
};

export const serveConfig: MeshServeCLIConfig = {
  supergraph: './supergraph.graphql',
  graphiql: {
    defaultQuery: /* GraphQL */ `
      query Test {
        getPetById(petId: 1) {
          __typename
          id
          name
          vaccinated
        }
      }
    `,
  },
  plugins: [
    useResponseCache({
      session: () => null,
      includeExtensionMetadata: true,
    }),
  ],
};
