import { DocumentNode, GraphQLSchema } from 'graphql';
import { BatchingOptions, FetchAPI, Plugin, YogaServerOptions } from 'graphql-yoga';
import { GraphiQLOptionsOrFactory } from 'graphql-yoga/typings/plugins/use-graphiql';
import { SupergraphPlugin, TransportEntry } from '@graphql-mesh/fusion-runtime';
// eslint-disable-next-line import/no-extraneous-dependencies
import { Logger } from '@graphql-mesh/types';
import { Executor, IResolvers } from '@graphql-tools/utils';
import { CORSPluginOptions } from '@whatwg-node/server';

export type MeshHTTPPlugin<TServerContext, TUserContext> = Plugin<
  {},
  TServerContext,
  TUserContext
> &
  SupergraphPlugin;

export type SupergraphConfig =
  | GraphQLSchema
  | DocumentNode
  | string
  | (() => SupergraphConfig)
  | Promise<SupergraphConfig>;

export interface MeshHTTPHandlerConfiguration<TServerContext, TUserContext> {
  /**
   * Path to the Supergraph Schema
   */
  supergraph?: SupergraphConfig;
  /**
   * Supergraph spec
   *
   * @default 'fusion'
   */
  spec?: 'federation' | 'fusion';
  /**
   * Headers to be sent to the Supergraph Schema endpoint
   */
  schemaHeaders?: Record<string, string>;
  /**
   * Polling interval in milliseconds
   */
  polling?: number;
  /**
   * Plugins
   */
  plugins?: MeshHTTPPlugin<TServerContext, TUserContext>[];
  /**
   * Configuration for CORS
   */
  cors?: CORSPluginOptions<TServerContext>;
  /**
   * Show GraphiQL
   */
  graphiql?: GraphiQLOptionsOrFactory<TServerContext>;
  /**
   *  Enable and define a limit for [Request Batching](https://github.com/graphql/graphql-over-http/blob/main/rfcs/Batching.md)
   */
  batching?: BatchingOptions;
  /**
   * Imported transports
   */
  transports?:
    | Record<string, Transport>
    | ((transportKind: string) => Promise<Transport> | Transport);
  /**
   * WHATWG compatible Fetch implementation
   */
  fetchAPI?: FetchAPI;
  /**
   * Logger
   */
  logging?: YogaServerOptions<TServerContext, TUserContext>['logging'] | Logger;
  /**
   * Additional Resolvers
   */
  additionalResolvers?: IResolvers<unknown, TServerContext & TUserContext>;
}

export interface Transport {
  getSubgraphExecutor(
    transportEntry: TransportEntry,
    getSubgraph?: () => GraphQLSchema,
  ): Executor | Promise<Executor>;
}
