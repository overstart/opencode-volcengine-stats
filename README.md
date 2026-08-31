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

## How it works

The plugin does **not** call the Ark API or handle authentication itself. It
shells out to the [`arkcli`](https://www.npmjs.com/package/@volcengine/ark-cli)
CLI, which you already have installed and authenticated:

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
locally once per second (no extra requests).

> **In one line:** the plugin periodically runs `arkcli usage plan`, parses the
> JSON, and draws three progress bars in the top-right corner / sidebar.

## Notes & caveats

- **Requires `arkcli` installed, on your `PATH`, and logged in.** First confirm
  `arkcli usage plan --product coding-plan --format json` returns data. If the
  binary is missing, you're not logged in, or no plan is subscribed, the widget
  shows a muted `ark ✕`/`ark …` and keeps retrying — it never breaks the TUI.
- **The figure is a live plan-quota snapshot**, 1:1 with the Ark console's "My
  Plan". It is **not**:
  - inference token usage (that's `arkcli usage stats`, delayed 5–30 min);
  - billing / spend (that's `arkcli billing`, T+1).
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
- **arkcli version** — needs a recent `@volcengine/ark-cli` that supports the
  `usage plan` subcommand.
- **Security** — the plugin only reads usage percentages and renders locally; it
  never prints or uploads tokens / APIKeys / credentials.

See the data-source reference:
<https://github.com/volcengine/ark-cli/blob/main/skills/arkcli-usage/references/arkcli-usage-plan.md>

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
> plugins, a different, non-JSX plugin type).

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

### Releasing

Pushing a `v*` tag triggers `.github/workflows/npm-publish.yml`, which runs the
checks, publishes to npm with provenance, and creates a GitHub Release. Make
sure the repo has an `NPM_TOKEN` secret (an npm **automation** token, so 2FA
doesn't block CI).

```bash
# bump version in package.json, then:
git tag v0.1.4
git push origin v0.1.4
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

## License

[MIT](LICENSE)
