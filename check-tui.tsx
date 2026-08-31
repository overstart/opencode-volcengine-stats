/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import mod from "./src/index.tsx"

const theme = {
  current: {
    error: RGBA.fromInts(255, 80, 80, 255),
    warning: RGBA.fromInts(255, 200, 0, 255),
    success: RGBA.fromInts(80, 220, 120, 255),
    text: RGBA.fromInts(230, 230, 230, 255),
    textMuted: RGBA.fromInts(140, 140, 140, 255),
  },
}

let registered: any = null
const api: any = {
  theme,
  route: { current: { name: "home" } },
  slots: { register: (p: any) => { registered = p; return "slot-id" } },
  lifecycle: { onDispose: () => {} },
}

await (mod as any).tui(api, {})
if (typeof registered?.slots?.app !== "function") throw new Error("no app slot")
if (typeof registered?.slots?.sidebar_content !== "function") throw new Error("no sidebar_content slot")

async function renderSlot(name: string, setRoute: string, width = 100) {
  api.route.current = { name: setRoute }
  const t = await testRender(() => registered.slots[name]({ session_id: "s1" }, {}), { width, height: 30 })
  await t.renderOnce()
  await new Promise((r) => setTimeout(r, 5000))
  await t.renderOnce()
  return t.captureCharFrame()
}

// Home: app overlay shows the bars.
const home = await renderSlot("app", "home")
const homeLines = home.split("\n").filter((l) => l.includes("%"))
console.log("=== home (app overlay) ===")
for (const l of homeLines.slice(0, 3)) console.log(JSON.stringify(l.trim()))
if (!homeLines.some((l) => l.includes("5h"))) throw new Error("home missing 5h")

// Session: app overlay must render NOTHING (sidebar owns the corner).
api.route.current = { name: "session" }
const appSession = (await testRender(() => registered.slots.app({}, {}), { width: 100, height: 30 }))
await appSession.renderOnce()
const appSessionFrame = appSession.captureCharFrame().replace(/\s/g, "")
if (appSessionFrame.includes("5h") || appSessionFrame.includes("ark")) {
  throw new Error("app overlay must be suppressed on session route")
}
console.log("=== session app overlay: suppressed (empty) OK ===")

// Session: sidebar_content shows the bars in-flow.
const side = await renderSlot("sidebar_content", "session", 42)
const sideLines = side.split("\n").filter((l) => l.includes("%"))
console.log("=== session (sidebar_content) ===")
for (const l of sideLines.slice(0, 3)) console.log(JSON.stringify(l.trim()))
if (!sideLines.some((l) => l.includes("5h"))) throw new Error("sidebar missing 5h")
if (!sideLines.some((l) => l.includes("1M"))) throw new Error("sidebar missing 1M")

console.log("PLACEMENT SELF-CHECK OK (home overlay + session sidebar, no overlap)")
process.exit(0)
