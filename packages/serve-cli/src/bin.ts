import { runServeCLI, spinnies } from './runServeCLI.js';
import 'ts-node/register';
import 'dotenv/config';

runServeCLI().catch(e => {
  spinnies.fail('main', { text: e.stack });
  process.exit(1);
});
