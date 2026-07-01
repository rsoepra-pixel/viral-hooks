import { useEffect, useState } from "react";
import { api, type Chat, type Pattern, type Finding, type SearchResult } from "./api.ts";

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    api.me().then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);
  if (authed === null) return <div className="wrap"><span className="spinner" /> Loading…</div>;
  if (!authed) return <Login onOk={() => setAuthed(true)} />;
  return <Main onLogout={() => setAuthed(false)} />;
}

function Login({ onOk }: { onOk: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api.login(pw); onOk(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="login">
      <div className="brand" style={{ fontSize: 20, marginBottom: 16 }}><span className="dot" /> WhatsApp AI Chat Analyzer</div>
      <form className="panel" onSubmit={submit}>
        <h2>Sign in</h2>
        <label>Password</label>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
        <button className="primary" style={{ marginTop: 12, width: "100%" }} disabled={busy}>
          {busy ? <span className="spinner" /> : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function Main({ onLogout }: { onLogout: () => void }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [health, setHealth] = useState<{ llmConfigured: boolean; liveEnabled: boolean } | null>(null);
  const [mode, setMode] = useState<"export" | "live">("export");

  const refresh = () => api.chats().then(setChats);
  useEffect(() => {
    refresh();
    api.patterns().then(setPatterns);
    api.health().then(setHealth).catch(() => {});
  }, []);

  return (
    <>
      <div className="topbar">
        <div className="brand"><span className="dot" /> WhatsApp AI Chat Analyzer</div>
        <div className="row">
          <span className="muted">
            {mode === "export" ? "Export-based · read-only · zero ban risk" : "Live link · read-only · opt-in (ban risk)"}
          </span>
          <button onClick={async () => { await api.logout(); onLogout(); }}>Log out</button>
        </div>
      </div>
      <div className="wrap">
        {health && !health.llmConfigured && (
          <div className="notice" style={{ marginBottom: 16 }}>
            ⚠️ No <b>ANTHROPIC_API_KEY</b> configured on the server — search will fail until you set it in <code>.env</code>.
          </div>
        )}

        <div className="panel">
          <h2>1 · Choose how to import chats</h2>
          <div className="row">
            <span className={"pill" + (mode === "export" ? " on" : "")} onClick={() => setMode("export")}>
              📁 Export files (safe, recommended)
            </span>
            <span className={"pill" + (mode === "live" ? " on" : "")} onClick={() => setMode("live")}>
              🔗 Live link (beta · ban risk)
            </span>
          </div>
        </div>

        {mode === "export" ? (
          <Uploader onUploaded={refresh} />
        ) : (
          <LivePanel enabledOnServer={!!health?.liveEnabled} onIngest={refresh} />
        )}
        <ChatList chats={chats} onChange={refresh} />
        <SearchConsole chats={chats} patterns={patterns} />
      </div>
    </>
  );
}

function LivePanel({ enabledOnServer, onIngest }: { enabledOnServer: boolean; onIngest: () => void }) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.liveStatus>> | null>(null);
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const poll = () => api.liveStatus().then(setStatus).catch(() => {});
  useEffect(() => {
    poll();
    const t = setInterval(() => { poll(); onIngest(); }, 5000);
    return () => clearInterval(t);
  }, []);

  const pair = async () => {
    setBusy(true); setErr(""); setCode("");
    try { const r = await api.livePair(phone, consent); setCode(r.code); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); poll(); }
  };

  return (
    <div className="panel">
      <h2>2 · Live WhatsApp link <span className="chip">beta · read-only</span></h2>
      <div className="error" style={{ marginBottom: 12 }}>
        ⚠️ <b>Ban risk.</b> This uses the unofficial WhatsApp Web protocol on <b>your own number</b>.
        WhatsApp may ban numbers that use such tools. The client is strictly read-only (never sends),
        which lowers but does not eliminate the risk. Use at your own discretion.
      </div>
      {!enabledOnServer ? (
        <div className="notice">
          Live mode is <b>disabled on the server</b>. To enable it, set <code>ENABLE_LIVE=true</code> and
          install the library (<code>npm i baileys -w server</code>), then restart.
        </div>
      ) : (
        <>
          <div className="muted" style={{ marginBottom: 8 }}>
            Status: <b>{status?.state ?? "…"}</b>
            {status?.messagesIngested ? ` · ${status.messagesIngested} messages ingested` : ""}
          </div>
          {status?.state === "connected" ? (
            <div className="row">
              <div className="notice" style={{ flex: 1 }}>✅ Connected. New messages are being ingested and are searchable below.</div>
              <button onClick={async () => { await api.liveLogout(); poll(); }}>Unlink</button>
            </div>
          ) : (
            <>
              <div className="grid cols-2">
                <div>
                  <label>Your WhatsApp number (international, e.g. 6281234567890)</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="62..." />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <label className="pill" style={{ marginBottom: 0 }}>
                    <input type="checkbox" style={{ width: "auto" }} checked={consent}
                      onChange={(e) => setConsent(e.target.checked)} />
                    I understand and accept the ban risk
                  </label>
                </div>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="primary" disabled={busy || !consent || !phone} onClick={pair}>
                  {busy ? <span className="spinner" /> : "Get pairing code"}
                </button>
              </div>
              {code && (
                <div className="notice" style={{ marginTop: 12 }}>
                  On your phone: WhatsApp → <b>Linked devices</b> → <b>Link a device</b> → <b>Link with phone number</b>,
                  then enter this code:
                  <div style={{ fontSize: 28, letterSpacing: 4, fontWeight: 700, marginTop: 8 }}>{code}</div>
                </div>
              )}
            </>
          )}
          {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
        </>
      )}
    </div>
  );
}

function Uploader({ onUploaded }: { onUploaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const onFile = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setErr("");
    try { for (const f of Array.from(files)) await api.upload(f); onUploaded(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="panel">
      <h2>2 · Import exported chats</h2>
      <p className="muted">
        In WhatsApp open a chat → ⋮ → <b>More</b> → <b>Export chat</b> → <b>Without media</b> (recommended),
        then upload the <code>.txt</code> or <code>.zip</code> here. Data stays on this server.
      </p>
      <div className="row">
        <input type="file" accept=".txt,.zip" multiple onChange={(e) => onFile(e.target.files)} />
        {busy && <span className="spinner" />}
      </div>
      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}

function ChatList({ chats, onChange }: { chats: Chat[]; onChange: () => void }) {
  return (
    <div className="panel">
      <h2>3 · Imported chats ({chats.length})</h2>
      {chats.length === 0 && <p className="muted">No chats yet.</p>}
      {chats.map((c) => (
        <div className="chat-item" key={c.id}>
          <div>
            <b>{c.title ?? "Untitled"}</b>{" "}
            <span className="chip">{c.isGroup ? "group" : "1:1"}</span>{" "}
            <span className="chip">{c.messageCount} msgs</span>{" "}
            <span className="muted">{new Date(c.from).toLocaleDateString("id-ID")} – {new Date(c.to).toLocaleDateString("id-ID")}</span>
          </div>
          <button onClick={async () => { if (confirm("Delete this chat's data?")) { await api.deleteChat(c.id); onChange(); } }}>Delete</button>
        </div>
      ))}
    </div>
  );
}

function SearchConsole({ chats, patterns }: { chats: Chat[]; patterns: Pattern[] }) {
  const [prompt, setPrompt] = useState("");
  const [selPatterns, setSelPatterns] = useState<string[]>([]);
  const [selChats, setSelChats] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minConf, setMinConf] = useState(0.5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [saved, setSaved] = useState<Array<{ id: string; name: string; query: any }>>([]);

  const refreshSaved = () => api.savedSearches().then(setSaved).catch(() => {});
  useEffect(() => { refreshSaved(); }, []);

  const currentQuery = () => ({ prompt, selPatterns, selChats, from, to, minConf });
  const applyQuery = (q: any) => {
    setPrompt(q.prompt ?? ""); setSelPatterns(q.selPatterns ?? []); setSelChats(q.selChats ?? []);
    setFrom(q.from ?? ""); setTo(q.to ?? ""); setMinConf(q.minConf ?? 0.5);
  };
  const save = async () => {
    const name = prompt.trim() ? prompt.slice(0, 40) : window.prompt("Name this search:") || "";
    if (!name) return;
    await api.saveSearch(name, currentQuery());
    refreshSaved();
  };

  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const run = async () => {
    setBusy(true); setErr(""); setResult(null);
    try {
      const res = await api.search({
        prompt: prompt || undefined,
        patternIds: selPatterns,
        chatIds: selChats,
        from: from ? new Date(from).getTime() : undefined,
        to: to ? new Date(to).getTime() + 86_399_000 : undefined,
        minConfidence: minConf,
      });
      setResult(res);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="panel">
      <h2>4 · Search &amp; analyze</h2>
      <div className="grid cols-2">
        <div>
          <label>Your instruction / prompt (optional)</label>
          <textarea rows={2} value={prompt} placeholder="e.g. cari orang yang menawari saya investasi crypto"
            onChange={(e) => setPrompt(e.target.value)} />
        </div>
        <div className="grid cols-2">
          <div><label>From date</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label>To date</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label>Risk patterns (none selected = all)</label>
        <div className="row">
          {patterns.map((p) => (
            <span key={p.id} title={p.description}
              className={"pill" + (selPatterns.includes(p.id) ? " on" : "")}
              onClick={() => setSelPatterns((s) => toggle(s, p.id))}>{p.label}</span>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label>Chats (none selected = all)</label>
        <div className="row">
          {chats.map((c) => (
            <span key={c.id}
              className={"pill" + (selChats.includes(c.id) ? " on" : "")}
              onClick={() => setSelChats((s) => toggle(s, c.id))}>{c.title ?? c.id.slice(0, 6)}</span>
          ))}
        </div>
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <div style={{ width: 220 }}>
          <label>Min confidence: {Math.round(minConf * 100)}%</label>
          <input type="range" min={0} max={1} step={0.05} value={minConf}
            onChange={(e) => setMinConf(Number(e.target.value))} />
        </div>
        <button className="primary" onClick={run} disabled={busy || chats.length === 0}>
          {busy ? <><span className="spinner" /> Analyzing…</> : "Analyze"}
        </button>
        <button onClick={save} disabled={chats.length === 0}>Save search</button>
      </div>

      {saved.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <label>Saved searches</label>
          <div className="row">
            {saved.map((s) => (
              <span key={s.id} className="pill" onClick={() => applyQuery(s.query)} title="Load">
                {s.name}
                <b style={{ marginLeft: 6, color: "var(--danger)" }}
                  onClick={async (e) => { e.stopPropagation(); await api.deleteSavedSearch(s.id); refreshSaved(); }}>×</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
      {result && <Results result={result} prompt={prompt} patterns={selPatterns.length ? selPatterns : patterns.map(p => p.id)} from={from} to={to} chats={chats} selChats={selChats} />}
    </div>
  );
}

function confClass(c: number) { return c >= 0.75 ? "high" : c >= 0.5 ? "med" : "low"; }

function Results({ result, prompt, patterns, from, to, chats, selChats }: {
  result: SearchResult; prompt: string; patterns: string[];
  from: string; to: string; chats: Chat[]; selChats: string[];
}) {
  const [mask, setMask] = useState(false);
  const [findings, setFindings] = useState<Finding[]>(result.findings);
  useEffect(() => { setFindings(result.findings); }, [result]);

  const dismiss = async (f: Finding) => {
    await api.addFeedback(f.signature);
    setFindings((fs) => fs.filter((x) => x.signature !== f.signature));
  };

  const openReport = async () => {
    const chatsScanned = (selChats.length ? chats.filter(c => selChats.includes(c.id)) : chats).map(c => c.title ?? c.id);
    const res = await fetch(api.reportUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        findings, prompt,
        patternsSearched: patterns, chatsScanned, maskNumbers: mask,
        from: from ? new Date(from).getTime() : undefined,
        to: to ? new Date(to).getTime() : undefined,
      }),
    });
    const html = await res.text();
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><b>{findings.length}</b> findings <span className="muted">· {result.candidatesScanned} candidates scanned</span></div>
        <div className="row">
          <label className="pill" style={{ marginBottom: 0 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={mask} onChange={(e) => setMask(e.target.checked)} /> Mask numbers
          </label>
          <button className="primary" onClick={openReport} disabled={findings.length === 0}>Generate report (PDF)</button>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        {findings.map((f) => <FindingCard key={f.signature} f={f} mask={mask} onDismiss={() => dismiss(f)} />)}
        {findings.length === 0 && <p className="muted">No matches above the confidence threshold.</p>}
      </div>
    </div>
  );
}

function FindingCard({ f, mask, onDismiss }: { f: Finding; mask: boolean; onDismiss: () => void }) {
  const number = f.senderNumber ? (mask ? maskPhone(f.senderNumber) : f.senderNumber) : "—";
  return (
    <div className="finding">
      <div className="head">
        <div>
          <div className="name">{f.sender ?? "Unknown"} <span className="chip">{f.patternLabel}</span></div>
          <div className="muted">{f.chatTitle ?? "Chat"} · {new Date(f.timestamp).toLocaleString("id-ID")} · WhatsApp: {number}</div>
        </div>
        <div className="row">
          <div className={"conf " + confClass(f.confidence)}>{Math.round(f.confidence * 100)}%</div>
          <button title="Mark as false positive (hides it and future matches)" onClick={onDismiss}>✕ False positive</button>
        </div>
      </div>
      <div className="muted" style={{ fontStyle: "italic", marginTop: 6 }}>{f.rationale}</div>
      <div className="excerpt">
        {f.context.map((m, i) => (
          <div key={i} className={"msg" + (m.timestamp === f.timestamp ? " center" : "")}>
            <span className="muted" style={{ fontSize: 11 }}>{new Date(m.timestamp).toLocaleTimeString("id-ID")}</span>{" "}
            <b>{m.sender ?? "system"}</b>:{" "}
            {m.timestamp === f.timestamp ? <Highlighted text={m.text} terms={f.highlights} /> : m.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (!terms?.length) return <>{text}</>;
  const sorted = [...new Set(terms)].filter(Boolean).sort((a, b) => b.length - a.length);
  const lower = new Set(sorted.map((t) => t.toLowerCase()));
  const parts = text.split(new RegExp("(" + sorted.map(escapeRe).join("|") + ")", "gi"));
  return <>{parts.map((p, i) => (lower.has(p.toLowerCase()) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>;
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function maskPhone(n: string) {
  const d = n.replace(/\D/g, "");
  return d.length < 5 ? n : d.slice(0, 4) + "•".repeat(Math.max(0, d.length - 7)) + d.slice(-3);
}
