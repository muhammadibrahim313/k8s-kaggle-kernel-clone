import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import ReactMarkdown from "react-markdown";
import type { NotebookCell } from "../types";
import { theme } from "../theme";

interface Props {
  cell: NotebookCell;
  running: boolean;
  flashMessage: string | null;
  elapsedMs: number | null;
  isFocused: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSourceChange: (source: string) => void;
  onRun: () => void;
  onDelete: () => void;
  onAddBelow: () => void;
  onAddAbove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleType: () => void;
  onFocus: () => void;
}

export default function Cell({
  cell, running, flashMessage, elapsedMs, isFocused,
  canMoveUp, canMoveDown,
  onSourceChange, onRun, onDelete, onAddBelow, onAddAbove,
  onMoveUp, onMoveDown, onToggleType, onFocus,
}: Props) {
  const isCode = cell.cell_type === "code";
  const [mdEditing, setMdEditing] = useState(false);

  const border = running ? theme.borderActive : isFocused ? theme.borderHover : theme.border;

  return (
    <div
      onClick={onFocus}
      style={{
        display: "flex", marginBottom: 8,
        border: `1px solid ${border}`,
        background: theme.cellBg,
        borderRadius: 2,
        transition: "border-color .15s",
        boxShadow: isFocused ? `0 0 0 1px ${theme.borderActive}33` : "none",
      }}
    >
      <div style={{
        width: 52, background: theme.gutter, borderRight: `1px solid ${theme.border}`,
        display: "flex", flexDirection: "column", alignItems: "center",
        paddingTop: 8, gap: 4, flexShrink: 0, minHeight: 44,
      }}>
        {isCode ? (
          <button
            onClick={(e) => { e.stopPropagation(); onRun(); }}
            disabled={running}
            title="Run cell (Shift+Enter)"
            style={{
              background: "none", border: "none",
              cursor: running ? "wait" : "pointer",
              color: running ? theme.textMuted : theme.green,
              padding: "2px 4px", display: "flex", alignItems: "center",
            }}
          >
            {running ? <Spinner size={8} /> : (
              <svg width="11" height="11" viewBox="0 0 10 10" fill="currentColor">
                <polygon points="1,0 10,5 1,10" />
              </svg>
            )}
          </button>
        ) : (
          <span style={{ fontSize: 9, color: theme.accent, letterSpacing: 0.5 }}>MD</span>
        )}

        {isCode && (
          <span style={{ fontSize: 10, color: theme.textMuted, userSelect: "none" }}>
            [{cell.execution_count ?? " "}]
          </span>
        )}

        {isCode && elapsedMs != null && elapsedMs > 0 && (
          <span style={{ fontSize: 9, color: theme.yellow, userSelect: "none" }}>
            {(elapsedMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {isCode || mdEditing ? (
          <CodeMirror
            value={cell.source}
            onChange={onSourceChange}
            extensions={isCode ? [python()] : []}
            theme={oneDark}
            basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
            style={{ fontSize: 13, fontFamily: theme.fontMono }}
          />
        ) : (
          <div
            onDoubleClick={() => setMdEditing(true)}
            style={{
              padding: "12px 16px", minHeight: 40, cursor: "text",
              color: theme.markdown, fontFamily: theme.fontSans, fontSize: 14, lineHeight: 1.6,
            }}
          >
            <MarkdownView source={cell.source} />
          </div>
        )}

        {!isCode && mdEditing && (
          <div style={{ padding: "4px 12px 8px", borderTop: `1px solid ${theme.border}` }}>
            <button
              onClick={() => setMdEditing(false)}
              style={{ fontSize: 10, color: theme.accent, background: "none", border: "none", cursor: "pointer", fontFamily: theme.fontSans }}
            >
              Done editing
            </button>
          </div>
        )}

        {flashMessage && (
          <div style={{
            borderTop: `1px solid #3d2e00`, padding: "6px 12px",
            background: "#1a1500", color: theme.yellow, fontSize: 12,
            fontFamily: theme.fontMono,
          }}>
            {flashMessage}
          </div>
        )}

        {isCode && cell.outputs.length > 0 && (
          <div style={{
            borderTop: `1px solid ${theme.border}`,
            padding: "8px 12px",
            fontFamily: theme.fontMono,
            fontSize: 12,
            background: theme.outputBg,
          }}>
            {cell.outputs.map((out, i) => <OutputView key={i} output={out} />)}
          </div>
        )}
      </div>

      <div style={{
        display: "flex", flexDirection: "column", gap: 1,
        padding: "6px 3px", background: theme.gutter,
        borderLeft: `1px solid ${theme.border}`,
      }}>
        <SideBtn title="Move up" onClick={onMoveUp} disabled={!canMoveUp}>↑</SideBtn>
        <SideBtn title="Move down" onClick={onMoveDown} disabled={!canMoveDown}>↓</SideBtn>
        <SideBtn title={isCode ? "Convert to markdown (M)" : "Convert to code (M)"} onClick={onToggleType}>
          {isCode ? "M" : "</>"}
        </SideBtn>
        <SideBtn title="Add cell above (A)" onClick={onAddAbove}>+↑</SideBtn>
        <SideBtn title="Add cell below (B)" onClick={onAddBelow}>+↓</SideBtn>
        <SideBtn title="Delete cell" onClick={onDelete} danger>
          <TrashIcon />
        </SideBtn>
      </div>
    </div>
  );
}

function MarkdownView({ source }: { source: string }) {
  if (!source.trim()) {
    return <span style={{ color: theme.textMuted, fontStyle: "italic" }}>Double-click to edit markdown…</span>;
  }
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h1 style={{ fontSize: 22, margin: "8px 0", color: theme.text }}>{children}</h1>,
        h2: ({ children }) => <h2 style={{ fontSize: 18, margin: "8px 0", color: theme.text }}>{children}</h2>,
        h3: ({ children }) => <h3 style={{ fontSize: 15, margin: "6px 0", color: theme.text }}>{children}</h3>,
        p: ({ children }) => <p style={{ margin: "6px 0" }}>{children}</p>,
        code: ({ children }) => (
          <code style={{ background: theme.gutter, padding: "1px 5px", borderRadius: 3, fontSize: 12, fontFamily: theme.fontMono }}>
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre style={{ background: theme.gutter, padding: 10, borderRadius: 4, overflow: "auto", fontSize: 12, fontFamily: theme.fontMono }}>
            {children}
          </pre>
        ),
        a: ({ href, children }) => <a href={href} style={{ color: theme.accent }} target="_blank" rel="noreferrer">{children}</a>,
        ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: "6px 0" }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: "6px 0" }}>{children}</ol>,
      }}
    >
      {source}
    </ReactMarkdown>
  );
}

