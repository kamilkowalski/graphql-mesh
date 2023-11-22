import type { MeshDevCLIConfig } from '@graphql-mesh/dev-cli';
import { loadGraphQLHTTPSubgraph } from '@graphql-mesh/dev-cli';
import { MeshServeCLIConfig } from '@graphql-mesh/serve-cli';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

export const devConfig: MeshDevCLIConfig = {
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('petstore', {
        source: 'https://petstore.swagger.io/v2/swagger.json',
      }),
    },
    {
      sourceHandler: loadGraphQLHTTPSubgraph('vaccination', {
        endpoint: 'http://localhost:4001/graphql',
      }),
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
};
