import { useState } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GripVertical, Lock, Star } from "lucide-react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, isNotesUnlockStale, type Note } from "../api/client";

function DragHandle(props: Record<string, unknown>) {
  return (
    <button type="button" className="btn-icon drag-handle" aria-label="Drag to reorder" {...props}>
      <GripVertical size={18} aria-hidden="true" />
    </button>
  );
}

function preview(bodyHtml: string): string {
  // Note bodies are sanitized HTML (from the WYSIWYG editor), not markdown — pull the
  // plain text out block by block so a card preview reads as flowing text instead of
  // literal "<p>" tags run together.
  const doc = new DOMParser().parseFromString(bodyHtml, "text/html");
  const parts: string[] = [];
  doc.body.querySelectorAll("p, h2, h3").forEach((el) => {
    const text = el.textContent?.trim();
    if (text) parts.push(text);
  });
  const trimmed = parts.join(" ") || doc.body.textContent?.trim() || "";
  return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
}

function SortableNoteCard({
  note,
  onOpen,
  onTogglePin,
}: {
  note: Note;
  onOpen: () => void;
  onTogglePin: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: note.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 };
  const previewText = note.locked ? "" : preview(note.body);

  return (
    <div className="card note-card" ref={setNodeRef} style={style} onClick={onOpen}>
      <div className="row-between">
        <div className="row" style={{ flex: 1, minWidth: 0 }}>
          <DragHandle {...attributes} {...listeners} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
          {note.pinned && <span className="chip chip-accent">Pinned</span>}
          {note.locked && (
            <span className="chip row" style={{ gap: 4 }}>
              <Lock size={12} className="icon-inline" aria-hidden="true" />
              Locked
            </span>
          )}
          <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.title}</strong>
        </div>
        <button
          type="button"
          className="btn-icon"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          aria-label="Toggle pin"
        >
          <Star size={18} fill={note.pinned ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      </div>
      {previewText && (
        <div className="text-dim" style={{ marginTop: 6, fontSize: 13 }}>
          {previewText}
        </div>
      )}
      {!note.locked && note.tags.length > 0 && (
        <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
          {note.tags.map((tag) => (
            <span className="chip" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteGroup({
  notes,
  onReorder,
  onOpen,
  onTogglePin,
}: {
  notes: Note[];
  onReorder: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onTogglePin: (note: Note) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = notes.findIndex((n) => n.id === active.id);
    const newIndex = notes.findIndex((n) => n.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(notes, oldIndex, newIndex).map((n) => n.id));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={notes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
        <div className="list">
          {notes.map((note) => (
            <SortableNoteCard
              key={note.id}
              note={note}
              onOpen={() => onOpen(note.id)}
              onTogglePin={() => onTogglePin(note)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export default function Notes() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickTitle, setQuickTitle] = useState("");

  useEffect(() => {
    load();
  }, []);

  // Previews for locked notes were already redacted server-side at fetch time (see
  // notes.ts's serialize), but that redaction only applies per-request — sitting on this
  // list past the 5-minute idle window shouldn't leave an already-loaded preview visible
  // indefinitely, so re-fetch once the clock lapses to pick up the re-redacted version.
  useEffect(() => {
    if (!notes.some((n) => n.locked)) return;
    const interval = setInterval(() => {
      if (isNotesUnlockStale()) load();
    }, 15_000);
    return () => clearInterval(interval);
  }, [notes]);

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
    navigate(`/notes/${note.id}`);
  }

  async function togglePin(note: Note) {
    const updated = await api.updateNote(note.id, { pinned: !note.pinned });
    setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)));
  }

  async function reorder(group: "pinned" | "unpinned", orderedIds: string[]) {
    const otherIds = notes.filter((n) => (group === "pinned" ? !n.pinned : n.pinned)).map((n) => n.id);
    const nextOrder = group === "pinned" ? [...orderedIds, ...otherIds] : [...otherIds, ...orderedIds];
    const byId = new Map(notes.map((n) => [n.id, n]));
    setNotes(nextOrder.map((id) => byId.get(id)!).filter(Boolean));
    try {
      await api.reorderNotes(orderedIds);
    } catch {
      load();
    }
  }

  const pinnedNotes = notes.filter((n) => n.pinned);
  const unpinnedNotes = notes.filter((n) => !n.pinned);

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
        <>
          {pinnedNotes.length > 0 && (
            <NoteGroup
              notes={pinnedNotes}
              onReorder={(ids) => reorder("pinned", ids)}
              onOpen={(id) => navigate(`/notes/${id}`)}
              onTogglePin={togglePin}
            />
          )}
          <NoteGroup
            notes={unpinnedNotes}
            onReorder={(ids) => reorder("unpinned", ids)}
            onOpen={(id) => navigate(`/notes/${id}`)}
            onTogglePin={togglePin}
          />
        </>
      )}
    </div>
  );
}
