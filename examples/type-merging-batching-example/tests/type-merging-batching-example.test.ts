import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { GraphQLSchema, parse } from 'graphql';
import { getComposedSchemaFromConfig } from '@graphql-mesh/dev-cli';
import { getExecutorForSupergraph } from '@graphql-mesh/fusion-runtime';
import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import { Request } from '@whatwg-node/fetch';
import { devConfig } from '../mesh.config.js';
import { authorsYoga } from '../services/authors/yoga.js';
import { booksYoga } from '../services/books/yoga.js';

describe('Type Merging with Batching Example', () => {
  let supergraph: GraphQLSchema;
  beforeAll(async () => {
    supergraph = await getComposedSchemaFromConfig({
      ...devConfig,
      async fetch(...args) {
        const req = new Request(...args);
        if (req.url.startsWith('http://localhost:4001/graphql')) {
          return authorsYoga.fetch(req);
        }
        if (req.url.startsWith('http://localhost:4002/graphql')) {
          return booksYoga.fetch(req);
        }
        return new Response(null, {
          status: 404,
        });
      },
    });
  });
  it('generates the schema correctly', () => {
    expect(printSchemaWithDirectives(supergraph)).toMatchSnapshot('schema');
  });
  const queryNames = readdirSync(join(__dirname, '../example-queries'));
  for (const queryName of queryNames) {
    it(`executes ${queryName} query`, async () => {
      const supergraphExecutor = getExecutorForSupergraph(supergraph, (_, __, subgraphName) => {
        switch (subgraphName) {
          case 'authors':
            return buildHTTPExecutor({
              fetch: authorsYoga.fetch,
            });
          case 'books':
            return buildHTTPExecutor({
              fetch: booksYoga.fetch,
            });
        }
        throw new Error(`Unknown subgraph ${subgraphName}`);
      });
      const query = readFileSync(join(__dirname, '../example-queries', queryName), 'utf8');
      const result = await supergraphExecutor({
        document: parse(query),
      });
      expect(result).toMatchSnapshot(queryName);
    });
  }
});
