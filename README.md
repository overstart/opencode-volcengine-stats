# opencode-volcengine-stats

[![CI](https://github.com/overstart/opencode-volcengine-stats/actions/workflows/ci.yml/badge.svg)](https://github.com/overstart/opencode-volcengine-stats/actions/workflows/ci.yml)
[![NPM Publish](https://github.com/overstart/opencode-volcengine-stats/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/overstart/opencode-volcengine-stats/actions/workflows/npm-publish.yml)
[![NPM Version](https://img.shields.io/npm/v/opencode-volcengine-stats)](https://www.npmjs.com/package/opencode-volcengine-stats)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[中文文档](README.zh-CN.md)

An [OpenCode](https://opencode.ai) TUI plugin that shows your **Volcengine Ark
Coding Plan** quota usage as three progress bars, one per rolling rate-limit
window. It is placed so it **never covers OpenCode's own UI**:

- **Home screen** — pinned to the **top-right corner** (that corner is empty on
  the home screen; the logo and prompt are centered).
- **Session screen** — rendered **inside the right sidebar, below the session
  title/context** (in-flow, not an overlay), so the title and context stay
  fully visible.

Each window — **5h** (the 5-hour `session` window), **1W** (`weekly`),
**1M** (`monthly`) — gets a bar filled to the used percentage, the rounded
percent, and a reset countdown. Each window uses its own hue so they are easy
to tell apart at a glance: **5h = blue (info)**, **1W = green (success)**,
**1M = amber (warning)** turning **red (error)** at ≥90%.

```
5h ██████░░░░░░░░  47% in 1h53m
1W █░░░░░░░░░░░░░  10% in 6d8h
1M ██████████░░░░  73% in 1d8h
```

## Install

> This is a **TUI** plugin. It is loaded through the TUI config file
> `tui.json` / `tui.jsonc`, **not** from `.opencode/plugins/` (that directory
> is for *server* plugins).

**Prerequisite:** [`arkcli`](https://www.npmjs.com/package/@volcengine/ark-cli)
installed, on your `PATH`, and logged in (the plugin reads usage through it):

```bash
npm i -g @volcengine/ark-cli@latest
arkcli auth login
arkcli usage plan --product coding-plan --format json   # sanity check
```

You do **not** need to `npm i` the plugin yourself — OpenCode auto-installs TUI
plugins at startup.

### Option 1 — let OpenCode add it

```bash
opencode plugin add opencode-volcengine-stats        # current project
opencode plugin add opencode-volcengine-stats -g     # global (all projects)
```

### Option 2 — edit the TUI config

Add the plugin to `tui.json` (OpenCode installs and caches the package on next
launch):

- Global: `~/.config/opencode/tui.json`
- Per project: `<project>/.opencode/tui.json`

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-volcengine-stats"]
}
```

Restart OpenCode; the widget appears a second or two after startup (once the
first `arkcli` fetch returns).

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

## How it works

The plugin does **not** call the Ark API or handle authentication itself. It
shells out to `arkcli`, which you already have installed and authenticated:

```bash
arkcli usage plan --product coding-plan --format json
```

`arkcli` reads the active profile's credentials (local SSO / AK·SK / APIKey) and
calls the Ark **control-plane OpenTOP** endpoint (visible with `--debug`):

```
GET https://ark.cn-beijing.volcengineapi.com/?Action=GetCodingPlanUsage&Version=2024-01-01
```

The control plane returns a live snapshot of your plan in
`Result.QuotaUsage[]`:

```json
{ "Level": "session", "Cap": 100, "Percent": 32.8, "ResetTimestamp": 1788169437 }
```

- `Level` — the rate-limit window: `session` (**5-hour rolling**), `weekly`,
  `monthly`. The three are **independent** and each resets on its own schedule.
- `Cap` — percentage baseline (100).
- `Percent` — used percentage for that window.
- `ResetTimestamp` — window reset time (Unix seconds).

`arkcli` reshapes this into `items[].periods[]` (`label` / `percent` /
`reset_at`); the plugin maps `session`→`5h`, `weekly`→`1W`, `monthly`→`1M`.
It polls every **60s** for a fresh percentage and computes the reset countdown
locally once per second (no extra requests). If `arkcli` is missing, not logged
in, or reports no subscribed plan, the widget shows a muted `ark ✕`/`ark …`
placeholder and keeps retrying — it never breaks the TUI.

See the data-source reference:
<https://github.com/volcengine/ark-cli/blob/main/skills/arkcli-usage/references/arkcli-usage-plan.md>

## Notes & caveats

- **The figure is a live plan-quota snapshot**, 1:1 with the Ark console's "My
  Plan". It is **not** inference token usage (`arkcli usage stats`, delayed
  5–30 min) and **not** billing/spend (`arkcli billing`, T+1).
- **The three windows are independently limited** — the 5-hour, weekly, and
  monthly quotas don't affect each other; hitting any one can throttle you, so
  watch all three bars.
- **Follows the active arkcli profile** — account and region come from arkcli's
  current profile; switching profile / account / region changes the shown usage.
- **Product scope** — currently fixed to `--product coding-plan` (personal
  Coding Plan). For Agent Plan or team/seat views set `product` to
  `agent-plan` / `coding-plan-team`, etc.
- **Timeout & concurrency** — each call has a 15s timeout and uses an in-flight
  lock to avoid duplicate requests; on a slow/flaky control plane the worst case
  is one skipped refresh, recovered on the next.
- **Countdown uses the local clock** — `reset_at` is a timezone-aware ISO time;
  local clock skew affects only the countdown, not the percentage.
- **Security** — the plugin only reads usage percentages and renders locally; it
  never prints or uploads tokens / APIKeys / credentials.

## License

[MIT](LICENSE)
