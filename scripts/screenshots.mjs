#!/usr/bin/env node
// Takes the README screenshots from a running demo server with headless Chrome.
// Uses only Node built-ins (Node 22+) and the Chrome DevTools protocol, no browser package.
//   NEXT_PUBLIC_DEMO=1 npm run build && NEXT_PUBLIC_DEMO=1 npx next start -p 3217
//   node scripts/screenshots.mjs http://localhost:3217 docs/screenshots [name-filter]
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const base = process.argv[2] ?? "http://localhost:3217";
const out = process.argv[3] ?? "docs/screenshots";
const only = process.argv[4];
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.CDP_PORT ?? 9347);
const D = { w: 1440, h: 900, mobile: false };
const M = { w: 390, h: 844, mobile: true };

const click = (text, sel = "button,a,[role=tab],[role=radio]") => `(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.offsetParent !== null && e.textContent.trim().startsWith(${JSON.stringify(text)})); if (!el) return "missing: ${text}"; el.click(); return "ok"; })()`;
const key = (k) => `window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(k)}, bubbles: true }))`;

/** name, path, viewport, steps run after load (strings are evaluated, numbers are waits in ms). */
const SHOTS = [
  ["today", "/", D],
  ["companies", "/companies", D],
  ["company", "/companies/co-brightwell", D],
  ["intent", "/companies/co-brightwell?tab=intent", D],
  ["intent-full", "/companies/co-brightwell?tab=intent", { ...D, h: 2050 }],
  ["intent-not-checked", "/companies/co-lowmoor?tab=intent", D],
  ["intent-error", "/companies/co-ardent?tab=intent", { ...D, h: 1500 }],
  ["people", "/people", D],
  ["contact", "/people?contact=p-noor-al-sayed", D],
  ["quote", "/people?contact=p-noor-al-sayed", D, [click("Enrich contact"), 1200]],
  ["find-people", "/people?contact=p-adaeze-okonkwo", D, [click("Find more people"), 500]],
  ["pipeline", "/pipeline", D],
  ["deal", "/pipeline?deal=d-brightwell", D, [900]],
  ["deal-page", "/deals/d-kestrel", D],
  ["spend", "/spend", D, [click("", "tbody tr button[aria-expanded]"), 300]],
  ["settings", "/settings", D],
  ["palette", "/companies", D, [key("/"), 400]],
  ["shortcuts", "/", D, [key("?"), 400]],
  ["companies-empty", "/companies?state=empty", D],
  ["companies-error", "/companies?state=error", D],
  ["today-empty", "/?state=empty", D],
  ["today-dark", "/?theme=dark", D, [500]],
  ["companies-dark", "/companies?theme=dark", D, [500]],
  ["intent-dark", "/companies/co-brightwell?tab=intent&theme=dark", D, [500]],
  ["pipeline-dark", "/pipeline?theme=dark", D, [500]],
  ["spend-dark", "/spend?theme=dark", D, [500]],
  ["m-today", "/?theme=light", M],
  ["m-companies", "/companies", M],
  ["m-company", "/companies/co-brightwell", M],
  ["m-intent", "/companies/co-brightwell?tab=intent", M],
  ["m-people", "/people", M],
  ["m-contact", "/people?contact=p-noor-al-sayed", M],
  ["m-quote", "/people?contact=p-noor-al-sayed", M, [click("Enrich contact"), 1200]],
  ["m-pipeline", "/pipeline", M],
  ["m-deal", "/pipeline?deal=d-brightwell", M, [900]],
  ["m-spend", "/spend", M],
  ["m-settings", "/settings", M],
  ["m-pipeline-dark", "/pipeline?theme=dark", M, [500]],
  // Last, because it makes a demo run that would otherwise show up in the People and Spend shots.
  ["quote-done", "/people?contact=p-greta-lindahl", D, [click("Enrich contact"), 1200, click("Run (demo"), 6500]],
  // Sign-in redirects to Today in demo mode. Take these two from a build without NEXT_PUBLIC_DEMO:
  //   node scripts/screenshots.mjs http://localhost:3218 docs/screenshots login
  ["login", "/login", D],
  ["m-login", "/login", M],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(path.join(tmpdir(), "crm-shots-"));
const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const stop = () => {
  proc.kill();
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Chrome may still be writing its profile. The OS clears the temp folder later.
  }
};
process.on("exit", stop);

let ws;
for (let i = 0; i < 50 && !ws; i++) {
  await sleep(200);
  try {
    const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  } catch { ws = undefined; }
}
if (!ws) throw new Error("Chrome did not start");
let id = 0;
const waiting = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const n = ++id;
  waiting.set(n, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id: n, method, params, sessionId }));
});

mkdirSync(out, { recursive: true });
const report = [];
for (const [name, url, vp, steps = []] of SHOTS) {
  if (only ? !name.includes(only) : name.includes("login")) continue;
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s("Page.enable");
  await s("Runtime.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.mobile ? 2 : 1, mobile: vp.mobile });
  if (vp.mobile) await s("Emulation.setTouchEmulationEnabled", { enabled: true });
  await s("Page.navigate", { url: base + url });
  await sleep(1800);
  const notes = [];
  for (const step of steps) {
    if (typeof step === "number") await sleep(step);
    else {
      const r = await s("Runtime.evaluate", { expression: step, returnByValue: true });
      if (typeof r.result.value === "string" && r.result.value.startsWith("missing")) notes.push(r.result.value);
      await sleep(250);
    }
  }
  const overflow = await s("Runtime.evaluate", { expression: "document.documentElement.scrollWidth - window.innerWidth", returnByValue: true });
  if (overflow.result.value > 0) notes.push(`page scrolls sideways by ${overflow.result.value}px`);
  if (process.env.EVAL) notes.push(JSON.stringify((await s("Runtime.evaluate", { expression: process.env.EVAL, returnByValue: true })).result.value));
  const shot = await s("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(out, `${name}.png`), Buffer.from(shot.data, "base64"));
  await send("Target.closeTarget", { targetId });
  report.push(`${name}${notes.length ? `  !! ${notes.join("; ")}` : ""}`);
}
console.log(report.join("\n"));
ws.close();
stop();
process.exit(0);
