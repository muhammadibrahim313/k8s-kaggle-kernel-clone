export type SessionStatus = "starting" | "idle" | "busy" | "stopping" | "stopped" | null;

export interface StreamOutput {
  output_type: "stream";
  name: "stdout" | "stderr";
  text: string;
}

export interface ExecuteResultOutput {
  output_type: "execute_result";
  execution_count: number;
  data: Record<string, string>;
}

export interface DisplayDataOutput {
  output_type: "display_data";
  data: Record<string, string>;
}

export interface ErrorOutput {
  output_type: "error";
  ename: string;
  evalue: string;
  traceback: string[];
}

export type CellOutput = StreamOutput | ExecuteResultOutput | DisplayDataOutput | ErrorOutput;

export interface NotebookCell {
  id: string;
  cell_type: "code" | "markdown";
  source: string;
  execution_count: number | null;
  outputs: CellOutput[];
  metadata: Record<string, unknown>;
}

export interface NotebookContent {
  nbformat: number;
  nbformat_minor: number;
  metadata: Record<string, unknown>;
  cells: NotebookCell[];
}

export interface NotebookMeta {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  session_status: SessionStatus;
}

export interface NotebookDetail extends NotebookMeta {
  notebook: NotebookContent;
}

// WebSocket message types coming from the server
export type WsMessage =
  | { type: "stream"; cell_id: string; name: "stdout" | "stderr"; text: string }
  | { type: "execute_result"; cell_id: string; execution_count: number; data: Record<string, string> }
  | { type: "display_data"; cell_id: string; data: Record<string, string> }
  | { type: "error"; cell_id: string; ename: string; evalue: string; traceback: string[] }
  | { type: "status"; cell_id: string; execution_state: string; execution_count?: number }
  | { type: "session_stopped"; cell_id: string }
  | { type: "error"; message: string };
