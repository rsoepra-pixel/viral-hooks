import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type { Store } from "./db.js";

/**
 * OPTIONAL live WhatsApp link via Baileys (pairing code).
 *
 * ⚠️ This mode is OFF by default and carries WhatsApp-ban risk (it uses the
 * unofficial WhatsApp Web protocol). It is provided as an explicit opt-in only.
 * The client is strictly READ-ONLY: it never sends messages, never marks itself
 * online, and never sends read receipts — it only ingests incoming/outgoing
 * message text into the local store for analysis, mirroring the export flow.
 *
 * Baileys is loaded via dynamic import so the app runs fine when it isn't
 * installed. This module has NOT been tested against a live WhatsApp account in
 * this environment — verify pairing on your own device before relying on it.
 */

export type LiveState =
  | "disabled" // master switch off
  | "idle" // enabled, not started
  | "starting"
  | "awaiting_pairing" // pairing code issued, waiting for phone to confirm
  | "connected"
  | "logged_out"
  | "error";

interface LiveStatus {
  available: boolean; // baileys importable
  enabled: boolean; // master switch (ENABLE_LIVE)
  state: LiveState;
  pairingCode: string | null;
  phone: string | null;
  lastError: string | null;
  messagesIngested: number;
}

export class WhatsAppLive {
  private sock: any = null;
  private state: LiveState;
  private pairingCode: string | null = null;
  private phone: string | null = null;
  private lastError: string | null = null;
  private ingested = 0;
  private authDir: string;

  constructor(
    private store: Store,
    dataDir: string,
    private enabled: boolean,
    private log: (msg: string) => void = () => {}
  ) {
    this.authDir = join(dataDir, "wa-auth");
    this.state = enabled ? "idle" : "disabled";
  }

  status(): LiveStatus {
    return {
      available: true, // resolved lazily; enable() reports real import errors
      enabled: this.enabled,
      state: this.state,
      pairingCode: this.pairingCode,
      phone: this.phone,
      lastError: this.lastError,
      messagesIngested: this.ingested,
    };
  }

  /** Start the socket and request a pairing code for `phone` (E.164 digits). */
  async pair(phone: string): Promise<{ code: string }> {
    if (!this.enabled) throw new Error("Live mode is disabled (set ENABLE_LIVE=true).");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8) throw new Error("Enter a valid phone number in international format.");
    this.phone = digits;
    await this.start();
    // Give the socket a moment to open its websocket before requesting a code.
    await new Promise((r) => setTimeout(r, 1500));
    if (this.sock?.authState?.creds?.registered) {
      throw new Error("Already registered — no pairing code needed.");
    }
    const code: string = await this.sock.requestPairingCode(digits);
    this.pairingCode = code;
    this.state = "awaiting_pairing";
    this.log(`live: pairing code issued for ${digits}`);
    return { code };
  }

  private async start(): Promise<void> {
    if (this.sock) return;
    this.state = "starting";
    this.lastError = null;
    let baileys: any;
    try {
      // Non-literal specifier keeps this an optional runtime dependency (no
      // compile-time type resolution required).
      const mod = "baileys";
      baileys = await import(mod);
    } catch (e: any) {
      this.state = "error";
      this.lastError = "Baileys is not installed. Run: npm i baileys -w server";
      throw new Error(this.lastError);
    }
    const makeWASocket = baileys.default ?? baileys.makeWASocket;
    const { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers } = baileys;

    mkdirSync(this.authDir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      // Read-only hygiene: stay invisible, don't advertise presence.
      markOnlineOnConnect: false,
      syncFullHistory: false,
      browser: Browsers?.appropriate?.("Desktop") ?? ["WA-Analyzer", "Chrome", "1.0"],
    });

    this.sock.ev.on("creds.update", saveCreds);

    this.sock.ev.on("connection.update", (u: any) => {
      const { connection, lastDisconnect } = u;
      if (connection === "open") {
        this.state = "connected";
        this.pairingCode = null;
        this.log("live: connected (read-only)");
      } else if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason?.loggedOut) {
          this.state = "logged_out";
          this.sock = null;
          this.log("live: logged out");
        } else {
          // transient — reconnect with a small backoff
          this.sock = null;
          this.state = "starting";
          setTimeout(() => this.start().catch(() => {}), 3000);
        }
      }
    });

    this.sock.ev.on("messages.upsert", (up: any) => {
      try {
        this.ingest(up.messages ?? []);
      } catch (e: any) {
        this.log(`live: ingest error ${e?.message}`);
      }
    });
  }

  private ingest(messages: any[]): void {
    // Group incoming messages by chat JID, then append to the store.
    const byChat = new Map<string, { isGroup: boolean; items: any[] }>();
    for (const m of messages) {
      const jid: string | undefined = m?.key?.remoteJid;
      if (!jid || jid === "status@broadcast") continue;
      const isGroup = jid.endsWith("@g.us");
      const entry = byChat.get(jid) ?? { isGroup, items: [] };
      entry.items.push(m);
      byChat.set(jid, entry);
    }

    for (const [jid, { isGroup, items }] of byChat) {
      const msgs = items
        .map((m) => this.toMessage(m, isGroup))
        .filter((m): m is NonNullable<typeof m> => m !== null);
      if (msgs.length === 0) continue;
      const participants = [...new Set(msgs.map((m) => m.sender).filter(Boolean))] as string[];
      const title = jid.split("@")[0];
      this.store.appendMessages(`live:${jid}`, title, isGroup, participants, msgs);
      this.ingested += msgs.length;
    }
  }

  private toMessage(m: any, isGroup: boolean): {
    timestamp: number;
    sender: string | null;
    text: string;
    system: boolean;
  } | null {
    const content = m?.message;
    if (!content) return null;
    const text: string =
      content.conversation ??
      content.extendedTextMessage?.text ??
      content.imageMessage?.caption ??
      content.videoMessage?.caption ??
      "";
    if (!text) return null; // skip media-only / reactions for now
    const ts = Number(m.messageTimestamp ?? 0) * 1000 || Date.now();
    const sender = m.key?.fromMe
      ? "Me"
      : m.pushName ?? (isGroup ? m.key?.participant?.split("@")[0] : m.key?.remoteJid?.split("@")[0]) ?? null;
    return { timestamp: ts, sender, text, system: false };
  }

  async logout(): Promise<void> {
    try {
      await this.sock?.logout?.();
    } catch {
      /* ignore */
    }
    this.sock = null;
    this.state = this.enabled ? "idle" : "disabled";
    this.pairingCode = null;
  }
}
