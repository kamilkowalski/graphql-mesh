import { GraphQLSchema } from 'graphql';

export interface MeshDevCLIConfig {
  subgraphs: MeshDevCLISubgraphConfig[];
  transforms?: MeshDevCLITransformConfig[];
  typeDefs?: string[];
}

export interface MeshDevCLISubgraphConfig {
  sourceHandler: MeshDevCLISourceHandlerDef;
  transforms?: MeshDevCLITransformConfig[];
}

export type MeshDevCLISourceHandlerDef = {
  name: string;
  schema$: Promise<GraphQLSchema> | GraphQLSchema;
};

export type MeshDevCLITransformConfig = (input: GraphQLSchema, ...args: any[]) => GraphQLSchema;
