import { createServer } from 'http';
import { authorsYoga } from './yoga';

createServer(authorsYoga).listen(4001, () => {
  console.log('Authors service listening on port 4001');
});
