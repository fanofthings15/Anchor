import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Note } from "../api/client";

export default function Notes() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickTitle, setQuickTitle] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setNotes((await api.listNotes()).sort(sortNotes));
    } finally {
      setLoading(false);
    }
  }

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    setQuickTitle("");
    const note = await api.createNote({ title });
    navigate(`/notes/${note.id}`);
  }

  async function togglePin(note: Note) {
    const updated = await api.updateNote(note.id, { pinned: !note.pinned });
    setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)).sort(sortNotes));
  }

  async function remove(id: string) {
    await api.deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  function sortNotes(a: Note, b: Note) {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updated_at.localeCompare(a.updated_at);
  }

  function preview(body: string): string {
    const trimmed = body.trim();
    return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
  }

  return (
    <div>
      <h1>Notes</h1>

      <form className="quick-add" onSubmit={quickAdd}>
        <input
          type="text"
          placeholder="New note title…"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
        />
        <button className="btn btn-primary" type="submit">
          Add
        </button>
      </form>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : notes.length === 0 ? (
        <div className="empty-state">No notes yet — add one above.</div>
      ) : (
        <div className="list">
          {notes.map((note) => (
            <div className="card" key={note.id}>
              <div className="row-between">
                <button
                  type="button"
                  className="row"
                  style={{ background: "none", border: "none", padding: 0, flex: 1, textAlign: "left" }}
                  onClick={() => navigate(`/notes/${note.id}`)}
                >
                  {note.pinned && <span className="chip chip-accent">Pinned</span>}
                  <strong>{note.title}</strong>
                </button>
                <button type="button" className="btn-icon" onClick={() => togglePin(note)} aria-label="Toggle pin">
                  {note.pinned ? "★" : "☆"}
                </button>
                <button type="button" className="btn-icon text-danger" onClick={() => remove(note.id)} aria-label="Delete note">
                  ✕
                </button>
              </div>
              {note.body.trim() && (
                <div className="text-dim" style={{ marginTop: 6, fontSize: 13 }}>
                  {preview(note.body)}
                </div>
              )}
              {note.tags.length > 0 && (
                <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                  {note.tags.map((tag) => (
                    <span className="chip" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
