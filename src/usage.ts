/**
 * Data layer for the Volcengine Coding Plan usage widget.
 *
 * Pure, TUI-free: shells out to `arkcli usage plan`, parses JSON, normalizes
 * the rolling-window periods, and provides formatting helpers. No Solid or
 * opentui imports so it stays unit-testable with Bun.
 */

export type WindowKey = "session" | "weekly" | "monthly"

export interface UsageWindow {
  key: WindowKey
  /** Short label shown in the TUI, e.g. "5h", "1W", "1M". */
  label: string
  /** Used percentage, 0-100+. */
  percent: number
  /** ISO timestamp when the window resets. */
  resetAt?: string
}

export interface UsageData {
  product: string
  edition?: string
  windows: UsageWindow[]
  updatedAt: number
}

export class UsageError extends Error {}

interface ArkPeriod {
  label?: string
  percent?: number
  reset_at?: string
}

interface ArkItem {
  product?: string
  edition?: string
  subscribed?: boolean
  periods?: ArkPeriod[]
}

interface ArkPlanOutput {
  items?: ArkItem[]
}

const LABELS: Record<WindowKey, string> = {
  session: "5h",
  weekly: "1W",
  monthly: "1M",
}

const ORDER: WindowKey[] = ["session", "weekly", "monthly"]

/**
 * Run `arkcli usage plan` and return the normalized Coding Plan windows.
 * Throws UsageError on any failure (missing binary, non-zero exit, bad JSON,
 * not subscribed). Callers are expected to catch and degrade gracefully.
 */
export async function fetchUsage(options: {
  product?: string
  bin?: string
  timeoutMs?: number
  signal?: AbortSignal
} = {}): Promise<UsageData> {
  const product = options.product ?? "coding-plan"
  const bin = options.bin ?? "arkcli"
  const timeoutMs = options.timeoutMs ?? 15000

  const proc = Bun.spawn(
    [bin, "usage", "plan", "--product", product, "--format", "json"],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  )

  const timer = setTimeout(() => proc.kill(), timeoutMs)
  let stdout = ""
  let stderr = ""
  let exitCode = -1
  try {
    const out = await new Response(proc.stdout).text()
    const err = await new Response(proc.stderr).text()
    stdout = out
    stderr = err
    exitCode = await proc.exited
  } catch (e) {
    throw new UsageError(`failed to run ${bin}: ${(e as Error).message}`)
  } finally {
    clearTimeout(timer)
  }

  if (exitCode !== 0) {
    const hint = stderr.trim().split("\n").pop() ?? ""
    throw new UsageError(
      `${bin} exited ${exitCode}${hint ? `: ${hint}` : " (not installed or not authenticated?)"}`,
    )
  }

  let parsed: ArkPlanOutput
  try {
    parsed = JSON.parse(stdout) as ArkPlanOutput
  } catch {
    throw new UsageError(`could not parse ${bin} JSON output`)
  }

  return normalize(parsed, product)
}

/** Pick the subscribed item for `product` and map its periods to windows. */
export function normalize(data: ArkPlanOutput, product: string): UsageData {
  const item = (data.items ?? []).find(
    (it) => (it.product ?? "") === product && it.subscribed !== false,
  )
  if (!item) {
    throw new UsageError(`no subscribed ${product} plan reported by arkcli`)
  }

  const byKey = new Map<WindowKey, UsageWindow>()
  for (const p of item.periods ?? []) {
    const key = (p.label ?? "").toLowerCase() as WindowKey
    const label = LABELS[key]
    if (!label) continue
    byKey.set(key, {
      key,
      label,
      percent: clampPercent(p.percent ?? 0),
      resetAt: p.reset_at,
    })
  }

  const windows = ORDER.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!)
  if (windows.length === 0) {
    throw new UsageError(`${product} plan reported no usage windows`)
  }

  return {
    product,
    edition: item.edition,
    windows,
    updatedAt: Date.now(),
  }
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

/** Build a block-character progress bar string for a percentage. */
export function bar(percent: number, width: number, fill = "█", empty = "░"): string {
  const w = Math.max(1, Math.floor(width))
  const filled = Math.round((clampPercent(percent) / 100) * w)
  return fill.repeat(filled) + empty.repeat(w - filled)
}

/** Compact "reset in" countdown, e.g. "4h12m", "35m", "6d". Empty when past. */
export function formatCountdown(resetAt: string | undefined, now: number = Date.now()): string {
  if (!resetAt) return ""
  const ms = new Date(resetAt).getTime() - now
  if (!Number.isFinite(ms) || ms <= 0) return "resetting"
  const mins = Math.floor(ms / 60000)
  const days = Math.floor(mins / (60 * 24))
  const hours = Math.floor((mins % (60 * 24)) / 60)
  const m = mins % 60
  if (days > 0) return `${days}d${hours}h`
  if (hours > 0) return `${hours}h${m}m`
  return `${m}m`
}

/** Self-check: run with `bun run src/usage.ts`. */
function selfCheck() {
  const fixture: ArkPlanOutput = {
    items: [
      {
        product: "coding-plan",
        edition: "personal",
        subscribed: true,
        periods: [
          { label: "session", percent: 25.71, reset_at: new Date(Date.now() + 3 * 3600_000 + 12 * 60_000).toISOString() },
          { label: "weekly", percent: 7.44, reset_at: new Date(Date.now() + 6 * 86400_000).toISOString() },
          { label: "monthly", percent: 71.27, reset_at: new Date(Date.now() + 25 * 3600_000).toISOString() },
        ],
      },
    ],
  }

  const data = normalize(fixture, "coding-plan")
  if (data.windows.length !== 3) throw new Error("expected 3 windows")
  if (data.windows.map((w) => w.key).join(",") !== "session,weekly,monthly") {
    throw new Error("wrong window order")
  }
  if (data.windows[0].label !== "5h" || data.windows[1].label !== "1W" || data.windows[2].label !== "1M") {
    throw new Error("wrong labels")
  }
  if (Math.abs(data.windows[2].percent - 71.27) > 0.01) throw new Error("percent mismatch")

  const b = bar(25, 8)
  if (b.split("█").length - 1 !== 2) throw new Error(`bar fill wrong: ${b}`)
  if (b.length !== 8) throw new Error(`bar width wrong: ${b.length}`)
  if (bar(0, 5) !== "░░░░░") throw new Error("bar 0 wrong")
  if (bar(100, 5) !== "█████") throw new Error("bar 100 wrong")

  const cd = formatCountdown(new Date(Date.now() + 3 * 3600_000 + 5 * 60_000).toISOString())
  if (!/^\dh/.test(cd)) throw new Error(`countdown wrong: ${cd}`)
  if (formatCountdown(new Date(Date.now() - 1000).toISOString()) !== "resetting") {
    throw new Error("past countdown wrong")
  }

  let threw = false
  try {
    normalize({ items: [{ product: "coding-plan", subscribed: false }] }, "coding-plan")
  } catch {
    threw = true
  }
  if (!threw) throw new Error("unsubscribed should throw")

  console.log("usage self-check OK")
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    selfCheck()
  } else {
    fetchUsage()
      .then((d) => console.log(JSON.stringify(d, null, 2)))
      .catch((e) => {
        console.error(String(e?.message ?? e))
        process.exit(1)
      })
  }
}
