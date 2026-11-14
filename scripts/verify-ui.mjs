import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const html = await readFile('plugins/weekly-usage/dist/dashboard.html','utf8');
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true});
try {
  const page = await browser.newPage({viewport:{width:840,height:900},locale:'zh-CN'});
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.evaluate(({html})=>{
    const frame=document.createElement('iframe');frame.id='view';frame.style='width:100%;height:100vh;border:0';
    const now=Date.now();
    const data={fetchedAtMs:now,windows:{
      weekly:{usedPercent:20,windowMinutes:10080,resetsAtMs:now+5040*60000},
      fiveHour:{usedPercent:90,windowMinutes:300,resetsAtMs:now+150*60000}
    }};
    window.quotaFixture=data;
    window.emitQuota=()=>frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{content:[],structuredContent:window.quotaFixture}},'*');
    addEventListener('message',({source,data})=>{
      if(source!==frame.contentWindow||data?.jsonrpc!=='2.0')return;
      if(data.method==='ui/initialize')source.postMessage({jsonrpc:'2.0',id:data.id,result:{protocolVersion:data.params.protocolVersion,hostInfo:{name:'test',version:'1'},hostCapabilities:{serverTools:{}},hostContext:{theme:'light'}}},'*');
      if(data.method==='ui/notifications/initialized')window.emitQuota();
      if(data.method==='tools/call')source.postMessage({jsonrpc:'2.0',id:data.id,result:{content:[],structuredContent:window.quotaFixture}},'*');
    });
    frame.srcdoc=html;document.body.append(frame);
  },{html});
  const f=page.frameLocator('#view');
  await f.locator('#advice').filter({hasText:'轻量模型'}).waitFor();
  assert.equal(await f.locator('.chart').nth(0).getAttribute('data-tone'),'cyan');
  assert.equal(await f.locator('.chart').nth(1).getAttribute('data-tone'),'red');
  await f.locator('#language').selectOption('en');
  await f.getByRole('heading',{name:'Codex Usage Compass'}).waitFor();
  assert.match(await f.locator('#advice').textContent(),/important work/);
  const old=await f.locator('[data-field="countdown"]').nth(1).textContent();
  await f.locator('[data-field="countdown"]').nth(1).filter({hasNotText:old}).waitFor({timeout:3500});
  await page.evaluate(()=>{window.quotaFixture={...window.quotaFixture,fetchedAtMs:Date.now(),windows:{weekly:window.quotaFixture.windows.weekly,fiveHour:null}};window.emitQuota();});
  await f.getByText('No data available',{exact:true}).waitFor();
  assert.match(await f.locator('#advice').textContent(),/stronger model/);
  await page.setViewportSize({width:375,height:850});
  assert.ok(await f.locator('html').evaluate(e=>e.scrollWidth<=e.clientWidth));
  await page.screenshot({path:'/tmp/usage-compass-verified.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('UI passed: both limits, conservative advice, language switch, countdown, unavailable window, mobile width.');
} finally { await browser.close(); }
