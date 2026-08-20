import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, isNotesUnlockStale, NOTES_UNLOCK_KEY, type Note, type NoteImage } from "../api/client";

function formatUpdated(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// A deliberately tiny markdown subset (bold + two heading levels) rather than a full
// parser/library — escapes first, then only ever introduces the handful of tags below
// around already-escaped text, so this can't be used to inject arbitrary HTML.
function applyBoldMarkup(escapedLine: string): string {
  return escapedLine.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function renderMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const escaped = escapeHtml(line);
      if (escaped.startsWith("## ")) return `<h3>${applyBoldMarkup(escaped.slice(3))}</h3>`;
      if (escaped.startsWith("# ")) return `<h2>${applyBoldMarkup(escaped.slice(2))}</h2>`;
      const bolded = applyBoldMarkup(escaped);
      return bolded.trim() === "" ? "<br/>" : `<p>${bolded}</p>`;
    })
    .join("");
}

// Reads a pasted image clipboard item into a base64 data URI the backend's upload
// endpoint expects — FileReader is callback-based, so this wraps it in a promise.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function NoteEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [note, setNote] = useState<Note | null>(null);
  const [images, setImages] = useState<NoteImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [newTag, setNewTag] = useState("");
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [hasNotesPin, setHasNotesPin] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Latest values escape the render closure via refs so the unmount-time flush (browser
  // back, nav-link tap, etc. — none of which necessarily blur the field first) always
  // saves what's actually on screen instead of whatever was current when the effect ran.
  const titleRef = useRef(title);
  const bodyRef = useRef(body);
  titleRef.current = title;
  bodyRef.current = body;
  const savedTitleRef = useRef("");
  const savedBodyRef = useRef("");

  useEffect(() => {
    if (!id) return;
    load(id);
    // Flush any unsaved edit when navigating away — covers back/nav-tap, which don't
    // fire a textarea blur the way clicking another control on the same page does. A
    // still-locked note (gated screen, nothing to flush) never populated these refs
    // beyond their initial empty state, so this is a no-op there.
    return () => {
      if (titleRef.current !== savedTitleRef.current || bodyRef.current !== savedBodyRef.current) {
        api.updateNote(id, { title: titleRef.current, body: bodyRef.current }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // A locked note that's currently unlocked and on screen should re-gate itself once the
  // 5-minute idle clock lapses, not just wait for the next request to happen to fail —
  // otherwise a note left open (but untouched) would keep showing its content
  // indefinitely. Only runs at all for locked notes; nothing to re-gate otherwise.
  useEffect(() => {
    if (!id || !note || note.requires_unlock || !note.locked) return;
    const interval = setInterval(() => {
      if (!isNotesUnlockStale()) return;
      sessionStorage.removeItem(NOTES_UNLOCK_KEY);
      if (titleRef.current !== savedTitleRef.current || bodyRef.current !== savedBodyRef.current) {
        api.updateNote(id, { title: titleRef.current, body: bodyRef.current }).catch(() => {});
      }
      load(id);
    }, 15_000);
    return () => clearInterval(interval);
  }, [id, note?.locked, note?.requires_unlock]);

  async function load(noteId: string) {
    setLoading(true);
    try {
      const [n, settings] = await Promise.all([api.getNote(noteId), api.getSettings()]);
      setNote(n);
      setHasNotesPin(settings.has_notes_pin);
      if (!n.requires_unlock) {
        setTitle(n.title);
        setBody(n.body);
        savedTitleRef.current = n.title;
        savedBodyRef.current = n.body;
        setImages(await api.listNoteImages(noteId));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setUnlockError("");
    setUnlocking(true);
    try {
      const { token } = await api.unlockNotes(unlockPin);
      sessionStorage.setItem(NOTES_UNLOCK_KEY, token);
      setUnlockPin("");
      await load(id);
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Incorrect PIN");
    } finally {
      setUnlocking(false);
    }
  }

  async function saveTitle() {
    if (!id || title === savedTitleRef.current) return;
    const trimmed = title.trim() || "Untitled";
    savedTitleRef.current = trimmed;
    const updated = await api.updateNote(id, { title: trimmed });
    setNote(updated);
    setTitle(updated.title);
  }

  async function saveBody() {
    if (!id || body === savedBodyRef.current) return;
    savedBodyRef.current = body;
    const updated = await api.updateNote(id, { body });
    setNote(updated);
  }

  async function togglePin() {
    if (!id || !note) return;
    const updated = await api.updateNote(id, { pinned: !note.pinned });
    setNote(updated);
  }

  async function toggleLock() {
    if (!id || !note) return;
    const updated = await api.updateNote(id, { locked: !note.locked });
    setNote(updated);
  }

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !note) return;
    const trimmed = newTag.trim();
    if (!trimmed || note.tags.includes(trimmed)) return;
    setNewTag("");
    const updated = await api.updateNote(id, { tags: [...note.tags, trimmed] });
    setNote(updated);
  }

  async function removeTag(tag: string) {
    if (!id || !note) return;
    const updated = await api.updateNote(id, { tags: note.tags.filter((t) => t !== tag) });
    setNote(updated);
  }

  async function remove() {
    if (!id) return;
    await api.deleteNote(id);
    navigate("/notes");
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (!id) return;
    const imageItem = Array.from(e.clipboardData.items).find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const image = await api.uploadNoteImage(id, dataUrl);
      setImages((prev) => [...prev, image]);
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(imageId: string) {
    await api.deleteNoteImage(imageId);
    setImages((prev) => prev.filter((img) => img.id !== imageId));
    setLightbox(null);
  }

  // Wraps the current selection in **bold** markers. No-op with nothing selected — there's
  // no cursor-position "start bold mode" concept here, only wrap-what's-highlighted.
  function applyBold() {
    const el = textareaRef.current;
    if (!el || el.selectionStart === el.selectionEnd) return;
    const { selectionStart: start, selectionEnd: end, value } = el;
    const next = `${value.slice(0, start)}**${value.slice(start, end)}**${value.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + 2, end + 2);
    });
  }

  // Toggles a "# " heading prefix on whichever line the cursor is currently in.
  function applyHeading() {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: pos, value } = el;
    const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
    const lineEndIdx = value.indexOf("\n", pos);
    const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
    const line = value.slice(lineStart, lineEnd);
    const alreadyHeading = line.startsWith("# ");
    const nextLine = alreadyHeading ? line.slice(2) : `# ${line}`;
    const next = value.slice(0, lineStart) + nextLine + value.slice(lineEnd);
    setBody(next);
    const delta = alreadyHeading ? -2 : 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos + delta, pos + delta);
    });
  }

  if (loading || !note) {
    return (
      <div>
        <div className="row-between" style={{ marginBottom: 16 }}>
          <button type="button" className="btn-icon" onClick={() => navigate("/notes")} aria-label="Back to notes">
            ←
          </button>
        </div>
        <div className="empty-state">Loading…</div>
      </div>
    );
  }

  if (note.requires_unlock) {
    return (
      <div>
        <div className="row-between" style={{ marginBottom: 16 }}>
          <button type="button" className="btn-icon" onClick={() => navigate("/notes")} aria-label="Back to notes">
            ←
          </button>
        </div>
        <form className="pin-gate" onSubmit={handleUnlock}>
          <div style={{ fontSize: 32 }}>🔒</div>
          <strong style={{ marginTop: 8 }}>{note.title}</strong>
          <div className="text-dim" style={{ fontSize: 13, marginTop: 4 }}>
            This note is locked — enter your PIN to view it.
          </div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            className="pin-gate-input"
            value={unlockPin}
            onChange={(e) => setUnlockPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            autoFocus
          />
          {unlockError && (
            <div className="text-danger" style={{ fontSize: 13, marginBottom: 8 }}>
              {unlockError}
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={unlocking || unlockPin.length !== 4}>
            {unlocking ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="note-editor">
      <div className="row-between" style={{ marginBottom: 12 }}>
        <button type="button" className="btn-icon" onClick={() => navigate("/notes")} aria-label="Back to notes">
          ←
        </button>
        <div className="row" style={{ gap: 4 }}>
          <button
            type="button"
            className="btn-icon"
            onClick={toggleLock}
            disabled={!hasNotesPin && !note.locked}
            aria-label={note.locked ? "Unlock note" : "Lock note"}
            title={!hasNotesPin && !note.locked ? "Set a PIN in Settings to lock notes" : undefined}
          >
            {note.locked ? "🔒" : "🔓"}
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={togglePin}
            aria-label={note.pinned ? "Unpin note" : "Pin note"}
          >
            {note.pinned ? "★" : "☆"}
          </button>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="btn-icon text-danger"
              onClick={() => setConfirmingDelete((v) => !v)}
              aria-label="Delete note"
            >
              ✕
            </button>
            {confirmingDelete && (
              <>
                <div className="confirm-menu-backdrop" onClick={() => setConfirmingDelete(false)} />
                <div className="confirm-menu">
                  <div className="confirm-menu-text">Delete this note?</div>
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn" onClick={() => setConfirmingDelete(false)}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-danger" onClick={remove}>
                      Delete
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <input
        type="text"
        className="note-editor-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        placeholder="Untitled"
      />

      <div className="text-dim" style={{ fontSize: 12, marginBottom: 12 }}>
        Updated {formatUpdated(note.updated_at)}
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {note.tags.map((tag) => (
          <button type="button" key={tag} className="chip" onClick={() => removeTag(tag)} title="Remove tag">
            {tag} ×
          </button>
        ))}
        <form className="row" style={{ gap: 4 }} onSubmit={addTag}>
          <input
            type="text"
            placeholder="+ tag"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            style={{ width: 90, minHeight: 32, fontSize: 13, padding: "4px 8px" }}
          />
        </form>
      </div>

      <div className="row" style={{ gap: 4, marginBottom: 6 }}>
        <button
          type="button"
          className="btn-icon"
          onMouseDown={(e) => e.preventDefault()}
          onClick={applyBold}
          disabled={previewMode}
          aria-label="Bold selected text"
          title="Bold (select text first)"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="btn-icon"
          onMouseDown={(e) => e.preventDefault()}
          onClick={applyHeading}
          disabled={previewMode}
          aria-label="Toggle heading on this line"
          title="Heading"
        >
          H
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={() => setPreviewMode((v) => !v)}>
          {previewMode ? "Write" : "Preview"}
        </button>
      </div>

      {previewMode ? (
        <div className="note-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
      ) : (
        <textarea
          ref={textareaRef}
          className="note-editor-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={saveBody}
          onPaste={handlePaste}
          placeholder="Write something… (paste an image to attach it) — use **bold** or the B/H buttons above"
        />
      )}

      {uploading && <div className="text-dim" style={{ fontSize: 13, marginTop: 8 }}>Uploading image…</div>}

      {images.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {images.map((img) => (
            <button
              type="button"
              key={img.id}
              className="note-image-thumb"
              onClick={() => setLightbox(img.id)}
              aria-label="View image"
            >
              <img src={`/api/notes/images/${img.id}`} alt="" />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="note-image-lightbox" onClick={() => setLightbox(null)}>
          <img src={`/api/notes/images/${lightbox}`} alt="" onClick={(e) => e.stopPropagation()} />
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setLightbox(null)}>
              Close
            </button>
            <button type="button" className="btn text-danger" onClick={() => removeImage(lightbox)}>
              Delete image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
