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
  health: () => fetch("/api/health").then((r) => j<{ ok: boolean; llmConfigured: boolean }>(r)),
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
};
