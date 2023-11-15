import { printSchemaWithDirectives } from '@graphql-tools/utils';
import loadGraphQLSchemaFromOpenAPI from '../src/index.js';

describe('Multiple Responses Swagger', () => {
  it('should create correct response types with 204 empty response', async () => {
    const schema = await loadGraphQLSchemaFromOpenAPI('test', {
      source: './fixtures/multiple-responses-swagger.yml',
      cwd: __dirname,
    });
    expect(printSchemaWithDirectives(schema)).toMatchInlineSnapshot(`
      "schema {
        query: Query
        mutation: Mutation
      }

      directive @oneOf on OBJECT | INTERFACE | INPUT_OBJECT

      directive @statusCodeTypeName(subgraph: String, typeName: String, statusCode: ID) repeatable on UNION

      directive @resolveRoot(subgraph: String) on FIELD_DEFINITION

      directive @globalOptions(subgraph: String, endpoint: String, operationHeaders: ObjMap, queryStringOptions: ObjMap, queryParams: ObjMap) on OBJECT

      directive @httpOperation(subgraph: String, path: String, operationSpecificHeaders: ObjMap, httpMethod: HTTPMethod, isBinary: Boolean, requestBaseBody: ObjMap, queryParamArgMap: ObjMap, queryStringOptionsByParam: ObjMap) on FIELD_DEFINITION

      type Query @globalOptions(subgraph: "test", endpoint: "https://api.example.com/v1") {
        "Optional extended description in Markdown."
        foo_by_id: foo_by_id_response @httpOperation(subgraph: "test", path: "/{id}", operationSpecificHeaders: "{\\"Accept\\":\\"application/json\\"}", httpMethod: GET)
      }

      union foo_by_id_response @statusCodeTypeName(subgraph: "test", statusCode: 200, typeName: "Foo") @statusCodeTypeName(subgraph: "test", statusCode: 500, typeName: "Error") = Foo | Error

      type Foo {
        id: String
      }

      type Error {
        message: String
        stack: String
      }

      type Mutation {
        "Optional extended description in Markdown."
        post: post_response @httpOperation(subgraph: "test", path: "/", operationSpecificHeaders: "{\\"Accept\\":\\"application/json\\"}", httpMethod: POST)
      }

      union post_response @statusCodeTypeName(subgraph: "test", statusCode: 204, typeName: "Void_container") @statusCodeTypeName(subgraph: "test", statusCode: 500, typeName: "Error") = Void_container | Error

      type Void_container {
        Void: Void @resolveRoot(subgraph: "test")
      }

      "Represents empty values"
      scalar Void

      scalar ObjMap

      enum HTTPMethod {
        GET
        HEAD
        POST
        PUT
        DELETE
        CONNECT
        OPTIONS
        TRACE
        PATCH
      }"
    `);
  });
});
