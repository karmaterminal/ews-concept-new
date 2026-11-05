// Navigation regression for /canticle/house (🌫 on ews#9): demo polling must follow the *current* query.
// Run against a served build:  node scripts/canticle-house-nav.mjs [base-url] [chromium]
//   default base http://127.0.0.1:4199, chromium /usr/bin/chromium. Exits 1 on any failed expectation.
// Steps: land without ?demo=1 (nothing polled), OPEN DEMO (six hosts), Back (polling stops),
// Forward (six hosts again), the HOUSE link on /canticle, 🌫's OPEN DEMO → reload → Back, and a full-load control.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const port = 9334, base = process.argv[2] ?? "http://127.0.0.1:4199";
const chromium = process.argv[3] ?? "/usr/bin/chromium";
const profile = mkdtempSync(join(tmpdir(), "house-nav-"));
const chrome = spawn(chromium, ["--headless=new", `--remote-debugging-port=${port}`, "--no-first-run",
  `--user-data-dir=${profile}`, "--window-size=412,820", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); let requests = 0;
ws.onmessage = (e) => { const m = JSON.parse(e.data);
  if (m.method === "Network.requestWillBeSent" && m.params.request.url.includes("/api/canticle-house")) requests++;
  if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result.result.value;
const state = `({hosts: document.querySelectorAll(".host-node").length, panel: !!document.querySelector(".grant-panel"), nolink: !!document.querySelector(".no-link"), url: location.search})`;
await send("Network.enable"); await send("Page.enable");
const out = {};
await send("Page.navigate", { url: `${base}/canticle/house` }); await sleep(3000);
out.land = { ...(await ev(state)), requests };
await ev(`document.querySelector(".grant-panel a").click()`); await sleep(11000);
out.open_demo_11s = { ...(await ev(state)), requests };
await ev(`history.back()`); await sleep(1500); const atBack = requests; await sleep(12000);
out.back_12s = { ...(await ev(state)), requests_since_back: requests - atBack };
await ev(`history.forward()`); await sleep(3000);
out.forward_3s = { ...(await ev(state)), requests };
await send("Page.navigate", { url: `${base}/canticle` }); await sleep(3000);
await ev(`[...document.querySelectorAll("a")].find(a => a.textContent.includes("HOUSE")).click()`); await sleep(3000);
out.from_main_link = await ev(state);
// 🌫's exact leak path: land without ?demo=1, OPEN DEMO, reload that demo URL, then Back (SvelteKit handles it as a
// same-document popstate, so the page stays mounted and must stop polling)
await send("Page.navigate", { url: `${base}/canticle/house` }); await sleep(2500);
await ev(`document.querySelector(".grant-panel a").click()`); await sleep(1500);
await send("Page.reload"); await sleep(3500);
const reloaded = await ev(state);
await ev(`history.back()`); await sleep(1500); const atReloadBack = requests; await sleep(12000);
out.open_reload_back_12s = { reloaded_hosts: reloaded.hosts, ...(await ev(state)), requests_since_back: requests - atReloadBack };
// a full load of ?demo=1, then Back: a cross-document traversal, so it reloads the non-demo page (a control, not 🌫's leak)
await send("Page.navigate", { url: `${base}/canticle/house` }); await sleep(2000);
await send("Page.navigate", { url: `${base}/canticle/house?demo=1` }); await sleep(3000);
const fullLoaded = await ev(state);
await ev(`history.back()`); await sleep(1500); const atFullBack = requests; await sleep(12000);
out.full_load_then_back_12s = { loaded_hosts: fullLoaded.hosts, ...(await ev(state)), requests_since_back: requests - atFullBack };
console.log(JSON.stringify(out, null, 1));
ws.close(); chrome.kill();
const failures = [];
if (out.land.requests !== 0 || !out.land.panel) failures.push("landing polled or showed no grant panel");
if (out.open_demo_11s.hosts !== 6 || out.open_demo_11s.requests < 1) failures.push("OPEN DEMO did not start polling");
if (out.back_12s.requests_since_back !== 0 || !out.back_12s.panel || out.back_12s.hosts !== 0) failures.push("Back left demo polling running or hosts drawn");
if (out.forward_3s.hosts !== 6) failures.push("Forward did not restart the demo");
if (out.full_load_then_back_12s.loaded_hosts !== 6 || out.full_load_then_back_12s.requests_since_back !== 0 || !out.full_load_then_back_12s.panel) failures.push("after a full demo load, Back left polling running");
if (out.open_reload_back_12s.reloaded_hosts !== 6 || out.open_reload_back_12s.requests_since_back !== 0 || !out.open_reload_back_12s.panel) failures.push("OPEN DEMO, reload, Back left demo polling running (🌫's leak)");
if (out.from_main_link.hosts !== 6) failures.push("the HOUSE link on /canticle did not start the demo");
if (failures.length) { console.error("FAIL: " + failures.join("; ")); process.exit(1); }
console.log("OK");
