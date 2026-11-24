/**
 * Browser smoke test driven over the Chrome DevTools Protocol (no Playwright
 * needed). Requires a Chrome started with --remote-debugging-port and a running
 * dev server. Signs up, creates a workspace, adds the mock AI provider, tests it,
 * and screenshots each step into .local/e2e/.
 *
 *   BASE_URL=http://localhost:3100 CDP=http://127.0.0.1:9222 node scripts/e2e-smoke.mjs
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const CDP = process.env.CDP ?? "http://127.0.0.1:9222";
const OUT = path.resolve(".local/e2e");
fs.mkdirSync(OUT, { recursive: true });

const email = `smoke+${Date.now()}@example.test`;
const password = "smoke-pass-12345";
let id = 0;
const pending = new Map();
let ws;

async function connect() {
  const res = await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" });
  const target = await res.json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.clearBrowserCookies");
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  return target.id;
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "evaluate failed");
  return r.result.value;
}

async function goto(url) {
  await send("Page.navigate", { url });
  await waitFor(() => evaluate("document.readyState === 'complete'"), `load ${url}`);
  // The root layout sets data-hydrated once React is interactive.
  await waitFor(() => evaluate("document.documentElement.dataset.hydrated === '1'"), `hydration ${url}`);
  await sleep(200);
}

async function waitFor(fn, label, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await fn()) return;
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fill(selector, value) {
  const ok = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`No element for ${selector}`);
}

async function clickText(text, tag = "button") {
  // Wait until a matching element exists and is enabled (transitions disable buttons briefly).
  const finder = `[...document.querySelectorAll(${JSON.stringify(tag)})].find((e) => e.textContent.trim().includes(${JSON.stringify(text)}) && !e.disabled && e.getAttribute('aria-disabled') !== 'true')`;
  await waitFor(() => evaluate(`!!(${finder})`), `enabled ${tag} "${text}"`, 60000);
  await evaluate(`(${finder}).click()`);
}

async function realClick(selector, text) {
  const rect = await evaluate(`(() => {
    let el = null;
    if (${JSON.stringify(text ?? "")}) {
      el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.trim().includes(${JSON.stringify(text ?? "")}));
    } else el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!rect) throw new Error(`No element for ${selector} ${text ?? ""}`);
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  }
}

async function pressKey(keyName, code) {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: keyName, code: keyName, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: keyName, code: keyName, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  await sleep(150);
}

async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, "base64"));
}

const href = () => evaluate("location.href");
const bodyText = () => evaluate("document.body.innerText");

async function main() {
  await connect();
  const log = (m) => console.log(`[e2e] ${m}`);

  // 1. Sign up
  await goto(`${BASE}/sign-up`);
  await fill("#name", "Smoke Tester");
  await fill("#email", email);
  await fill("#password", password);
  await shot("01-sign-up");
  await clickText("Create account");
  await waitFor(async () => (await href()).includes("/verify"), "redirect to verify");
  log(`signed up as ${email}`);
  await shot("02-verify");

  // 2. Workspace creation (email verification is not required to proceed)
  await goto(`${BASE}/workspaces/new`);
  await fill("#name", "Smoke Co");
  await clickText("Create workspace");
  await waitFor(async () => /\/w\/smoke-co/.test(await href()), "workspace dashboard");
  const dash = (await href()).replace(/\/$/, "");
  const slug = dash.split("/w/")[1].split(/[/?#]/)[0];
  log(`workspace created: ${dash} (slug ${slug})`);
  await waitFor(async () => (await bodyText()).includes("Setup:"), "dashboard checklist");
  await shot("03-dashboard");

  // 3. Integrations: add mock AI provider, test it
  await goto(`${dash}/integrations`);
  await waitFor(async () => (await bodyText()).includes("AI models"), "integrations page");
  await clickText("Mock AI (development)");
  await waitFor(() => evaluate("!!document.querySelector('[role=dialog]')"), "add dialog");
  await shot("04-add-provider");
  await clickText("Add provider");
  await waitFor(() => evaluate("[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Test')"), "provider row with Test button");
  await sleep(300);
  await clickText("Test");
  await waitFor(async () => (await bodyText()).includes("healthy"), "health badge");
  await shot("05-integrations");
  log("mock provider added and tested");
  for (const name of ["Mock people data (development)", "Mock web research (development)", "Mock signals (development)"]) {
    await clickText(name);
    await waitFor(() => evaluate("!!document.querySelector('[role=dialog]')"), "add dialog");
    await clickText("Add provider");
    await waitFor(() => evaluate("!document.querySelector('[role=dialog]')"), "dialog closed");
    await sleep(500);
  }
  log("mock data providers added");

  // Phase 3a: company profile from website (mock fetch + mock AI)
  await goto(`${dash}/company`);
  await fill("#website", "example.com");
  await clickText("Analyse website with AI");
  await waitFor(() => evaluate("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Use this draft'))"), "AI draft");
  await clickText("Use this draft");
  await waitFor(() => evaluate("document.querySelector('#companyName')?.value.includes('Mock Example Corp')"), "draft applied to form");
  await clickText("Save and approve");
  await waitFor(async () => (await bodyText()).includes("Approved"), "profile approved");
  await shot("06-company");
  log("company profile drafted, applied and approved");

  // Phase 3b: ICP from plain language
  await goto(`${dash}/icps/new`);
  await fill("textarea", "Founders and heads of growth at B2B software companies in the UAE with 10-200 employees, excluding agencies");
  await clickText("Draft criteria with AI");
  await waitFor(() => evaluate("(document.querySelector('#icp-name')?.value ?? '').length > 0"), "ICP name drafted");
  await clickText("Create and activate");
  await waitFor(async () => /\/icps\/[0-9a-f-]{36}/.test(await href()), "ICP saved");
  await shot("07-icp");
  log("ICP drafted and activated");

  // Phase 3c: search → review → import
  await goto(`${dash}/leads/searches/new`);
  await waitFor(() => evaluate("!!document.querySelector('#provider')"), "search wizard");
  await clickText("Preview estimate");
  await waitFor(async () => (await bodyText()).includes("Estimated matches"), "estimate");
  await clickText("Run search for");
  await waitFor(async () => /\/leads\/searches\/[0-9a-f-]{36}/.test(await href()), "search page");
  await waitFor(() => evaluate("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Approve all undecided'))"), "results listed");
  await clickText("Approve all undecided");
  await waitFor(() => evaluate("[...document.querySelectorAll('button')].some((b) => /Import \\d+ good fit/.test(b.textContent) && !b.disabled)"), "import enabled");
  await sleep(400);
  await clickText("to Leads");
  await waitFor(async () => (await bodyText()).includes("imported"), "import badges");
  await shot("08-search-review");
  log("search ran, results approved and imported");

  // Phase 3d: lead profile → research
  await goto(`${dash}/leads`);
  await waitFor(() => evaluate("!!document.querySelector('table a[href*=\"/leads/\"]')"), "leads table");
  const leadHref = await evaluate("document.querySelector('table a[href*=\"/leads/\"]').getAttribute('href')");
  await goto(`${BASE}${leadHref}`);
  await waitFor(() => evaluate("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Run AI research'))"), "lead page");
  await clickText("Run AI research");
  await waitFor(async () => /suggested opener/i.test(await bodyText()), "research rendered");
  await waitFor(async () => /ICP fit\s*\d+/i.test((await bodyText()).replace(/\n/g, " ")), "scores rendered");
  await shot("09-lead-research");
  log("lead researched with explained scores");

  // Phase 3e: signals sync
  await goto(`${dash}/signals`);
  await clickText("Sync from providers");
  await waitFor(async () => /hiring/i.test(await bodyText()) && /observed/i.test(await bodyText()), "signal in feed");
  await shot("10-signals");
  log("signals synced from mock provider");

  // Phase 4: campaign → approve sequence → activate → enroll → run → review draft → approve → run → manual task → done
  // Open the sending window around the clock so the scheduler acts immediately in this test.
  await evaluate(`fetch('/api/v1/w/${slug}/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sendingWindow: { days: [0,1,2,3,4,5,6], start: '00:00', end: '23:59' } }) }).then((r) => r.status)`);
  await goto(`${dash}/campaigns/new`);
  await fill("#name", "Smoke campaign");
  await clickText("Create campaign");
  await waitFor(async () => /\/campaigns\/[0-9a-f-]{36}/.test(await href()), "campaign page");
  await waitFor(() => evaluate("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Approve revision'))"), "sequence editor");
  await clickText("Approve revision");
  await waitFor(async () => /approved · rev/i.test(await bodyText()), "sequence approved");
  await clickText("Activate");
  await waitFor(async () => /Campaign activated|awaiting review|Pause/.test(await bodyText()), "campaign active");
  await shot("11-campaign-active");
  await clickText("Audience", "button");
  await clickText("Add leads");
  await waitFor(() => evaluate("document.querySelectorAll('[role=dialog] li').length > 0"), "leads listed in dialog");
  await clickText("Select all", "[role=dialog] button");
  await waitFor(() => evaluate("[...document.querySelectorAll('[role=dialog] button')].some((b) => /^Add \\d+ lead/.test(b.textContent.trim()) && !b.disabled)"), "submit enabled");
  // Submit; re-click if the dialog is still open after a few seconds (a click can land during a re-render).
  for (let attempt = 0; attempt < 6; attempt++) {
    await clickText("Add ", "[role=dialog] button");
    try {
      await waitFor(() => evaluate("!document.querySelector('[role=dialog]')"), "dialog closed", 20000);
      break;
    } catch (err) {
      if (attempt === 5) throw err;
    }
  }
  await waitFor(async () => /enrolled|active/i.test(await bodyText()), "enrollments listed");
  await clickText("Run due steps now");
  await waitFor(async () => (await bodyText()).includes("Review ("), "review tab count");
  await waitFor(async () => /Review \((\d+)\)/.test(await bodyText()) && Number(/Review \((\d+)\)/.exec(await bodyText())[1]) > 0, "drafts awaiting review");
  await clickText("Review (", "button");
  await waitFor(() => evaluate("[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Approve all')"), "approve all button");
  await shot("12-review-queue");
  await clickText("Approve all");
  await waitFor(async () => /Review \(0\)/.test(await bodyText()), "queue empty");
  await clickText("Run due steps now");
  await waitFor(async () => /Manual tasks \((\d+)\)/.test(await bodyText()) && Number(/Manual tasks \((\d+)\)/.exec(await bodyText())[1]) > 0, "manual tasks created (no sender connected)");
  await clickText("Manual tasks", "button");
  await waitFor(() => evaluate("[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Mark done'))"), "task card");
  await shot("13-manual-tasks");
  await clickText("Mark done");
  await waitFor(async () => /Task done/.test(await bodyText()), "task completed toast");
  log("campaign created, approved, activated, drafts reviewed, manual task completed");

  // Phase 5: sending accounts (mock mailbox) → test email → domain check; webhooks endpoint with one-time secret
  const mailboxRes = await evaluate(`fetch('/api/v1/w/${slug}/integrations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category: 'mailbox', provider: 'mock' }) }).then((r) => r.status)`);
  if (mailboxRes !== 201) throw new Error(`mock mailbox integration not created: ${mailboxRes}`);
  await goto(`${dash}/integrations/senders`);
  await clickText("Add email sender");
  await waitFor(() => evaluate("!!document.querySelector('#sender-email')"), "add sender dialog");
  await fill("#sender-email", "sam@arevei.test");
  await fill("#sender-from-name", "Sam Seller");
  await clickText("Add sender", "[role=dialog] button");
  await waitFor(async () => /sam@arevei\.test/.test(await bodyText()) && !(await evaluate("!!document.querySelector('[role=dialog]')")), "sender listed");
  await shot("14-senders");
  await waitFor(() => evaluate("(() => { const b = document.querySelector('button[title=\"Send test email\"]'); return !!b && !b.disabled; })()"), "test email button enabled");
  await realClick('button[title="Send test email"]');
  await waitFor(() => evaluate("!!document.querySelector('#test-to')"), "test dialog");
  await clickText("Send test", "[role=dialog] button");
  await waitFor(async () => /Test email accepted/.test(await bodyText()), "test email accepted toast");
  await waitFor(() => evaluate("!document.querySelector('[role=dialog]')"), "test dialog closed");
  await waitFor(() => evaluate("(() => { const b = document.querySelector('button[title=\"Check SPF / DKIM / DMARC\"]'); return !!b && !b.disabled; })()"), "domain check button enabled");
  await sleep(300);
  await realClick('button[title="Check SPF / DKIM / DMARC"]');
  await waitFor(async () => /Domain authentication/.test(await bodyText()), "domain report dialog");
  await shot("15-domain-auth");
  await pressKey("Escape", 27);
  log("email sender added, test email sent through mock provider, domain checked");

  await goto(`${dash}/settings/webhooks`);
  await clickText("Add endpoint");
  await waitFor(() => evaluate("!!document.querySelector('#wh-url')"), "webhook dialog");
  await fill("#wh-url", `${BASE}/api/health`);
  await clickText("Create", "[role=dialog] button");
  await waitFor(() => evaluate("!!document.querySelector('[data-testid=webhook-secret]')"), "secret revealed");
  const whSecret = await evaluate("document.querySelector('[data-testid=webhook-secret]').textContent");
  if (!/^whsec_/.test(whSecret)) throw new Error("webhook secret not shown");
  await shot("16-webhook-secret");
  await clickText("Done", "[role=dialog] button");
  await waitFor(() => evaluate("!document.querySelector('[role=dialog]')"), "secret dialog closed");
  await waitFor(async () => /api\/health/.test(await bodyText()), "endpoint listed");
  await waitFor(() => evaluate("(() => { const b = document.querySelector('button[title=\"Send test event\"]'); return !!b && !b.disabled; })()"), "test event button enabled");
  await sleep(300);
  await realClick('button[title="Send test event"]');
  await waitFor(async () => /Delivered \(HTTP 200\)|Not delivered/.test(await bodyText()), "test delivery outcome");
  log("webhook endpoint created with one-time secret and test event delivered");

  // Phase 6: simulate an inbound reply from an enrolled lead (dev-only endpoint) → inbox triage → send the AI draft
  const leadsRes = await evaluate(`fetch('/api/v1/w/${slug}/leads?limit=1').then((r) => r.json())`);
  const replyLeadId = (leadsRes.items ?? leadsRes.leads ?? [])[0]?.id;
  if (!replyLeadId) throw new Error("no lead available for inbox simulation");
  const sim = await evaluate(`fetch('/api/v1/w/${slug}/inbox/simulate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ leadId: ${JSON.stringify(replyLeadId)}, text: 'Thanks, does this integrate with HubSpot?' }) }).then((r) => r.json())`);
  if (!sim.result?.created) throw new Error(`inbox simulation failed: ${JSON.stringify(sim)}`);
  await goto(`${dash}/inbox?conversation=${sim.result.conversationId}`);
  await waitFor(async () => /AI triage/.test(await bodyText()) && /question/i.test(await bodyText()), "triage card rendered");
  await waitFor(() => evaluate("!!document.querySelector('[data-testid=reply-body]') && document.querySelector('[data-testid=reply-body]').value.includes('mock draft')"), "draft loaded in editor");
  await shot("17-inbox");
  await clickText("Send");
  await waitFor(async () => /Reply sent/.test(await bodyText()), "reply sent toast");
  await waitFor(async () => /You.*sent/s.test(await bodyText()), "sent message in thread");
  await shot("18-inbox-sent");
  log("inbound reply simulated, triaged by AI, draft reviewed and sent");

  // Phase 7: analytics computed from the events above
  await goto(`${dash}/analytics?days=7`);
  await waitFor(async () => /Leads contacted/.test(await bodyText()) && /Reply rate/.test(await bodyText()), "analytics tiles");
  await waitFor(() => evaluate("document.querySelectorAll('.recharts-surface').length >= 2"), "charts rendered");
  const contactedTile = await evaluate("[...document.querySelectorAll('div')].find((d) => d.textContent.trim() === 'Leads contacted')?.nextElementSibling?.textContent ?? ''");
  if (!/^\d/.test(contactedTile)) throw new Error(`contacted tile missing: ${contactedTile}`);
  await shot("19-analytics");
  await clickText("Table");
  await waitFor(() => evaluate("[...document.querySelectorAll('th')].some((t) => t.textContent.trim() === 'Day')"), "time series table view");
  log(`analytics rendered (leads contacted: ${contactedTile})`);

  // 4. Settings → members page renders; API key creation works
  await goto(`${dash}/settings/api-keys`);
  await fill("#key-name", "smoke key");
  await clickText("Create key");
  const keyExpr = "[...document.querySelectorAll('code')].map((c) => c.textContent.trim()).find((t) => /^agk_[A-Za-z0-9_-]{20,}$/.test(t)) ?? null";
  await waitFor(() => evaluate(`${keyExpr} !== null`), "api key revealed");
  const key = await evaluate(keyExpr);
  await shot("06-api-key");
  log(`api key created: ${key.slice(0, 8)}…`);

  // 5. Use the key against the REST API
  const me = await fetch(`${BASE}/api/v1/workspaces`, { headers: { Authorization: `Bearer ${key}` } });
  if (!me.ok) throw new Error(`API key call failed: ${me.status}`);
  const integrations = await fetch(`${BASE}/api/v1/w/${slug}/integrations`, { headers: { Authorization: `Bearer ${key}` } });
  const data = await integrations.json();
  if (!integrations.ok || !Array.isArray(data.integrations)) throw new Error("integrations API failed");
  if (JSON.stringify(data).includes("ciphertext")) throw new Error("API leaked credential material");
  log(`REST API ok: ${data.integrations.length} integration(s) visible, no secrets in payload`);

  // 6. Sign out
  await goto(`${dash}`);
  await realClick('button[aria-label="Account menu"]');
  await waitFor(() => evaluate("[...document.querySelectorAll('[role=menuitem]')].some((e) => e.textContent.includes('Sign out'))"), "account menu open", 15000);
  await sleep(500);
  await pressKey("End", 35);
  await pressKey("Enter", 13);
  await waitFor(async () => (await href()).includes("/sign-in"), "signed out");
  log("signed out");
  console.log(`\nAll steps passed. Screenshots in ${OUT}`);
  ws.close();
}

main().catch((err) => {
  console.error("[e2e] FAILED:", err.message);
  shot("99-failure").finally(() => process.exit(1));
});
