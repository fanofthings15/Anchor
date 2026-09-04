import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, GripVertical, X } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, type Todo, type TodoList } from "../api/client";

const COLLAPSE_STORAGE_KEY = "anchor-todos-collapsed-lists";

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveCollapsed(ids: Set<string>) {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // best-effort — losing the collapsed-state preference isn't worth surfacing an error
  }
}

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

// Shared by every drag handle in this file — a dedicated element with its own
// listeners so dragging never fires from a tap on the checkbox/delete button, and
// `touch-action: none` keeps mobile Safari/Chrome from trying to scroll the page
// while a drag is in progress.
function DragHandle(props: Record<string, unknown>) {
  return (
    <button type="button" className="btn-icon drag-handle" aria-label="Drag to reorder" {...props}>
      <GripVertical size={18} aria-hidden="true" />
    </button>
  );
}

function TodoCardBody({ todo }: { todo: Todo }) {
  return (
    <>
      <div className="row" style={{ flex: 1 }}>
        <span className={todo.completed ? "text-strike" : ""}>{todo.title}</span>
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
    </>
  );
}

function SortableTodoCard({ todo, onToggle, onDelete }: { todo: Todo; onToggle: (t: Todo) => void; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 };

  return (
    <div className="card" ref={setNodeRef} style={style}>
      <div className="row-between">
        <DragHandle {...attributes} {...listeners} />
        <button
          type="button"
          className={`checkbox-btn${todo.completed ? " checked" : ""}`}
          onClick={() => onToggle(todo)}
          aria-label="Toggle complete"
        />
        <TodoCardBody todo={todo} />
        <button type="button" className="btn-icon text-danger" onClick={() => onDelete(todo.id)} aria-label="Delete todo">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ListSection({
  list,
  activeTodos,
  doneTodos,
  collapsed,
  onToggleCollapse,
  addingHere,
  addValue,
  onToggleAdd,
  onAddValueChange,
  onAddSubmit,
  onToggle,
  onDeleteTodo,
  onDeleteList,
  isDropTarget,
}: {
  list: TodoList;
  activeTodos: Todo[];
  doneTodos: Todo[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  addingHere: boolean;
  addValue: string;
  onToggleAdd: () => void;
  onAddValueChange: (v: string) => void;
  onAddSubmit: (e: React.FormEvent) => void;
  onToggle: (t: Todo) => void;
  onDeleteTodo: (id: string) => void;
  onDeleteList: (id: string) => void;
  isDropTarget: boolean;
}) {
  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({ id: list.id });
  // The whole section (including its header) also acts as a drop target for cross-list
  // todo dragging — this is what lets a card be dropped into an otherwise-empty list, or
  // straight onto a collapsed list's header without expanding it first.
  const { setNodeRef: setDroppableRef } = useDroppable({ id: list.id });

  function setNodeRef(node: HTMLElement | null) {
    setSortableRef(node);
    setDroppableRef(node);
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    marginBottom: 20,
  };
  const totalCount = activeTodos.length + doneTodos.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDropTarget ? "list-drop-target" : undefined}
    >
      <div className="row-between">
        <div className="row">
          <DragHandle {...attributes} {...listeners} />
          <button
            type="button"
            className="btn-icon"
            onClick={onToggleCollapse}
            aria-label={collapsed ? `Expand ${list.name}` : `Collapse ${list.name}`}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
          </button>
          <h2 style={{ margin: 0 }}>{list.name}</h2>
          {collapsed && totalCount > 0 && <span className="chip">{totalCount}</span>}
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
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
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
            <div className="empty-state">No todos in this list yet — drag one in, or add above.</div>
          ) : (
            <>
              <SortableContext items={activeTodos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="list">
                  {activeTodos.map((todo) => (
                    <SortableTodoCard key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDeleteTodo} />
                  ))}
                  {activeTodos.length === 0 && (
                    // Keeps the list section tall enough to drop into even once every
                    // active item has been dragged out of it.
                    <div className="empty-state" style={{ padding: "8px 0" }}>
                      Drop here
                    </div>
                  )}
                </div>
              </SortableContext>
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
                          <X size={18} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
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
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => loadCollapsed());
  const [activeDragTodoId, setActiveDragTodoId] = useState<string | null>(null);
  const [dropTargetListId, setDropTargetListId] = useState<string | null>(null);
  const dragStartListId = useRef<string | null>(null);

  const listSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const itemSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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

  function toggleCollapse(listId: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      saveCollapsed(next);
      return next;
    });
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

  // Resolves a drag id to "which list is this in" — a todo id maps to its own list_id;
  // a list id maps to itself, which is how dropping into an empty (or collapsed) list's
  // container area — rather than directly onto another card — still resolves correctly.
  function containerIdFor(id: string): string | null {
    if (lists.some((l) => l.id === id)) return id;
    return todos.find((t) => t.id === id)?.list_id ?? null;
  }

  function handleItemDragStart(e: DragStartEvent) {
    const id = e.active.id as string;
    setActiveDragTodoId(id);
    dragStartListId.current = todos.find((t) => t.id === id)?.list_id ?? null;
  }

  function handleItemDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) {
      setDropTargetListId(null);
      return;
    }
    const activeTodo = todos.find((t) => t.id === (active.id as string));
    if (!activeTodo) return;
    const overContainer = containerIdFor(over.id as string);
    setDropTargetListId(overContainer);
    if (!overContainer || overContainer === activeTodo.list_id) return;
    // Crossing into a different list — move it there now so the drag visually "lands"
    // in the new list immediately. Exact position within that list is resolved on drop.
    setTodos((prev) => prev.map((t) => (t.id === activeTodo.id ? { ...t, list_id: overContainer } : t)));
  }

  async function handleItemDragEnd(e: DragEndEvent) {
    setActiveDragTodoId(null);
    setDropTargetListId(null);
    const { active, over } = e;
    const startListId = dragStartListId.current;
    dragStartListId.current = null;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const activeTodo = todos.find((t) => t.id === activeId);
    if (!activeTodo) return;
    const destListId = activeTodo.list_id; // already updated by handleItemDragOver if it crossed lists

    const destActiveIds = todos
      .filter((t) => t.list_id === destListId && !t.completed)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((t) => t.id);

    let orderedIds = destActiveIds;
    if (overId !== destListId) {
      const oldIndex = orderedIds.indexOf(activeId);
      const newIndex = orderedIds.indexOf(overId);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        orderedIds = arrayMove(orderedIds, oldIndex, newIndex);
      }
    }

    setTodos((prev) => {
      const order = new Map(orderedIds.map((id, i) => [id, i]));
      return prev.map((t) => (t.list_id === destListId && order.has(t.id) ? { ...t, sort_order: order.get(t.id)! } : t));
    });

    try {
      if (startListId && startListId !== destListId) {
        await api.updateTodo(activeId, { list_id: destListId });
      }
      await api.reorderTodos(destListId, orderedIds);
    } catch {
      load();
    }
  }

  return (
    <div>
      <h1>Todos</h1>

      {lists.length > 0 && (
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
          {lists.length === 0 ? (
            <div className="empty-state">No lists yet — create one below to get started.</div>
          ) : (
            <DndContext sensors={listSensors} collisionDetection={closestCenter} onDragEnd={handleListDragEnd}>
              <SortableContext items={lists.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                <DndContext
                  sensors={itemSensors}
                  collisionDetection={closestCorners}
                  onDragStart={handleItemDragStart}
                  onDragOver={handleItemDragOver}
                  onDragEnd={handleItemDragEnd}
                >
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
                        collapsed={collapsedIds.has(list.id)}
                        onToggleCollapse={() => toggleCollapse(list.id)}
                        addingHere={addingToListId === list.id}
                        addValue={perListValue}
                        onToggleAdd={() => toggleAddHere(list.id)}
                        onAddValueChange={setPerListValue}
                        onAddSubmit={(e) => perListAdd(list.id, e)}
                        onToggle={toggleComplete}
                        onDeleteTodo={removeTodo}
                        onDeleteList={deleteList}
                        isDropTarget={activeDragTodoId !== null && dropTargetListId === list.id}
                      />
                    );
                  })}

                  <DragOverlay>
                    {activeDragTodoId
                      ? (() => {
                          const dragged = todos.find((t) => t.id === activeDragTodoId);
                          return dragged ? (
                            <div className="card" style={{ opacity: 0.95 }}>
                              <div className="row-between">
                                <span className="drag-handle btn-icon">
                                  <GripVertical size={18} aria-hidden="true" />
                                </span>
                                <TodoCardBody todo={dragged} />
                              </div>
                            </div>
                          ) : null;
                        })()
                      : null}
                  </DragOverlay>
                </DndContext>
              </SortableContext>
            </DndContext>
          )}

          {showNewList ? (
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
          )}
        </>
      )}
    </div>
  );
}
