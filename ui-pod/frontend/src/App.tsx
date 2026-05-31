import { Routes, Route, Navigate } from "react-router-dom";
import NotebookList from "./components/NotebookList";
import NotebookPage from "./components/NotebookPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<NotebookList />} />
      <Route path="/notebooks/:id" element={<NotebookPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
