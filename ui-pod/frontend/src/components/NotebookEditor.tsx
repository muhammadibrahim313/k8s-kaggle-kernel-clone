import { useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import Cell from "./Cell";
import type { NotebookCell, NotebookContent } from "../types";
import { theme } from "../theme";

interface Props {
  notebook: NotebookContent;
  runningCellId: string | null;
  cellFlash: { cellId: string; message: string } | null;
  cellElapsed: Record<string, number>;
  focusedCellId: string | null;
  onChange: (nb: NotebookContent) => void;
  onRunCell: (cell: NotebookCell) => void;
  onSave: (nb: NotebookContent) => void;
  onFocusCell: (id: string) => void;
}

function newCell(type: "code" | "markdown" = "code"): NotebookCell {
  return { id: uuidv4(), cell_type: type, source: "", execution_count: null, outputs: [], metadata: {} };
}

export default function NotebookEditor({
  notebook, runningCellId, cellFlash, cellElapsed, focusedCellId,
  onChange, onRunCell, onSave, onFocusCell,
}: Props) {
  const updateCells = (cells: NotebookCell[], save = false) => {
    const nb = { ...notebook, cells };
    onChange(nb);
    if (save) onSave(nb);
  };

  const updateSource = (id: string, source: string) =>
    updateCells(notebook.cells.map((c) => (c.id === id ? { ...c, source } : c)));

  const deleteCell = (id: string) =>
    updateCells(notebook.cells.filter((c) => c.id !== id), true);

  const insertCell = (idx: number, type: "code" | "markdown" = "code") => {
    const cells = [...notebook.cells];
    cells.splice(idx, 0, newCell(type));
    updateCells(cells);
    onFocusCell(cells[idx].id);
  };

  const moveCell = (id: string, direction: -1 | 1) => {
    const idx = notebook.cells.findIndex((c) => c.id === id);
    const target = idx + direction;
    if (target < 0 || target >= notebook.cells.length) return;
    const cells = [...notebook.cells];
    const [cell] = cells.splice(idx, 1);
    cells.splice(target, 0, cell);
    updateCells(cells, true);
  };

  const toggleType = (id: string) => {
    updateCells(notebook.cells.map((c) => {
      if (c.id !== id) return c;
      const next = c.cell_type === "code" ? "markdown" : "code";
      return { ...c, cell_type: next, outputs: next === "markdown" ? [] : c.outputs, execution_count: next === "markdown" ? null : c.execution_count };
    }), true);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const inEditor = target.closest(".cm-editor") || target.tagName === "TEXTAREA" || target.tagName === "INPUT";
    if (e.key === "Enter" && e.shiftKey && focusedCellId) {
      e.preventDefault();
      const cell = notebook.cells.find((c) => c.id === focusedCellId);
      if (cell?.cell_type === "code") onRunCell(cell);
      return;
    }
    if (inEditor) return;
    if (!focusedCellId) return;
    const idx = notebook.cells.findIndex((c) => c.id === focusedCellId);
    if (idx < 0) return;

    if (e.key === "a" || e.key === "A") {
      e.preventDefault();
      insertCell(idx);
    } else if (e.key === "b" || e.key === "B") {
      e.preventDefault();
      insertCell(idx + 1);
    } else if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      toggleType(focusedCellId);
    }
  }, [focusedCellId, notebook.cells, onRunCell]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div style={{ padding: "16px 20px", maxWidth: 960, margin: "0 auto", flex: 1, minWidth: 0 }}>
      {notebook.cells.length === 0 && (
        <button onClick={() => insertCell(0)} style={addBtnStyle}>+ Add first cell</button>
      )}

      {notebook.cells.map((cell, idx) => (
        <Cell
          key={cell.id}
          cell={cell}
          running={cell.id === runningCellId}
          flashMessage={cellFlash?.cellId === cell.id ? cellFlash.message : null}
          elapsedMs={cellElapsed[cell.id] ?? null}
          isFocused={cell.id === focusedCellId}
          canMoveUp={idx > 0}
          canMoveDown={idx < notebook.cells.length - 1}
          onSourceChange={(src) => updateSource(cell.id, src)}
          onRun={() => onRunCell(cell)}
          onDelete={() => deleteCell(cell.id)}
          onAddBelow={() => insertCell(idx + 1)}
          onAddAbove={() => insertCell(idx)}
          onMoveUp={() => moveCell(cell.id, -1)}
          onMoveDown={() => moveCell(cell.id, 1)}
          onToggleType={() => toggleType(cell.id)}
          onFocus={() => onFocusCell(cell.id)}
        />
      ))}

      {notebook.cells.length > 0 && (
        <button onClick={() => insertCell(notebook.cells.length)} style={addBtnStyle}>
          + cell
        </button>
      )}

      <p style={{ textAlign: "center", color: theme.textMuted, fontSize: 10, marginTop: 12, fontFamily: theme.fontSans }}>
        Shift+Enter run · A add above · B add below · M toggle markdown
      </p>
    </div>
  );
}

const addBtnStyle: React.CSSProperties = {
  marginTop: 6, width: "100%", padding: "8px",
  background: "transparent", border: `1px dashed ${theme.border}`,
  cursor: "pointer", color: theme.textMuted, fontSize: 11,
  fontFamily: theme.fontSans, letterSpacing: 0.5, borderRadius: 2,
};
