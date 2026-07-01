import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Message } from "@wa-analyzer/core";

export interface ChatRow {
  id: string;
  title: string | null;
  is_group: number;
  participants: string; // JSON array
  message_count: number;
  min_ts: number;
  max_ts: number;
  created_at: number;
}

export class Store {
  private db: Database.Database;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new Database(join(dataDir, "analyzer.sqlite"));
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT,
        is_group INTEGER NOT NULL DEFAULT 0,
        participants TEXT NOT NULL DEFAULT '[]',
        message_count INTEGER NOT NULL DEFAULT 0,
        min_ts INTEGER NOT NULL DEFAULT 0,
        max_ts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        chat_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        sender TEXT,
        text TEXT NOT NULL,
        system INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (chat_id, seq)
      );
      CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages(chat_id, ts);
    `);
  }

  addChat(
    id: string,
    title: string | null,
    isGroup: boolean,
    participants: string[],
    messages: Message[]
  ): ChatRow {
    const now = Date.now();
    const nonEmpty = messages.filter((m) => m.text.trim() !== "" || m.system);
    const minTs = nonEmpty.length ? Math.min(...nonEmpty.map((m) => m.timestamp)) : now;
    const maxTs = nonEmpty.length ? Math.max(...nonEmpty.map((m) => m.timestamp)) : now;

    const insertChat = this.db.prepare(
      `INSERT INTO chats (id,title,is_group,participants,message_count,min_ts,max_ts,created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    );
    const insertMsg = this.db.prepare(
      `INSERT OR REPLACE INTO messages (chat_id,seq,ts,sender,text,system) VALUES (?,?,?,?,?,?)`
    );
    const tx = this.db.transaction(() => {
      insertChat.run(
        id,
        title,
        isGroup ? 1 : 0,
        JSON.stringify(participants),
        messages.length,
        minTs,
        maxTs,
        now
      );
      for (const m of messages) {
        insertMsg.run(id, m.seq, m.timestamp, m.sender, m.text, m.system ? 1 : 0);
      }
    });
    tx();
    return {
      id,
      title,
      is_group: isGroup ? 1 : 0,
      participants: JSON.stringify(participants),
      message_count: messages.length,
      min_ts: minTs,
      max_ts: maxTs,
      created_at: now,
    };
  }

  listChats(): ChatRow[] {
    return this.db.prepare(`SELECT * FROM chats ORDER BY created_at DESC`).all() as ChatRow[];
  }

  getChat(id: string): ChatRow | undefined {
    return this.db.prepare(`SELECT * FROM chats WHERE id = ?`).get(id) as ChatRow | undefined;
  }

  deleteChat(id: string) {
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM messages WHERE chat_id = ?`).run(id);
      this.db.prepare(`DELETE FROM chats WHERE id = ?`).run(id);
    });
    tx();
  }

  getMessages(chatId: string, from?: number, to?: number): Message[] {
    let sql = `SELECT seq,ts,sender,text,system FROM messages WHERE chat_id = ?`;
    const params: (string | number)[] = [chatId];
    if (from != null) {
      sql += ` AND ts >= ?`;
      params.push(from);
    }
    if (to != null) {
      sql += ` AND ts <= ?`;
      params.push(to);
    }
    sql += ` ORDER BY seq ASC`;
    const rows = this.db.prepare(sql).all(...params) as Array<{
      seq: number;
      ts: number;
      sender: string | null;
      text: string;
      system: number;
    }>;
    return rows.map((r) => ({
      seq: r.seq,
      timestamp: r.ts,
      sender: r.sender,
      text: r.text,
      system: r.system === 1,
    }));
  }

  /** Purge messages older than retentionDays (0 = disabled). */
  purgeOld(retentionDays: number) {
    if (retentionDays <= 0) return 0;
    const cutoff = Date.now() - retentionDays * 86400_000;
    const info = this.db.prepare(`DELETE FROM messages WHERE ts < ?`).run(cutoff);
    return info.changes;
  }

  wipeAll() {
    this.db.exec(`DELETE FROM messages; DELETE FROM chats;`);
  }
}
