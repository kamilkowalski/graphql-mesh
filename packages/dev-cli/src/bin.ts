import { runDevCLI, spinnies } from './runDevCLI.js';
import 'ts-node/register';

runDevCLI().catch(e => {
  spinnies.fail('main', { text: e.stack });
  process.exit(1);
});
