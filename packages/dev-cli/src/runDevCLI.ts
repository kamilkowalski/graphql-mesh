/* eslint-disable import/no-nodejs-modules */
import { promises as fsPromises } from 'fs';
import { join } from 'path';
import { GraphQLSchema } from 'graphql';
import Spinnies from 'spinnies';
import { composeSubgraphs, SubgraphConfig } from '@graphql-mesh/fusion-composition';
import { loadFiles } from '@graphql-tools/load-files';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import { MeshDevCLIConfig } from './types';

export const spinnies = new Spinnies({
  color: 'white',
  succeedColor: 'white',
  failColor: 'red',
  succeedPrefix: '✔',
  failPrefix: '💥',
  spinner: { interval: 80, frames: ['/', '|', '\\', '--'] },
});

export async function runDevCLI(
  processExit = (exitCode: number) => process.exit(exitCode),
): Promise<void | never> {
  spinnies.add('main', { text: 'Starting Mesh Dev CLI' });
  const meshDevCLIConfigFileName = process.env.MESH_DEV_CONFIG_FILE_NAME || 'mesh.config.ts';
  const meshDevCLIConfigFilePath =
    process.env.MESH_DEV_CONFIG_FILE_PATH || join(process.cwd(), meshDevCLIConfigFileName);
  spinnies.add('config', { text: `Loading Mesh Dev CLI Config from ${meshDevCLIConfigFilePath}` });
  const loadedConfig: { devConfig: MeshDevCLIConfig } = await import(meshDevCLIConfigFilePath);
  const meshDevCLIConfig = loadedConfig.devConfig;
  if (!meshDevCLIConfig) {
    spinnies.fail('config', {
      text: `Mesh Dev CLI Config was not found in ${meshDevCLIConfigFilePath}`,
    });
    return processExit(1);
  }
  spinnies.succeed('config', {
    text: `Loaded Mesh Dev CLI Config from ${meshDevCLIConfigFilePath}`,
  });
  const subgraphConfigsForComposition: SubgraphConfig[] = await Promise.all(
    meshDevCLIConfig.subgraphs.map(async subgraphCLIConfig => {
      const { name: subgraphName, schema$ } = subgraphCLIConfig.sourceHandler();
      spinnies.add(subgraphName, { text: `Loading subgraph` });
      let subgraphSchema: GraphQLSchema;
      try {
        subgraphSchema = await schema$;
      } catch (e) {
        spinnies.fail(subgraphName, {
          text: `Failed to load subgraph ${subgraphName} - ${e.stack}`,
        });
        return processExit(1);
      }
      spinnies.succeed(subgraphName, { text: `Loaded subgraph ${subgraphName}` });
      return {
        name: subgraphName,
        schema: subgraphSchema,
        transforms: subgraphCLIConfig.transforms,
      };
    }),
  );
  spinnies.add('composition', { text: `Composing supergraph` });
  let typeDefs: string[] | undefined;
  if (meshDevCLIConfig.typeDefs?.length) {
    typeDefs = await loadFiles(meshDevCLIConfig.typeDefs);
  }
  let composedSchema = composeSubgraphs(subgraphConfigsForComposition, {
    typeDefs,
  });
  if (meshDevCLIConfig.transforms?.length) {
    spinnies.add('transforms', { text: `Applying transforms` });
    for (const transform of meshDevCLIConfig.transforms) {
      composedSchema = transform(composedSchema);
    }
    spinnies.succeed('transforms', { text: `Applied transforms` });
  }
  spinnies.succeed('composition', { text: `Composed supergraph` });

  spinnies.add('write', { text: `Writing supergraph` });
  const printedSupergraph = printSchemaWithDirectives(composedSchema);

  const supergraphFileName = process.env.MESH_SUPERGRAPH_FILE_NAME || 'supergraph.graphql';
  const supergraphPath =
    process.env.MESH_SUPERGRAPH_PATH || join(process.cwd(), supergraphFileName);
  await fsPromises.writeFile(supergraphPath, printedSupergraph, 'utf8');
  spinnies.succeed('write', { text: `Written supergraph to ${supergraphPath}` });
  spinnies.succeed('main', { text: 'Finished Mesh Dev CLI' });
}
