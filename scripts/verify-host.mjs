// Exercises Codex's own plugin discovery and launcher, not just direct MCP startup.
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';
const home = await mkdtemp(join(tmpdir(), 'quota host 中文 '));
const cli = process.argv[2];
const command = cli ? process.execPath : 'codex';
const prefix = cli ? [resolve(cli)] : [];
const env = { ...process.env, HOME:home, USERPROFILE:home, LOCALAPPDATA:join(home,'AppData','Local'), CODEX_HOME:join(home,'.codex'), CODEX_MCP_NODE_PATH:process.execPath };
await mkdir(env.CODEX_HOME, {recursive:true});
const run = args => execFileSync(command,[...prefix,...args],{env,encoding:'utf8',timeout:60000});
run(['plugin','marketplace','add',process.cwd()]);
run(['plugin','add','weekly-usage@weekly-usage-local']);
const configured = JSON.parse(run(['mcp','list','--json']));
assert.ok(configured.some(s => s.name === 'weekly-usage' && s.enabled));
const host = spawn(command,[...prefix,'app-server','--listen','stdio://'],{env,stdio:['pipe','pipe','pipe'],windowsHide:true});
host.stderr.on('data',()=>{});
const lines = createInterface({input:host.stdout});
const send = message => host.stdin.write(JSON.stringify(message)+'\n');
try {
  await new Promise((resolve,reject) => {
    const timeout = setTimeout(()=>reject(new Error('Codex host startup timed out')),45000);
    host.once('error',reject);
    lines.on('line', line => {
      let data;try{data=JSON.parse(line);}catch{return;}
      if(data.id===1){send({method:'initialized'});send({id:2,method:'mcpServerStatus/list',params:{}});}
      if(data.id===2){
        clearTimeout(timeout);
        try {
          const server=data.result?.data?.find(s=>s.name==='weekly-usage');
          assert.ok(server,JSON.stringify(data));
          assert.equal(server.toolsError,null);
          assert.ok(server.tools.set_system_ring);
          assert.equal(server.serverInfo.version,'0.5.0');
          resolve();
        }catch(error){reject(error);}
      }
    });
    send({id:1,method:'initialize',params:{clientInfo:{name:'quota-host-test',version:'1'},capabilities:{experimentalApi:true}}});
  });
  console.log('CODEX_HOST_INSTALL_OK: clean profile, plugin discovery, platform launcher, MCP tools');
} finally { host.stdin.end(); lines.close(); host.kill(); }
