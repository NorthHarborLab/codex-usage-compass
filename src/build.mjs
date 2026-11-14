import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const dist = new URL('../plugins/weekly-usage/dist/', import.meta.url);
await mkdir(dist, { recursive: true });

const [html, css, view] = await Promise.all([
  readFile(new URL('./dashboard.html', import.meta.url), 'utf8'),
  readFile(new URL('./dashboard.css', import.meta.url), 'utf8'),
  build({
    entryPoints: [fileURLToPath(new URL('./dashboard.mjs', import.meta.url))],
    bundle: true,
    format: 'iife',
    minify: true,
    legalComments: 'inline',
    write: false,
  }),
]);

await Promise.all([
  writeFile(new URL('dashboard.html', dist), html
    .replace('<!-- STYLE -->', () => `<style>${css}</style>`)
    .replace('<!-- SCRIPT -->', () => `<script>${view.outputFiles[0].text}</script>`)),
  build({
    entryPoints: [fileURLToPath(new URL('./server.mjs', import.meta.url))],
    outfile: fileURLToPath(new URL('server.cjs', dist)),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    minify: true,
    legalComments: 'inline',
    supported: { 'top-level-await': false },
  }),
]);

// Keep the installed plugin self-contained, including its desktop renderer.
await mkdir(new URL('desktop/', dist), { recursive: true });
await mkdir(new URL('src/', dist), { recursive: true });
for (const file of ['indicator.mjs', 'read-usage.mjs', 'UsageCompassTray.cs']) await cp(new URL('../desktop/' + file, import.meta.url), new URL('desktop/' + file, dist));
for (const file of ['account.mjs', 'usage.mjs', 'i18n.mjs']) await cp(new URL(file, import.meta.url), new URL('src/' + file, dist));
