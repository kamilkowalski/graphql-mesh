import { DocumentNode, GraphQLSchema } from 'graphql';

export interface MeshDevCLIConfig {
  subgraphs: MeshDevCLISubgraphConfig[];
  transforms?: MeshDevCLITransformConfig[];
  additionalTypeDefs?: string | DocumentNode | (string | DocumentNode)[];
  target?: string;
}

export interface MeshDevCLISubgraphConfig {
  sourceHandler: MeshDevCLISourceHandlerDef;
  transforms?: MeshDevCLITransformConfig[];
}

export type MeshDevCLISourceHandlerDef = () => {
  name: string;
  schema$: Promise<GraphQLSchema> | GraphQLSchema;
};

export type MeshDevCLITransformConfig = (input: GraphQLSchema, ...args: any[]) => GraphQLSchema;
