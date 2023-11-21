import { runServeCLI, spinnies } from './runServeCLI.js';
import 'ts-node/register';
import 'dotenv/config';
import 'json-bigint-patch';

runServeCLI().catch(e => {
  spinnies.stopAll('fail');
  console.error(e);
  process.exit(1);
});
