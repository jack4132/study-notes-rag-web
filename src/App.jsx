import { useState, useEffect, useRef } from "react";
import { Layers, BookOpen, Search, Plus, Moon, Sun, FileText, Send, CheckCircle2, XCircle } from "lucide-react";
import { fetchDocuments, askQuestionStream, uploadDocument } from "./api.js";

// Parses AI answer text, turning "[source: file.pdf, page 7]" into
// clickable citation pills.
function renderAnswerWithCitations(text, onCiteClick) {
  const citationRegex = /\[source: (.*?), page (.*?)\]/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = citationRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "citation", source: match[1], page: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }

  return parts.map((part, idx) => {
    if (part.type === "citation") {
      return (
        <button
          key={idx}
          onClick={() => onCiteClick(part.source, part.page)}
          className="inline-flex mx-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer"
          style={{
            background: "var(--citation-bg)",
            color: "var(--citation-text)",
            border: "1px solid var(--citation-border)",
          }}
        >
          p. {part.page}
        </button>
      );
    }
    return <span key={idx}>{part.content}</span>;
  });
}

export default function App() {
  const [isDark, setIsDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
  );
  const [view, setView] = useState("board"); // "board" | "workspace"
  const [documents, setDocuments] = useState([]);
  const [search, setSearch] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [highlightedCite, setHighlightedCite] = useState(null);
  const [selectedSource, setSelectedSource] = useState(null); // null = search all docs
  const [toast, setToast] = useState(null); // { message, type: "success" | "error" }
  const [isUploading, setIsUploading] = useState(false);

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    loadDocuments();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function loadDocuments() {
    try {
      const data = await fetchDocuments();
      setDocuments(data.documents || []);
    } catch (err) {
      console.error("Failed to load documents:", err);
      showToast("Could not reach backend. Is the FastAPI server running on :8000?", "error");
    }
  }

  async function handleUploadClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Only PDF files are supported.", "error");
      e.target.value = "";
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadDocument(file);
      if (result.error) {
        showToast(result.error, "error");
      } else {
        showToast(`"${result.filename}" uploaded — ${result.chunks_created} chunks indexed`, "success");
        await loadDocuments();
      }
    } catch (err) {
      console.error("Upload failed:", err);
      showToast(`Upload failed: ${err.message}`, "error");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }

  async function handleSend() {
    const question = input.trim();
    if (!question || isStreaming) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setMessages((prev) => [...prev, { role: "assistant", text: "" }]);
    setIsStreaming(true);

    try {
      await askQuestionStream(
        question,
        (token) => {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              text: updated[updated.length - 1].text + token,
            };
            return updated;
          });
        },
        () => setIsStreaming(false),
        selectedSource
      );
    } catch (err) {
      console.error("Chat stream failed:", err);
      setIsStreaming(false);
    }
  }

  function handleCiteClick(source, page) {
    setHighlightedCite(`${source}-${page}`);
    setTimeout(() => setHighlightedCite(null), 3200); // spec: 3.2s highlight
  }

  const filteredDocs = documents.filter((d) =>
    d.filename.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Toast Notification */}
      {toast && (
        <div
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{
            background: toast.type === "success" ? "var(--status-offline-bg)" : "#FEE2E2",
            color: toast.type === "success" ? "var(--status-offline-text)" : "#B91C1C",
            border: `1px solid ${toast.type === "success" ? "var(--status-offline-text)" : "#B91C1C"}`,
          }}
        >
          {toast.type === "success" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          <span>{toast.message}</span>
        </div>
      )}
      {/* Top Navigation Bar */}
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)" }}
      >
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center font-mayek font-bold text-base"
              style={{ background: "#1C1B19", color: "#FFFFFF" }}
            >
              ꯃ
            </div>
            <div>
              <div className="text-sm font-bold leading-none">Study Notes Assistant</div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                RAG Workspace
              </div>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            <button
              onClick={() => setView("board")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold"
              style={{
                background: view === "board" ? "var(--bg-surface-subtle)" : "transparent",
                border: view === "board" ? "1px solid var(--border-default)" : "1px solid transparent",
                color: view === "board" ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              <Layers size={14} /> Board (Library)
            </button>
            <button
              onClick={() => setView("workspace")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold"
              style={{
                background: view === "workspace" ? "var(--bg-surface-subtle)" : "transparent",
                border: view === "workspace" ? "1px solid var(--border-default)" : "1px solid transparent",
                color: view === "workspace" ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              <BookOpen size={14} /> Study Workspace
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-1.5 w-56"
            style={{ background: "var(--bg-surface-subtle)", border: "1px solid var(--border-default)" }}
          >
            <Search size={14} style={{ color: "var(--text-secondary)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes..."
              className="bg-transparent text-xs outline-none w-full"
              style={{ color: "var(--text-primary)" }}
            />
          </div>

          <input
            type="file"
            accept=".pdf"
            ref={fileInputRef}
            onChange={handleFileSelected}
            className="hidden"
          />
          <button
            onClick={handleUploadClick}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold"
            style={{ background: "var(--accent-btn-bg)", color: "var(--accent-btn-text)", opacity: isUploading ? 0.6 : 1 }}
          >
            <Plus size={14} /> {isUploading ? "Uploading..." : "Upload Note"}
          </button>

          <button
            onClick={() => setIsDark((v) => !v)}
            className="p-2 rounded-xl"
            style={{ background: "var(--bg-surface-subtle)", border: "1px solid var(--border-default)" }}
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>

      {/* BOARD VIEW */}
      {view === "board" && (
        <div className="flex-1 p-8">
          <h1 className="text-xl font-bold">Study Board</h1>
          <p className="text-xs mt-1 mb-5" style={{ color: "var(--text-secondary)" }}>
            {documents.length} indexed documents • Semantic retrieval ready
          </p>

          <div className="grid grid-cols-3 gap-5">
            {filteredDocs.map((doc) => (
              <div
                key={doc.filename}
                onClick={() => setView("workspace")}
                className="rounded-2xl p-5 cursor-pointer hover:-translate-y-0.5 transition-transform"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: "var(--bg-surface-subtle)", border: "1px solid var(--border-default)" }}
                >
                  <FileText size={16} />
                </div>
                <div className="text-sm font-semibold mb-2">{doc.filename}</div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {doc.chunk_count} chunks indexed
                </div>
              </div>
            ))}

            <div
              onClick={handleUploadClick}
              className="rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer min-h-[200px]"
              style={{ border: "1.5px dashed var(--border-default)", color: "var(--text-secondary)" }}
            >
              <Plus className="mb-2" />
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Upload Study Notes
              </div>
              <div className="text-xs mt-1 max-w-[200px]">PDF documents</div>
            </div>
          </div>
        </div>
      )}

      {/* WORKSPACE VIEW */}
      {view === "workspace" && (
        <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 60px)" }}>
          {/* LEFT: Document Picker / Scope Selector */}
          <div
            className="w-[30%] flex flex-col overflow-hidden"
            style={{ background: "var(--bg-canvas)", borderRight: "1px solid var(--border-default)" }}
          >
            <div
              className="px-4 py-3.5"
              style={{ borderBottom: "1px solid var(--border-default)" }}
            >
              <div className="text-xs font-semibold">Scope your question</div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Select a document to search only within it
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <button
                onClick={() => setSelectedSource(null)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2"
                style={{
                  background: selectedSource === null ? "var(--citation-bg)" : "var(--bg-surface)",
                  color: selectedSource === null ? "var(--citation-text)" : "var(--text-primary)",
                  border: `1px solid ${selectedSource === null ? "var(--citation-border)" : "var(--border-default)"}`,
                }}
              >
                <Layers size={14} /> All Documents
              </button>
              {documents.map((doc) => (
                <button
                  key={doc.filename}
                  onClick={() => setSelectedSource(doc.filename)}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs flex items-start gap-2"
                  style={{
                    background: selectedSource === doc.filename ? "var(--citation-bg)" : "var(--bg-surface)",
                    color: selectedSource === doc.filename ? "var(--citation-text)" : "var(--text-primary)",
                    border: `1px solid ${selectedSource === doc.filename ? "var(--citation-border)" : "var(--border-default)"}`,
                  }}
                >
                  <FileText size={14} className="mt-0.5 flex-shrink-0" />
                  <span className="break-words font-medium">{doc.filename}</span>
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT: Chat */}
          <div
            className="w-[70%] flex flex-col overflow-hidden"
            style={{ background: "var(--bg-surface)" }}
          >
            <div
              className="px-5 py-3.5 flex items-center justify-between text-xs font-semibold"
              style={{ borderBottom: "1px solid var(--border-default)" }}
            >
              <span>✨ Study Buddy • Grounded Citations</span>
              <span
                className="text-[11px] font-normal px-2.5 py-1 rounded-full"
                style={{ background: "var(--bg-surface-subtle)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
              >
                {selectedSource ? `Scoped: ${selectedSource}` : "Scope: All documents"}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className="max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
                    style={
                      msg.role === "user"
                        ? { background: "var(--accent-btn-bg)", color: "var(--accent-btn-text)" }
                        : {
                            background: "var(--bg-surface-subtle)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-primary)",
                          }
                    }
                  >
                    {msg.role === "assistant"
                      ? renderAnswerWithCitations(msg.text, handleCiteClick)
                      : msg.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4" style={{ borderTop: "1px solid var(--border-default)" }}>
              <div
                className="flex items-center gap-2 rounded-2xl px-3.5 py-2"
                style={{ background: "var(--bg-surface-subtle)", border: "1px solid var(--border-default)" }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Ask a question about your notes..."
                  disabled={isStreaming}
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: "var(--text-primary)" }}
                />
                <button
                  onClick={handleSend}
                  disabled={isStreaming}
                  className="p-2 rounded-xl"
                  style={{ background: "var(--accent-btn-bg)", color: "var(--accent-btn-text)" }}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
