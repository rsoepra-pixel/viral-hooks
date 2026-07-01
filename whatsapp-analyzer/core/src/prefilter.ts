import type { Candidate, Message, PatternDef } from "./types.js";
import { PATTERNS } from "./patterns.js";

/**
 * Deterministic, local prefilter. Scans messages for keyword/regex hits per
 * pattern and returns candidate windows (message + surrounding context) for the
 * LLM to judge. This keeps LLM cost and data exposure minimal — only likely
 * matches leave the machine.
 */

export interface PrefilterOptions {
  patternIds?: string[];
  /** Extra free-text terms from the user's prompt to also match on. */
  promptTerms?: string[];
  from?: number;
  to?: number;
  /** Number of context messages on each side. */
  contextRadius?: number;
}

function normalize(s: string): string {
  return s.toLowerCase();
}

function compileRegexes(defs: PatternDef[]): Map<string, RegExp[]> {
  const map = new Map<string, RegExp[]>();
  for (const d of defs) {
    const res = (d.regexes ?? []).map((r) => new RegExp(r, "gi"));
    map.set(d.id, res);
  }
  return map;
}

export function prefilter(
  chatId: string,
  messages: Message[],
  opts: PrefilterOptions = {}
): Candidate[] {
  const radius = opts.contextRadius ?? 3;
  const selected = opts.patternIds?.length
    ? PATTERNS.filter((p) => opts.patternIds!.includes(p.id))
    : PATTERNS;
  const regexMap = compileRegexes(selected);
  const promptTerms = (opts.promptTerms ?? [])
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2);

  const candidates: Candidate[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.system) continue;
    if (opts.from != null && msg.timestamp < opts.from) continue;
    if (opts.to != null && msg.timestamp > opts.to) continue;

    const lc = normalize(msg.text);
    const matchedPatterns = new Set<string>();
    const hits = new Set<string>();

    for (const p of selected) {
      for (const kw of p.keywords) {
        if (lc.includes(kw)) {
          matchedPatterns.add(p.id);
          hits.add(kw);
        }
      }
      for (const re of regexMap.get(p.id) ?? []) {
        re.lastIndex = 0;
        const m = re.exec(msg.text);
        if (m) {
          matchedPatterns.add(p.id);
          hits.add(m[0]);
        }
      }
    }

    // User's free-text terms count as a match too (pattern id "prompt").
    for (const term of promptTerms) {
      if (lc.includes(term)) {
        matchedPatterns.add("prompt");
        hits.add(term);
      }
    }

    if (matchedPatterns.size === 0) continue;

    const start = Math.max(0, i - radius);
    const end = Math.min(messages.length - 1, i + radius);
    candidates.push({
      chatId,
      message: msg,
      context: messages.slice(start, end + 1),
      matchedPatterns: [...matchedPatterns],
      hits: [...hits],
    });
  }

  return candidates;
}
