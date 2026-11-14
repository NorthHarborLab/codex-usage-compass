$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '..\plugins\weekly-usage\dist\desktop\UsageCompassTray.cs'
Add-Type -Path $source -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
$frame = & node --input-type=module -e "import {trayModel} from './src/tray-model.mjs';console.log(JSON.stringify(trayModel({fetchedAtMs:Date.now(),windows:{weekly:{usedPercent:20,windowMinutes:10080,resetsAtMs:Date.now()+5040*60000},fiveHour:{usedPercent:90,windowMinutes:300,resetsAtMs:Date.now()+150*60000}}},'zh-CN')))"
if ($LASTEXITCODE -ne 0) { throw 'Frame generation failed' }
[UsageCompassTray]::SelfTest($frame)
