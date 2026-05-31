import type { NotebookMeta, NotebookDetail, NotebookContent } from "./types";

const BASE = "/api";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface FileEntry {
  name: string;
  path: string;
  size: number;
}

export const api = {
  listNotebooks: () => req<NotebookMeta[]>("/notebooks"),

  createNotebook: (name: string) =>
    req<NotebookMeta>("/notebooks", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  getNotebook: (id: string) => req<NotebookDetail>(`/notebooks/${id}`),

  saveNotebook: (id: string, content: NotebookContent) =>
    req<void>(`/notebooks/${id}`, {
      method: "PUT",
      body: JSON.stringify(content),
    }),

  deleteNotebook: (id: string) =>
    req<void>(`/notebooks/${id}`, { method: "DELETE" }),

  listFiles: (id: string) =>
    req<{ files: FileEntry[] }>(`/notebooks/${id}/files`),

  uploadFile: async (id: string, file: File): Promise<FileEntry> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/notebooks/${id}/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
    return res.json();
  },

  startSession: (id: string) =>
    req<{ status: string }>(`/notebooks/${id}/session`, { method: "POST" }),

  stopSession: (id: string) =>
    req<void>(`/notebooks/${id}/session`, { method: "DELETE" }),

  getSession: (id: string) =>
    req<{ status: string }>(`/notebooks/${id}/session`),

  interrupt: (id: string) =>
    req<void>(`/notebooks/${id}/interrupt`, { method: "POST" }),

  restart: (id: string) =>
    req<void>(`/notebooks/${id}/restart`, { method: "POST" }),
};

export function openExecutionSocket(notebookId: string): WebSocket {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return new WebSocket(`${proto}://${location.host}/ws/notebooks/${notebookId}/execution`);
}
