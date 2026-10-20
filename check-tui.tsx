import { testRender } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import { PluginContextProvider } from "@opencode/plugin/tui"
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import mod from "./tui.tsx"

// 假 arkcli：输出套餐 fixture，同时记录被调用次数，用于断言
// 快捷键 / 点击确实触发了重新拉取。
const dir = mkdtempSync(join(tmpdir(), "arkfake-"))
const bin = join(dir, "arkcli")
const calls = join(dir, "calls")
const iso = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()
const fixture = {
  items: [
    {
      product: "coding-plan",
      edition: "personal",
      subscribed: true,
      periods: [
        { label: "session", percent: 10, reset_at: iso(3) },
        { label: "weekly", percent: 22, reset_at: iso(6 * 24) },
        { label: "monthly", percent: 78, reset_at: iso(38) },
      ],
    },
  ],
}
writeFileSync(bin, `#!/bin/sh\necho x >> "${calls}"\necho '${JSON.stringify(fixture)}'\n`)
chmodSync(bin, 0o755)
const callCount = () => {
  try {
    return readFileSync(calls, "utf8").trim().split("\n").filter(Boolean).length
  } catch {
    return 0
  }
}

// ---- V2 Context mock -------------------------------------------------------

const color = (r: number, g: number, b: number) => RGBA.fromInts(r, g, b, 255)
const claims: any[] = []
const layerFactories: Array<() => any> = []
const ctx: any = {
  options: { bin, pollMs: 600_000 },
  theme: {
    text: {
      base: color(230, 230, 230),
      muted: color(140, 140, 140),
      feedback: {
        info: { base: color(80, 160, 255) },
        success: { base: color(80, 220, 120) },
        warning: { base: color(255, 200, 0) },
        error: { base: color(255, 80, 80) },
      },
    },
  },
  ui: {
    slot: (claim: any) => {
      claims.push(claim)
      return () => {
        const i = claims.indexOf(claim)
        if (i >= 0) claims.splice(i, 1)
      }
    },
  },
  keymap: {
    layer: (factory: () => any) => {
      layerFactories.push(factory)
    },
  },
}

// ---- setup：注册 sidebar.content slot claim --------------------------------

await mod.setup(ctx)

if (mod.id !== "volcengine-stats") throw new Error(`bad plugin id: ${mod.id}`)
if (claims.length !== 1) {
  throw new Error(`expected exactly 1 slot claim, got ${claims.length}`)
}
const claim = claims[0]
if (claim.append !== "sidebar.content") {
  throw new Error(`expected append sidebar.content, got ${claim.append ?? JSON.stringify(claim)}`)
}
// 3.5：绝不注册 app / 首页悬浮层。
if (claim.append === "app" || claim.prepend === "app" || claim.replace === "app") {
  throw new Error("app/home overlay claim must not exist")
}

// 挂载会话侧边栏：首次拉取后出现进度条与刷新提示。
const t = await testRender(
  () => (
    <PluginContextProvider value={ctx}>
      {claim.render({ sessionID: "s1" })}
    </PluginContextProvider>
  ),
  { width: 42, height: 20 },
)
let frame = ""
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 200))
  await t.renderOnce()
  frame = t.captureCharFrame()
  if (frame.includes("ctrl+alt+r") && frame.includes("10%")) break
}
if (!frame.includes("ctrl+alt+r") || !frame.includes("10%")) {
  throw new Error("bars/hint did not mount:\n" + frame.split("\n").slice(0, 6).join("\n"))
}
console.log("bars + refresh hint mounted OK")
if (callCount() !== 1) throw new Error(`expected 1 fetch, got ${callCount()}`)

// 组件内部应注册恰好一个 keymap layer，命令 id / 绑定正确。
if (layerFactories.length !== 1) {
  throw new Error(`expected 1 keymap layer, got ${layerFactories.length}`)
}
const layer = layerFactories[0]()
const command = layer.commands?.[0]
if (command?.id !== "volcengine-stats.refresh") {
  throw new Error(`bad command id: ${command?.id}`)
}
if (command.bind !== "ctrl+alt+r") throw new Error(`wrong refresh key: ${command.bind}`)
if (layer.mode !== "global") throw new Error(`refresh layer must be global, got: ${layer.mode}`)
if (!layer.bindings?.includes("volcengine-stats.refresh")) {
  throw new Error("layer bindings missing command id")
}
console.log("keymap layer OK")

// 分发刷新命令触发第二次拉取。
command.run()
for (let i = 0; i < 20 && callCount() < 2; i++) {
  await new Promise((r) => setTimeout(r, 200))
  await t.renderOnce()
}
if (callCount() !== 2) throw new Error(`hotkey: expected 2 fetches, got ${callCount()}`)
console.log("hotkey refresh OK")

// 点击 ↻ 提示行触发第三次拉取。
const lines = t.captureCharFrame().split("\n")
const y = lines.findIndex((l) => l.includes("↻"))
const x = (lines[y] ?? "").indexOf("↻")
if (y < 0 || x < 0) throw new Error("refresh icon not found")
await t.mockMouse.click(x, y)
for (let i = 0; i < 20 && callCount() < 3; i++) {
  await new Promise((r) => setTimeout(r, 200))
  await t.renderOnce()
}
if (callCount() !== 3) throw new Error(`click: expected 3 fetches, got ${callCount()}`)
console.log("click refresh OK")

console.log("V2 TUI WIRING SELF-CHECK OK (bars verify via live TUI / bun run check)")
process.exit(0)
