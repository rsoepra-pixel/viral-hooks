# WhatsApp AI Chat Analyzer — Development & Implementation Plan

> **Status:** Draft plan for review.
> **Goal:** A private web app that links to your own WhatsApp, lets you use AI to
> search your chats (by prompt, text patterns, and date ranges) across personal and
> group chats, and produces professional reports flagging risk patterns such as scam,
> threat, gambling, illegal lending, theft, malicious intent, romance scam, and pig
> butchering.
> **Guiding principles:** *Security & privacy first. Minimize WhatsApp ban risk.*

---

## 0. Decisions assumed in this plan (please confirm / override)

I could not collect your answers interactively, so this plan is written around the
**recommended defaults** below. Each is a real fork in the road — tell me if you want
a different option and I'll revise.

| # | Decision | Recommended default | Why |
|---|----------|---------------------|-----|
| D1 | **WhatsApp connection** | **Hybrid**: build the safe *chat-export analyzer* first, then add an *optional* read-only live link via Baileys (pairing code) as a later, toggleable phase. | Delivers all the AI/reporting value at zero ban risk immediately; you opt into live-linking (and its risk) only when you're ready. |
| D2 | **Where AI runs** | **Cloud Claude API with redaction** — names/phone numbers tokenized before leaving your machine, restored locally in the report. | Best analysis quality while keeping personally-identifying data out of the third-party API. Swappable for a local model. |
| D3 | **Hosting** | **Self-hosted via Docker** (your machine or a private VPS). | Required for a persistent Baileys connection *and* best for data privacy. |
| D4 | **Deliverable now** | **This plan document.** I have not written app code yet. | You asked for a development & implementation plan and to clarify unknowns first. |

---

## 1. The core trade-off you must decide (read this first)

Your two requirements are in direct tension with your ban-avoidance requirement:

- You want to **link via pairing code** and **search your existing personal & group chats**.
- The only technology that can read your *existing* personal/group history is an
  **unofficial library** (Baileys / whatsapp-web.js) that impersonates WhatsApp Web.
- Those unofficial libraries are **exactly what WhatsApp detects and bans** (reported
  ban windows of ~2–8 weeks for automation).

There is **no officially-sanctioned, zero-risk way** to read your existing personal and
group chats programmatically. Anyone claiming otherwise is selling the risk to you
without disclosing it. The honest options:

| Option | Reads existing personal/group chats? | Pairing code? | Ban risk | ToS |
|--------|:---:|:---:|:---:|:---:|
| **A. Unofficial (Baileys), read-only** | ✅ Yes | ✅ Yes | **Medium** (mitigatable) | Violates WhatsApp ToS |
| **B. Official WhatsApp Business API** | ❌ No (new business msgs only) | ❌ No | **None** | Compliant |
| **C. Chat-export file analysis** | ✅ Yes (manual export) | N/A | **None** | Compliant (you own the data) |
| **D. Hybrid (C now, A later)** | ✅ Yes | ✅ Later | Starts none → your choice | Read-only offline is fine; live link is your call |

**Key nuance that makes this workable:** WhatsApp's ban systems overwhelmingly target
**senders/spammers** — bulk messaging, broadcast lists, unsolicited outreach, link
spam. A purely **read-only, single-number, human-paced** client that never sends bulk
messages is a *far* lower-risk profile than the automation bans you read about. This
plan treats the WhatsApp client as **strictly read-only** by default.

> **A note on pairing codes:** WhatsApp companion-device linking uses an **8-character
> code** ("Link with phone number"), not a 6-digit one. The 6-digit code you may be
> thinking of is the **SMS registration OTP** for activating a number — a different
> flow. Baileys' `requestPairingCode()` returns the 8-character linking code. The plan
> supports whatever WhatsApp currently issues.

---

## 2. Legal, ethical & privacy considerations (must-read)

This app reads other people's messages (everyone in your group chats), so treat this
seriously:

1. **Legitimate use:** Analyzing *your own* received messages to protect yourself and
   your contacts from scams/threats is a defensible, defensive purpose. This plan is
   scoped to that.
