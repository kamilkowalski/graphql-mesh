import {
  DocumentNode,
  FragmentDefinitionNode,
  GraphQLSchema,
  Kind,
  OperationDefinitionNode,
} from 'graphql';
import { getRootTypeMap } from '@graphql-tools/utils';
import {
  createExecutableResolverOperationNodesWithDependencyMap,
  ExecutableResolverOperationNode,
  executeResolverOperationNodesWithDependenciesInParallel,
  OnExecuteFn,
} from './execution.js';
import { FlattenedFieldNode, flattenSelections } from './flattenSelections.js';
import { ResolverOperationNode, visitFieldNodeForTypeResolvers } from './query-planning.js';
import { SerializedResolverOperationNode } from './serialization.js';

export function planOperation(
  supergraph: GraphQLSchema,
  document: DocumentNode,
  operationName?: string,
) {
  let operationAst: OperationDefinitionNode | undefined;
  const fragments: Record<string, FragmentDefinitionNode> = Object.create(null);
  for (const definition of document.definitions) {
    if (definition.kind === 'OperationDefinition') {
      if (!operationName && operationAst) {
        throw new Error('Must provide operation name if query contains multiple operations');
      }
      if (!operationName || definition.name?.value === operationName) {
        operationAst = definition;
      }
    } else if (definition.kind === 'FragmentDefinition') {
      fragments[definition.name.value] = definition;
    }
  }

  if (!operationAst) {
    throw new Error(`No operation found with name ${operationName}`);
  }

  const flattenedFakeFieldNode: FlattenedFieldNode = {
    kind: Kind.FIELD,
    name: {
      kind: Kind.NAME,
      value: '__fake',
    },
    selectionSet: {
      kind: Kind.SELECTION_SET,
      selections: flattenSelections(operationAst.selectionSet.selections, fragments),
    },
  };

  const rootTypeMap = getRootTypeMap(supergraph);
  const operationType = operationAst.operation;
  const rootType = rootTypeMap.get(operationType);
  if (!rootType) {
    throw new Error(`No root type found for operation type ${operationType}`);
  }

  return visitFieldNodeForTypeResolvers('ROOT', flattenedFakeFieldNode, rootType, supergraph, {
    currentVariableIndex: 0,
  });
}

export interface ExecutableOperationPlan {
  resolverOperationNodes: ExecutableResolverOperationNode[];
  resolverDependencyFieldMap: Map<string, ExecutableResolverOperationNode[]>;
}

export interface NonExecutableOperationPlan {
  resolverOperationNodes: ResolverOperationNode[];
  resolverDependencyFieldMap: Map<string, ResolverOperationNode[]>;
}

export interface SerializableOperationPlan {
  resolverOperationNodes: SerializedResolverOperationNode[];
  resolverDependencyFieldMap: Map<string, SerializedResolverOperationNode[]>;
}

export function executeOperation({
  supergraph,
  onExecute,
  document,
  operationName,
  variables = {},
}: {
  supergraph: GraphQLSchema;
  onExecute: OnExecuteFn;
  document: DocumentNode;
  operationName?: string;
  variables?: Record<string, any>;
}) {
  const plan = planOperation(supergraph, document, operationName);
  const executablePlan = createExecutableResolverOperationNodesWithDependencyMap(
    plan.resolverOperationNodes,
    plan.resolverDependencyFieldMap,
  );
  return executeOperationPlan({ executablePlan, onExecute, variables });
}

export function executeOperationPlan({
  executablePlan,
  onExecute,
  variables,
}: {
  executablePlan: ExecutableOperationPlan;
  onExecute: OnExecuteFn;
  variables?: Record<string, any>;
}) {
  return executeResolverOperationNodesWithDependenciesInParallel(
    executablePlan.resolverOperationNodes,
    executablePlan.resolverDependencyFieldMap,
    new Map(Object.entries(variables)),
    onExecute,
  );
}
