import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { startupPaths, runStartup, desktopRunning, desktopQuote, installedPlugin } from './startup.mjs';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  for(let n=0;n<100;n++){if(await fn())return;await wait(30);}
  throw new Error('startup transition timed out');
}
test('Linux worker starts without a panel, survives Codex restarts and respects plugin removal', {skip:process.platform!=='linux'}, async () => {
  const root = await mkdtemp(join(tmpdir(),'quota startup 中文 '));
  const paths = startupPaths({HOME:root});
  await mkdir(paths.root,{recursive:true});
  await mkdir(join(root,'plugin/dist'),{recursive:true});
  await mkdir(join(root,'plugin2/dist'),{recursive:true});
  const events = join(root,'events');
  const fixture = `const fs=require('node:fs');const file=${JSON.stringify(events)};fs.appendFileSync(file,'start '+process.pid+'\\n');process.stdin.resume();process.stdin.on('end',()=>{fs.appendFileSync(file,'stop '+process.pid+'\\n');process.exit();});`;
  for (const name of ['plugin','plugin2']) await writeFile(join(root,name,'dist/server.cjs'),fixture);
  await writeFile(paths.settings,JSON.stringify({desktop:'/fixture/Codex',cli:'/fixture/codex',codexHome:root}));
  await mkdir(join(root,'.config/autostart'),{recursive:true});
  await writeFile(paths.entry,'fixture');
  let active=false, plugin=join(root,'plugin'), lookups=0, fail=false;
  const lines=async()=>{try{return(await readFile(events,'utf8')).trim().split('\n');}catch{return [];}};
  const options={paths,intervalMs:30,lookupIntervalMs:30,isDesktopRunning:async()=>active,resolvePlugin:async()=>{lookups++;if(fail)throw new Error('not ready');return plugin;}};
  const worker=await runStartup(paths.settings,options);
  try {
    await wait(100); assert.equal(lookups,0); assert.deepEqual(await lines(),[]);
    assert.equal(await runStartup(paths.settings,options),undefined,'second worker must not start a duplicate');
    active=true;fail=true;await wait(100);assert.deepEqual(await lines(),[]);
    fail=false;await until(async()=>(await lines()).length===1);
    await wait(100);assert.equal((await lines()).length,1);
    active=false;await until(async()=>(await lines()).length===2);
    active=true;await until(async()=>(await lines()).length===3);
    plugin=null;await until(async()=>(await lines()).length===4);
    plugin=join(root,'plugin2');await until(async()=>(await lines()).length===5);
    plugin={removed:true};await until(async()=>(await lines()).length===6);
    await until(async()=>{try{await access(paths.entry);return false;}catch{return true;}});
  } finally {await worker.close();await rm(root,{recursive:true,force:true});}
});
test('Linux desktop detection matches the exact executable', {skip:process.platform!=='linux'}, async()=>{
  const root=await mkdtemp(join(tmpdir(),'quota desktop '));
  const {copyFile}=await import('node:fs/promises');
  const exe=join(root,'sleep');await copyFile('/bin/sleep',exe);
  const child=spawn(exe,['60']);
  try {await until(()=>desktopRunning(exe));assert.equal(await desktopRunning(exe+'-missing'),false);}
  finally{if(child.exitCode===null && child.signalCode===null){const exited=new Promise(r=>child.once('close',r));child.kill();await exited;}await rm(root,{recursive:true,force:true});}
});
test('Desktop Entry quotes spaces and protects field codes',()=>{
  assert.equal(desktopQuote('/路径/a b%f'), '"/路径/a b%%f"');
  assert.ok(desktopQuote('a"b').includes('\\\\"'));
});
