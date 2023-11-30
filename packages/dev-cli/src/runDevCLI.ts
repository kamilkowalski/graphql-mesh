/* eslint-disable import/no-nodejs-modules */
import { promises as fsPromises } from 'fs';
import { isAbsolute, join } from 'path';
import { DocumentNode, GraphQLSchema, parse } from 'graphql';
import Spinnies from 'spinnies';
import { composeSubgraphs, SubgraphConfig } from '@graphql-mesh/fusion-composition';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { loadTypedefs } from '@graphql-tools/load';
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
      spinnies.add(subgraphName, { text: `Loading subgraph ${subgraphName}` });
      let subgraphSchema: GraphQLSchema;
      try {
        subgraphSchema = await schema$;
      } catch (e) {
        console.log(`Failed to load subgraph ${subgraphName} - ${e.stack}`);
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
  let additionalTypeDefs: (DocumentNode | string)[] | undefined;
  if (meshDevCLIConfig.additionalTypeDefs != null) {
    const result = await loadTypedefs(meshDevCLIConfig.additionalTypeDefs, {
      noLocation: true,
      assumeValid: true,
      assumeValidSDL: true,
      loaders: [new GraphQLFileLoader()],
    });
    additionalTypeDefs = result.map(r => r.document || r.rawSDL);
  }
  let composedSchema = composeSubgraphs(subgraphConfigsForComposition, {
    typeDefs: additionalTypeDefs,
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

  const supergraphFileName = meshDevCLIConfig.target || './supergraph.graphql';
  const supergraphPath = isAbsolute(supergraphFileName)
    ? join(process.cwd(), supergraphFileName)
    : supergraphFileName;

  let writtenData: string;
  if (supergraphPath.endsWith('.json')) {
    writtenData = JSON.stringify(parse(writtenData, { noLocation: true }), null, 2);
  } else if (
    supergraphPath.endsWith('.graphql') ||
    supergraphPath.endsWith('.gql') ||
    supergraphPath.endsWith('.graphqls') ||
    supergraphPath.endsWith('.gqls')
  ) {
    writtenData = printedSupergraph;
  } else if (
    supergraphPath.endsWith('.ts') ||
    supergraphPath.endsWith('.cts') ||
    supergraphPath.endsWith('.mts') ||
    supergraphPath.endsWith('.js') ||
    supergraphPath.endsWith('.cjs') ||
    supergraphPath.endsWith('.mjs')
  ) {
    writtenData = `export default /* GraphQL */ \`\n${printedSupergraph}\n\``;
  } else {
    console.error(`Unsupported file extension for ${supergraphPath}`);
    return processExit(1);
  }
  await fsPromises.writeFile(supergraphPath, printedSupergraph, 'utf8');
  spinnies.succeed('write', { text: `Written supergraph to ${supergraphPath}` });
  spinnies.succeed('main', { text: 'Finished Mesh Dev CLI' });
}
