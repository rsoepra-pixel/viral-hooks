// Shared domain types for the WhatsApp AI Chat Analyzer.

/** A single parsed WhatsApp message. */
export interface Message {
  /** Stable index within the source chat (order of appearance). */
  seq: number;
  /** Epoch milliseconds. */
  timestamp: number;
  /** Display name of the sender, or null for system messages. */
  sender: string | null;
  /** Message body (media placeholders kept as text, e.g. "<Media omitted>"). */
  text: string;
  /** True when the line was a WhatsApp system notice (joins, encryption notice…). */
  system: boolean;
}

/** A parsed chat file (one export). */
export interface ParsedChat {
  /** Best-effort chat/group title, if detectable from the export. */
  title: string | null;
  /** Whether the export looks like a group (multiple distinct senders / group notices). */
  isGroup: boolean;
  messages: Message[];
  /** Distinct sender display names encountered. */
  participants: string[];
}

/** One risk category the AI can flag. */
export interface PatternDef {
  id: string;
  label: string;
  /** Short description shown in UI/report. */
  description: string;
  /** Keyword/phrase lexicon (lowercased) used by the deterministic prefilter. */
  keywords: string[];
  /** Optional regexes (as strings) used by the prefilter. */
  regexes?: string[];
  /** Extra guidance handed to the LLM for this category. */
  rubric: string;
}

/** A candidate window surfaced by the prefilter for LLM review. */
export interface Candidate {
  chatId: string;
  /** Center message that matched. */
  message: Message;
  /** Surrounding context messages (including the center). */
  context: Message[];
  /** Pattern ids the prefilter matched. */
  matchedPatterns: string[];
  /** The literal substrings that triggered the match. */
  hits: string[];
}

/** Result of LLM classification for a candidate. */
export interface Finding {
  /** Stable id "chatId:seq:patternId" for feedback (false-positive) tracking. */
  signature: string;
  chatId: string;
  chatTitle: string | null;
  sender: string | null;
  senderNumber: string | null;
  timestamp: number;
  patternId: string;
  patternLabel: string;
  /** 0..1 confidence from the model. */
  confidence: number;
  /** One-line reason. */
  rationale: string;
  /** The excerpt shown in the report (de-redacted). */
  excerpt: string;
  /** Substrings to highlight within the excerpt. */
  highlights: string[];
  /** Context messages for the evidence card (de-redacted). */
  context: Message[];
}

export interface SearchQuery {
  /** Free-text instruction from the user (optional). */
  prompt?: string;
  /** Selected pattern ids (empty = all). */
  patternIds: string[];
  /** Inclusive date range (epoch ms), optional bounds. */
  from?: number;
  to?: number;
  /** Restrict to these chat ids (empty = all). */
  chatIds: string[];
  /** Minimum confidence to include in results. */
  minConfidence: number;
}
