import type { MeshDevCLIConfig } from '@graphql-mesh/dev-cli';
import { loadThriftSubgraph } from '@omnigraph/thrift';

export const devConfig: MeshDevCLIConfig = {
  subgraphs: [
    {
      sourceHandler: loadThriftSubgraph('calculator', {
        source: './src/thrift/calculator.thrift',
        endpoint: 'http://localhost:9876/thrift',
        serviceName: 'Calculator',
      }),
    },
  ],
};
