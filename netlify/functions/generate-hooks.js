// netlify/functions/generate-hooks.mjs
// CreatorCenter.id — AI ViralHook backend
// - Keeps the Anthropic API key server-side (set ANTHROPIC_API_KEY in Netlify env vars)
// - Enforces 5 generation runs/day and a 90-day access window per user (Netlify Blobs)
// - Two actions: "start" (authorize + count a run) and "batch" (proxy one batch call)
//
// Requires dependency: @netlify/blobs  (see package.json)

import { getStore } from "@netlify/blobs";

const DAILY_LIMIT   = 5;
const WINDOW_DAYS   = 90;
const RUN_TTL_MS    = 60 * 60 * 1000;            // a run token stays valid 1 hour
const GLOBAL_DAILY_RUNS = Number(process.env.GLOBAL_DAILY_RUNS || 500); // #1 spend cap (all users/day)
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const TZ            = "Asia/Jakarta";            // day boundary for "5 per day"
// Accept either env var name so it works whether you named it ANTHROPIC_API_KEY or CLAUDE_API_KEY
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });

// Stable per-user key: email if given, else client IP. Lowercased.
function userKey(email, req) {
  const e = (email || "").trim().toLowerCase();
  if (e && /\S+@\S+\.\S+/.test(e)) return "u:" + e;
  const ip = req.headers.get("x-nf-client-connection-ip")
          || req.headers.get("x-forwarded-for") || "anon";
  return "ip:" + ip.split(",")[0].trim();
}

// Today's date string in Jakarta, e.g. "2026-06-27"
function jakartaDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

async function callAnthropic(payload) {
  // Retry on 429 (rate limit) and 529 (overloaded) with backoff.
  let lastStatus = 0, lastBody = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(payload)
    });
    if (r.ok) return await r.json();
    lastStatus = r.status;
    lastBody = (await r.text().catch(() => "")).slice(0, 300);
    if (r.status === 429 || r.status === 529) { await new Promise(s => setTimeout(s, 600 * attempt)); continue; }
    break; // other errors: don't retry
  }
  const err = new Error("anthropic_" + lastStatus);
  err.anthropicStatus = lastStatus;
  err.anthropicBody = lastBody;
  throw err;
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 204 });

  // ---- TEMPORARY DEBUG: open this function's URL in a browser (GET) to inspect
  //      the key the function actually uses. Shows only length/prefix/last4 —
  //      NOT the key itself. Remove this block once everything works. ----
  if (req.method === "GET") {
    return json({
      debug: true,
      keyPresent: !!API_KEY,
      keyLength: API_KEY ? API_KEY.length : 0,
      keyPrefix: API_KEY ? API_KEY.slice(0, 12) : "",   // e.g. "sk-ant-api03" (format, not secret)
      keyTail:   API_KEY ? API_KEY.slice(-4) : "",       // should be "wAAA"
      startsWithSkAnt: API_KEY ? API_KEY.startsWith("sk-ant-") : false
    });
  }

  if (req.method !== "POST")    return json({ error: "POST only" }, 405);
  if (!API_KEY) return json({ error: "Server missing API key." }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }

  const key   = userKey(body.email, req);
  const store = getStore({ name: "viralhook", consistency: "strong" });

  // ---------- 90-day access window ----------
  const firstKey = "first:" + key;
  let first = await store.get(firstKey, { type: "json" });
  const now = Date.now();
  if (!first) { first = { t: now }; await store.setJSON(firstKey, first); }
  const ageDays = (now - first.t) / 86400000;
  if (ageDays > WINDOW_DAYS) {
    return json({ error: "Your 90-day access window has ended." }, 429);
  }

  // ===================== ACTION: start =====================
  if (body.action === "start") {
    const day = jakartaDay();

    // #1 Global spend ceiling: stop the whole site once the daily run budget is hit.
    const gKey = "global:" + day;
    const gUsed = (await store.get(gKey, { type: "json" }))?.n || 0;
    if (gUsed >= GLOBAL_DAILY_RUNS) {
      return json({ error: "The tool is at capacity for today. Please try again tomorrow." }, 429);
    }

    const dayKey = "runs:" + key + ":" + day;
    const used = (await store.get(dayKey, { type: "json" }))?.n || 0;
    if (used >= DAILY_LIMIT) {
      return json({ error: `Daily limit reached (${DAILY_LIMIT}/day). Try again tomorrow.` }, 429);
    }
    await store.setJSON(dayKey, { n: used + 1 });
    await store.setJSON(gKey, { n: gUsed + 1 });

    const runToken = (globalThis.crypto?.randomUUID?.() || (now + "-" + Math.random()));
    await store.setJSON("run:" + key + ":" + runToken, { t: now });   // authorize this run

    return json({ runToken, runsLeft: DAILY_LIMIT - (used + 1) });
  }

  // ===================== ACTION: batch =====================
  if (body.action === "batch") {
    const runRec = await store.get("run:" + key + ":" + body.runToken, { type: "json" });
    if (!runRec || (now - runRec.t) > RUN_TTL_MS) {
      return json({ error: "Run not authorized or expired. Start a new generation." }, 403);
    }
    if (!Array.isArray(body.messages) || !body.messages.length) {
      return json({ error: "No messages." }, 400);
    }
    try {
      const data = await callAnthropic({
        model: body.model || "claude-sonnet-4-6",
        max_tokens: Math.min(body.max_tokens || 1500, 2000),
        messages: body.messages
      });
      return json(data);   // forward Anthropic's response (frontend reads .content)
    } catch (e) {
      const detail = e.anthropicStatus
        ? ("Anthropic " + e.anthropicStatus + ": " + (e.anthropicBody || "")).slice(0, 300)
        : String(e.message || e);
      return json({ error: "Generation service unavailable. Retry this set.", detail }, 502);
    }
  }

  return json({ error: "Unknown action." }, 400);
};
