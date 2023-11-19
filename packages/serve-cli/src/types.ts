import { DocumentNode, GraphQLSchema } from 'graphql';
import { BatchingOptions, Plugin } from 'graphql-yoga';
import { GraphiQLOptionsOrFactory } from 'graphql-yoga/typings/plugins/use-graphiql';
import { AppOptions, HttpRequest, HttpResponse } from 'uWebSockets.js';
import { SupergraphPlugin } from '@graphql-mesh/fusion-runtime';
import { CORSPluginOptions } from '@whatwg-node/server/typings/plugins/useCors';

export interface MeshServeCLIServerContext {
  req: HttpRequest;
  res: HttpResponse;
}

export type MeshServePlugin = Plugin<MeshServeCLIServerContext> & SupergraphPlugin;

export interface MeshServeCLIConfig {
  /**
   * Path to the Supergraph Schema
   */
  supergraph: string | DocumentNode | GraphQLSchema;

  /**
   * Headers to be sent to the Supergraph Schema endpoint
   */
  headers?: Record<string, string>;

  polling?: number;

  plugins?: MeshServePlugin[];

  /**
   * Port to listen on (default: `4000`)
   */
  port?: number;
  /**
   * Host to listen on (default: `localhost`)
   */
  host?: string;
  /**
   * Configuration for CORS
   */
  cors?: CORSPluginOptions<MeshServeCLIServerContext>;
  /**
   * Show GraphiQL
   */
  graphiql?: GraphiQLOptionsOrFactory<MeshServeCLIServerContext>;
  /**
   * SSL Credentials for HTTPS Server
   * If this is provided, Mesh will be served via HTTPS instead of HTTP.
   */
  sslCredentials?: AppOptions;
  /**
   * Path to the browser that will be used by `mesh serve` to open a playground window in development mode
   * This feature can be disabled by passing `false`
   */
  browser?: string | boolean;
  /**
   *  Enable and define a limit for [Request Batching](https://github.com/graphql/graphql-over-http/blob/main/rfcs/Batching.md)
   */
  batching?: BatchingOptions;
}
