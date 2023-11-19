import {
  GraphQLFieldConfig,
  GraphQLInputFieldConfig,
  GraphQLNamedType,
  GraphQLSchema,
  isSpecifiedScalarType,
  OperationTypeNode,
} from 'graphql';
import { mergeSchemas, MergeSchemasConfig } from '@graphql-tools/schema';
import {
  DirectableGraphQLObject,
  getDirectives,
  getRootTypeMap,
  MapperKind,
  mapSchema,
} from '@graphql-tools/utils';

export interface SubgraphConfig {
  name: string;
  schema: GraphQLSchema;
  transforms?: SubgraphTransform[];
}

type SubgraphTransform = (schema: GraphQLSchema, subgraphConfig: SubgraphConfig) => GraphQLSchema;

const defaultRootTypeNames: Record<OperationTypeNode, string> = {
  query: 'Query',
  mutation: 'Mutation',
  subscription: 'Subscription',
};

export function composeSubgraphs(
  subgraphs: SubgraphConfig[],
  options?: Omit<MergeSchemasConfig, 'schema'>,
) {
  const annotatedSubgraphs: GraphQLSchema[] = [];
  for (const subgraphConfig of subgraphs) {
    const { name: subgraphName, schema, transforms } = subgraphConfig;
    const rootTypeMap = getRootTypeMap(schema);
    const typeToOperationType = new Map<string, OperationTypeNode>();

    for (const [operationType, rootType] of rootTypeMap) {
      typeToOperationType.set(rootType.name, operationType);
    }

    const annotatedSubgraph = mapSchema(schema, {
      [MapperKind.TYPE]: type => {
        if (isSpecifiedScalarType(type)) {
          return type;
        }
        const operationType = typeToOperationType.get(type.name);
        if (operationType) {
          return new (Object.getPrototypeOf(type).constructor)({
            ...type.toConfig(),
            name: defaultRootTypeNames[operationType],
          });
        }
        return new (Object.getPrototypeOf(type).constructor)({
          ...type.toConfig(),
          extensions: {
            ...type.extensions,
            directives: {
              ...getDirectiveExtensions(schema, type),
              source: {
                subgraph: subgraphName,
                name: type.name,
              },
            },
          },
        });
      },
      [MapperKind.FIELD]: (fieldConfig, fieldName) => ({
        ...fieldConfig,
        extensions: {
          ...fieldConfig.extensions,
          directives: {
            ...getDirectiveExtensions(schema, fieldConfig),
            source: {
              subgraph: subgraphName,
              name: fieldName,
            },
          },
        },
      }),
      [MapperKind.ENUM_VALUE]: (valueConfig, _typeName, _schema, externalValue) => ({
        ...valueConfig,
        extensions: {
          ...valueConfig.extensions,
          directives: {
            ...getDirectiveExtensions(schema, valueConfig),
            source: {
              subgraph: subgraphName,
              name: externalValue,
            },
          },
        },
      }),
      [MapperKind.ROOT_FIELD]: (fieldConfig, fieldName, typeName) => {
        const operationType = typeToOperationType.get(typeName);
        const operationName =
          operationType === 'query' ? fieldName : `${operationType}${fieldName}`;
        const variableDefinitions: string[] = [];
        const rootFieldArgs: string[] = [];
        if (fieldConfig.args) {
          for (const argName in fieldConfig.args) {
            const arg = fieldConfig.args[argName];
            let variableDefinitionStr = `$${argName}: ${arg.type}`;
            if (arg.defaultValue) {
              variableDefinitionStr += ` = ${
                typeof arg.defaultValue === 'string'
                  ? JSON.stringify(arg.defaultValue)
                  : arg.defaultValue
              }`;
            }
            variableDefinitions.push(variableDefinitionStr);
            rootFieldArgs.push(`${argName}: $${argName}`);
          }
        }
        const variableDefinitionsString = variableDefinitions.length
          ? `(${variableDefinitions.join(', ')})`
          : '';
        const rootFieldArgsString = rootFieldArgs.length ? `(${rootFieldArgs.join(', ')})` : '';
        const operationString = `${operationType} ${operationName}${variableDefinitionsString} { ${fieldName}${rootFieldArgsString} }`;

        return {
          ...fieldConfig,
          extensions: {
            ...fieldConfig.extensions,
            directives: {
              ...getDirectiveExtensions(schema, fieldConfig),
              resolver: {
                subgraph: subgraphName,
                operation: operationString,
              },
              source: {
                subgraph: subgraphName,
                name: fieldName,
              },
            },
          },
        };
      },
    });

    let transformedSubgraph = annotatedSubgraph;
    if (transforms?.length) {
      for (const transform of transforms) {
        transformedSubgraph = transform(transformedSubgraph, subgraphConfig);
      }
    }
    annotatedSubgraphs.push(transformedSubgraph);
  }

  return mergeSchemas({
    schemas: annotatedSubgraphs,
    assumeValidSDL: true,
    assumeValid: true,
    ...options,
  });
}

type MapperTypeKind =
  | MapperKind.ROOT_OBJECT
  | MapperKind.OBJECT_TYPE
  | MapperKind.INTERFACE_TYPE
  | MapperKind.UNION_TYPE
  | MapperKind.ENUM_TYPE
  | MapperKind.INPUT_OBJECT_TYPE
  | MapperKind.SCALAR_TYPE
  | MapperKind.TYPE;

export function createRenameTypeTransform(
  renameFn: (type: GraphQLNamedType, subgraphConfig: SubgraphConfig) => string,
  kind: MapperTypeKind = MapperKind.TYPE,
): SubgraphTransform {
  return function renameTypeTransform(schema: GraphQLSchema, subgraphConfig: SubgraphConfig) {
    return mapSchema(schema, {
      [kind]: (type: GraphQLNamedType) =>
        isSpecifiedScalarType(type)
          ? type
          : new (Object.getPrototypeOf(type).constructor)({
              ...type.toConfig(),
              name: renameFn(type, subgraphConfig) || type.name,
            }),
    });
  };
}

export type MapperFieldKind =
  | MapperKind.FIELD
  | MapperKind.ROOT_FIELD
  | MapperKind.OBJECT_FIELD
  | MapperKind.INTERFACE_FIELD
  | MapperKind.INPUT_OBJECT_FIELD;

export function createRenameFieldTransform(
  renameFn: (
    field: GraphQLFieldConfig<any, any> | GraphQLInputFieldConfig,
    fieldName: string,
    typeName: string,
    subgraphConfig: SubgraphConfig,
  ) => string,
  kind: MapperFieldKind = MapperKind.FIELD,
): SubgraphTransform {
  return function renameFieldTransform(schema: GraphQLSchema, subgraphConfig: SubgraphConfig) {
    return mapSchema(schema, {
      [kind]: (
        field: GraphQLFieldConfig<any, any> | GraphQLInputFieldConfig,
        fieldName: string,
        typeName: string,
      ) => [renameFn(field, fieldName, typeName, subgraphConfig) || fieldName, field],
    });
  };
}

function getDirectiveExtensions(schema: GraphQLSchema, directableNode: DirectableGraphQLObject) {
  const directives = getDirectives(schema, directableNode);
  const directivesObject: Record<string, any> = {};
  for (const directive of directives) {
    directivesObject[directive.name] = directive.args;
  }
  return directivesObject;
}
