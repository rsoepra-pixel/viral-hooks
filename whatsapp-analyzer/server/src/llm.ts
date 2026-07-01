import type { Candidate, PatternDef, RedactionMap } from "@wa-analyzer/core";
import { redactText } from "@wa-analyzer/core";

/**
 * Claude-based classifier. Receives prefiltered candidates (already redacted if
 * enabled) and returns structured verdicts. Uses the Anthropic Messages API
 * with a forced tool call so output is valid JSON.
 */

export interface Verdict {
  index: number;
  patternId: string;
  confidence: number;
  rationale: string;
  highlights: string[];
  isMatch: boolean;
}

const CLASSIFY_TOOL = {
  name: "report_findings",
  description: "Report which candidate messages match which risk pattern.",
  input_schema: {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer", description: "Candidate index" },
            patternId: { type: "string", description: "Matched pattern id" },
            isMatch: { type: "boolean" },
            confidence: { type: "number", description: "0..1" },
            rationale: { type: "string", description: "One short sentence." },
            highlights: {
              type: "array",
              items: { type: "string" },
              description: "Exact substrings from the message to highlight.",
            },
          },
          required: ["index", "patternId", "isMatch", "confidence", "rationale", "highlights"],
        },
      },
    },
    required: ["findings"],
  },
} as const;

function buildPrompt(
  candidates: Candidate[],
  patterns: PatternDef[],
  redact: boolean,
  map: RedactionMap,
  userPrompt?: string
): string {
  const rubric = patterns
    .map((p) => `- ${p.id} (${p.label}): ${p.rubric}`)
    .join("\n");

  const items = candidates
    .map((c, i) => {
      const ctx = c.context
        .map((m) => {
          const who = m.sender ?? "system";
          const text = redact ? redactText(map, m.text) : m.text;
          return `    ${who}: ${text}`;
        })
        .join("\n");
      return `[Candidate ${i}] (prefilter matched: ${c.matchedPatterns.join(", ")})\n${ctx}`;
    })
    .join("\n\n");

  return `You are a fraud/risk analyst reviewing exported WhatsApp chat excerpts (mostly Indonesian).
For EACH candidate, decide whether it genuinely matches one or more of these risk patterns. Be precise: reject weak/coincidental keyword hits. Names/phones may be tokenized like [NAME_1]/[PHONE_2] — treat tokens as the referenced person.

Risk patterns:
${rubric}
${userPrompt ? `\nThe user is specifically looking for: "${userPrompt}". Prefer candidates relevant to this.\n` : ""}
Return findings via the report_findings tool. Only include real matches (isMatch=true). "highlights" must be exact substrings copied from the candidate text. confidence is 0..1.

Candidates:
${items}`;
}

export async function classify(
  apiKey: string,
  model: string,
  candidates: Candidate[],
  patterns: PatternDef[],
  redact: boolean,
  map: RedactionMap,
  userPrompt?: string
): Promise<Verdict[]> {
  if (candidates.length === 0) return [];
  const body = {
    model,
    max_tokens: 4096,
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "report_findings" },
    messages: [
      { role: "user", content: buildPrompt(candidates, patterns, redact, map, userPrompt) },
    ],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${txt.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    content: Array<{ type: string; name?: string; input?: { findings?: Verdict[] } }>;
  };
  const toolUse = data.content.find((c) => c.type === "tool_use" && c.name === "report_findings");
  const findings = toolUse?.input?.findings ?? [];
  return findings.filter((f) => f.isMatch);
}

/** Split candidates into batches to keep prompts within limits. */
export function batch<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
