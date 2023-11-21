import { ASTNode, buildASTSchema, ConstDirectiveNode, GraphQLSchema, Kind, visit } from 'graphql';
import { getDocumentNodeFromSchema } from '@graphql-tools/utils';

export function extractSubgraphFromSupergraph(subgraph: string, supergraph: GraphQLSchema) {
  const supergraphAst = getDocumentNodeFromSchema(supergraph);
  const filterNodeBySubgraph = createFilterNodeBySubgraph(subgraph);
  const filteredAst = visit(supergraphAst, {
    Directive(node) {
      const subgraphArgument = node.arguments?.find(argument => argument.name.value === 'subgraph');
      if (
        subgraphArgument != null &&
        subgraphArgument.value.kind === Kind.STRING &&
        subgraphArgument.value.value !== subgraph
      ) {
        return null;
      }
      return node;
    },
    ObjectTypeDefinition: {
      enter: filterNodeBySubgraph,
    },
    FieldDefinition: {
      enter: filterNodeBySubgraph,
    },
    EnumTypeDefinition: {
      enter: filterNodeBySubgraph,
    },
    EnumValueDefinition: {
      enter: filterNodeBySubgraph,
    },
    InputObjectTypeDefinition: {
      enter: filterNodeBySubgraph,
    },
    ScalarTypeDefinition: {
      enter: filterNodeBySubgraph,
    },
  });

  return buildASTSchema(filteredAst, {
    assumeValid: true,
    assumeValidSDL: true,
  });
}

function createFilterNodeBySubgraph(subgraph: string) {
  return function filterNodeBySubgraph(
    node: ASTNode & { directives?: readonly ConstDirectiveNode[] },
  ) {
    const sourceDirectives = node.directives?.filter(
      directive => directive.name.value === 'source',
    );
    for (const sourceDirective of sourceDirectives ?? []) {
      const subgraphArgument = sourceDirective.arguments?.find(
        argument => argument.name.value === 'subgraph',
      );
      if (
        subgraphArgument != null &&
        subgraphArgument.value.kind === Kind.STRING &&
        subgraphArgument.value.value === subgraph
      ) {
        const nameArgument = sourceDirective.arguments?.find(
          argument => argument.name.value === 'name',
        );
        if (nameArgument?.value.kind === Kind.STRING) {
          return {
            ...node,
            name: {
              kind: Kind.NAME,
              value: nameArgument.value.value,
            },
          };
        }
        return node;
      }
    }
    if (sourceDirectives.length > 0) {
      return null;
    }
    return node;
  };
}
