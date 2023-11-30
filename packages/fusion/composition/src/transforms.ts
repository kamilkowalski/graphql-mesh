import {
  GraphQLFieldConfig,
  GraphQLInputFieldConfig,
  GraphQLNamedType,
  GraphQLSchema,
  GraphQLType,
  isSpecifiedScalarType,
  parseType,
  typeFromAST,
} from 'graphql';
import {
  filterSchema,
  getRootTypes,
  MapperKind,
  mapSchema,
  pruneSchema,
  SchemaMapper,
} from '@graphql-tools/utils';
import { SubgraphConfig, SubgraphTransform } from './compose.js';

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

export interface PrefixTransformConfig {
  /**
   * The prefix to apply to the schema types. By default it's the API name.
   */
  value?: string;
  /**
   * List of ignored types
   */
  ignore?: string[];
  /**
   * Changes root types and changes the field names (default: false)
   */
  includeRootOperations?: boolean;
  /**
   * Changes types (default: true)
   */
  includeTypes?: boolean;
}

export function createPrefixTransform({
  value,
  ignore = [],
  includeRootOperations = false,
  includeTypes = true,
}: PrefixTransformConfig = {}) {
  return function prefixTransform(schema: GraphQLSchema, subgraphConfig: SubgraphConfig) {
    value = value || subgraphConfig.name;
    const transforms: SubgraphTransform[] = [];
    const rootTypeNames = [...getRootTypes(schema)].map(type => type.name);
    if (includeTypes) {
      transforms.push(
        createRenameTypeTransform(type => {
          if (ignore.includes(type.name)) {
            return type.name;
          }
          return `${value}${type.name}`;
        }),
      );
    }
    if (includeRootOperations) {
      transforms.push(
        createRenameFieldTransform((_field, fieldName, typeName) => {
          if (rootTypeNames.includes(typeName) && !ignore.includes(typeName)) {
            return `${value}${fieldName}`;
          }
          return fieldName;
        }, MapperKind.ROOT_FIELD),
      );
    }
    for (const transform of transforms) {
      schema = transform(schema, subgraphConfig);
    }
    return schema;
  };
}

export type FilterTransformConfig = Omit<Parameters<typeof filterSchema>[0], 'schema'>;
export function createFilterTransform(config: FilterTransformConfig): SubgraphTransform {
  return function filterTransform(schema) {
    return pruneSchema(
      filterSchema({
        schema,
        ...config,
      }),
    );
  };
}

export type NameReplacer = (name: string) => string;

export interface NamingConventionTransform {
  typeNames?: NameReplacer;
  fieldNames?: NameReplacer;
  enumValues?: NameReplacer;
  fieldArgumentNames?: NameReplacer;
}

export * from 'change-case';

export function createNamingConventionTransform(
  config: NamingConventionTransform,
): SubgraphTransform {
  const schemaMapper: SchemaMapper = {};
  if (config.typeNames) {
    schemaMapper[MapperKind.TYPE] = type => {
      if (isSpecifiedScalarType(type)) {
        return type;
      }
      return new (Object.getPrototypeOf(type).constructor)({
        ...type.toConfig(),
        name: config.typeNames(type.name),
      });
    };
  }
  if (config.fieldNames) {
    schemaMapper[MapperKind.FIELD] = (fieldConfig, fieldName) => [
      config.fieldNames(fieldName),
      fieldConfig,
    ];
  }
  if (config.enumValues) {
    schemaMapper[MapperKind.ENUM_VALUE] = (valueConfig, _typeName, _schema, externalValue) => [
      config.enumValues(externalValue),
      valueConfig,
    ];
  }
  if (config.fieldArgumentNames) {
    schemaMapper[MapperKind.ARGUMENT] = (argumentConfig, argumentName) => ({
      ...argumentConfig,
      name: config.fieldArgumentNames(argumentName),
    });
  }
  return function namingConventionTransform(schema: GraphQLSchema) {
    return mapSchema(schema, schemaMapper);
  };
}

export function createTypeReplaceTransform(
  replacerFn: (typeName: string, fieldName: string, existingType: GraphQLType) => string | void,
): SubgraphTransform {
  return function typeReplaceTransform(schema: GraphQLSchema) {
    return mapSchema(schema, {
      [MapperKind.FIELD]: (fieldConfig, fieldName, typeName) => {
        const newTypeName = replacerFn(typeName, fieldName, fieldConfig.type);
        if (newTypeName) {
          const newType = typeFromAST(schema, parseType(newTypeName)) as any;
          if (!newType) {
            throw new Error(`No type found for ${newTypeName}`);
          }
          return [fieldName, { ...fieldConfig, type: newType }];
        }
        return undefined;
      },
    });
  };
}
