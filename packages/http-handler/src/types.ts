import { DocumentNode, GraphQLSchema } from 'graphql';
import { BatchingOptions, FetchAPI, Plugin, YogaServerOptions } from 'graphql-yoga';
import { GraphiQLOptionsOrFactory } from 'graphql-yoga/typings/plugins/use-graphiql';
import { SupergraphPlugin, TransportEntry } from '@graphql-mesh/fusion-runtime';
// eslint-disable-next-line import/no-extraneous-dependencies
import { Logger } from '@graphql-mesh/types';
import { Executor } from '@graphql-tools/utils';
import { CORSPluginOptions } from '@whatwg-node/server';

export type MeshHTTPPlugin<TServerContext> = Plugin<TServerContext> & SupergraphPlugin;

export interface MeshHTTPHandlerConfiguration<TServerContext> {
  /**
   * Path to the Supergraph Schema
   */
  supergraph?:
    | string
    | DocumentNode
    | GraphQLSchema
    | (() => Promise<string | DocumentNode | GraphQLSchema>);
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
  plugins?: MeshHTTPPlugin<TServerContext>[];
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
  logging?: YogaServerOptions<TServerContext, {}>['logging'] | Logger;
}

export interface Transport {
  getSubgraphExecutor(
    transportEntry: TransportEntry,
    getSubgraph?: () => GraphQLSchema,
  ): Executor | Promise<Executor>;
}
