import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, openExecutionSocket } from "../api";
import type { NotebookDetail, NotebookContent, NotebookCell, SessionStatus, WsMessage } from "../types";
import type { StreamOutput, ExecuteResultOutput, DisplayDataOutput, ErrorOutput } from "../types";
import NotebookTopBar, { type SaveState } from "./NotebookTopBar";
import NotebookEditor from "./NotebookEditor";
import DatasetSidebar from "./DatasetSidebar";
import { v4 as uuidv4 } from "uuid";
import { theme } from "../theme";

interface FileEntry {
  name: string;
  path: string;
  size: number;
}

export default function NotebookPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<NotebookDetail | null>(null);
  const [notebook, setNotebook] = useState<NotebookContent | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(null);
  const [runningCellId, setRunningCellId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [cellFlash, setCellFlash] = useState<{ cellId: string; message: string } | null>(null);
  const [focusedCellId, setFocusedCellId] = useState<string | null>(null);
  const [cellElapsed, setCellElapsed] = useState<Record<string, number>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingCells = useRef<NotebookCell[]>([]);
  const notebookRef = useRef<NotebookContent | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerStartRef = useRef<Record<string, number>>({});
  const runCellRef = useRef<(cell: NotebookCell) => void>(() => {});

  useEffect(() => { notebookRef.current = notebook; }, [notebook]);

  const loadFiles = useCallback(() => {
    if (!id) return;
    api.listFiles(id).then((r) => setFiles(r.files)).catch(console.error);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    api.getNotebook(id).then((d) => {
      setDetail(d);
      const cells = d.notebook.cells.map((c: NotebookCell) => ({
        ...c,
        id: (c as NotebookCell & { id?: string }).id ?? uuidv4(),
        source: Array.isArray(c.source) ? (c.source as string[]).join("") : c.source,
        outputs: c.outputs ?? [],
      }));
      setNotebook({ ...d.notebook, cells });
      setSessionStatus(d.session_status);
      setFocusedCellId(cells[0]?.id ?? null);
      setSaveState("saved");
    }).catch((e) => setError(String(e)));
    loadFiles();
  }, [id, loadFiles]);

  useEffect(() => {
    if (sessionStatus !== "starting") return;
    const t = setInterval(async () => {
      try {
        const s = await api.getSession(id!);
        setSessionStatus(s.status as SessionStatus);
        if (s.status !== "starting") clearInterval(t);
      } catch { clearInterval(t); }
    }, 2000);
    return () => clearInterval(t);
  }, [sessionStatus, id]);

  const saveNotebook = useCallback(async (nb?: NotebookContent) => {
    const toSave = nb ?? notebookRef.current;
    if (!toSave || !id) return;
    setSaveState("saving");
    try {
      await api.saveNotebook(id, toSave);
      setSaveState("saved");
    } catch (e) {
      console.error("Save failed:", e);
      setSaveState("unsaved");
    }
  }, [id]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("unsaved");
    saveTimerRef.current = setTimeout(() => saveNotebook(), 1500);
  }, [saveNotebook]);

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await saveNotebook();
  }, [saveNotebook]);

  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === "session_stopped") {
      setSessionStatus("stopped");
      setRunningCellId(null);
      return;
    }
    if (!("cell_id" in msg)) return;
    const cellId = msg.cell_id;

    setNotebook((prev) => {
      if (!prev) return prev;
      const cells = prev.cells.map((c) => {
        if (c.id !== cellId) return c;

        if (msg.type === "stream") {
          const last = c.outputs[c.outputs.length - 1];
          if (last?.output_type === "stream" && last.name === msg.name) {
            return { ...c, outputs: [...c.outputs.slice(0, -1), { ...last, text: last.text + msg.text }] };
          }
          const out: StreamOutput = { output_type: "stream", name: msg.name, text: msg.text };
          return { ...c, outputs: [...c.outputs, out] };
        }

        if (msg.type === "execute_result") {
          const out: ExecuteResultOutput = { output_type: "execute_result", execution_count: msg.execution_count, data: msg.data };
          return { ...c, execution_count: msg.execution_count, outputs: [...c.outputs, out] };
        }

        if (msg.type === "display_data") {
          const out: DisplayDataOutput = { output_type: "display_data", data: msg.data };
          return { ...c, outputs: [...c.outputs, out] };
        }

        if (msg.type === "error") {
          const out: ErrorOutput = { output_type: "error", ename: msg.ename, evalue: msg.evalue, traceback: msg.traceback };
          return { ...c, outputs: [...c.outputs, out] };
        }

        if (msg.type === "status" && msg.execution_state === "idle") {
          return msg.execution_count !== undefined ? { ...c, execution_count: msg.execution_count } : c;
        }

        return c;
      });
      return { ...prev, cells };
    });

    if (msg.type === "status" && msg.execution_state === "idle") {
      const start = timerStartRef.current[cellId];
      if (start) {
        setCellElapsed((prev) => ({ ...prev, [cellId]: Date.now() - start }));
      }
      const next = pendingCells.current.shift();
      if (next) {
        runCellRef.current(next);
      } else {
        setRunningCellId(null);
        setSessionStatus("idle");
        saveNotebook();
      }
    }
  }, [saveNotebook]);

  useEffect(() => {
    if (sessionStatus !== "idle" && sessionStatus !== "busy") {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }
    if (wsRef.current) return;
    const ws = openExecutionSocket(id!);
    wsRef.current = ws;
    ws.onmessage = (ev) => handleWsMessage(JSON.parse(ev.data));
    ws.onerror = () => setError("WebSocket connection error");
    ws.onclose = () => { wsRef.current = null; };
  }, [sessionStatus, id, handleWsMessage]);

  useEffect(() => {
    if (!runningCellId) return;
    const t = setInterval(() => {
      const start = timerStartRef.current[runningCellId];
      if (start) setCellElapsed((prev) => ({ ...prev, [runningCellId]: Date.now() - start }));
    }, 100);
    return () => clearInterval(t);
  }, [runningCellId]);

  const flashCell = (cellId: string, message: string) => {
    setCellFlash({ cellId, message });
    setTimeout(() => setCellFlash(null), 4000);
  };

  const runCell = useCallback((cell: NotebookCell) => {
    if (cell.cell_type !== "code") return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      flashCell(cell.id, "Start a session before running cells.");
      return;
    }
    setNotebook((prev) => prev
      ? { ...prev, cells: prev.cells.map((c) => c.id === cell.id ? { ...c, outputs: [], execution_count: null } : c) }
      : prev
    );
    timerStartRef.current[cell.id] = Date.now();
    setCellElapsed((prev) => ({ ...prev, [cell.id]: 0 }));
    setRunningCellId(cell.id);
    setSessionStatus("busy");
    wsRef.current.send(JSON.stringify({ type: "execute", cell_id: cell.id, source: cell.source }));
  }, []);

  useEffect(() => { runCellRef.current = runCell; }, [runCell]);

  const runAll = () => {
    if (!notebook) return;
    const code = notebook.cells.filter((c) => c.cell_type === "code");
    if (!code.length) return;
    pendingCells.current = code.slice(1);
    runCell(code[0]);
  };

  const startSession = async () => {
    setSessionStatus("starting");
    try { await api.startSession(id!); }
    catch (e) { setError(String(e)); setSessionStatus(null); }
  };

  const stopSession = async () => {
    setSessionStatus("stopping" as SessionStatus);
    pendingCells.current = [];
    setRunningCellId(null);
    try {
      await flushSave();
      await api.stopSession(id!);
    } catch (e) { setError(String(e)); }
    setSessionStatus(null);
  };

  const interrupt = async () => {
    pendingCells.current = [];
    await api.interrupt(id!).catch(console.error);
    setRunningCellId(null);
    setSessionStatus("idle");
  };

  const handleNotebookChange = useCallback((nb: NotebookContent) => {
    setNotebook(nb);
    scheduleSave();
  }, [scheduleSave]);

  const handleUpload = async (file: File) => {
    if (!id) return;
    await api.uploadFile(id, file);
  };

  if (error) {
    return (
      <div style={{ padding: 40, color: theme.red, fontFamily: theme.fontMono, fontSize: 13 }}>
        Error: {error}
      </div>
    );
  }

  if (!detail || !notebook) {
    return (
      <div style={{ padding: 40, color: theme.textMuted, fontFamily: theme.fontMono, fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, display: "flex", flexDirection: "column" }}>
      <NotebookTopBar
        name={detail.name}
        sessionStatus={sessionStatus}
        saveState={saveState}
        sidebarOpen={sidebarOpen}
        onStartSession={startSession}
        onStopSession={stopSession}
        onRunAll={runAll}
        onInterrupt={interrupt}
        onSave={flushSave}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        onBack={() => navigate("/")}
      />

      {!sessionStatus && (
        <div style={{ textAlign: "center", padding: "8px 0 4px", color: theme.textMuted, fontSize: 11, fontFamily: theme.fontSans }}>
          no active session — start one to run cells
        </div>
      )}

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <NotebookEditor
          notebook={notebook}
          runningCellId={runningCellId}
          cellFlash={cellFlash}
          cellElapsed={cellElapsed}
          focusedCellId={focusedCellId}
          onChange={handleNotebookChange}
          onRunCell={runCell}
          onSave={saveNotebook}
          onFocusCell={setFocusedCellId}
        />

        {sidebarOpen && id && (
          <DatasetSidebar
            notebookId={id}
            files={files}
            onUpload={handleUpload}
            onRefresh={loadFiles}
            onClose={() => setSidebarOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
