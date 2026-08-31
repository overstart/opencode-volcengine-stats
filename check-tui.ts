import { testRender } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import mod from "./tui.ts"

const api: any = {
  theme: {
    current: {
      error: RGBA.fromInts(255, 80, 80, 255),
      warning: RGBA.fromInts(255, 200, 0, 255),
      success: RGBA.fromInts(80, 220, 120, 255),
      text: RGBA.fromInts(230, 230, 230, 255),
      textMuted: RGBA.fromInts(140, 140, 140, 255),
    },
  },
  route: { current: { name: "home" } },
  slots: { register: (p: any) => { (globalThis as any).__r = p; return "id" } },
  lifecycle: { onDispose: () => {} },
}

await (mod as any).tui(api, {})
const reg = (globalThis as any).__r
if (typeof reg?.slots?.app !== "function") throw new Error("no app slot")
if (typeof reg?.slots?.sidebar_content !== "function") throw new Error("no sidebar_content slot")

// Home route: app slot returns an overlay node rendering the loading state.
api.route.current = { name: "home" }
const t = await testRender(() => reg.slots.app({}, {}), { width: 100, height: 30 })
await t.renderOnce()
const homeFrame = t.captureCharFrame()
if (!homeFrame.includes("ark")) throw new Error("home overlay did not mount (ark …)")
console.log("home overlay mounted:", JSON.stringify(homeFrame.split("\n").find((l: string) => l.includes("ark"))?.trim()))

// Session route: app slot must render nothing (sidebar owns the corner).
api.route.current = { name: "session" }
if (reg.slots.app({}, {}) !== null) throw new Error("app overlay must be suppressed on session")
console.log("session app overlay suppressed: null OK")

// Session: sidebar_content returns a node mounting the loading state.
api.route.current = { name: "home" }
const t2 = await testRender(() => reg.slots.sidebar_content({ session_id: "s1" }, {}), { width: 42, height: 30 })
await t2.renderOnce()
const sideFrame = t2.captureCharFrame()
if (!sideFrame.includes("ark")) throw new Error("sidebar_content did not mount")
console.log("sidebar_content mounted OK")

console.log("IMPERATIVE TUI WIRING SELF-CHECK OK (bars verify via live TUI / bun run check)")
process.exit(0)
