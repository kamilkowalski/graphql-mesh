import { DocumentNode, GraphQLSchema } from 'graphql';
import { composeSubgraphs, SubgraphConfig } from '@graphql-mesh/fusion-composition';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { loadTypedefs } from '@graphql-tools/load';
import { fetch as defaultFetch } from '@whatwg-node/fetch';
import { LoaderContext, MeshDevCLIConfig } from './types';

export async function getComposedSchemaFromConfig(
  meshDevCLIConfig: MeshDevCLIConfig,
  spinnies?: Spinnies,
) {
  const ctx: LoaderContext = {
    fetch: meshDevCLIConfig.fetch || defaultFetch,
    cwd: meshDevCLIConfig.cwd || globalThis.process?.cwd?.(),
  };
  const subgraphConfigsForComposition: SubgraphConfig[] = await Promise.all(
    meshDevCLIConfig.subgraphs.map(async subgraphCLIConfig => {
      const { name: subgraphName, schema$ } = subgraphCLIConfig.sourceHandler(ctx);
      spinnies?.add(subgraphName, { text: `Loading subgraph ${subgraphName}` });
      let subgraphSchema: GraphQLSchema;
      try {
        subgraphSchema = await schema$;
      } catch (e) {
        throw new Error(`Failed to load subgraph ${subgraphName} - ${e.stack}`);
      }
      spinnies?.succeed(subgraphName, { text: `Loaded subgraph ${subgraphName}` });
      return {
        name: subgraphName,
        schema: subgraphSchema,
        transforms: subgraphCLIConfig.transforms,
      };
    }),
  );
  spinnies?.add('composition', { text: `Composing supergraph` });
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
    spinnies?.add('transforms', { text: `Applying transforms` });
    for (const transform of meshDevCLIConfig.transforms) {
      composedSchema = transform(composedSchema);
    }
    spinnies?.succeed('transforms', { text: `Applied transforms` });
  }
  spinnies?.succeed('composition', { text: `Composed supergraph` });
  return composedSchema;
}
