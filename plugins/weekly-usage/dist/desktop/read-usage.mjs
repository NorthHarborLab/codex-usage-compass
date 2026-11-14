import { getUsage } from '../src/account.mjs';

try {
  console.log(JSON.stringify(await getUsage()));
} catch (error) {
  console.log(JSON.stringify({ error: error.message }));
}
