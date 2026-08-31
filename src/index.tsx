/** @jsxImportSource @opentui/solid */
import { createSignal, onCleanup } from "solid-js"
import type {
  TuiPlugin,
  TuiPluginModule,
  TuiSlotPlugin,
} from "@opencode-ai/plugin/tui"
import {
  bar,
  fetchUsage,
  formatCountdown,
  UsageError,
  type UsageData,
} from "./usage.js"

interface PluginOptions {
  /** arkcli product id. Default: "coding-plan". */
  product?: string
  /** arkcli binary name or path. Default: "arkcli". */
  bin?: string
  /** Data refetch interval in ms. Default: 60000. */
  pollMs?: number
  /** Progress-bar track width in cells. Default: 14. */
  barWidth?: number
  /** Show the per-window reset countdown. Default: true. */
  showCountdown?: boolean
}

const PLUGIN_ID = "volcengine-stats"

function colorForPercent(percent: number, theme: any): any {
  if (percent >= 90) return theme.error
  if (percent >= 70) return theme.warning
  return theme.success
}

/**
 * The three usage rows. Pure in-flow content (no absolute positioning) so it
 * can be embedded either in the sidebar or the home overlay. Owns its own
 * polling lifecycle per mounted instance.
 */
const WidgetBody = (props: { api: any; options: Required<PluginOptions> }) => {
  const { api, options } = props
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

  return (
    <box flexDirection="column" gap={0} flexShrink={0}>
      {(() => {
        const d = data()
        const theme = api.theme.current
        if (!d) {
          return <text fg={theme.textMuted}>{error() ? "ark ✕" : "ark …"}</text>
        }
        return (
          <box flexDirection="column" gap={0}>
            {d.windows.map((w) => {
              const cd = options.showCountdown ? formatCountdown(w.resetAt, now()) : ""
              return (
                <box flexDirection="row" gap={1} alignItems="center">
                  <text fg={theme.textMuted}>{w.label}</text>
                  <text fg={colorForPercent(w.percent, theme)}>
                    {bar(w.percent, options.barWidth)}
                  </text>
                  <text fg={theme.text}>{Math.round(w.percent).toString().padStart(3, " ")}%</text>
                  {cd ? <text fg={theme.textMuted}>in {cd}</text> : null}
                </box>
              )
            })}
          </box>
        )
      })()}
    </box>
  )
}

const tui: TuiPlugin = async (api, rawOptions) => {
  const options: Required<PluginOptions> = {
    product: (rawOptions?.product as string) ?? "coding-plan",
    bin: (rawOptions?.bin as string) ?? "arkcli",
    pollMs: (rawOptions?.pollMs as number) ?? 60_000,
    barWidth: (rawOptions?.barWidth as number) ?? 14,
    showCountdown: rawOptions?.showCountdown !== false,
  }

  const slot: TuiSlotPlugin = {
    slots: {
      // Session screen: render in-flow inside the right sidebar, below the
      // session title. Never overlaps the title/context UI.
      sidebar_content() {
        return (
          <box marginTop={1} flexShrink={0} flexDirection="column" gap={0}>
            <WidgetBody api={api} options={options} />
          </box>
        )
      },
      // Home screen: the top-right corner is empty (logo/prompt are centered),
      // so an overlay there covers nothing. Suppress it on other routes where
      // the right sidebar owns that corner.
      app() {
        if (api.route?.current?.name !== "home") return null
        return (
          <box
            position="absolute"
            top={0}
            right={1}
            zIndex={5000}
            flexShrink={0}
            flexDirection="column"
            paddingLeft={1}
            paddingRight={1}
          >
            <WidgetBody api={api} options={options} />
          </box>
        )
      },
    },
  }
  api.slots.register(slot)
}

const plugin: TuiPluginModule & { id: string } = {
  id: PLUGIN_ID,
  tui,
}

export default plugin
