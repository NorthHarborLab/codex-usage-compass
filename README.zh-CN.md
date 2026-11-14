# Codex 额度指南

[English](README.md)

[Download v0.3.2](https://github.com/NorthHarborLab/codex-usage-compass/releases/tag/v0.3.2)
显示 7 天与 5 小时额度圆环，结合剩余时间给出模型和速度建议。Ubuntu 顶栏小组件可随手展开，查看时保留当前聊天页面。

## 安装

先安装并登录 Codex CLI，准备 Node.js 20 以上版本。Codex 桌面自带的 CLI 和 Node.js 也可使用。下载 Release 压缩包并解压，在解压目录执行：

```sh
sh scripts/install-linux.sh plugin
```

在桌面侧栏打开 **Codex 额度指南 / Codex Usage Compass**，或在聊天中要求打开额度圆环。若仍显示旧名称「Codex 周额度」，重新打开桌面应用。请保留解压目录，它是本地插件市场来源。

安装 Ubuntu 顶栏组件：

```sh
sudo apt install gjs gir1.2-gtk-3.0 gir1.2-appindicator3-0.1 gnome-shell-extension-appindicator
sh scripts/install-linux.sh indicator
```

若系统使用 Ayatana，可改装 `gir1.2-ayatanaappindicator3-0.1`。组件兼容两种接口。需要启用 GNOME 的 AppIndicator 扩展，Ubuntu 通常已自带。

组件安装到 `~/.local/share/codex-weekly-usage`，通过用户级 systemd 服务在登录桌面时启动。顶栏显示彩色圆环和余量，单击展开两个周期的数据、倒计时、建议、刷新与语言选项。两个周期都有数据时，图标优先展示覆盖率较低的周期。

同时安装两部分可执行 `sh scripts/install-linux.sh all`。升级时，在新版本目录重新执行同一命令。

## 卸载

```sh
sh scripts/uninstall-linux.sh all
# 只卸载顶栏或插件：
sh scripts/uninstall-linux.sh indicator
sh scripts/uninstall-linux.sh plugin
```

语言偏好保留在 `~/.config/codex-weekly-usage-language`，删除此文件即可恢复系统语言。市场注册可用 `codex plugin marketplace remove weekly-usage-local` 删除。

## 颜色和建议

覆盖率为「实际余量 ÷ 按时间应留额度」。应留额度为「距重置分钟数 ÷ 周期分钟数 × 100%」。周周期为 10,080 分钟，5 小时周期为 300 分钟。

| 覆盖率 | 颜色 | 使用建议 |
|---|---|---|
| 低于 25% | 红 | 留给重要任务，轻量模型、标准速度或等待重置 |
| 25% 至不足 50% | 橙 | 降低模型或推理强度 |
| 50% 至不足 80% | 黄 | 复杂任务用强模型，日常任务节省额度 |
| 80% 至不足 100% | 蓝 | 保持平稳节奏 |
| 100% 至不足 150% | 绿 | 余量宽裕，重要任务可用更强模型 |
| 150% 起 | 青 | 可以尝试更强模型或套餐支持的快速模式 |

圆环最多填满一圈，中心显示实际余量。建议同时参考两个可用窗口，实际余量 ≤5% 时优先提醒节省。周期到期或数据超过两分钟时先等待更新。缺失窗口显示「暂无数据」。

这些建议依据均匀使用节奏计算，目前没有历史习惯学习功能。模型和速度选项依套餐而定，建议不会自动更改设置。倒计时每秒更新，用量每分钟同步。

## 多语言与支持范围

面板及顶栏完整支持简体中文和英文，可手动切换。其他语言回退英文，其他中文地区设置使用简体中文。面板跟随浏览器语言，顶栏跟随系统语言，手动选择会在存储可用时保留。

本次发布验证了 Ubuntu GNOME 50。Windows 和 macOS 顶栏/托盘尚未实现，也未进行平台测试。5 小时窗口已用模拟数据测试，当前实际账户只返回周额度。

## 数据与开发

插件调用本机 `codex app-server` 的 `account/rateLimits/read`。认证由 Codex 处理，每位使用者登录自己的账户。插件不会复制凭据、读取聊天内容、运行推理或上传用量到项目服务器。用量仅保存在内存，语言偏好和运行时圆环图片保存在本机。

这是独立项目，与 OpenAI 无隶属关系。额度接口和桌面扩展接口可能随版本变化。

```sh
npm ci
npm test
npm run build
CHROME_PATH=/usr/bin/google-chrome node scripts/verify-ui.mjs
```

发布包包含预构建文件，安装无需 npm。详细测试范围见 [VERIFICATION.md](VERIFICATION.md)，依赖许可证见 [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt)。
