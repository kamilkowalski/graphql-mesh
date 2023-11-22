import {
  buildClientSchema,
  buildSchema,
  getIntrospectionQuery,
  GraphQLSchema,
  IntrospectionQuery,
} from 'graphql';
import { ExecutionResult } from '@graphql-tools/utils';

export interface GraphQLSubgraphLoaderHTTPConfiguration {
  /**
   * A url or file path to your remote GraphQL endpoint.
   * If you provide a path to a code file(js or ts),
   * other options will be ignored and the schema exported from the file will be used directly.
   */
  endpoint: string;
  /**
   * HTTP method used for GraphQL operations (Allowed values: GET, POST)
   */
  method?: 'GET' | 'POST';
  /**
   * Use HTTP GET for Query operations
   */
  useGETForQueries?: boolean;

  // Runtime specific options
  /**
   * JSON object representing the Headers to add to the runtime of the API calls only for operation during runtime
   */
  operationHeaders?: {
    [k: string]: any;
  };
  /**
   * Request Credentials if your environment supports it.
   * [See more](https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials)
   *
   * @default "same-origin" (Allowed values: omit, include)
   */
  credentials?: 'omit' | 'include';
  /**
   * Retry attempts if fails
   */
  retry?: number;
  /**
   * Timeout in milliseconds
   */
  timeout?: number;

  // Introspection specific options

  /**
   * Path to the introspection
   * You can separately give schema introspection or SDL
   */
  source?: string;
  /**
   * JSON object representing the Headers to add to the runtime of the API calls only for schema introspection
   */
  schemaHeaders?: any;
}

export function loadGraphQLHTTPSubgraph(
  subgraphName: string,
  {
    endpoint,
    method,
    useGETForQueries,

    operationHeaders,
    credentials,
    retry,
    timeout,

    source,
    schemaHeaders,
  }: GraphQLSubgraphLoaderHTTPConfiguration,
) {
  return () => {
    if (source) {
      const schema$ = fetch(source, {
        headers: schemaHeaders,
      })
        .then(res => res.text())
        .then(sdl =>
          buildSchema(sdl, {
            assumeValidSDL: true,
            assumeValid: true,
            noLocation: true,
          }),
        )
        .then(schema =>
          addAnnotations(
            {
              kind: 'http',
              subgraph: subgraphName,
              location: endpoint,
              headers: operationHeaders,
              options: {
                method,
                useGETForQueries,
                credentials,
                retry,
                timeout,
              },
            },
            schema,
          ),
        );
      return {
        name: subgraphName,
        schema$,
      };
    }
    const schema$ = fetch(endpoint, {
      method: method || (useGETForQueries ? 'GET' : 'POST'),
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: getIntrospectionQuery(),
      }),
    })
      .then(res => res.json())
      .then((result: ExecutionResult<IntrospectionQuery>) =>
        buildClientSchema(result.data, {
          assumeValid: true,
        }),
      )
      .then(schema =>
        addAnnotations(
          {
            kind: 'http',
            subgraph: subgraphName,
            location: endpoint,
            headers: operationHeaders,
            options: {
              method,
              useGETForQueries,
              credentials,
              retry,
              timeout,
            },
          },
          schema,
        ),
      );
    return {
      name: subgraphName,
      schema$,
    };
  };
}

interface GraphQLHTTPTransportEntry {
  kind: 'http';
  subgraph: string;
  location: string;
  headers: Record<string, string>;
  options: {
    method: 'GET' | 'POST';
    useGETForQueries: boolean;
    credentials: 'omit' | 'include';
    retry: number;
    timeout: number;
  };
}

function addAnnotations(
  transportEntry: GraphQLHTTPTransportEntry,
  schema: GraphQLSchema,
): GraphQLSchema {
  const schemaExtensions: any = (schema.extensions ||= {});
  schemaExtensions.directives ||= {};
  schemaExtensions.directives.transport = transportEntry;
  return schema;
}
