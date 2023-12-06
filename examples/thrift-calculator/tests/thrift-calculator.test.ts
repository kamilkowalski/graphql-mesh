import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { GraphQLSchema, parse } from 'graphql';
import { getComposedSchemaFromConfig } from '@graphql-mesh/dev-cli';
import { getExecutorForSupergraph } from '@graphql-mesh/fusion-runtime';
import { printSchemaWithDirectives } from '@graphql-tools/utils';
import { getSubgraphExecutor } from '@omnigraph/thrift';
import { devConfig } from '../mesh.config';
import thriftServer from '../src/main';

describe('Thrift Calculator', () => {
  let supergraph: GraphQLSchema;
  beforeAll(async () => {
    supergraph = await getComposedSchemaFromConfig({
      ...devConfig,
      cwd: join(__dirname, '..'),
    });
  });
  it('generates the schema correctly', () => {
    expect(printSchemaWithDirectives(supergraph)).toMatchSnapshot('schema');
  });
  const queryNames = readdirSync(join(__dirname, '../example-queries'));
  for (const queryName of queryNames) {
    it(`executes ${queryName} query`, async () => {
      const supergraphExecutor = getExecutorForSupergraph(
        supergraph,
        (transportEntry, getSubgraph) => {
          return getSubgraphExecutor(transportEntry as any, getSubgraph);
        },
      );
      const query = readFileSync(join(__dirname, '../example-queries', queryName), 'utf8');
      const result = await supergraphExecutor({
        document: parse(query),
      });
      expect(result).toMatchSnapshot(queryName);
    });
  }
  afterAll(() => {
    thriftServer.close();
  });
});
