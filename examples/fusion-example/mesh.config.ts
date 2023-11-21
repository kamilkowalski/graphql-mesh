import type { MeshDevCLIConfig } from '@graphql-mesh/dev-cli';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

export const devConfig: MeshDevCLIConfig = {
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('petstore', {
        source: 'https://petstore.swagger.io/v2/swagger.json',
      }),
    },
    {
      sourceHandler: loadOpenAPISubgraph('vaccination', {
        source: 'http://localhost:4001/openapi.json',
        ignoreErrorResponses: true,
      }),
    },
  ],
};
