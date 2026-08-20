import { useEffect, useState } from "react";
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

export default function Todos() {
  const [lists, setLists] = useState<TodoList[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickTitle, setQuickTitle] = useState("");
  const [newListName, setNewListName] = useState("");
  const [showNewList, setShowNewList] = useState(false);

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

  async function toggleComplete(todo: Todo) {
    const updated = await api.completeTodo(todo.id, !todo.completed);
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? updated : t)));
  }

  async function removeTodo(id: string) {
    await api.deleteTodo(id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  function sortTodos(a: Todo, b: Todo) {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return a.created_at.localeCompare(b.created_at);
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
          {lists.map((list) => {
            const listTodos = todos.filter((t) => t.list_id === list.id).sort(sortTodos);
            return (
              <div key={list.id}>
                <div className="row-between">
                  <h2>{list.name}</h2>
                  <button
                    type="button"
                    className="btn-icon text-danger"
                    onClick={() => deleteList(list.id)}
                    aria-label={`Delete list ${list.name}`}
                  >
                    ✕
                  </button>
                </div>
                {listTodos.length === 0 ? (
                  <div className="empty-state">No todos in this list yet.</div>
                ) : (
                  <div className="list">
                    {listTodos.map((todo) => (
                      <div className="card" key={todo.id}>
                        <div className="row-between">
                          <div className="row" style={{ flex: 1 }}>
                            <button
                              type="button"
                              className={`checkbox-btn${todo.completed ? " checked" : ""}`}
                              onClick={() => toggleComplete(todo)}
                              aria-label="Toggle complete"
                            />
                            <span className={todo.completed ? "text-strike" : ""}>{todo.title}</span>
                          </div>
                          <button
                            type="button"
                            className="btn-icon text-danger"
                            onClick={() => removeTodo(todo.id)}
                            aria-label="Delete todo"
                          >
                            ✕
                          </button>
                        </div>
                        {(todo.due_at || todo.priority === "high") && (
                          <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                            {todo.due_at && (
                              <span
                                className={`chip ${
                                  isOverdue(todo.due_at) && !todo.completed
                                    ? "chip-danger"
                                    : isDueToday(todo.due_at)
                                    ? "chip-warning"
                                    : ""
                                }`}
                              >
                                {formatDue(todo.due_at)}
                              </span>
                            )}
                            {todo.priority === "high" && <span className="chip chip-danger">High</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

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
