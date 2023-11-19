/* eslint-disable import/no-nodejs-modules */
import cluster from 'cluster';
import { availableParallelism } from 'os';
import { join } from 'path';
import { createYoga } from 'graphql-yoga';
import Spinnies from 'spinnies';
import { App, SSLApp } from 'uWebSockets.js';
import { useSupergraph } from '@graphql-mesh/fusion-runtime';
import { GitLoader } from '@graphql-tools/git-loader';
import { GithubLoader } from '@graphql-tools/github-loader';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { loadSchema } from '@graphql-tools/load';
import { UrlLoader } from '@graphql-tools/url-loader';
import { MeshServeCLIConfig } from './types';

export const spinnies = new Spinnies({
  color: 'white',
  succeedColor: 'white',
  failColor: 'red',
  succeedPrefix: '✔',
  failPrefix: '💥',
  spinner: { interval: 80, frames: ['/', '|', '\\', '--'] },
});

export async function runServeCLI(
  processExit = (exitCode: number) => process.exit(exitCode),
): Promise<void | never> {
  const prefix = `🕸️ GraphQL Mesh`;
  spinnies.add('main', { text: `${prefix} - Starting` });
  if (cluster.isPrimary) {
    let forkNum: number;
    if (!process.env.FORK || process.env.FORK === 'true') {
      forkNum = availableParallelism();
    } else if (
      process.env.FORK === 'false' ||
      process.env.FORK === '0' ||
      process.env.FORK === '1'
    ) {
      forkNum = 1;
    } else if (!isNaN(parseInt(process.env.FORK))) {
      forkNum = parseInt(process.env.FORK);
    }

    if (forkNum > 1) {
      spinnies.update('main', { text: `Forking ${forkNum} Mesh Workers` });
      for (let i = 0; i < forkNum; i++) {
        spinnies.update('main', { text: `Forking Mesh Worker #${i}` });
        const worker = cluster.fork();
        registerTerminateHandler(eventName => {
          spinnies.add(`worker-${worker.id}`, {
            text: `Closing Mesh Worker #${i} for ${eventName}`,
          });
          worker.kill(eventName);
          spinnies.succeed(`worker-${worker.id}`, {
            text: `Closed Mesh Worker #${i} for ${eventName}`,
          });
        });
        spinnies.update('main', { text: `Forked Mesh Worker #${i}` });
      }
      spinnies.succeed('main', { text: `Forked ${forkNum} Mesh Workers` });
      return;
    }
  }

  const meshServeCLIConfigFileName =
    process.env.MESH_SERVE_CONFIG_FILE_NAME || 'mesh.serve.config.ts';
  const meshServeCLIConfigFilePath =
    process.env.MESH_SERVE_CONFIG_FILE_PATH || join(process.cwd(), meshServeCLIConfigFileName);

  spinnies.add('config', {
    text: `${prefix} - Loading configuration from ${meshServeCLIConfigFilePath}`,
  });
  const loadedConfig: { config: MeshServeCLIConfig } = await import(meshServeCLIConfigFilePath);
  if (!loadedConfig.config) {
    spinnies.fail('config', {
      text: `${prefix} - Configuration file was not found in ${meshServeCLIConfigFilePath}`,
    });
    return processExit(1);
  }
  spinnies.succeed('config', {
    text: `${prefix} - Loaded configuration from ${meshServeCLIConfigFilePath}`,
  });
  const meshServeCLIConfig = loadedConfig.config;
  const port = meshServeCLIConfig.port || 4000;
  const host = meshServeCLIConfig.host || 'localhost';
  spinnies.add('yoga', { text: `${prefix} - Processing Supergraph` });
  const yoga = createYoga({
    plugins: [
      ...(meshServeCLIConfig.plugins || []),
      useSupergraph({
        async getSupergraph() {
          spinnies.add('supergraph', { text: `${prefix} - Loading supergraph schema` });
          const loadedSupergraphSchema = await loadSchema(meshServeCLIConfig.supergraph, {
            loaders: [
              new GraphQLFileLoader(),
              new UrlLoader(),
              new GitLoader(),
              new GithubLoader(),
            ],
            assumeValid: true,
            assumeValidSDL: true,
          });
          spinnies.succeed('supergraph', { text: `${prefix} - Loaded supergraph schema` });
          return loadedSupergraphSchema;
        },
        async getExecutorFromHandler(handlerName, handlerOptions, getSubgraph) {
          const omnigraphPackageName = `@omnigraph/${handlerName}`;
          spinnies.add(omnigraphPackageName, {
            text: `${prefix} - Loading ${omnigraphPackageName}`,
          });
          try {
            const omnigraphPackage = await import(omnigraphPackageName);
            const getSubgraphExecutor = omnigraphPackage.getSubgraphExecutor;
            if (!getSubgraphExecutor) {
              spinnies.fail(omnigraphPackageName, {
                text: `${prefix} - getSubgraphExecutor is not exported from ${omnigraphPackageName}`,
              });
              throw new Error(`getSubgraphExecutor is not exported from ${omnigraphPackageName}`);
            }
            spinnies.succeed(omnigraphPackageName, {
              text: `${prefix} - Loaded ${omnigraphPackageName}`,
            });
            return getSubgraphExecutor({
              getSubgraph,
              options: handlerOptions,
            });
          } catch (error) {
            spinnies.fail(omnigraphPackageName, {
              text: `${prefix} - Failed to load ${omnigraphPackageName}`,
            });
            throw error;
          }
        },
        polling: meshServeCLIConfig.polling,
      }),
    ],
    cors: meshServeCLIConfig.cors,
    graphiql: meshServeCLIConfig.graphiql,
    batching: meshServeCLIConfig.batching,
  });
  spinnies.succeed('yoga', { text: `${prefix} - Processed Supergraph` });
  const app = meshServeCLIConfig.sslCredentials ? SSLApp(meshServeCLIConfig.sslCredentials) : App();
  const protocol = meshServeCLIConfig.sslCredentials ? 'https' : 'http';
  app.any('/*', yoga);
  spinnies.add('start-server', { text: `${prefix} - Starting server` });
  app.listen(host, port, function listenCallback(listenSocket) {
    if (listenSocket) {
      spinnies.succeed('start-server', {
        text: `${prefix} - Started server on ${protocol}://${host}:${port}`,
      });
      registerTerminateHandler(eventName => {
        spinnies.fail('listen', {
          text: `${prefix} - Closing ${protocol}://${host}:${port} for ${eventName}`,
        });
        app.close();
      });
    } else {
      spinnies.fail('start-server', { text: `${prefix} - Failed to start server` });
      processExit(1);
    }
  });
  spinnies.remove('main');
}

const terminateEvents = ['SIGINT', 'SIGTERM'] as const;
type TerminateEvents = (typeof terminateEvents)[number];
type TerminateHandler = (eventName: TerminateEvents) => void;
const terminateHandlers = new Set<TerminateHandler>();
for (const eventName of terminateEvents) {
  process.once(eventName, () => {
    for (const handler of terminateHandlers) {
      handler(eventName);
      terminateHandlers.delete(handler);
    }
  });
}

function registerTerminateHandler(callback: TerminateHandler) {
  terminateHandlers.add(callback);
  return () => {
    terminateHandlers.delete(callback);
  };
}
