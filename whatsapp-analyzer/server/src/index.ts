import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import AdmZip from "adm-zip";
import {
  parseChat,
  buildReportHtml,
  PATTERNS,
  type Finding,
  type SearchQuery,
} from "@wa-analyzer/core";
import { loadConfig, hashPassword } from "./config.js";
import { Store } from "./db.js";
import { runSearch } from "./pipeline.js";

const cfg = loadConfig();
const store = new Store(cfg.dataDir);
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true, bodyLimit: 64 * 1024 * 1024 });
await app.register(cookie, { secret: cfg.sessionSecret });
await app.register(multipart, { limits: { fileSize: 64 * 1024 * 1024 } });

const SESSION_COOKIE = "wa_session";

function isAuthed(req: any): boolean {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw) return false;
  const unsigned = req.unsignCookie(raw);
  return unsigned.valid && unsigned.value === "ok";
}

// Auth guard for all /api routes except login/health.
app.addHook("preHandler", async (req, reply) => {
  const url = req.url.split("?")[0];
  if (!url.startsWith("/api/")) return;
  if (url === "/api/login" || url === "/api/health") return;
  if (!isAuthed(req)) {
    reply.code(401).send({ error: "unauthorized" });
  }
});

app.get("/api/health", async () => ({
  ok: true,
  llmConfigured: !!cfg.anthropicKey,
  redact: cfg.redact,
}));

app.post("/api/login", async (req, reply) => {
  const { password } = (req.body as { password?: string }) ?? {};
  if (!cfg.passwordHash) {
    return reply.code(500).send({ error: "No APP_PASSWORD_HASH configured on server." });
  }
  if (!password) return reply.code(400).send({ error: "password required" });
  const attempt = Buffer.from(hashPassword(password, cfg.passwordHash.split(":")[0]));
  const stored = Buffer.from(cfg.passwordHash);
  const ok = attempt.length === stored.length && timingSafeEqual(attempt, stored);
  if (!ok) return reply.code(401).send({ error: "invalid password" });
  reply.setCookie(SESSION_COOKIE, "ok", {
    signed: true,
    httpOnly: true,
    sameSite: "strict",
    secure: cfg.isProd,
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return { ok: true };
});

app.post("/api/logout", async (_req, reply) => {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
});

app.get("/api/me", async () => ({ authed: true }));

app.get("/api/patterns", async () =>
  PATTERNS.map((p) => ({ id: p.id, label: p.label, description: p.description }))
);

// ---- Chats ----
app.get("/api/chats", async () =>
  store.listChats().map((c) => ({
    id: c.id,
    title: c.title,
    isGroup: c.is_group === 1,
    participants: JSON.parse(c.participants),
    messageCount: c.message_count,
    from: c.min_ts,
    to: c.max_ts,
  }))
);

app.post("/api/chats/upload", async (req, reply) => {
  const file = await (req as any).file();
  if (!file) return reply.code(400).send({ error: "no file" });
  const buf = await file.toBuffer();
  const filename: string = file.filename ?? "chat.txt";

  let text: string;
  let title = filename.replace(/\.(txt|zip)$/i, "");
  if (/\.zip$/i.test(filename)) {
    const zip = new AdmZip(buf);
    const entry =
      zip.getEntries().find((e) => /_chat\.txt$/i.test(e.entryName)) ??
      zip.getEntries().find((e) => /\.txt$/i.test(e.entryName));
    if (!entry) return reply.code(400).send({ error: "no .txt chat found in zip" });
    text = entry.getData().toString("utf8");
  } else {
    text = buf.toString("utf8");
  }
  // WhatsApp titles exports like "WhatsApp Chat with Budi.txt"
  const m = /chat with (.+)/i.exec(title);
  if (m) title = m[1].trim();

  const parsed = parseChat(text, { dayFirst: true, title });
  if (parsed.messages.length === 0) {
    return reply.code(400).send({ error: "could not parse any messages from file" });
  }
  const id = randomUUID();
  const row = store.addChat(id, parsed.title, parsed.isGroup, parsed.participants, parsed.messages);
  return {
    id: row.id,
    title: row.title,
    isGroup: row.is_group === 1,
    messageCount: row.message_count,
    from: row.min_ts,
    to: row.max_ts,
    participants: parsed.participants,
  };
});

app.delete("/api/chats/:id", async (req) => {
  store.deleteChat((req.params as { id: string }).id);
  return { ok: true };
});

app.post("/api/wipe", async () => {
  store.wipeAll();
  return { ok: true };
});

// ---- Search / analyze ----
app.post("/api/search", async (req, reply) => {
  const body = (req.body as Partial<SearchQuery>) ?? {};
  const query: SearchQuery = {
    prompt: body.prompt,
    patternIds: body.patternIds ?? [],
    from: body.from,
    to: body.to,
    chatIds: body.chatIds ?? [],
    minConfidence: body.minConfidence ?? 0.5,
  };
  try {
    const result = await runSearch(store, cfg, query);
    return result;
  } catch (e: any) {
    req.log.error(e);
    return reply.code(500).send({ error: e.message ?? "search failed" });
  }
});

// ---- Report ----
app.post("/api/report", async (req, reply) => {
  const body = req.body as {
    findings: Finding[];
    from?: number;
    to?: number;
    patternsSearched?: string[];
    chatsScanned?: string[];
    prompt?: string;
    maskNumbers?: boolean;
  };
  const html = buildReportHtml(body.findings ?? [], {
    generatedAt: Date.now(),
    from: body.from,
    to: body.to,
    patternsSearched: body.patternsSearched ?? [],
    chatsScanned: body.chatsScanned ?? [],
    promptUsed: body.prompt,
    maskNumbers: body.maskNumbers,
  });
  reply.header("content-type", "text/html; charset=utf-8");
  return html;
});

// ---- Static frontend (built) ----
const webDist = join(__dirname, "../../web/dist");
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
    return reply.sendFile("index.html");
  });
}

// Retention purge on boot.
if (cfg.retentionDays > 0) {
  const purged = store.purgeOld(cfg.retentionDays);
  app.log.info(`retention: purged ${purged} old messages`);
}

app.listen({ port: cfg.port, host: "0.0.0.0" }).then(() => {
  app.log.info(`WhatsApp Analyzer listening on :${cfg.port} (LLM ${cfg.anthropicKey ? "on" : "OFF"})`);
});
