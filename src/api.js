const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

/**
 * Fetches the list of ingested documents (metadata-only, no LLM).
 */
export async function fetchDocuments() {
  const res = await fetch(`${API_BASE}/api/documents`);
  if (!res.ok) throw new Error("Failed to fetch documents");
  return res.json();
}

/**
 * Non-streaming chat - waits for full answer. Useful for simple testing.
 */
export async function askQuestion(message, source = null) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, source }),
  });
  if (!res.ok) throw new Error("Chat request failed");
  const data = await res.json();
  return data.answer;
}

/**
 * Streaming chat - calls onToken(text) for each piece of the answer as it
 * arrives. We can't use native EventSource here because it only supports
 * GET requests, and our endpoint needs POST (to send the question body).
 * So we manually read the response stream and parse SSE "data: ..." lines.
 */
export async function askQuestionStream(message, onToken, onDone, source = null) {
  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, source }),
  });

  if (!res.ok || !res.body) throw new Error("Streaming chat request failed");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE messages are separated by a blank line ("\n\n")
    const parts = buffer.split("\n\n");
    buffer = parts.pop(); // keep any incomplete trailing chunk for next read

    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      const data = part.slice(6);

      if (data === "[DONE]") {
        onDone?.();
        return;
      }

      // Undo the newline-escaping we did on the backend (main.py)
      onToken(data.replace(/\\n/g, "\n"));
    }
  }

  onDone?.();
}

/**
 * Uploads a PDF file for ingestion.
 */
export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}
