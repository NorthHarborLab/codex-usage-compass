import { readFile, readdir, writeFile } from 'node:fs/promises';
const lock = JSON.parse(await readFile('package-lock.json','utf8'));
const sections = ['Third-party dependency notices\nGenerated from package-lock.json. Each dependency retains its own license.\n'];
for (const path of Object.keys(lock.packages).sort()) {
  if (!path || lock.packages[path].dev || lock.packages[path].optional) continue;
  const pkg = JSON.parse(await readFile(path+'/package.json','utf8'));
  const names = (await readdir(path)).filter(n => /^(licen[cs]e|copying|notice)(\.|$)/i.test(n));
  sections.push(`\n===== ${pkg.name} ${pkg.version} (${pkg.license || 'see below'}) =====\n`);
  for (const name of names) sections.push(await readFile(path+'/'+name,'utf8'));
}
const text = sections.join('\n').replace(/\r\n/g, '\n');
await writeFile('THIRD_PARTY_LICENSES.txt',text);
await writeFile('plugins/weekly-usage/THIRD_PARTY_LICENSES.txt',text);
