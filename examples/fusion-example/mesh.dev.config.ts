import { MeshDevCLIConfig } from '@graphql-mesh/dev-cli';
import { createRenameFieldTransform } from '@graphql-mesh/fusion-composition';
import OpenAPILoader from '@omnigraph/openapi';

export const config: MeshDevCLIConfig = {
  subgraphs: [
    {
      name: 'my-openapi',
      handler: OpenAPILoader('my-openapi', {
        source: 'https://petstore3.swagger.io/api/v3/openapi.json',
        fetch,
      }),
      transforms: [createRenameFieldTransform((_, fieldName) => `myOpenAPI${fieldName}`)],
    },
  ],
};
