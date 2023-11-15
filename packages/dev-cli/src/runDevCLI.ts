/* eslint-disable import/no-nodejs-modules */
import { promises as fsPromises } from 'fs';
import { join } from 'path';
import { GraphQLSchema } from 'graphql';
import Spinnies from 'spinnies';
import { composeSubgraphs, SubgraphConfig } from '@graphql-mesh/fusion-composition';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import { MeshDevCLIConfig } from './types';

export const spinnies = new Spinnies();

export async function runDevCLI() {
  const meshDevCLIConfigFileName = process.env.MESH_DEV_CONFIG_FILE_NAME || 'mesh.dev.config.ts';
  const meshDevCLIConfigFilePath =
    process.env.MESH_DEV_CONFIG_FILE_PATH || join(process.cwd(), meshDevCLIConfigFileName);
  spinnies.add('config', { text: `Loading Mesh Dev CLI Config from ${meshDevCLIConfigFilePath}` });
  const loadedConfig: { config: MeshDevCLIConfig } = await import(meshDevCLIConfigFilePath);
  if (!loadedConfig.config) {
    spinnies.fail('config', {
      text: `Mesh Dev CLI Config was not found in ${meshDevCLIConfigFilePath}`,
    });
    process.exit(1);
  }
  spinnies.succeed('config', {
    text: `Loaded Mesh Dev CLI Config from ${meshDevCLIConfigFilePath}`,
  });
  const meshDevCLIConfig = loadedConfig.config;
  const subgraphConfigsForComposition: SubgraphConfig[] = await Promise.all(
    meshDevCLIConfig.subgraphs.map(async subgraphConfig => {
      spinnies.add(subgraphConfig.name, { text: `Loading subgraph ${subgraphConfig.name}` });
      let subgraphSchema: GraphQLSchema;
      try {
        subgraphSchema = await subgraphConfig.handler;
      } catch (e) {
        spinnies.fail(subgraphConfig.name, {
          text: `Failed to load subgraph ${subgraphConfig.name} - ${e.stack}`,
        });
        process.exit(1);
      }
      spinnies.succeed(subgraphConfig.name, { text: `Loaded subgraph ${subgraphConfig.name}` });
      return {
        name: subgraphConfig.name,
        schema: subgraphSchema,
        transforms: subgraphConfig.transforms,
      };
    }),
  );
  spinnies.add('composition', { text: `Composing supergraph` });
  let composedSchema = composeSubgraphs(subgraphConfigsForComposition);
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
  spinnies.succeed('write', { text: `Wrote supergraph to ${supergraphPath}` });
}
