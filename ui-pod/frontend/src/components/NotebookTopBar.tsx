import { theme } from "../theme";
import type { SessionStatus } from "../types";

export type SaveState = "saved" | "saving" | "unsaved";

function btn(bg: string, border: string, disabled = false): React.CSSProperties {
  return {
    padding: "5px 14px", fontSize: 11, fontFamily: theme.fontSans, letterSpacing: 0.3,
    background: disabled ? "transparent" : bg, color: disabled ? theme.textMuted : theme.text,
    border: `1px solid ${disabled ? theme.border : border}`, borderRadius: 3,
    cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap",
  };
}

function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 10, height: 10,
      border: "1.5px solid #555", borderTopColor: theme.accent,
      borderRadius: "50%", animation: "spin 0.7s linear infinite",
      verticalAlign: "middle", marginRight: 5,
    }} />
  );
}

const STATUS: Record<string, { label: string; color: string }> = {
  idle:     { label: "idle",     color: theme.green },
  busy:     { label: "busy",     color: theme.yellow },
  starting: { label: "starting", color: theme.accent },
  stopping: { label: "stopping", color: theme.textMuted },
  stopped:  { label: "stopped",  color: "#333" },
};

interface Props {
  name: string;
  sessionStatus: SessionStatus;
  saveState: SaveState;
  sidebarOpen: boolean;
  onStartSession: () => void;
  onStopSession: () => void;
  onRunAll: () => void;
  onInterrupt: () => void;
  onSave: () => void;
  onToggleSidebar: () => void;
  onBack: () => void;
}

export default function NotebookTopBar({
  name, sessionStatus, saveState, sidebarOpen,
  onStartSession, onStopSession, onRunAll, onInterrupt, onSave, onToggleSidebar, onBack,
}: Props) {
  const s = STATUS[sessionStatus ?? "stopped"] ?? STATUS.stopped;
  const transitioning = sessionStatus === "starting" || sessionStatus === "stopping";
  const active = sessionStatus === "idle" || sessionStatus === "busy";

  const saveLabel = saveState === "saving" ? "saving…" : saveState === "unsaved" ? "save" : "saved";
  const saveBorder = saveState === "unsaved" ? theme.accent : theme.border;

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 100,
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 16px", background: theme.surface,
      borderBottom: `1px solid ${theme.border}`,
      fontFamily: theme.fontSans,
    }}>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: theme.textMuted, fontSize: 14, padding: "0 4px", fontFamily: "inherit" }}>
        ←
      </button>

      <span style={{ color: theme.text, fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {name}
      </span>

      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: s.color, minWidth: 70 }}>
        {transitioning ? <Spinner /> : (
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, display: "inline-block" }} />
        )}
        {s.label}
      </span>

      <div style={{ width: 1, height: 16, background: theme.border }} />

      <button style={btn("transparent", saveBorder)} onClick={onSave} disabled={saveState === "saving"}>
        {saveState === "saving" && <Spinner />}
        {saveLabel}
      </button>

      <button
        style={btn(sidebarOpen ? "#0d2847" : "transparent", sidebarOpen ? theme.accent : theme.border)}
        onClick={onToggleSidebar}
      >
        Data
      </button>

      <div style={{ width: 1, height: 16, background: theme.border }} />

      {!active && !transitioning && (
        <button style={btn("#0d2847", theme.accent)} onClick={onStartSession}>
          Start Session
        </button>
      )}

      {active && sessionStatus === "idle" && (
        <button style={btn("#0d2a1a", theme.green)} onClick={onRunAll}>
          Run All
        </button>
      )}

      {active && sessionStatus === "busy" && (
        <button style={btn("#2a1010", theme.red)} onClick={onInterrupt}>
          Interrupt
        </button>
      )}

      {active && (
        <button style={btn("transparent", theme.border, transitioning)} onClick={onStopSession} disabled={transitioning}>
          Stop
        </button>
      )}
    </div>
  );
}
