import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
