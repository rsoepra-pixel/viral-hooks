# WhatsApp AI Chat Analyzer

A **privacy-first, self-hosted** web app that analyzes your **exported** WhatsApp
chats with AI to flag risk patterns — scam, threat, online gambling, illegal lending
(pinjol), theft, malicious intent, romance scam, and pig butchering — and produces a
**professional PDF report** with name, WhatsApp number, chat, and highlighted matches.

Built and tuned for **Indonesian** chats.

> **Zero WhatsApp ban risk by design.** This app never connects to WhatsApp. You use
> WhatsApp's built-in **Export chat** feature and upload the file. Nothing is sent to
> WhatsApp's servers, so there is no automation for Meta to detect or ban. This was a
> deliberate choice (see `../docs/whatsapp-ai-chat-analyzer-plan.md`, §1).

## How it works

```
Export chat (.txt/.zip)  →  Upload  →  Local parse + store (SQLite)
   →  Deterministic prefilter (Indonesian lexicons, local, free)
   →  Redact names/phones  →  Claude classifies candidates
   →  De-redact locally  →  Professional PDF/HTML report
```

Two-stage pipeline keeps cost and data exposure low: a local keyword/regex prefilter
narrows millions of messages to candidates; only those (with names/numbers **redacted**)
are sent to Claude for a precise verdict + confidence + rationale.

## Security & privacy

- **Local-first:** all chat data lives in SQLite on your server (`./data`).
- **Redaction before cloud:** phone numbers and contact names are tokenized
  (`[NAME_1]`, `[PHONE_2]`) before any text reaches the Claude API, then restored
  locally when rendering the report. Toggle with `REDACT_BEFORE_LLM`.
- **Single-user auth:** password (scrypt-hashed) + signed, HttpOnly, SameSite=strict
  session cookie. Enable HTTPS via the bundled Caddy config.
- **Data minimization:** only prefiltered candidates go to the LLM — not your whole
  history. Optional auto-purge via `RETENTION_DAYS`. One-click wipe (`POST /api/wipe`).
- **No third-party assets** in the report (safe to open offline).
- Handle contacts' data responsibly and per applicable law (e.g. Indonesia's
  **UU PDP No. 27/2022**).

## Quick start (local dev)

```bash
cd whatsapp-analyzer
npm install
cp .env.example .env
# set ANTHROPIC_API_KEY, SESSION_SECRET, and an APP_PASSWORD (dev) or APP_PASSWORD_HASH

# generate a password hash for production:
npm run hash -w server -- "your-strong-password"

npm run build:core
# terminal 1 (API):
npm run dev:server
# terminal 2 (web, proxies /api → :8787):
npm run dev:web
# open http://localhost:5173
```

## Production (Docker + HTTPS)

```bash
cp .env.example .env      # fill in secrets; set APP_PASSWORD_HASH (not APP_PASSWORD)
# edit Caddyfile with your domain
docker compose up -d --build
```

Runs the server (which also serves the built web UI) behind Caddy with automatic TLS.
Point a domain at your VPS and set it in the `Caddyfile`.

## Configuration (`.env`)

| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | Claude API key (server-side only) |
| `ANTHROPIC_MODEL` | default `claude-sonnet-5` |
| `APP_PASSWORD_HASH` | scrypt hash from `npm run hash` (production) |
| `APP_PASSWORD` | plaintext password (dev only, auto-hashed) |
| `SESSION_SECRET` | 32+ random chars for signing cookies |
| `REDACT_BEFORE_LLM` | `true` (recommended) / `false` |
| `RETENTION_DAYS` | auto-purge messages older than N days (`0` = never) |

## Tuning detection

Edit the Indonesian/English lexicons and rubrics in
`core/src/patterns.ts`. Keywords drive the cheap prefilter (high recall); the LLM
rubric makes the final call (precision). Add your own patterns there.

## Tests

```bash
npm test        # core parser / prefilter / redactor unit tests
```

## Status

- ✅ Phase 0 — foundations (auth, encrypted-friendly local store, config)
- ✅ Phase 1 — export analyzer (parser, prefilter, redactor, Claude classify, report)
- ⏭️ Phase 2 — richer pattern tuning, saved searches, false-positive feedback
- ⏸️ Phase 3 — optional live link (intentionally **not** built: you opted out of ban risk)

See `../docs/whatsapp-ai-chat-analyzer-plan.md` for the full plan.
