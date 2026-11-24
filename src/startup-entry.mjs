import { runStartup } from './startup.mjs';
runStartup(process.argv[2]).then(worker => {
  if (!worker) return;
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => void worker.close());
}).catch(() => { process.exitCode = 1; });
