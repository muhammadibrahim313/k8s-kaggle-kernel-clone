import { useRef, useState } from "react";
import { theme } from "../theme";

interface FileEntry {
  name: string;
  path: string;
  size: number;
}

interface Props {
  notebookId: string;
  files: FileEntry[];
  onUpload: (file: File) => Promise<void>;
  onRefresh: () => void;
  onClose: () => void;
}

export default function DatasetSidebar({ files, onUpload, onRefresh, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        await onUpload(file);
      }
      onRefresh();
    } finally {
      setUploading(false);
    }
  };

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopied(path);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <aside style={{
      width: 260, flexShrink: 0, borderLeft: `1px solid ${theme.border}`,
      background: theme.surface, display: "flex", flexDirection: "column",
      fontFamily: theme.fontSans, fontSize: 12,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px", borderBottom: `1px solid ${theme.border}`,
      }}>
        <span style={{ color: theme.text, fontWeight: 600, letterSpacing: 0.5 }}>DATASETS</span>
        <button onClick={onClose} style={iconBtn} title="Close">×</button>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{
          margin: 12, padding: "16px 12px", textAlign: "center", cursor: "pointer",
          border: `1px dashed ${dragOver ? theme.accent : theme.border}`,
          borderRadius: 4, color: theme.textMuted, background: dragOver ? "#0d2847" : "transparent",
          transition: "border-color .15s, background .15s",
        }}
      >
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
        {uploading ? "Uploading…" : "Drop files or click to upload"}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "0 12px 12px" }}>
        {files.length === 0 && (
          <p style={{ color: theme.textMuted, fontSize: 11, padding: "4px 0" }}>
            No files yet. Upload CSV, parquet, etc.
          </p>
        )}
        {files.map((f) => (
          <div key={f.name} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 6px", borderBottom: `1px solid ${theme.border}`,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.name}
              </div>
              <div style={{ color: theme.textMuted, fontSize: 10, marginTop: 2 }}>
                {(f.size / 1024).toFixed(1)} KB
              </div>
            </div>
            <button
              onClick={() => copyPath(f.path)}
              title="Copy path for use in cells"
              style={{ ...iconBtn, fontSize: 10, color: copied === f.path ? theme.green : theme.accent }}
            >
              {copied === f.path ? "✓" : "path"}
            </button>
          </div>
        ))}
      </div>

      <div style={{ padding: "8px 12px", borderTop: `1px solid ${theme.border}`, color: theme.textMuted, fontSize: 10 }}>
        In cells: <code style={{ color: theme.accent }}>pd.read_csv("PATH")</code>
      </div>
    </aside>
  );
}

const iconBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  color: theme.textMuted, fontSize: 16, padding: "0 4px", fontFamily: "inherit",
};
