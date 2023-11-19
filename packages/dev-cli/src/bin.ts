import { runDevCLI, spinnies } from './runDevCLI.js';
import 'ts-node/register';
import 'dotenv/config';

runDevCLI().catch(e => {
  spinnies.fail('main', { text: e.stack });
  process.exit(1);
});
