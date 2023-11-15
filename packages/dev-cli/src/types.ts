import { GraphQLSchema } from 'graphql';

export interface MeshDevCLIConfig {
  subgraphs: MeshDevCLISubgraphConfig[];
  transforms?: MeshDevCLITransformConfig[];
  typeDefs?: string[];
}

export interface MeshDevCLISubgraphConfig {
  name: string;
  handler: MeshDevCLIHandlerConfig;
  transforms?: MeshDevCLITransformConfig[];
}

export type MeshDevCLIHandlerConfig = Promise<GraphQLSchema> | GraphQLSchema;

export type MeshDevCLITransformConfig = (input: GraphQLSchema, ...args: any[]) => GraphQLSchema;
