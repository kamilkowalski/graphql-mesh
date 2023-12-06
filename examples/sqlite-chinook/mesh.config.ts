import { MeshDevCLIConfig } from '@graphql-mesh/dev-cli';
import { loadSQLiteSubgraph } from '@omnigraph/sqlite';

export const devConfig: MeshDevCLIConfig = {
  subgraphs: [
    {
      sourceHandler: loadSQLiteSubgraph('chinook', {
        db: './chinook.db',
      }),
    },
  ],
};