function Spinner({ size = 10 }: { size?: number }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size,
      border: "1.5px solid #555", borderTopColor: theme.accent,
      borderRadius: "50%", animation: "spin 0.7s linear infinite",
    }} />
  );
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
      <rect x="1" y="3" width="10" height="1" />
      <rect x="4" y="1" width="4" height="1" rx="0.5" />
      <path d="M2 4l.7 7h6.6L10 4H2zm2 1h1l.3 5H4.3L4 5zm2.5 0h1l-.3 5H6.2L6.5 5z" />
    </svg>
  );
}

function SideBtn({ title, onClick, children, danger, disabled }: {
  title: string; onClick: () => void; children: React.ReactNode; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }}
      disabled={disabled}
      style={{
        background: "none", border: "none",
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "#333" : danger ? theme.red : theme.textMuted,
        fontSize: 11, padding: "2px 4px", fontFamily: "inherit", lineHeight: 1,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

function OutputView({ output }: { output: NotebookCell["outputs"][number] }) {
  if (output.output_type === "stream") {
    const color = output.name === "stderr" ? theme.red : "#c8d3da";
    return <pre style={{ color, whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.5 }}>{output.text}</pre>;
  }

  if (output.output_type === "execute_result" || output.output_type === "display_data") {
    const data = output.data;
    if (data["image/png"]) {
      return <img src={`data:image/png;base64,${data["image/png"]}`} style={{ maxWidth: "100%", display: "block" }} alt="output" />;
    }
    if (data["text/html"]) {
      return <div style={{ color: "#c8d3da" }} dangerouslySetInnerHTML={{ __html: data["text/html"] }} />;
    }
    if (data["text/plain"]) {
      return <pre style={{ color: "#c8d3da", margin: 0, whiteSpace: "pre-wrap" }}>{data["text/plain"]}</pre>;
    }
  }

  if (output.output_type === "error") {
    const clean = output.traceback.map((l) => l.replace(/\x1b\[[0-9;]*m/g, "")).join("\n");
    return (
      <pre style={{ color: theme.red, margin: 0, whiteSpace: "pre-wrap" }}>
        {output.ename}: {output.evalue}{"\n"}{clean}
      </pre>
    );
  }

  return null;
}
