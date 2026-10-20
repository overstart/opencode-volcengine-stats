import { createSignal, For, onCleanup, Show } from "solid-js"
import { Plugin, usePlugin } from "@opencode/plugin/tui"
import {
  bar,
  fetchUsage,
  formatCountdown,
  type UsageData,
  type WindowKey,
} from "./src/usage"

interface PluginOptions {
  product?: string
  bin?: string
  pollMs?: number
  barWidth?: number
  showCountdown?: boolean
  refreshKey?: string
}

type ResolvedOptions = Required<PluginOptions>
type Theme = ReturnType<typeof usePlugin>["theme"]

// 三个窗口使用不同语义色，便于一眼区分；月度窗口接近耗尽（≥90%）时变红。
function barColor(key: WindowKey, percent: number, theme: Theme) {
  const feedback = theme.text.feedback
  if (key === "session") return feedback.info.base
  if (key === "weekly") return feedback.success.base
  if (percent >= 90) return feedback.error.base
  return feedback.warning.base
}

function UsageWidget(props: { options: ResolvedOptions }) {
  const ctx = usePlugin()
  const { theme } = ctx
  const resolved = props.options

  const [data, setData] = createSignal<UsageData | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [now, setNow] = createSignal(Date.now())
  const [busy, setBusy] = createSignal(false)

  let inFlight = false
  const refresh = async () => {
    if (inFlight) return
    inFlight = true
    setBusy(true)
    try {
      const result = await fetchUsage({
        product: resolved.product,
        bin: resolved.bin,
      })
      setData(result)
      setError(null)
    } catch (e) {
      setData(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlight = false
      setBusy(false)
    }
  }

  // 挂载即拉取；按 pollMs 轮询；每秒只在本地跳动倒计时，不产生额外请求。
  void refresh()
  const poll = setInterval(() => void refresh(), resolved.pollMs)
  const tick = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => {
    clearInterval(poll)
    clearInterval(tick)
  })

  // 快捷键层在组件内部注册：仅会话侧边栏挂载期间存在，组件卸载时自动注销，
  // 因此不再需要 V1 版本的模块级 refresher 中转和手动 lifecycle.onDispose。
  // 必须用 global 模式：默认的 base 模式在会话输入界面收不到按键派发。
  ctx.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: "volcengine-stats.refresh",
        title: "Refresh Ark Coding Plan usage",
        bind: resolved.refreshKey,
        run: () => {
          void refresh()
        },
      },
    ],
    bindings: ["volcengine-stats.refresh"],
  }))

  const countdown = (resetAt: string | undefined) =>
    resolved.showCountdown ? formatCountdown(resetAt, now()) : ""

  return (
    <box marginTop={1} flexShrink={0} flexDirection="column">
      <Show
        when={data()}
        fallback={
          <text fg={theme.text.muted}>{error() ? "ark ✕" : "ark …"}</text>
        }
      >
        {(d) => (
          <box flexDirection="column">
            <For each={d().windows}>
              {(w) => (
                <box flexDirection="row" gap={1} alignItems="center">
                  <text fg={theme.text.muted}>{w.label}</text>
                  <text fg={barColor(w.key, w.percent, theme)}>
                    {bar(w.percent, resolved.barWidth)}
                  </text>
                  <text fg={theme.text.base}>
                    {`${Math.round(w.percent).toString().padStart(3, " ")}%`}
                  </text>
                  {countdown(w.resetAt) ? (
                    <text fg={theme.text.muted}>
                      {`in ${countdown(w.resetAt)}`}
                    </text>
                  ) : null}
                </box>
              )}
            </For>
            <text
              fg={theme.text.muted}
              onMouseDown={() => void refresh()}
            >
              {busy()
                ? "↻ refreshing…"
                : `↻ ${resolved.refreshKey} refresh`}
            </text>
          </box>
        )}
      </Show>
    </box>
  )
}

export default Plugin.define({
  id: "volcengine-stats",
  setup(ctx) {
    const options: ResolvedOptions = {
      product: (ctx.options.product as string | undefined) ?? "coding-plan",
      bin: (ctx.options.bin as string | undefined) ?? "arkcli",
      pollMs: (ctx.options.pollMs as number | undefined) ?? 60_000,
      barWidth: (ctx.options.barWidth as number | undefined) ?? 14,
      showCountdown: ctx.options.showCountdown !== false,
      refreshKey:
        (ctx.options.refreshKey as string | undefined) ?? "ctrl+alt+r",
    }

    // 只挂到会话侧边栏：sidebar.content 仅在会话内发布，首页不会渲染，
    // 也不注册任何 app 悬浮层。
    ctx.ui.slot({
      append: "sidebar.content",
      render: () => <UsageWidget options={options} />,
    })
  },
})
