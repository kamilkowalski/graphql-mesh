import type { MeshDevCLIConfig } from '@graphql-mesh/dev-cli';
import { loadOpenAPISubgraph } from '@omnigraph/openapi';

export const config: MeshDevCLIConfig = {
  subgraphs: [
    {
      sourceHandler: loadOpenAPISubgraph('my-openapi', {
        source:
          'https://raw.githubusercontent.com/grokify/api-specs/master/stackexchange/stackexchange-api-v2.2_openapi-v3.0.yaml',
      }),
    },
  ],
};
