import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Note, type NoteImage } from "../api/client";

function formatUpdated(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
    // fire a textarea blur the way clicking another control on the same page does.
    return () => {
      if (titleRef.current !== savedTitleRef.current || bodyRef.current !== savedBodyRef.current) {
        api.updateNote(id, { title: titleRef.current, body: bodyRef.current }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load(noteId: string) {
    setLoading(true);
    try {
      const [n, imgs] = await Promise.all([api.getNote(noteId), api.listNoteImages(noteId)]);
      setNote(n);
      setTitle(n.title);
      setBody(n.body);
      savedTitleRef.current = n.title;
      savedBodyRef.current = n.body;
      setImages(imgs);
    } finally {
      setLoading(false);
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
            onClick={togglePin}
            aria-label={note.pinned ? "Unpin note" : "Pin note"}
          >
            {note.pinned ? "★" : "☆"}
          </button>
          <button type="button" className="btn-icon text-danger" onClick={remove} aria-label="Delete note">
            ✕
          </button>
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

      <textarea
        className="note-editor-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={saveBody}
        onPaste={handlePaste}
        placeholder="Write something… (paste an image to attach it)"
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
