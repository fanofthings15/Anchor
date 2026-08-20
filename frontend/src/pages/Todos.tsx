import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, type Todo, type TodoList } from "../api/client";

function isOverdue(dueAt: string): boolean {
  return new Date(dueAt).getTime() < Date.now();
}

function isDueToday(dueAt: string): boolean {
  const due = new Date(dueAt);
  const now = new Date();
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

function formatDue(dueAt: string): string {
  const due = new Date(dueAt);
  return due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Shared by both drag contexts below (list order, and item order within a list) — the
// handle is a dedicated element with its own listeners so dragging never fires from a
// tap on the checkbox/delete button, and `touch-action: none` keeps mobile Safari/Chrome
// from trying to scroll the page while a drag is in progress.
function DragHandle(props: Record<string, unknown>) {
  return (
    <button type="button" className="btn-icon drag-handle" aria-label="Drag to reorder" {...props}>
      ⠿
    </button>
  );
}

function SortableTodoCard({ todo, onToggle, onDelete }: { todo: Todo; onToggle: (t: Todo) => void; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div className="card" ref={setNodeRef} style={style}>
      <div className="row-between">
        <DragHandle {...attributes} {...listeners} />
        <div className="row" style={{ flex: 1 }}>
          <button
            type="button"
            className={`checkbox-btn${todo.completed ? " checked" : ""}`}
            onClick={() => onToggle(todo)}
            aria-label="Toggle complete"
          />
          <span className={todo.completed ? "text-strike" : ""}>{todo.title}</span>
        </div>
        <button type="button" className="btn-icon text-danger" onClick={() => onDelete(todo.id)} aria-label="Delete todo">
          ✕
        </button>
      </div>
      {(todo.due_at || todo.priority === "high") && (
        <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
          {todo.due_at && (
            <span
              className={`chip ${
                isOverdue(todo.due_at) && !todo.completed ? "chip-danger" : isDueToday(todo.due_at) ? "chip-warning" : ""
              }`}
            >
              {formatDue(todo.due_at)}
            </span>
          )}
          {todo.priority === "high" && <span className="chip chip-danger">High</span>}
        </div>
      )}
    </div>
  );
}

function ListSection({
  list,
  activeTodos,
  doneTodos,
  addingHere,
  addValue,
  onToggleAdd,
  onAddValueChange,
  onAddSubmit,
  onReorderTodos,
  onToggle,
  onDeleteTodo,
  onDeleteList,
}: {
  list: TodoList;
  activeTodos: Todo[];
  doneTodos: Todo[];
  addingHere: boolean;
  addValue: string;
  onToggleAdd: () => void;
  onAddValueChange: (v: string) => void;
  onAddSubmit: (e: React.FormEvent) => void;
  onReorderTodos: (listId: string, orderedIds: string[]) => void;
  onToggle: (t: Todo) => void;
  onDeleteTodo: (id: string) => void;
  onDeleteList: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const itemSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleItemDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = activeTodos.findIndex((t) => t.id === active.id);
    const newIndex = activeTodos.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(activeTodos, oldIndex, newIndex);
    onReorderTodos(list.id, reordered.map((t) => t.id));
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div className="row-between">
        <div className="row">
          <DragHandle {...attributes} {...listeners} />
          <h2 style={{ margin: 0 }}>{list.name}</h2>
        </div>
        <div className="row">
          <button type="button" className="btn-icon" onClick={onToggleAdd} aria-label={`Add to ${list.name}`}>
            +
          </button>
          <button
            type="button"
            className="btn-icon text-danger"
            onClick={() => onDeleteList(list.id)}
            aria-label={`Delete list ${list.name}`}
          >
            ✕
          </button>
        </div>
      </div>

      {addingHere && (
        <form className="quick-add" onSubmit={onAddSubmit}>
          <input
            type="text"
            placeholder={`Add to ${list.name}…`}
            value={addValue}
            onChange={(e) => onAddValueChange(e.target.value)}
            autoFocus
          />
          <button className="btn btn-primary" type="submit">
            Add
          </button>
        </form>
      )}

      {activeTodos.length === 0 && doneTodos.length === 0 ? (
        <div className="empty-state">No todos in this list yet.</div>
      ) : (
        <>
          {activeTodos.length > 0 && (
            <DndContext sensors={itemSensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd}>
              <SortableContext items={activeTodos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="list">
                  {activeTodos.map((todo) => (
                    <SortableTodoCard key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDeleteTodo} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
          {doneTodos.length > 0 && (
            <div className="list" style={{ marginTop: activeTodos.length > 0 ? 8 : 0 }}>
              {doneTodos.map((todo) => (
                <div className="card" key={todo.id}>
                  <div className="row-between">
                    <div className="row" style={{ flex: 1 }}>
                      <button
                        type="button"
                        className="checkbox-btn checked"
                        onClick={() => onToggle(todo)}
                        aria-label="Toggle complete"
                      />
                      <span className="text-strike">{todo.title}</span>
                    </div>
                    <button
                      type="button"
                      className="btn-icon text-danger"
                      onClick={() => onDeleteTodo(todo.id)}
                      aria-label="Delete todo"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Todos() {
  const [lists, setLists] = useState<TodoList[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickTitle, setQuickTitle] = useState("");
  const [newListName, setNewListName] = useState("");
  const [showNewList, setShowNewList] = useState(false);
  const [addingToListId, setAddingToListId] = useState<string | null>(null);
  const [perListValue, setPerListValue] = useState("");

  const listSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getTodos();
      setLists(data.lists);
      setTodos(data.todos);
    } finally {
      setLoading(false);
    }
  }

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    setNewListName("");
    const list = await api.createTodoList(name);
    setLists((prev) => [...prev, list]);
    setShowNewList(false);
  }

  async function deleteList(id: string) {
    await api.deleteTodoList(id);
    setLists((prev) => prev.filter((l) => l.id !== id));
    setTodos((prev) => prev.filter((t) => t.list_id !== id));
  }

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title || lists.length === 0) return;
    setQuickTitle("");
    const todo = await api.createTodo({ list_id: lists[0].id, title });
    setTodos((prev) => [...prev, todo]);
  }

  function toggleAddHere(listId: string) {
    setPerListValue("");
    setAddingToListId((prev) => (prev === listId ? null : listId));
  }

  async function perListAdd(listId: string, e: React.FormEvent) {
    e.preventDefault();
    const title = perListValue.trim();
    if (!title) return;
    setPerListValue("");
    const todo = await api.createTodo({ list_id: listId, title });
    setTodos((prev) => [...prev, todo]);
  }

  async function toggleComplete(todo: Todo) {
    const updated = await api.completeTodo(todo.id, !todo.completed);
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? updated : t)));
  }

  async function removeTodo(id: string) {
    await api.deleteTodo(id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  // Optimistically reorders the given list's active todos locally, then persists —
  // reloads from the server if the save fails so the UI never drifts from real state.
  async function reorderTodosInList(listId: string, orderedIds: string[]) {
    setTodos((prev) => {
      const order = new Map(orderedIds.map((id, i) => [id, i]));
      const untouched = prev.filter((t) => t.list_id !== listId || !order.has(t.id));
      const reordered = orderedIds
        .map((id) => prev.find((t) => t.id === id))
        .filter((t): t is Todo => Boolean(t))
        .map((t, i) => ({ ...t, sort_order: i }));
      return [...untouched, ...reordered];
    });
    try {
      await api.reorderTodos(listId, orderedIds);
    } catch {
      load();
    }
  }

  async function handleListDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = lists.findIndex((l) => l.id === active.id);
    const newIndex = lists.findIndex((l) => l.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(lists, oldIndex, newIndex);
    setLists(reordered);
    try {
      await api.reorderTodoLists(reordered.map((l) => l.id));
    } catch {
      load();
    }
  }

  return (
    <div>
      <h1>Todos</h1>

      {lists.length === 0 && !loading ? (
        <form className="quick-add" onSubmit={createList}>
          <input
            type="text"
            placeholder="Name your first list…"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
          />
          <button className="btn btn-primary" type="submit">
            Create list
          </button>
        </form>
      ) : (
        <form className="quick-add" onSubmit={quickAdd}>
          <input
            type="text"
            placeholder="New todo…"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
          />
          <button className="btn btn-primary" type="submit">
            Add
          </button>
        </form>
      )}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <>
          <DndContext sensors={listSensors} collisionDetection={closestCenter} onDragEnd={handleListDragEnd}>
            <SortableContext items={lists.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              {lists.map((list) => {
                const listTodos = todos.filter((t) => t.list_id === list.id).sort((a, b) => a.sort_order - b.sort_order);
                const activeTodos = listTodos.filter((t) => !t.completed);
                const doneTodos = listTodos.filter((t) => t.completed);
                return (
                  <ListSection
                    key={list.id}
                    list={list}
                    activeTodos={activeTodos}
                    doneTodos={doneTodos}
                    addingHere={addingToListId === list.id}
                    addValue={perListValue}
                    onToggleAdd={() => toggleAddHere(list.id)}
                    onAddValueChange={setPerListValue}
                    onAddSubmit={(e) => perListAdd(list.id, e)}
                    onReorderTodos={reorderTodosInList}
                    onToggle={toggleComplete}
                    onDeleteTodo={removeTodo}
                    onDeleteList={deleteList}
                  />
                );
              })}
            </SortableContext>
          </DndContext>

          {lists.length > 0 &&
            (showNewList ? (
              <form className="quick-add" onSubmit={createList}>
                <input
                  type="text"
                  placeholder="New list name…"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  autoFocus
                />
                <button className="btn btn-primary" type="submit">
                  Create
                </button>
              </form>
            ) : (
              <button type="button" className="btn" onClick={() => setShowNewList(true)}>
                + New list
              </button>
            ))}
        </>
      )}
    </div>
  );
}
