import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, isNotesUnlockStale, NOTES_UNLOCK_KEY, type Note, type NoteImage } from "../api/client";

function formatUpdated(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Only these tags ever come out of sanitizeHtml — deliberately no attributes at all (they
// get stripped even off allowed tags), so there's no way for pasted or stored content to
// carry a style=/onclick=/etc through to what gets rendered via innerHTML. Anything not
// in this list is unwrapped (its text kept, the tag itself dropped), not deleted outright.
const ALLOWED_TAGS = new Set(["P", "BR", "STRONG", "B", "H2", "H3"]);

function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  function clean(node: Node) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (!ALLOWED_TAGS.has(el.tagName)) {
          while (el.firstChild) node.insertBefore(el.firstChild, el);
          node.removeChild(el);
          continue;
        }
        for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
        clean(el);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        node.removeChild(child); // comments, etc.
      }
    }
  }
  clean(doc.body);
  return doc.body.innerHTML;
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
  const [newTag, setNewTag] = useState("");
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [hasNotesPin, setHasNotesPin] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const bodyEditableRef = useRef<HTMLDivElement>(null);

  // The body editor is uncontrolled (React never sets its innerHTML on every keystroke —
  // that fights contentEditable's own cursor/selection handling) — bodyRef tracks the
  // latest raw HTML via onInput instead, read out (and sanitized) only when actually
  // saving. titleRef mirrors the same "latest value visible to the unmount-flush closure"
  // purpose for the plain-text title input, which stays a normal controlled input.
  const titleRef = useRef(title);
  const bodyRef = useRef("");
  titleRef.current = title;
  const savedTitleRef = useRef("");
  const savedBodyRef = useRef("");

  useEffect(() => {
    if (!id) return;
    load(id);
    // Flush any unsaved edit when navigating away — covers back/nav-tap, which don't
    // fire a blur the way clicking another control on the same page does. A still-locked
    // note (gated screen, nothing to flush) never populated these refs beyond their
    // initial empty state, so this is a no-op there.
    return () => flushDirty(id);
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
      flushDirty(id);
      load(id);
    }, 15_000);
    return () => clearInterval(interval);
  }, [id, note?.locked, note?.requires_unlock]);

  // Initializes the contentEditable's DOM content directly (not via React re-render —
  // React doesn't own this element's children once it's editable) exactly once per
  // note-load or unlock transition. Deliberately keyed on id/requires_unlock rather than
  // the whole `note` object, since `note` also changes on every unrelated update (pin
  // toggle, tag add, the body save's own response) — re-running this on those would wipe
  // out whatever the user is currently typing. `loading` is also a dependency: load()
  // calls setNote(n) before its own later `await listNoteImages(...)` resolves, so
  // note?.id can go from undefined to set while loading is still true (the contentEditable
  // div isn't rendered yet in that branch, so the ref is null and this bails out) — without
  // also re-running once loading flips back to false, that first bail was the only attempt
  // and the editor would stay permanently empty after every fresh load.
  useEffect(() => {
    if (loading || !note || note.requires_unlock) return;
    const el = bodyEditableRef.current;
    if (!el) return;
    const sanitized = sanitizeHtml(note.body);
    el.innerHTML = sanitized;
    bodyRef.current = sanitized;
    savedBodyRef.current = sanitized;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, note?.requires_unlock, loading]);

  function flushDirty(noteId: string) {
    const titleDirty = titleRef.current !== savedTitleRef.current;
    const sanitizedBody = sanitizeHtml(bodyRef.current);
    const bodyDirty = sanitizedBody !== savedBodyRef.current;
    if (!titleDirty && !bodyDirty) return;
    const patch: Partial<{ title: string; body: string }> = {};
    if (titleDirty) patch.title = titleRef.current;
    if (bodyDirty) patch.body = sanitizedBody;
    api.updateNote(noteId, patch).catch(() => {});
    if (titleDirty) savedTitleRef.current = titleRef.current;
    if (bodyDirty) savedBodyRef.current = sanitizedBody;
  }

  async function load(noteId: string) {
    setLoading(true);
    try {
      const [n, settings] = await Promise.all([api.getNote(noteId), api.getSettings()]);
      setNote(n);
      setHasNotesPin(settings.has_notes_pin);
      if (!n.requires_unlock) {
        setTitle(n.title);
        savedTitleRef.current = n.title;
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
    if (!id) return;
    const sanitized = sanitizeHtml(bodyRef.current);
    if (sanitized === savedBodyRef.current) return;
    savedBodyRef.current = sanitized;
    const updated = await api.updateNote(id, { body: sanitized });
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

  function handleInput() {
    const el = bodyEditableRef.current;
    if (!el) return;
    // A fully-cleared contentEditable often still holds a stray <br> rather than being
    // truly empty, which breaks the CSS :empty placeholder trick — flatten that case so
    // the placeholder reappears when the note is actually blank.
    if (el.innerHTML === "<br>") el.innerHTML = "";
    bodyRef.current = el.innerHTML;
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const imageItem = Array.from(e.clipboardData.items).find((item) => item.type.startsWith("image/"));
    if (imageItem) {
      e.preventDefault();
      if (!id) return;
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
      return;
    }
    // Force plain-text paste for everything else — foreign formatting (fonts, colors,
    // spans) would just get stripped by sanitizeHtml on save anyway, so inserting it as
    // styled first only to un-style it a moment later is pure visual noise.
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
    handleInput();
  }

  async function removeImage(imageId: string) {
    await api.deleteNoteImage(imageId);
    setImages((prev) => prev.filter((img) => img.id !== imageId));
    setLightbox(null);
  }

  // Both formatting commands run through execCommand — deprecated, but still the only
  // way to apply formatting to a Selection inside a contentEditable without hand-rolling
  // DOM range manipulation, and every engine this app actually runs on still implements
  // it. onMouseDown preventDefault on the buttons stops them from stealing focus (and
  // with it the text selection) away from the editable area before the command runs.
  function applyBold() {
    const el = bodyEditableRef.current;
    if (!el) return;
    el.focus();
    document.execCommand("bold");
    handleInput();
  }

  function applyHeading() {
    const el = bodyEditableRef.current;
    if (!el) return;
    el.focus();
    const current = document.queryCommandValue("formatBlock").toLowerCase();
    document.execCommand("formatBlock", false, current === "h2" ? "p" : "h2");
    handleInput();
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
          aria-label="Toggle heading on this line"
          title="Heading"
        >
          H
        </button>
      </div>

      <div
        ref={bodyEditableRef}
        className="note-editor-body"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={saveBody}
        onPaste={handlePaste}
        data-placeholder="Write something… (paste an image to attach it)"
      />

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
