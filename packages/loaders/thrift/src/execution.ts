import { ASTNode, ConstDirectiveNode, valueFromASTUntyped, type GraphQLSchema } from 'graphql';
import { getInterpolatedHeadersFactory } from '@graphql-mesh/string-interpolation';
import { MapperKind, mapSchema } from '@graphql-tools/utils';
import { createGraphQLThriftClient } from './client.js';
import { GraphQLThriftAnnotations } from './types.js';

interface DirectiveAnnotation {
  name: string;
  args: any;
}

function getDirectiveAnnotations(directableObj: {
  astNode?: ASTNode & { directives?: readonly ConstDirectiveNode[] };
  extensions?: any;
}): DirectiveAnnotation[] {
  const directiveAnnotations: DirectiveAnnotation[] = [];
  if (directableObj.astNode?.directives?.length) {
    directableObj.astNode.directives.forEach(directive => {
      directiveAnnotations.push({
        name: directive.name.value,
        args: Object.fromEntries(
          directive.arguments.map(arg => [arg.name.value, valueFromASTUntyped(arg.value)]),
        ),
      });
    });
  }
  if (directableObj.extensions?.directives) {
    for (const directiveName in directableObj.extensions.directives) {
      const directiveObjs = directableObj.extensions.directives[directiveName];
      if (Array.isArray(directiveObjs)) {
        directiveObjs.forEach(directiveObj => {
          directiveAnnotations.push({
            name: directiveName,
            args: directiveObj,
          });
        });
      } else {
        directiveAnnotations.push({
          name: directiveName,
          args: directiveObjs,
        });
      }
    }
  }
  return directiveAnnotations;
}

export function getExecutableThriftSchema(subgraph: GraphQLSchema): GraphQLSchema {
  const schemaDefDirectives = getDirectiveAnnotations(subgraph);
  const graphqlAnnotations = schemaDefDirectives.find(directive => directive.name === 'transport')
    ?.args as GraphQLThriftAnnotations;
  if (!graphqlAnnotations) throw new Error('No @transport directive found on schema definition');
  const client = createGraphQLThriftClient(graphqlAnnotations);
  const headersFactory = getInterpolatedHeadersFactory(graphqlAnnotations.headers);

  return mapSchema(subgraph, {
    [MapperKind.ROOT_FIELD]: (fieldConfig, fnName) => {
      const directiveAnnotations = getDirectiveAnnotations(fieldConfig);
      const fieldTypeMapDirectives = directiveAnnotations.filter(
        directive => directive.name === 'fieldTypeMap',
      );
      fieldTypeMapDirectives?.forEach(fieldTypeMap => {
        fieldConfig.resolve = function thriftRootFieldResolver(root, args, context, info) {
          return client.doRequest(fnName, args, fieldTypeMap.args, {
            headers: headersFactory({ root, args, context, info, env: globalThis.process?.env }),
          });
        };
      });
      return fieldConfig;
    },
  });
}
