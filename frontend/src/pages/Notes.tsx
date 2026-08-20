import { useEffect, useState } from "react";
import { api, type Note } from "../api/client";

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickTitle, setQuickTitle] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setNotes(await api.listNotes());
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
    setNotes((prev) => [note, ...prev]);
  }

  async function togglePin(note: Note) {
    const updated = await api.updateNote(note.id, { pinned: !note.pinned });
    setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)).sort(sortNotes));
  }

  async function saveBody(note: Note, body: string) {
    const updated = await api.updateNote(note.id, { body });
    setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)));
  }

  async function remove(id: string) {
    await api.deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  function sortNotes(a: Note, b: Note) {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updated_at.localeCompare(a.updated_at);
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
                  onClick={() => setExpandedId(expandedId === note.id ? null : note.id)}
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
              {expandedId === note.id && (
                <textarea
                  defaultValue={note.body}
                  placeholder="Write something…"
                  onBlur={(e) => saveBody(note, e.target.value)}
                  style={{ width: "100%", marginTop: 10 }}
                />
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