2. **Consent & jurisdiction:** Recording/analyzing group members' messages may be
   regulated where you live (data-protection / wiretap-style laws vary by country).
   Because you're in a jurisdiction that may differ from mine, **confirm local rules
   before going live.** Keep analysis private (no publishing others' messages).
3. **Data minimization:** Only pull the date ranges/chats you need. Purge raw data on a
   schedule. Don't build a permanent surveillance archive.
4. **No enforcement claims:** Reports flag *possible* patterns for your own review — they
   are not proof and must not be presented as legal determinations.
5. **Never** use this to send messages, impersonate, or target people at scale.

These constraints are baked into the design (read-only, local storage, redaction,
retention limits).

---

## 3. WhatsApp connection strategy & ban-avoidance playbook

Applies when/if you enable the optional live link (Option A/D).

### 3.1 Library choice
- **Baileys** (`baileys` on npm, WhiskeySockets fork) — actively maintained, native
  pairing-code support, no headless browser needed (lighter, more stable than
  `whatsapp-web.js` which drives a real Chromium).

### 3.2 Hard rules to minimize bans
1. **Read-only.** The client never sends messages, never joins/leaves groups, never
   changes profile. Disable all send paths in code.
2. **Use a warm, aged number** — your real, established number with normal history.
   Brand-new numbers linking to automation get flagged fastest. (If you'd rather not
   risk your main number, that's a real dilemma — a secondary number won't contain your
   existing chats. Discuss before enabling.)
3. **One stable session.** Persist auth creds and reuse them; avoid repeated
   re-linking, which is a strong ban signal.
4. **Human-paced sync.** Throttle history backfill; don't hammer the socket. Add jitter.
   No tight reconnect loops (handle 515/connection errors with exponential backoff).
5. **Stable network/host.** Run from a consistent IP (home/VPS), not rotating
   datacenter IPs. Keep the process up 24/7 rather than churning connections.
6. **Keep the phone healthy & online.** The linked phone must stay reachable; keep the
   companion device count low.
7. **Kill switch.** One click to unlink/log out and wipe the local session.
8. **Realistic client fingerprint.** Use current Baileys defaults (up-to-date WA Web
   version string / browser identity). Update the library promptly when WA changes.

### 3.3 Residual risk acceptance
Even with all of the above, a ban is **possible**. The app must (a) work fully in the
zero-risk export mode, and (b) degrade gracefully if the number is banned (keep already-
analyzed data, surface a clear status). You accept the residual risk when you toggle the
live link on.

---

## 4. System architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Your machine / private VPS                    │
│                                                                       │
│  ┌───────────────┐     ┌──────────────────────┐    ┌──────────────┐  │
│  │  Web frontend │◄───►│   App server (API)   │◄──►│  Local store │  │
│  │  (React/Vite) │ auth│   Node + Fastify     │    │  SQLite +    │  │
│  └───────────────┘     │                      │    │  encrypted   │  │
│                        │  ┌────────────────┐  │    │  volume      │  │
│                        │  │ Ingest layer   │  │    └──────────────┘  │
│                        │  │  • Export parser│ │                       │
│                        │  │  • Baileys svc  │◄─┼──(optional live link)─┼─► WhatsApp
│                        │  │    (read-only)  │  │      via pairing code │
│                        │  └────────────────┘  │                       │
│                        │  ┌────────────────┐  │                       │
│                        │  │ Analysis engine│  │   redacted text       │
│                        │  │ • prefilter    │──┼──────────────────────►│ Claude API
│                        │  │ • redactor     │  │   ◄── findings ───────│ (or local LLM)
│                        │  │ • LLM classify │  │                       │
│                        │  └────────────────┘  │                       │
│                        │  ┌────────────────┐  │                       │
│                        │  │ Report builder │──┼──► PDF / HTML report   │
│                        │  └────────────────┘  │                       │
│                        └──────────────────────┘                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.1 Components
- **Frontend (React + Vite + Tailwind):** login, connect-WhatsApp (pairing-code display),
  chat/group browser, search console (prompt + pattern presets + date range), results
  viewer, report export.
- **App server (Node + Fastify/Express, TypeScript):** auth, REST/WebSocket API,
  orchestration.
- **Ingest layer:**
  - *Export parser* — parses WhatsApp `Export chat` `.txt`/`.zip` (with media) into
    normalized messages. Zero-risk, build first.
  - *Baileys service* — optional read-only live client; pairing-code linking; incremental
    history sync into the store. Runs as a long-lived worker.
- **Local store:** SQLite (via Prisma or better-sqlite3) on an **encrypted volume**;
  full-text search index (SQLite FTS5) for fast text/pattern queries before the LLM.
- **Analysis engine:** deterministic prefilter (keywords/regex/FTS) → **redactor**
  (tokenize names & numbers) → **LLM classifier** (Claude) → structured findings.
- **Report builder:** professional PDF/HTML with the required fields.

### 4.2 Why not the current Netlify setup?
Netlify serverless functions are **short-lived and stateless** — they cannot hold a
persistent WhatsApp WebSocket or a long history sync. The live-link mode needs a
**persistent server**. The static frontend could still be served anywhere, but the
backend must be self-hosted or on a persistent container host (Fly.io/Railway/VPS).

---

## 5. Security design (data protection)

1. **Everything local by default.** Data lives on your host, in SQLite on an
   **encrypted-at-rest** volume (LUKS / OS disk encryption; app-level encryption for the
   creds blob and DB with a key derived from a passphrase you enter at startup).
2. **App authentication.** Single-user login (strong password + optional TOTP 2FA);
   session cookies `HttpOnly`, `Secure`, `SameSite=Strict`. Rate-limit login.
3. **Transport.** HTTPS everywhere (self-signed for LAN or a real cert via a reverse
   proxy like Caddy/Traefik). No plaintext.
4. **Secrets.** Claude API key and WA session creds stored encrypted, never in the repo,
   never sent to the frontend. `.env` git-ignored; provide `.env.example`.
5. **Redaction before cloud.** Phone numbers, display names, and obvious PII are replaced
   with stable tokens (`CONTACT_7A`, `+PHONE_3`) before text is sent to the LLM;
   de-tokenized locally when rendering the report. (Skippable if you choose a local LLM.)
6. **Least data to the LLM.** Only prefiltered candidate messages (plus minimal context
   window) go to the API — not your entire history.
7. **Retention & purge.** Configurable auto-purge of raw messages; one-click "wipe all
   local data" and "unlink WhatsApp."
8. **Audit log.** Local log of what was analyzed and when.
9. **No third-party trackers/CDNs for sensitive views.** Bundle assets locally.
10. **Backups** (optional) are encrypted before leaving the host.

---

## 6. AI analysis & pattern detection

### 6.1 Two-stage pipeline (cost + privacy efficient)
1. **Deterministic prefilter (local, free):** FTS5 full-text search + curated keyword
   lexicons + regex for each risk category and for your custom prompt terms. Narrows
   millions of messages down to candidate windows. Also handles multilingual lexicons
   (important for local-language scams).
2. **LLM classification (Claude):** for each candidate window, Claude judges whether it
   truly matches a category, returns a **confidence score**, a short **rationale**, and
   the exact **matched spans** to highlight. Structured JSON output via tool/schema.

### 6.2 Built-in pattern presets (with tunable lexicons)
- Possible **scam** (fake prizes, impersonation, advance-fee, phishing links)
- Possible **threat** (intimidation, coercion, blackmail)
- Possible **online gambling** (betting sites, odds, deposit/withdraw slang)
- Possible **online borrowing / illegal lending** (loan-app pressure, usurious terms)
- Possible **theft** (stolen goods, account takeover, unauthorized access)
- Possible **malicious intent** (planning harm/fraud)
- Possible **malicious romance / romance scam** (love-bombing → money asks)
- Possible **pig butchering** (long-con romance + fake crypto/investment platform)

Each preset = editable keyword lexicon + few-shot examples + an LLM rubric. You can also
add **free-form prompts** ("find messages pressuring me to invest in USDT") and save them
as custom patterns.

### 6.3 Query controls
- Free-text prompt, one or many pattern presets, **date range**, chat/group selector,
  sender filter, language, min-confidence threshold.

---

## 7. Report output (professional layout)

For every finding, the report includes exactly what you asked for:
- **Name** (contact display name / group + sender)
- **WhatsApp number** (with a redaction toggle for sharing)
- **Chat excerpt** with surrounding context
- **Highlighted matched text/pattern** (the exact spans that triggered the flag)

Plus:
- Category label, **confidence score**, and a one-line AI rationale
- Timestamp and source chat/group
- Report header: generated date, date range analyzed, patterns searched, chats scanned
- **Executive summary** (counts per category, top contacts, timeline chart)
- Export to **PDF and HTML**; optional CSV of findings for records
- Clean, printable layout (cover page, section per category, evidence cards)

---

## 8. Development roadmap (phased)

### Phase 0 — Foundations (safe, no WhatsApp risk)
- Repo restructure: `apps/web` (frontend), `apps/server` (backend), `packages/core`
  (parsing, analysis, reporting). TypeScript, ESLint/Prettier, Docker Compose.
- Auth, encrypted SQLite store, config/secrets handling.
- **Deliverable:** running skeleton you can log into.

### Phase 1 — Export-based analyzer (full value, zero ban risk)
- WhatsApp `Export chat` parser (txt + zip + media), normalized message model, FTS index.
- Chat/group browser + search console (prompt, presets, date range).
- Analysis pipeline (prefilter → redactor → Claude classifier).
- **Report builder (PDF/HTML)** with the required fields + highlighting.
- **Deliverable:** upload an exported chat → get a professional risk report. *This alone
  meets most of your goal safely.*

### Phase 2 — Pattern library & tuning
- All 8 presets with multilingual lexicons + few-shot rubrics; custom saved prompts;
  confidence thresholds; false-positive feedback loop.
- **Deliverable:** high-quality, tunable detection.

### Phase 3 — Optional live link (your risk decision)
- Baileys read-only service with **pairing-code** linking UI, session persistence,
  throttled incremental history sync, kill switch, ban-resilient reconnection.
- Feature-flagged OFF by default; big consent screen documenting ban risk.
- **Deliverable:** live, near-real-time analysis of new messages.

### Phase 4 — Hardening & ops
- 2FA, retention/purge automation, audit log, backups, local-LLM (Ollama) option,
  scheduled scans + alerts, tests, docs.

---

## 9. Technology stack (proposed)

| Layer | Choice | Notes |
|-------|--------|-------|
| Frontend | React + Vite + TypeScript + Tailwind | Local-bundled assets |
| Backend | Node.js + Fastify + TypeScript | Persistent server |
| DB | SQLite + FTS5 (better-sqlite3/Prisma) | On encrypted volume |
| WA live (opt.) | `baileys` | Read-only, pairing code |
| AI | Claude API (Opus/Sonnet), schema tool-use | Local Ollama fallback |
| Reports | React-PDF or Puppeteer→PDF + HTML | Professional layout |
| Packaging | Docker + Docker Compose | Self-host friendly |
| Proxy/TLS | Caddy | Auto HTTPS |

---

## 10. Open questions / clarifications I need from you

1. **Connection choice (D1):** OK with the **hybrid** (safe export mode first, optional
   live link later), or do you want the live Baileys link from day one?
2. **Privacy vs. quality (D2):** Cloud Claude **with redaction** (recommended), cloud
   without redaction, or a **local LLM** (max privacy, lower quality)?
3. **Hosting (D3):** Self-host on your own machine, a private VPS, or a managed
   container host? Do you have a machine/VPS that can run 24/7 for the live link?
4. **Number strategy:** For the optional live link, are you comfortable linking your
   **main number** (needed to see your existing chats), understanding the residual ban
   risk?
5. **Jurisdiction:** Which country are you in? It affects the legal/consent guidance for
   analyzing group members' messages.
6. **Languages:** Which languages do your chats use? (Drives the detection lexicons.)
7. **Scale:** Roughly how many chats/messages and what date ranges do you expect to
   analyze? (Drives storage/performance choices.)
8. **Reuse the repo or fresh?** This `viral-hooks` repo is an unrelated app. Build the
   new app in a subfolder here, or start a clean repo?
9. **Should I start building Phase 0 + Phase 1 now**, or refine this plan first?

---

*Prepared as a plan for review. No WhatsApp connection or code has been created yet.*
