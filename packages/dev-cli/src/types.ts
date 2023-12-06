import { DocumentNode, GraphQLSchema } from 'graphql';
import { fetch as defaultFetch } from '@whatwg-node/fetch';

export interface MeshDevCLIConfig {
  subgraphs: MeshDevCLISubgraphConfig[];
  transforms?: MeshDevCLITransformConfig[];
  additionalTypeDefs?: string | DocumentNode | (string | DocumentNode)[];
  target?: string;
  fetch?: typeof defaultFetch;
  cwd?: string;
}

export interface MeshDevCLISubgraphConfig {
  sourceHandler: MeshDevCLISourceHandlerDef;
  transforms?: MeshDevCLITransformConfig[];
}

export type MeshDevCLISourceHandlerDef = (ctx: LoaderContext) => {
  name: string;
  schema$: Promise<GraphQLSchema> | GraphQLSchema;
};

export type MeshDevCLITransformConfig = (input: GraphQLSchema, ...args: any[]) => GraphQLSchema;

export interface LoaderContext {
  fetch: typeof defaultFetch;
  cwd: string;
}
