import {
  prefilter,
  createRedactionMap,
  registerNames,
  PATTERN_MAP,
  PATTERNS,
  type Candidate,
  type Finding,
  type SearchQuery,
} from "@wa-analyzer/core";
import { classify, batch, type Verdict } from "./llm.js";
import type { RedactionMap, PatternDef } from "@wa-analyzer/core";
import type { Store } from "./db.js";
import type { Config } from "./config.js";

/** Injectable classifier so the pipeline can be tested without a live API. */
export type ClassifyFn = (
  candidates: Candidate[],
  patterns: PatternDef[],
  redact: boolean,
  map: RedactionMap,
  userPrompt?: string
) => Promise<Verdict[]>;

export interface PipelineDeps {
  classify?: ClassifyFn;
}

const PHONE_ONLY = /^\+?\d[\d\s().-]{6,}\d$/;

function senderNumber(sender: string | null): string | null {
  if (!sender) return null;
  return PHONE_ONLY.test(sender.trim()) ? sender.trim() : null;
}

export interface PipelineResult {
  findings: Finding[];
  candidatesScanned: number;
  chatsScanned: string[];
}

export async function runSearch(
  store: Store,
  cfg: Config,
  q: SearchQuery,
  deps: PipelineDeps = {}
): Promise<PipelineResult> {
  const classifyFn: ClassifyFn =
    deps.classify ??
    ((cands, patterns, redact, map, prompt) => {
      if (!cfg.anthropicKey) {
        throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
      }
      return classify(cfg.anthropicKey, cfg.model, cands, patterns, redact, map, prompt);
    });

  const chats = store.listChats().filter(
    (c) => q.chatIds.length === 0 || q.chatIds.includes(c.id)
  );

  const promptTerms = (q.prompt ?? "")
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);

  const allCandidates: Candidate[] = [];
  const chatMeta = new Map<string, { title: string | null }>();

  for (const chat of chats) {
    chatMeta.set(chat.id, { title: chat.title });
    const messages = store.getMessages(chat.id, q.from, q.to);
    const cands = prefilter(chat.id, messages, {
      patternIds: q.patternIds,
      promptTerms,
      contextRadius: 3,
    });
    allCandidates.push(...cands);
  }

  // Build one redaction map across all candidates for consistency.
  const map = createRedactionMap();
  if (cfg.redact) {
    const names = new Set<string>();
    for (const c of allCandidates) for (const m of c.context) if (m.sender) names.add(m.sender);
    registerNames(map, [...names]);
  }

  const selectedPatterns =
    q.patternIds.length > 0 ? PATTERNS.filter((p) => q.patternIds.includes(p.id)) : PATTERNS;

  const dismissed = store.listFeedback();
  const findings: Finding[] = [];
  for (const chunk of batch(allCandidates, 15)) {
    const verdicts = await classifyFn(chunk, selectedPatterns, cfg.redact, map, q.prompt);
    for (const v of verdicts) {
      const c = chunk[v.index];
      if (!c) continue;
      if (v.confidence < q.minConfidence) continue;
      const sig = `${c.chatId}:${c.message.seq}:${v.patternId}`;
      if (dismissed.has(sig)) continue; // user marked this a false positive
      const pattern = PATTERN_MAP.get(v.patternId);
      findings.push({
        signature: sig,
        chatId: c.chatId,
        chatTitle: chatMeta.get(c.chatId)?.title ?? null,
        sender: c.message.sender,
        senderNumber: senderNumber(c.message.sender),
        timestamp: c.message.timestamp,
        patternId: v.patternId,
        patternLabel: pattern?.label ?? v.patternId,
        confidence: v.confidence,
        rationale: v.rationale,
        excerpt: c.message.text,
        highlights: v.highlights?.length ? v.highlights : c.hits,
        context: c.context, // original (un-redacted) for local report
      });
    }
  }

  findings.sort((a, b) => b.confidence - a.confidence);
  return {
    findings,
    candidatesScanned: allCandidates.length,
    chatsScanned: chats.map((c) => c.title ?? c.id),
  };
}
