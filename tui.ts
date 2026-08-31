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

function colorForPercent(percent: number, theme: any): any {
  if (percent >= 90) return theme.error
  if (percent >= 70) return theme.warning
  return theme.success
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
        { flexDirection: "column", rowGap: 1 },
        d.windows.map((w) => {
          const cd = options.showCountdown ? formatCountdown(w.resetAt, now()) : ""
          const row = [
            text({ fg: theme.textMuted }, [w.label]),
            text({ fg: colorForPercent(w.percent, theme) }, [bar(w.percent, options.barWidth)]),
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
      // Session screen: in-flow inside the right sidebar, below the title.
      sidebar_content(_ctx: unknown, _props: unknown) {
        return box({ marginTop: 1, flexShrink: 0, flexDirection: "column" }, [
          WidgetBody(api, options),
        ])
      },
      // Home screen: overlay in the empty top-right corner (suppressed on
      // other routes, where the sidebar owns that corner).
      app() {
        if (api.route?.current?.name !== "home") return null
        return box(
          {
            position: "absolute",
            top: 0,
            right: 1,
            zIndex: 5000,
            flexShrink: 0,
            flexDirection: "column",
            paddingLeft: 1,
            paddingRight: 1,
          },
          [WidgetBody(api, options)],
        )
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "volcengine-stats",
  tui,
}

export default plugin
