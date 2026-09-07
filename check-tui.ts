import { testRender } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import mod from "./tui.ts"

// Fake arkcli: emits a plan fixture and logs every invocation so the test can
// assert that clicks / hotkey dispatch actually trigger a refetch.
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

const layers: any[] = []
const api: any = {
  theme: {
    current: {
      error: RGBA.fromInts(255, 80, 80, 255),
      warning: RGBA.fromInts(255, 200, 0, 255),
      success: RGBA.fromInts(80, 220, 120, 255),
      info: RGBA.fromInts(80, 160, 255, 255),
      primary: RGBA.fromInts(80, 160, 255, 255),
      text: RGBA.fromInts(230, 230, 230, 255),
      textMuted: RGBA.fromInts(140, 140, 140, 255),
    },
  },
  route: { current: { name: "session" } },
  slots: { register: (p: any) => { (globalThis as any).__r = p; return "id" } },
  keymap: { registerLayer: (l: any) => { layers.push(l); return () => {} } },
  lifecycle: { onDispose: () => {} },
}

await (mod as any).tui(api, { bin, pollMs: 600_000 })
const reg = (globalThis as any).__r
if (typeof reg?.slots?.sidebar_content !== "function") throw new Error("no sidebar_content slot")
if (typeof reg?.slots?.app === "function") throw new Error("app slot must not be registered")

// Refresh hotkey layer registered with the default binding.
const layer = layers.find((l) => l.commands?.[0]?.name === "volcengine-stats.refresh")
if (!layer) throw new Error("no refresh keymap layer")
if (layer.bindings[0].key !== "ctrl+alt+r") throw new Error("wrong refresh key")
// Dispatch before mount must be a no-op (no crash).
layer.commands[0].run({})

// Session sidebar: bars + clickable refresh hint appear after the first fetch.
const t = await testRender(() => reg.slots.sidebar_content({ session_id: "s1" }, {}), { width: 42, height: 20 })
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

// Hotkey dispatch triggers a refetch.
layer.commands[0].run({})
for (let i = 0; i < 20 && callCount() < 2; i++) {
  await new Promise((r) => setTimeout(r, 200))
  await t.renderOnce()
}
if (callCount() !== 2) throw new Error(`hotkey: expected 2 fetches, got ${callCount()}`)
console.log("hotkey refresh OK")

// Clicking the ↻ hint line triggers a refetch too.
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

console.log("IMPERATIVE TUI WIRING SELF-CHECK OK (bars verify via live TUI / bun run check)")
process.exit(0)
