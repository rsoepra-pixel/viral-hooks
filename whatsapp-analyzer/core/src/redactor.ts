import type { Message } from "./types.js";

/**
 * PII redaction: replace phone numbers and known contact/sender names with
 * stable tokens before text is sent to a cloud LLM, then restore them locally
 * when rendering the report. Redaction is deterministic within a session so the
 * model can still reason about "who said what".
 */

export interface RedactionMap {
  /** token -> original value */
  restore: Map<string, string>;
  /** original value -> token */
  tokens: Map<string, string>;
}

export function createRedactionMap(): RedactionMap {
  return { restore: new Map(), tokens: new Map() };
}

// Indonesian + international phone shapes: +62..., 62..., 08...
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;

function tokenFor(
  map: RedactionMap,
  original: string,
  prefix: string
): string {
  const existing = map.tokens.get(original);
  if (existing) return existing;
  const n = [...map.tokens.keys()].filter((k) =>
    (map.tokens.get(k) ?? "").startsWith(`[${prefix}`)
  ).length;
  const token = `[${prefix}_${n + 1}]`;
  map.tokens.set(original, token);
  map.restore.set(token, original);
  return token;
}

/** Register participant names up front so they tokenize consistently. */
export function registerNames(map: RedactionMap, names: string[]): void {
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed.length >= 2) tokenFor(map, trimmed, "NAME");
  }
}

/** Redact a single text blob using the shared map. */
export function redactText(map: RedactionMap, text: string): string {
  let out = text;
  // Names first (longest first to avoid partial shadowing).
  const names = [...map.tokens.keys()]
    .filter((k) => (map.tokens.get(k) ?? "").startsWith("[NAME"))
    .sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (!name) continue;
    const re = new RegExp(escapeRe(name), "g");
    out = out.replace(re, map.tokens.get(name)!);
  }
  // Phone numbers.
  out = out.replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return m; // not a phone
    return tokenFor(map, m.trim(), "PHONE");
  });
  return out;
}

/** Restore tokens back to original values (used when rendering reports). */
export function restoreText(map: RedactionMap, text: string): string {
  let out = text;
  for (const [token, original] of map.restore) {
    out = out.split(token).join(original);
  }
  return out;
}

/** Redact a message's sender + text, returning a shallow copy. */
export function redactMessage(map: RedactionMap, msg: Message): Message {
  const sender =
    msg.sender != null
      ? map.tokens.get(msg.sender.trim()) ?? tokenFor(map, msg.sender.trim(), "NAME")
      : null;
  return { ...msg, sender, text: redactText(map, msg.text) };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
