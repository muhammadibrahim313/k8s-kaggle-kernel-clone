import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { NotebookMeta, SessionStatus } from "../types";
import { theme } from "../theme";

function statusDot(s: SessionStatus) {
  const color = s === "idle" ? theme.green : s === "busy" ? theme.yellow : s === "starting" ? theme.accent : theme.textMuted;
  const label = s ?? "no session";
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color, fontFamily: theme.fontSans }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

export default function NotebookList() {
  const [notebooks, setNotebooks] = useState<NotebookMeta[]>([]);
  const navigate = useNavigate();

  const load = () => api.listNotebooks().then(setNotebooks).catch(console.error);
  useEffect(() => { load(); }, []);

  const create = async () => {
    const name = prompt("Notebook name:", "Untitled");
    if (!name) return;
    const nb = await api.createNotebook(name);
    navigate(`/notebooks/${nb.id}`);
  };

  const del = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this notebook?")) return;
    await api.deleteNotebook(id);
    load();
  };

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, fontFamily: theme.fontSans }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "48px 24px" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 28, borderBottom: `1px solid ${theme.border}`, paddingBottom: 16,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: theme.textMuted }}>
            Notebooks
          </span>
          <button onClick={create} style={btnStyle(theme.accent)}>+ New</button>
        </div>

        {notebooks.length === 0 && (
          <p style={{ color: theme.textMuted, fontSize: 13 }}>No notebooks yet.</p>
        )}

        {notebooks.map((nb) => (
          <div
            key={nb.id}
            onClick={() => navigate(`/notebooks/${nb.id}`)}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 16px", background: theme.surface,
              border: `1px solid ${theme.border}`, borderRadius: 3,
              marginBottom: 4, cursor: "pointer", transition: "border-color .15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.borderHover)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = theme.border)}
          >
            <span style={{ fontSize: 13, color: theme.text }}>{nb.name}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {statusDot(nb.session_status)}
              <button
                onClick={(e) => del(e, nb.id)}
                style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 13, padding: "0 4px" }}
              >
                ×
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: "5px 14px", background: bg, color: "#fff",
    border: `1px solid ${bg}`, borderRadius: 3, cursor: "pointer",
    fontSize: 12, fontFamily: "inherit", letterSpacing: 0.5,
  };
}
