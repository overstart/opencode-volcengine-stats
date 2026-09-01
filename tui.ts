import { createSignal, onCleanup } from "solid-js"
import { createElement, setProp, insert } from "@opentui/solid"
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import {
  bar,
  fetchUsage,
  formatCountdown,
  UsageError,
  type UsageData,
} from "./src/usage"

interface PluginOptions {
  product?: string
  bin?: string
  pollMs?: number
  barWidth?: number
  showCountdown?: boolean
}

type Child = string | number | boolean | null | undefined | object | (() => Child)

function el(tag: string, props: Record<string, unknown>, children: Child[] = []): any {
  const node = createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) setProp(node, key, value)
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) insert(node, child)
  }
  return node
}
const box = (props: Record<string, unknown>, children: Child[] = []) => el("box", props, children)
const text = (props: Record<string, unknown>, children: Child[] = []) => el("text", props, children)

function barColor(key: string, percent: number, theme: any): any {
  // Distinct hue per window so 5h / 1W / 1M are tellable at a glance;
  // monthly still ramps to red when nearly exhausted.
  if (key === "session") return theme.info ?? theme.primary
  if (key === "weekly") return theme.success
  if (percent >= 90) return theme.error
  return theme.warning
}

function WidgetBody(api: any, options: Required<PluginOptions>) {
  const [data, setData] = createSignal<UsageData | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [now, setNow] = createSignal(Date.now())

  let inFlight = false
  const refresh = async () => {
    if (inFlight) return
    inFlight = true
    try {
      const result = await fetchUsage({ product: options.product, bin: options.bin })
      setData(result)
      setError(null)
    } catch (e) {
      setData(null)
      setError(e instanceof UsageError ? e.message : String(e))
    } finally {
      inFlight = false
    }
  }

  refresh()
  const poll = setInterval(refresh, options.pollMs)
  const tick = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => {
    clearInterval(poll)
    clearInterval(tick)
  })

  return box({ flexDirection: "column", flexShrink: 0 }, [
    () => {
      const d = data()
      const theme = api.theme.current
      if (!d) {
        return text({ fg: theme.textMuted }, [error() ? "ark ✕" : "ark …"])
      }
      return box(
        { flexDirection: "column" },
        d.windows.map((w) => {
          const cd = options.showCountdown ? formatCountdown(w.resetAt, now()) : ""
          const row = [
            text({ fg: theme.textMuted }, [w.label]),
            text({ fg: barColor(w.key, w.percent, theme) }, [bar(w.percent, options.barWidth)]),
            text({ fg: theme.text }, [`${Math.round(w.percent).toString().padStart(3, " ")}%`]),
          ] as Child[]
          if (cd) row.push(text({ fg: theme.textMuted }, [`in ${cd}`]))
          return box({ flexDirection: "row", gap: 1, alignItems: "center" }, row)
        }),
      )
    },
  ])
}

const tui: TuiPlugin = async (api, rawOptions) => {
  const options: Required<PluginOptions> = {
    product: (rawOptions?.product as string) ?? "coding-plan",
    bin: (rawOptions?.bin as string) ?? "arkcli",
    pollMs: (rawOptions?.pollMs as number) ?? 60_000,
    barWidth: (rawOptions?.barWidth as number) ?? 14,
    showCountdown: rawOptions?.showCountdown !== false,
  }

  api.slots.register({
    slots: {
      // Session screen only: in-flow inside the right sidebar, below the
      // title. The host mounts this slot with a session_id, so the widget
      // never appears on the home screen (matches context/mcp sidebar items).
      sidebar_content(_ctx: unknown, _props: unknown) {
        return box({ marginTop: 1, flexShrink: 0, flexDirection: "column" }, [
          WidgetBody(api, options),
        ])
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "volcengine-stats",
  tui,
}

export default plugin
