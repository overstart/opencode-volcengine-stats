# opencode-volcengine-stats

An [OpenCode](https://opencode.ai) TUI plugin that shows your **Volcengine Ark
Coding Plan** quota usage as three progress bars for each rolling rate-limit
window. It is placed so it **never covers OpenCode's own UI**:

- **Home screen** — pinned to the **top-right corner** (that corner is empty on
  the home screen; the logo and prompt are centered).
- **Session screen** — rendered **inside the right sidebar, below the session
  title/context** (in-flow, not an overlay), so the title and context stay
  fully visible.

Each window — **5h** (the 5-hour `session` window), **1W** (`weekly`),
**1M** (`monthly`) — gets a bar filled to the used percentage, the rounded
percent, and a reset countdown. Bar color ramps green → amber → red using the
active TUI theme colors (works in dark and light themes).

```
5h ██████░░░░░░░░  47% in 1h53m
1W █░░░░░░░░░░░░░  10% in 6d8h
1M ██████████░░░░  73% in 1d8h
```

## How it works

The plugin does **not** call the Ark API or handle authentication itself. It
shells out to the [`arkcli`](https://www.npmjs.com/package/@volcengine/ark-cli)
CLI, which you already have installed and authenticated:

```bash
arkcli usage plan --product coding-plan --format json
```

It parses the returned `items[].periods[]` (fields `label`, `percent`,
`reset_at`), polls every minute, and counts down the reset time once per second
without refetching. If `arkcli` is missing, not logged in, or reports no
subscribed plan, the widget shows a muted `ark ✕` placeholder and keeps
retrying — it never breaks the TUI.

See the data-source reference:
<https://github.com/volcengine/ark-cli/blob/main/skills/arkcli-usage/references/arkcli-usage-plan.md>

## 原理与注意事项

### 获取 Coding Plan 用量的原理

插件本身**不直接调用火山方舟 API，也不处理登录/密钥**，它只是去调用本机
已经安装并登录好的 `arkcli`，把鉴权和请求都交给它：

1. 插件通过 Bun shell 执行：
   ```bash
   arkcli usage plan --product coding-plan --format json
   ```
2. `arkcli` 读取当前 profile 的登录凭证（本机 SSO / AK·SK / APIKey），向火山
   方舟**控制面 OpenTOP** 发起请求（`--debug` 可见）：
   ```
   GET https://ark.cn-beijing.volcengineapi.com/?Action=GetCodingPlanUsage&Version=2024-01-01
   ```
   Region 跟随当前 profile（默认 `cn-beijing`）。
3. 控制面返回「我的套餐」实时快照，核心字段在 `Result.QuotaUsage[]`：
   ```json
   { "Level": "session", "Cap": 100, "Percent": 32.8, "ResetTimestamp": 1788169437 }
   ```
   - `Level`：限流窗口，取值 `session`（**5 小时滚动窗口**）、`weekly`（周）、
     `monthly`（月），三者**相互独立**、各自滚动重置。
   - `Cap`：百分比基准（100）。
   - `Percent`：该窗口已用百分比。
   - `ResetTimestamp`：窗口重置时间（Unix 秒）。
4. `arkcli` 把它整理成 `items[0].periods[]`（`label` / `percent` / `reset_at`），
   插件再把 `session` 显示为 `5h`、`weekly` 显示为 `1W`、`monthly` 显示为 `1M`。
5. 插件每 **60s** 拉取一次最新百分比；进度条颜色按用量 green→amber→red。
   「重置倒计时」是每秒用 `reset_at` 在**本地**计算的，不额外发请求。

一句话：**插件 = 定时跑 `arkcli usage plan` → 解析 JSON → 在右上角画三条进度条。**

### 注意事项

- **依赖 arkcli 已安装并在 `PATH` 上，且已登录。** 先自行确认
  `arkcli usage plan --product coding-plan --format json` 能出数据；找不到
  二进制、未登录、未订阅时，插件只显示灰色 `ark ✕`/`ark …` 并继续重试，
  不会让 TUI 报错。
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
  计算，本机时钟偏差会影响倒计时显示（不影响百分比本身）。
- **arkcli 版本**：需要支持 `usage plan` 子命令的较新版本（`@volcengine/ark-cli`
  最新版即可）。
- **安全**：插件只读取用量百分比并在本地渲染，不打印、不上传任何 token /
  APIKey / 凭证。

## Prerequisites

1. [OpenCode](https://opencode.ai) installed (the plugin targets the TUI plugin
   API shipped with OpenCode 1.18+).
2. `arkcli` installed and authenticated:
   ```bash
   npm i -g @volcengine/ark-cli@latest
   arkcli auth login        # or however you normally authenticate
   arkcli usage plan --product coding-plan --format json   # sanity check
   ```
   Make sure `arkcli` is on your `PATH` so the OpenCode process can run it.

## Install

> **Important:** this is a **TUI** plugin. TUI plugins are loaded through the
> dedicated TUI config file `tui.json` / `tui.jsonc` — they are **not**
> auto-loaded from `.opencode/plugins/` (that directory is for *server*
> plugins, which is a different, non-JSX plugin type).

The package exposes the TUI plugin via the `opencode-volcengine-stats/tui`
entrypoint (default-exports `{ id, tui }`). You do **not** need to install it
with `npm i` yourself — OpenCode auto-installs TUI plugins at startup.

### Install as an npm package (recommended)

Add the plugin to your TUI config. OpenCode installs and caches the package
automatically on next launch.

- Global (all projects): edit `~/.config/opencode/tui.json`
- Per project: edit `<project>/.opencode/tui.json`

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-volcengine-stats"]
}
```

Or let OpenCode patch the config for you (`-g` for global):

```bash
opencode plugin add opencode-volcengine-stats        # current project
opencode plugin add opencode-volcengine-stats -g     # global
```

You can also install the package directly if you prefer:

```bash
npm i -g opencode-volcengine-stats      # global
npm i    opencode-volcengine-stats      # or as a project dependency
```

Restart OpenCode; the widget appears a second or two after startup (once the
first `arkcli` fetch returns).

### Run from source (this repo)

`.opencode/tui.json` references the entry directly (path relative to the config
file):

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["../tui.ts"]
}
```

## Configuration

TUI-plugin options are passed as the second element of the `plugin` entry in
`tui.json`. Defaults:

| Option          | Default        | Meaning                                   |
|-----------------|----------------|-------------------------------------------|
| `product`       | `"coding-plan"`| arkcli product id                         |
| `bin`           | `"arkcli"`     | arkcli binary name/path                   |
| `pollMs`        | `60000`        | Data refetch interval (ms)                |
| `barWidth`      | `14`           | Progress-bar track width in cells         |
| `showCountdown` | `true`         | Show the per-window reset countdown       |

Example `tui.json` (options via `[spec, options]`):

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["opencode-volcengine-stats", { "pollMs": 30000, "barWidth": 18 }]]
}
```

## Development

- Data layer (pure, no TUI): `src/usage.ts`
- TUI plugin module (Solid signals + imperative opentui `createElement`,
  because TUI plugins shipped as npm packages are not JSX-transformed):
  `tui.ts`
- TUI config that loads it in this repo: `.opencode/tui.json`

```bash
bun install

bun run check        # pure-logic self-check (parse/normalize/bar/countdown)
bun run fetch        # print normalized live usage from arkcli as JSON
bun run check:tui    # render the real widget headlessly (runs arkcli)
bun run typecheck    # tsc --noEmit
```

### Spec-driven development

Specs are managed with [OpenSpec](https://github.com/Fission-AI/OpenSpec) under
`openspec/`. The change proposal for this widget lives in
`openspec/changes/add-coding-plan-usage-widget/` (proposal, design, spec deltas,
and tasks). Validate with:

```bash
openspec validate add-coding-plan-usage-widget
```

### Code navigation

The repo is indexed with codegraph; run `codegraph init` to (re)build the
`.codegraph/` index, then explore symbols/call-paths with the codegraph tools.
