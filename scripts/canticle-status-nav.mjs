// Navigation regression for /canticle/status (demo data): board → click a bar (SYNCHRONIZING) → detail → pick a stream
// hex → the pick survives a poll → Back to the board → the detail's pollers stopped; Back during SYNCHRONIZING cancels the
// open; Forward restores the picked stream; a query-only link on the same station resyncs it; a ?stream= the station doesn't carry is said, not drawn.
// Run against a served build:  node scripts/canticle-status-nav.mjs [base-url] [chromium]. Exits 1 on any failed step.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const port = 9335, base = process.argv[2] ?? "http://127.0.0.1:4199";
const chromium = process.argv[3] ?? "/usr/bin/chromium";
const profile = mkdtempSync(join(tmpdir(), "status-nav-"));
const chrome = spawn(chromium, ["--headless=new", `--remote-debugging-port=${port}`, "--no-first-run", `--user-data-dir=${profile}`, "--window-size=412,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target; for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const reqs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.method === "Network.requestWillBeSent" && m.params.request.url.includes("/api/canticle-")) reqs.push(m.params.request.url.replace(base, "")); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result.result.value;
await send("Network.enable"); await send("Page.enable");
const out = {};
await send("Page.navigate", { url: `${base}/canticle/status?demo=1` }); await sleep(3000);
out.board = await ev(`({bars: document.querySelectorAll(".station-bar").length, up: document.querySelectorAll(".station-up").length})`);
await ev(`document.querySelector(".station-bar").click()`); await sleep(250);
out.overlay = await ev(`document.querySelector(".loading-overlay p")?.textContent ?? null`);
await sleep(2500);
out.detail = await ev(`({path: location.pathname + location.search, title: document.querySelector(".title")?.textContent, logLines: document.querySelectorAll(".log-line").length})`);
await ev(`[...document.querySelectorAll(".hex-picker button")].find(b => b.textContent.trim() !== "ALL").click()`); await sleep(800);
out.stream = await ev(`({search: location.search, wave: document.querySelector(".waveform-title")?.textContent})`);
await sleep(11000);
out.stream_after_poll = await ev(`({search: location.search, wave: document.querySelector(".waveform-title")?.textContent})`);
const before = reqs.length;
await ev(`history.back()`); await sleep(2500);
out.back = await ev(`({path: location.pathname + location.search, bars: document.querySelectorAll(".station-bar").length})`);
await sleep(3000);
out.detail_requests_after_back = reqs.slice(before).filter((u) => u.includes("drum") || u.includes("flow")).length;
// 🌫 on #10: Forward back onto the detail restores the picked stream from the address, not ALL
await ev(`history.forward()`); await sleep(2500);
out.forward = await ev(`({search: location.search, wave: document.querySelector(".waveform-title")?.textContent, active: document.querySelector(".hex-picker button.active")?.textContent.trim()})`);
await sleep(11000);
out.forward_after_poll = await ev(`({wave: document.querySelector(".waveform-title")?.textContent, active: document.querySelector(".hex-picker button.active")?.textContent.trim()})`);
// 🌫 on #10: query-only navigation on the same station (an ordinary link) resyncs the pick, and so do Back/Forward over it
const link = (href) => ev(`(() => { const a = document.createElement("a"); a.href = ${JSON.stringify(href)}; a.textContent = "x"; document.body.append(a); a.click(); a.remove(); return true; })()`);
const wave = () => ev(`document.querySelector(".waveform-title")?.textContent`);
await send("Page.navigate", { url: `${base}/canticle/status/demo-melchior?demo=1` }); await sleep(3000);
out.query = { start: await wave() };
await link("/canticle/status/demo-melchior?demo=1&stream=chatter"); await sleep(1500); out.query.to_chatter = await wave();
await link("/canticle/status/demo-melchior?demo=1"); await sleep(1500); out.query.to_all = await wave();
await ev(`history.back()`); await sleep(1500); out.query.back = await wave();
await ev(`history.forward()`); await sleep(1500); out.query.forward = await wave();
await sleep(11000); out.query.after_poll = await wave();
// 🌿 on #10: Back during the SYNCHRONIZING pause must cancel the pending open
await send("Page.navigate", { url: `${base}/canticle?demo=1` }); await sleep(2500);
await ev(`[...document.querySelectorAll("a")].find(a => a.textContent.trim() === "STATUS").click()`); await sleep(2500);
await ev(`document.querySelector(".station-bar").click()`); await sleep(200);
await ev(`history.back()`); await sleep(1800);
out.back_during_sync = await ev(`location.pathname + location.search`);
// 🌿 on #10: a stream the station doesn't carry is said so, not drawn flat
await send("Page.navigate", { url: `${base}/canticle/status/demo-melchior?demo=1&stream=nope` }); await sleep(3500);
out.missing_stream = await ev(`({said: !!document.querySelector(".stream-missing"), lines: document.querySelectorAll(".waveform-panel polyline").length})`);
console.log(JSON.stringify(out, null, 1)); ws.close(); chrome.kill();
const failures = [];
if (out.board.bars !== 3 || out.board.up !== 2) failures.push("the demo board is not 3 bars with 2 up");
if (!String(out.overlay).startsWith("SYNCHRONIZING")) failures.push("no loading overlay on click");
if (!out.detail.path.startsWith("/canticle/status/demo-") || !out.detail.path.includes("demo=1")) failures.push("the click did not open the demo detail");
if (!out.stream.search.includes("stream=") || out.stream.wave === "ARRIVALS // ALL") failures.push("the stream pick did not take");
if (out.stream_after_poll.wave !== out.stream.wave) failures.push("a poll reverted the stream pick");
if (out.back.path !== "/canticle/status?demo=1" || out.back.bars !== 3) failures.push("Back did not return to the board");
if (out.detail_requests_after_back !== 0) failures.push("the detail kept polling after Back");
if (!out.forward.search.includes("stream=") || out.forward.wave !== out.stream.wave || out.forward.active === "ALL") failures.push("Forward lost the picked stream (" + out.forward.wave + ")");
if (out.forward_after_poll.wave !== out.stream.wave) failures.push("after Forward, a poll reverted the pick");
if (out.query.start !== "ARRIVALS // ALL" || out.query.to_chatter !== "ARRIVALS // chatter" || out.query.to_all !== "ARRIVALS // ALL" || out.query.back !== "ARRIVALS // chatter" || out.query.forward !== "ARRIVALS // ALL" || out.query.after_poll !== "ARRIVALS // ALL") failures.push("query-only navigation did not resync the pick (" + JSON.stringify(out.query) + ")");
if (out.back_during_sync !== "/canticle?demo=1") failures.push("Back during SYNCHRONIZING still opened the detail (" + out.back_during_sync + ")");
if (!out.missing_stream.said || out.missing_stream.lines !== 0) failures.push("a stream the station doesn't carry was drawn, not said");
if (failures.length) { console.error("FAIL: " + failures.join("; ")); process.exit(1); }
console.log("OK");
