# opencode-volcengine-stats

[![CI](https://github.com/overstart/opencode-volcengine-stats/actions/workflows/ci.yml/badge.svg)](https://github.com/overstart/opencode-volcengine-stats/actions/workflows/ci.yml)
[![NPM Publish](https://github.com/overstart/opencode-volcengine-stats/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/overstart/opencode-volcengine-stats/actions/workflows/npm-publish.yml)
[![NPM Version](https://img.shields.io/npm/v/opencode-volcengine-stats)](https://www.npmjs.com/package/opencode-volcengine-stats)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md)

一个 [OpenCode](https://opencode.ai) TUI 插件，把你的**火山方舟 Coding Plan**
套餐用量按三个滚动限流窗口画成三条进度条。摆放位置经过设计，**绝不遮挡
OpenCode 自己的界面**：

- **首页**——钉在**右上角**（首页该区域是空白，logo 和输入框居中）。
- **会话页**——渲染在**右侧栏内部、会话标题/上下文下方**（随文档流，不是浮层），
  因此标题和上下文始终完整可见。

每个窗口——**5h**（5 小时 `session` 窗口）、**1W**（`weekly` 周）、
**1M**（`monthly` 月）——都有一条按已用百分比填充的进度条、四舍五入的百分比，
以及重置倒计时。三条进度条各自使用不同色相，一眼可分：
**5h = 蓝色（info）**、**1W = 绿色（success）**、**1M = 琥珀色（warning）**，
用量 ≥90% 时变**红（error）**。

```
5h ██████░░░░░░░░  47% in 1h53m
1W █░░░░░░░░░░░░░  10% in 6d8h
1M ██████████░░░░  73% in 1d8h
```

## 工作原理

插件本身**不直接调用方舟 API，也不处理鉴权**。它只是去调用本机已经安装并登录好
的 [`arkcli`](https://www.npmjs.com/package/@volcengine/ark-cli)：

```bash
arkcli usage plan --product coding-plan --format json
```

`arkcli` 读取当前 profile 的登录凭证（本机 SSO / AK·SK / APIKey），向火山方舟
**控制面 OpenTOP** 发起请求（`--debug` 可见）：

```
GET https://ark.cn-beijing.volcengineapi.com/?Action=GetCodingPlanUsage&Version=2024-01-01
```

控制面返回「我的套餐」实时快照，核心字段在 `Result.QuotaUsage[]`：

```json
{ "Level": "session", "Cap": 100, "Percent": 32.8, "ResetTimestamp": 1788169437 }
```

- `Level`：限流窗口，取值 `session`（**5 小时滚动窗口**）、`weekly`（周）、
  `monthly`（月），三者**相互独立**、各自滚动重置。
- `Cap`：百分比基准（100）。
- `Percent`：该窗口已用百分比。
- `ResetTimestamp`：窗口重置时间（Unix 秒）。

`arkcli` 把它整理成 `items[].periods[]`（`label` / `percent` / `reset_at`），
插件再把 `session` 显示为 `5h`、`weekly` 显示为 `1W`、`monthly` 显示为 `1M`。
插件每 **60s** 拉取一次最新百分比；「重置倒计时」是每秒用 `reset_at` 在**本地**
计算的，不额外发请求。

> **一句话：** 插件定时跑 `arkcli usage plan` → 解析 JSON → 在右上角/侧栏画三条
> 进度条。

## 注意事项

- **依赖 `arkcli` 已安装、在 `PATH` 上、且已登录。** 先自行确认
  `arkcli usage plan --product coding-plan --format json` 能出数据；找不到
  二进制、未登录、未订阅时，插件只显示灰色 `ark ✕`/`ark …` 并继续重试，不会让
  TUI 报错。
- **数据口径是「套餐额度快照」**，和火山方舟控制台「我的套餐」1:1，是实时的。
  它**不是**：
  - 推理 token 用量（那是 `arkcli usage stats`，有 5–30 分钟延迟）；
  - 账单/消费金额（那是 `arkcli billing`，T+1 出账）。
- **三个窗口独立限流**：5 小时、周、月额度互不影响，任何一个打满都可能触发
  限流，请分别看三条进度条。
- **跟着 arkcli profile 走**：插件用的是 `arkcli` 当前激活 profile 的账号和
  region；切换 profile / 账号 / region 后，显示的用量会对应变化。
- **产品范围**：当前固定查 `--product coding-plan`（个人 Coding Plan）。
  Agent Plan 或团队版/席位视图需把 `product` 改成 `agent-plan` /
  `coding-plan-team` 等。
- **超时与并发**：单次调用有 15s 超时，并用 in-flight 锁避免重复并发请求；
  网络慢或控制面抖动时最坏情况是某一轮不更新，下一轮自动恢复。
- **倒计时依赖本机时钟**：`reset_at` 是带时区的 ISO 时间，倒计时按本机时间
  计算，本机时钟偏差只会影响倒计时显示，不影响百分比本身。
- **arkcli 版本**：需要支持 `usage plan` 子命令的较新版本（`@volcengine/ark-cli`
  最新版即可）。
- **安全**：插件只读取用量百分比并在本地渲染，不打印、不上传任何 token /
  APIKey / 凭证。

数据源参考：
<https://github.com/volcengine/ark-cli/blob/main/skills/arkcli-usage/references/arkcli-usage-plan.md>

## 前置条件

1. 已安装 [OpenCode](https://opencode.ai)（插件面向 OpenCode 1.18+ 自带的 TUI
   插件 API）。
2. 已安装并登录 `arkcli`：
   ```bash
   npm i -g @volcengine/ark-cli@latest
   arkcli auth login        # 或你平时的登录方式
   arkcli usage plan --product coding-plan --format json   # 自检
   ```
   请确保 `arkcli` 在 `PATH` 上，OpenCode 进程才能调用它。

## 安装

> **重要：** 这是一个 **TUI** 插件。TUI 插件通过专用的 TUI 配置文件
> `tui.json` / `tui.jsonc` 加载——它们**不会**从 `.opencode/plugins/` 自动加载
> （那个目录放的是 *server* 插件，是另一种非 JSX 插件类型）。

包通过 `opencode-volcengine-stats/tui` 入口暴露 TUI 插件（默认导出
`{ id, tui }`）。你**不需要**自己 `npm i`——OpenCode 会在启动时自动安装
TUI 插件。

### 作为 npm 包安装（推荐）

把插件加到 TUI 配置里，OpenCode 下次启动会自动安装并缓存该包。

- 全局（所有项目）：编辑 `~/.config/opencode/tui.json`
- 单项目：编辑 `<项目>/.opencode/tui.json`

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-volcengine-stats"]
}
```

也可以让 OpenCode 帮你改配置（`-g` 表示全局）：

```bash
opencode plugin add opencode-volcengine-stats        # 当前项目
opencode plugin add opencode-volcengine-stats -g     # 全局
```

如果你更愿意手动装包：

```bash
npm i -g opencode-volcengine-stats      # 全局
npm i    opencode-volcengine-stats      # 或作为项目依赖
```

重启 OpenCode；启动后约 1–2 秒（第一次 `arkcli` 返回后）小组件出现。

### 从源码运行（本仓库）

`.opencode/tui.json` 直接引用入口（相对于配置文件的路径）：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["../tui.ts"]
}
```

## 配置

TUI 插件选项通过 `tui.json` 中 `plugin` 条目的第二个元素传入。默认值：

| 选项            | 默认值          | 含义                              |
|-----------------|-----------------|-----------------------------------|
| `product`       | `"coding-plan"` | arkcli 产品 id                    |
| `bin`           | `"arkcli"`      | arkcli 二进制名称/路径            |
| `pollMs`        | `60000`         | 数据重新拉取间隔（毫秒）          |
| `barWidth`      | `14`            | 进度条轨道宽度（单元格）          |
| `showCountdown` | `true`          | 是否显示每个窗口的重置倒计时      |

`tui.json` 示例（通过 `[spec, options]` 传选项）：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["opencode-volcengine-stats", { "pollMs": 30000, "barWidth": 18 }]]
}
```

## 开发

- 数据层（纯逻辑，无 TUI）：`src/usage.ts`
- TUI 插件模块（Solid signals + 命令式 opentui `createElement`，因为以 npm 包
  发布的 TUI 插件不会被 JSX 转换）：`tui.ts`
- 本仓库加载它的 TUI 配置：`.opencode/tui.json`

```bash
bun install

bun run check        # 纯逻辑自检（解析/归一化/进度条/倒计时）
bun run fetch        # 把 arkcli 的实时用量归一化后以 JSON 打印
bun run check:tui    # 无头渲染真实小组件（会调用 arkcli）
bun run typecheck    # tsc --noEmit
```

### 发布

推送 `v*` tag 会触发 `.github/workflows/npm-publish.yml`：跑检查、带 provenance
发布到 npm、并创建 GitHub Release。请确保仓库配置了 `NPM_TOKEN` secret（npm 的
**automation** token，这样 2FA 不会卡住 CI）。

```bash
# 先在 package.json 里改版本号，然后：
git tag v0.1.4
git push origin v0.1.4
```

### Spec 驱动开发

规格用 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 管理在 `openspec/`
目录下。本小组件的变更提案位于
`openspec/changes/add-coding-plan-usage-widget/`（proposal、design、spec 增量、
tasks）。校验：

```bash
openspec validate add-coding-plan-usage-widget
```

### 代码导航

仓库已用 codegraph 建索引；运行 `codegraph init`（重新）构建 `.codegraph/`
索引，然后用 codegraph 工具浏览符号与调用路径。

## 许可证

[MIT](LICENSE)
