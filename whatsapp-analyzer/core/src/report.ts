import type { Finding, Message } from "./types.js";

/**
 * Professional, self-contained HTML report. Opens print-ready (Ctrl/Cmd+P to
 * save as PDF) with no external assets — safe for sensitive data. Every finding
 * card shows: name, WhatsApp number, chat, and the highlighted matched text.
 */

export interface ReportMeta {
  generatedAt: number;
  from?: number;
  to?: number;
  patternsSearched: string[];
  chatsScanned: string[];
  promptUsed?: string;
  /** When true, phone numbers are masked in the output. */
  maskNumbers?: boolean;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(ms?: number): string {
  if (ms == null) return "—";
  const d = new Date(ms);
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function maskPhone(n: string | null): string {
  if (!n) return "—";
  const digits = n.replace(/\D/g, "");
  if (digits.length < 5) return n;
  return digits.slice(0, 4) + "•".repeat(Math.max(0, digits.length - 7)) + digits.slice(-3);
}

function highlight(text: string, terms: string[]): string {
  let html = esc(text);
  const sorted = [...new Set(terms)].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const t of sorted) {
    const re = new RegExp(escapeRe(esc(t)), "gi");
    html = html.replace(re, (m) => `<mark>${m}</mark>`);
  }
  return html;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function contextBlock(context: Message[], centerTs: number, terms: string[]): string {
  return context
    .map((m) => {
      const isCenter = m.timestamp === centerTs;
      const who = m.sender ? esc(m.sender) : "<i>system</i>";
      const body = isCenter ? highlight(m.text, terms) : esc(m.text);
      return `<div class="msg${isCenter ? " center" : ""}"><span class="t">${fmtDate(
        m.timestamp
      )}</span> <b>${who}</b>: ${body}</div>`;
    })
    .join("");
}

export function buildReportHtml(findings: Finding[], meta: ReportMeta): string {
  const byPattern = new Map<string, Finding[]>();
  for (const f of findings) {
    const arr = byPattern.get(f.patternLabel) ?? [];
    arr.push(f);
    byPattern.set(f.patternLabel, arr);
  }

  const summaryRows = [...byPattern.entries()]
    .map(([label, arr]) => `<tr><td>${esc(label)}</td><td class="num">${arr.length}</td></tr>`)
    .join("");

  const sections = [...byPattern.entries()]
    .map(([label, arr]) => {
      const cards = arr
        .sort((a, b) => b.confidence - a.confidence)
        .map((f) => {
          const num = meta.maskNumbers ? maskPhone(f.senderNumber) : f.senderNumber ?? "—";
          const conf = Math.round(f.confidence * 100);
          const confClass = conf >= 75 ? "high" : conf >= 50 ? "med" : "low";
          return `
          <div class="card">
            <div class="card-head">
              <div>
                <div class="name">${esc(f.sender ?? "Unknown")}</div>
                <div class="meta">${esc(f.chatTitle ?? "Chat")} · ${fmtDate(f.timestamp)}</div>
                <div class="meta">WhatsApp: ${esc(num)}</div>
              </div>
              <div class="conf ${confClass}">${conf}%</div>
            </div>
            <div class="rationale">${esc(f.rationale)}</div>
            <div class="excerpt">${contextBlock(f.context, f.timestamp, f.highlights)}</div>
          </div>`;
        })
        .join("");
      return `<section><h2>${esc(label)} <span class="count">${arr.length}</span></h2>${cards}</section>`;
    })
    .join("");

  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>WhatsApp Risk Analysis Report</title>
<style>
  :root{--ink:#0f1320;--muted:#6b7280;--line:#e5e7eb;--accent:#4f46e5;--mark:#fde68a;}
  *{box-sizing:border-box}
  body{font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);margin:0;background:#fff}
  .wrap{max-width:900px;margin:0 auto;padding:40px 32px}
  .cover{border-bottom:3px solid var(--accent);padding-bottom:24px;margin-bottom:24px}
  .cover h1{margin:0 0 6px;font-size:26px}
  .cover .sub{color:var(--muted)}
  .kv{display:grid;grid-template-columns:180px 1fr;gap:6px 16px;margin-top:18px;font-size:13px}
  .kv .k{color:var(--muted)}
  table.summary{border-collapse:collapse;width:100%;margin:20px 0}
  table.summary td{border-bottom:1px solid var(--line);padding:8px 6px}
  table.summary .num{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
  h2{font-size:18px;margin:28px 0 12px;display:flex;align-items:center;gap:10px}
  h2 .count{background:var(--accent);color:#fff;border-radius:999px;font-size:12px;padding:2px 10px}
  .card{border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 14px;page-break-inside:avoid}
  .card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
  .name{font-weight:700;font-size:15px}
  .meta{color:var(--muted);font-size:12px}
  .conf{font-weight:700;border-radius:8px;padding:4px 10px;font-size:13px}
  .conf.high{background:#fee2e2;color:#b91c1c}
  .conf.med{background:#fef3c7;color:#92400e}
  .conf.low{background:#e5e7eb;color:#374151}
  .rationale{margin:10px 0;font-style:italic;color:#374151}
  .excerpt{background:#f9fafb;border-radius:8px;padding:10px 12px;font-size:13px}
  .msg{padding:3px 0}
  .msg.center{background:#fff7ed;border-left:3px solid var(--accent);padding-left:8px;margin:2px -4px}
  .msg .t{color:var(--muted);font-size:11px;margin-right:6px;font-variant-numeric:tabular-nums}
  mark{background:var(--mark);padding:0 2px;border-radius:3px}
  .foot{margin-top:40px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
  @media print{.wrap{padding:0}}
</style></head><body><div class="wrap">
  <div class="cover">
    <h1>WhatsApp Risk Analysis Report</h1>
    <div class="sub">AI-assisted review of exported chats — for personal review only</div>
    <div class="kv">
      <div class="k">Generated</div><div>${fmtDate(meta.generatedAt)}</div>
      <div class="k">Date range analyzed</div><div>${fmtDate(meta.from)} — ${fmtDate(meta.to)}</div>
      <div class="k">Patterns searched</div><div>${esc(meta.patternsSearched.join(", ") || "All")}</div>
      <div class="k">Chats scanned</div><div>${esc(meta.chatsScanned.join(", ") || "—")}</div>
      ${meta.promptUsed ? `<div class="k">Prompt</div><div>${esc(meta.promptUsed)}</div>` : ""}
      <div class="k">Total findings</div><div>${findings.length}</div>
    </div>
  </div>
  <h2>Executive summary</h2>
  <table class="summary"><tbody>${summaryRows || '<tr><td colspan="2">No findings.</td></tr>'}</tbody></table>
  ${sections}
  <div class="foot">
    Findings indicate <b>possible</b> patterns for your review and are not proof or a legal
    determination. Handle contacts' data responsibly and in line with applicable law
    (e.g. Indonesia's UU PDP No. 27/2022).
  </div>
</div></body></html>`;
}
