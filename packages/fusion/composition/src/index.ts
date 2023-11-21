import {
  getNamedType,
  GraphQLField,
  GraphQLFieldConfig,
  GraphQLInputFieldConfig,
  GraphQLNamedType,
  GraphQLSchema,
  isObjectType,
  isSpecifiedScalarType,
  OperationTypeNode,
} from 'graphql';
import { pascalCase } from 'pascal-case';
import { snakeCase } from 'snake-case';
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

type ResolverAnnotation = {
  subgraph: string;
  operation: string;
  kind: 'BATCH' | 'FETCH';
};

type VariableAnnotation = {
  subgraph: string;
  name: string;
  select: string;
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

    const queryType = schema.getQueryType();
    const queryFields = queryType?.getFields();

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
        const directives: Record<string, any> = {
          ...getDirectiveExtensions(schema, type),
          source: {
            subgraph: subgraphName,
            name: type.name,
          },
        };
        // Automatic type merging configuration based on ById and ByIds naming conventions
        addAnnotationsForSemanticConventions({
          type,
          queryFields,
          subgraphName,
          directives,
          subgraphs,
        });
        return new (Object.getPrototypeOf(type).constructor)({
          ...type.toConfig(),
          extensions: {
            ...type.extensions,
            directives,
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

function addAnnotationsForSemanticConventions({
  type,
  queryFields,
  subgraphName,
  directives,
  subgraphs,
}: {
  type: GraphQLNamedType;
  queryFields?: Record<string, GraphQLField<any, any>>;
  subgraphName: string;
  directives: Record<string, any>;
  subgraphs: SubgraphConfig[];
}) {
  if (queryFields && isObjectType(type)) {
    const fieldMap = type.getFields();
    for (const queryFieldName in queryFields) {
      for (const fieldName in fieldMap) {
        const objectField = fieldMap[fieldName];
        const queryField = queryFields[queryFieldName];
        const arg = queryField.args.find(
          arg => getNamedType(arg.type) === getNamedType(objectField.type),
        );
        const queryFieldTypeName = getNamedType(queryField.type).name;
        const queryFieldNameSnakeCase = snakeCase(queryFieldName);
        const varName = `${type.name}_${fieldName}`;
        if (arg && queryFieldTypeName === type.name) {
          // eslint-disable-next-line no-inner-declarations
          function addVariablesForOtherSubgraphs() {
            directives.variable ||= [];
            for (const otherSubgraphConfig of subgraphs) {
              const otherType = otherSubgraphConfig.schema.getType(type.name);
              if (isObjectType(otherType)) {
                const otherTypeFields = otherType.getFields();
                if (fieldName in otherTypeFields) {
                  directives.variable ||= [];
                  if (
                    !directives.variable.some(
                      (v: VariableAnnotation) =>
                        v.subgraph === otherSubgraphConfig.name && v.name === varName,
                    )
                  ) {
                    directives.variable.push({
                      subgraph: otherSubgraphConfig.name,
                      name: varName,
                      select: fieldName,
                    });
                  }
                }
              }
            }
          }
          switch (queryFieldNameSnakeCase) {
            case snakeCase(type.name):
            case snakeCase(`get_${type.name}_by_${fieldName}`):
            case snakeCase(`${type.name}_by_${fieldName}`): {
              const operationName = pascalCase(`${type.name}_by_${fieldName}`);
              const resolverAnnotation: ResolverAnnotation = {
                subgraph: subgraphName,
                operation: `query ${operationName}($${varName}: ${arg.type}) { ${queryFieldName}(${arg.name}: $${varName}) }`,
                kind: 'FETCH',
              };
              directives.resolver ||= [];
              directives.resolver.push(resolverAnnotation);
              addVariablesForOtherSubgraphs();
              break;
            }
            case snakeCase(`${type.name}s`):
            case snakeCase(`get_${type.name}s_by_${fieldName}`):
            case snakeCase(`${type.name}s_by_${fieldName}`):
            case snakeCase(`get_${type.name}s_by_${fieldName}s`):
            case snakeCase(`${type.name}s_by_${fieldName}s`): {
              const operationName = pascalCase(`${type.name}s_by_${fieldName}s`);
              const resolverAnnotation: ResolverAnnotation = {
                subgraph: subgraphName,
                operation: `query ${operationName}($${varName}: ${arg.type}) { ${queryFieldName}(${arg.name}: $${varName}) }`,
                kind: 'BATCH',
              };
              directives.resolver ||= [];
              directives.resolver.push(resolverAnnotation);
              directives.variable ||= [];
              addVariablesForOtherSubgraphs();
              break;
            }
          }
        }
      }
    }
  }
}
