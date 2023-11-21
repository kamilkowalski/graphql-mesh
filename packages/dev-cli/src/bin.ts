import { runDevCLI, spinnies } from './runDevCLI.js';
import 'ts-node/register';
import 'dotenv/config';

runDevCLI().catch(e => {
  spinnies.stopAll('fail');
  console.error(e);
  process.exit(1);
});
