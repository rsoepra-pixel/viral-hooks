export interface Chat {
  id: string;
  title: string | null;
  isGroup: boolean;
  participants: string[];
  messageCount: number;
  from: number;
  to: number;
}

export interface Pattern {
  id: string;
  label: string;
  description: string;
}

export interface Finding {
  signature: string;
  chatId: string;
  chatTitle: string | null;
  sender: string | null;
  senderNumber: string | null;
  timestamp: number;
  patternId: string;
  patternLabel: string;
  confidence: number;
  rationale: string;
  excerpt: string;
  highlights: string[];
  context: { timestamp: number; sender: string | null; text: string; system: boolean }[];
}

export interface SearchResult {
  findings: Finding[];
  candidatesScanned: number;
  chatsScanned: string[];
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () =>
    fetch("/api/health").then((r) =>
      j<{ ok: boolean; llmConfigured: boolean; liveEnabled: boolean }>(r)
    ),
  login: (password: string) =>
    fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }).then((r) => j<{ ok: boolean }>(r)),
  logout: () => fetch("/api/logout", { method: "POST" }).then((r) => j(r)),
  me: () => fetch("/api/me").then((r) => (r.ok ? r.json() : Promise.reject(new Error("401")))),
  patterns: () => fetch("/api/patterns").then((r) => j<Pattern[]>(r)),
  chats: () => fetch("/api/chats").then((r) => j<Chat[]>(r)),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch("/api/chats/upload", { method: "POST", body: fd }).then((r) => j<Chat>(r));
  },
  deleteChat: (id: string) => fetch(`/api/chats/${id}`, { method: "DELETE" }).then((r) => j(r)),
  search: (q: {
    prompt?: string;
    patternIds: string[];
    from?: number;
    to?: number;
    chatIds: string[];
    minConfidence: number;
  }) =>
    fetch("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(q),
    }).then((r) => j<SearchResult>(r)),
  reportUrl: "/api/report",

  // Phase 2: false-positive feedback
  addFeedback: (signature: string) =>
    fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signature }),
    }).then((r) => j(r)),

  // Phase 2: saved searches
  savedSearches: () =>
    fetch("/api/saved-searches").then((r) =>
      j<Array<{ id: string; name: string; query: any; created_at: number }>>(r)
    ),
  saveSearch: (name: string, query: any) =>
    fetch("/api/saved-searches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, query }),
    }).then((r) => j(r)),
  deleteSavedSearch: (id: string) =>
    fetch(`/api/saved-searches/${id}`, { method: "DELETE" }).then((r) => j(r)),

  // Optional live link
  liveStatus: () =>
    fetch("/api/live/status").then((r) =>
      j<{
        available: boolean;
        enabled: boolean;
        state: string;
        pairingCode: string | null;
        phone: string | null;
        lastError: string | null;
        messagesIngested: number;
      }>(r)
    ),
  livePair: (phone: string, consent: boolean) =>
    fetch("/api/live/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, consent }),
    }).then((r) => j<{ code: string }>(r)),
  liveLogout: () => fetch("/api/live/logout", { method: "POST" }).then((r) => j(r)),
};
