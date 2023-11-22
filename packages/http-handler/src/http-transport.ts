import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { Transport } from './types';

export const httpTransport: Transport = {
  getSubgraphExecutor({ location, headers, options }) {
    return buildHTTPExecutor({
      endpoint: location,
      headers,
      ...options,
    });
  },
};
