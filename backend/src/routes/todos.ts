import { Router } from "express";
import { db } from "../db";

export const todosRouter = Router();

type Priority = "low" | "normal" | "high";
const PRIORITIES: Priority[] = ["low", "normal", "high"];

interface TodoListRow {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

interface TodoRow {
  id: string;
  user_id: string;
  list_id: string;
  title: string;
  notes: string;
  due_at: string | null;
  priority: string;
  completed: number;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
}

function serializeList(row: TodoListRow) {
  return {
    id: row.id,
    name: row.name,
    sort_order: row.sort_order,
    created_at: row.created_at,
  };
}

function serializeTodo(row: TodoRow) {
  return {
    id: row.id,
    list_id: row.list_id,
    title: row.title,
    notes: row.notes,
    due_at: row.due_at,
    priority: row.priority as Priority,
    completed: row.completed === 1,
    completed_at: row.completed_at,
    sort_order: row.sort_order,
    created_at: row.created_at,
  };
}

// GET /api/todos — all lists and todos for the current user
todosRouter.get("/", (req, res) => {
  const lists = db
    .query<TodoListRow, [string]>("SELECT * FROM todo_lists WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC")
    .all(req.uid);
  const todos = db
    .query<TodoRow, [string]>("SELECT * FROM todos WHERE user_id = ? ORDER BY list_id ASC, sort_order ASC, created_at ASC")
    .all(req.uid);
  res.json({ lists: lists.map(serializeList), todos: todos.map(serializeTodo) });
});

// PATCH /api/todos/lists/reorder — persist a new list order (drag-and-drop)
todosRouter.patch("/lists/reorder", (req, res) => {
  const { ordered_ids } = req.body ?? {};
  if (!Array.isArray(ordered_ids) || ordered_ids.some((id) => typeof id !== "string")) {
    res.status(400).json({ error: "ordered_ids must be an array of list ids" });
    return;
  }
  const update = db.query("UPDATE todo_lists SET sort_order = ? WHERE id = ? AND user_id = ?");
  ordered_ids.forEach((id: string, index: number) => update.run(index, id, req.uid));
  const lists = db
    .query<TodoListRow, [string]>("SELECT * FROM todo_lists WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC")
    .all(req.uid);
  res.json(lists.map(serializeList));
});

// PATCH /api/todos/reorder — persist a new todo order within one list (drag-and-drop)
todosRouter.patch("/reorder", (req, res) => {
  const { list_id, ordered_ids } = req.body ?? {};
  if (typeof list_id !== "string" || !list_id) {
    res.status(400).json({ error: "list_id is required" });
    return;
  }
  if (!Array.isArray(ordered_ids) || ordered_ids.some((id) => typeof id !== "string")) {
    res.status(400).json({ error: "ordered_ids must be an array of todo ids" });
    return;
  }
  const update = db.query("UPDATE todos SET sort_order = ? WHERE id = ? AND user_id = ? AND list_id = ?");
  ordered_ids.forEach((id: string, index: number) => update.run(index, id, req.uid, list_id));
  const todos = db
    .query<TodoRow, [string, string]>("SELECT * FROM todos WHERE user_id = ? AND list_id = ? ORDER BY sort_order ASC")
    .all(req.uid, list_id);
  res.json(todos.map(serializeTodo));
});

// POST /api/todos/lists — create a new list
todosRouter.post("/lists", (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const countRow = db
    .query<{ n: number }, [string]>("SELECT COUNT(*) as n FROM todo_lists WHERE user_id = ?")
    .get(req.uid);
  const sortOrder = countRow?.n ?? 0;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.query(
    "INSERT INTO todo_lists (id, user_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, req.uid, name.trim(), sortOrder, now);
  const row = db.query<TodoListRow, [string]>("SELECT * FROM todo_lists WHERE id = ?").get(id)!;
  res.status(201).json(serializeList(row));
});

// DELETE /api/todos/lists/:id — delete a list and cascade-delete its todos
todosRouter.delete("/lists/:id", (req, res) => {
  db.query("DELETE FROM todos WHERE list_id = ? AND user_id = ?").run(req.params.id, req.uid);
  db.query("DELETE FROM todo_lists WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});

// POST /api/todos — create a todo
todosRouter.post("/", (req, res) => {
  const { list_id, title, notes = "", due_at = null, priority = "normal" } = req.body ?? {};
  if (typeof list_id !== "string" || !list_id) {
    res.status(400).json({ error: "list_id is required" });
    return;
  }
  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (!PRIORITIES.includes(priority)) {
    res.status(400).json({ error: "invalid priority" });
    return;
  }
  const list = db
    .query<TodoListRow, [string, string]>("SELECT * FROM todo_lists WHERE id = ? AND user_id = ?")
    .get(list_id, req.uid);
  if (!list) {
    res.status(404).json({ error: "list not found" });
    return;
  }
  const countRow = db
    .query<{ n: number }, [string, string]>("SELECT COUNT(*) as n FROM todos WHERE user_id = ? AND list_id = ?")
    .get(req.uid, list_id);
  const sortOrder = countRow?.n ?? 0;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.query(
    "INSERT INTO todos (id, user_id, list_id, title, notes, due_at, priority, completed, completed_at, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)"
  ).run(id, req.uid, list_id, title.trim(), notes, due_at, priority, sortOrder, now);
  const row = db.query<TodoRow, [string]>("SELECT * FROM todos WHERE id = ?").get(id)!;
  res.status(201).json(serializeTodo(row));
});

// PATCH /api/todos/:id/complete — set/clear completed + completed_at
todosRouter.patch("/:id/complete", (req, res) => {
  const existing = db
    .query<TodoRow, [string, string]>("SELECT * FROM todos WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.uid);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { completed } = req.body ?? {};
  if (typeof completed !== "boolean") {
    res.status(400).json({ error: "completed must be a boolean" });
    return;
  }
  const completedAt = completed ? new Date().toISOString() : null;
  db.query("UPDATE todos SET completed = ?, completed_at = ? WHERE id = ? AND user_id = ?").run(
    completed ? 1 : 0,
    completedAt,
    req.params.id,
    req.uid
  );
  if (completed) {
    db.query(
      `INSERT INTO todo_completions (todo_id, user_id, completed_at) VALUES (?, ?, ?)
       ON CONFLICT(todo_id) DO UPDATE SET completed_at = excluded.completed_at`
    ).run(req.params.id, req.uid, completedAt!);
  } else {
    db.query("DELETE FROM todo_completions WHERE todo_id = ? AND user_id = ?").run(req.params.id, req.uid);
  }
  const row = db.query<TodoRow, [string]>("SELECT * FROM todos WHERE id = ?").get(req.params.id)!;
  res.json(serializeTodo(row));
});

// PATCH /api/todos/:id — update fields
todosRouter.patch("/:id", (req, res) => {
  const existing = db
    .query<TodoRow, [string, string]>("SELECT * FROM todos WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.uid);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { title, notes, due_at, priority, list_id } = req.body ?? {};

  if (priority !== undefined && !PRIORITIES.includes(priority)) {
    res.status(400).json({ error: "invalid priority" });
    return;
  }
  if (list_id !== undefined) {
    const list = db
      .query<TodoListRow, [string, string]>("SELECT * FROM todo_lists WHERE id = ? AND user_id = ?")
      .get(list_id, req.uid);
    if (!list) {
      res.status(404).json({ error: "list not found" });
      return;
    }
  }

  const next: TodoRow = {
    ...existing,
    title: typeof title === "string" && title.trim() ? title.trim() : existing.title,
    notes: typeof notes === "string" ? notes : existing.notes,
    due_at: due_at === undefined ? existing.due_at : due_at,
    priority: typeof priority === "string" ? priority : existing.priority,
    list_id: typeof list_id === "string" ? list_id : existing.list_id,
  };

  db.query(
    "UPDATE todos SET title = ?, notes = ?, due_at = ?, priority = ?, list_id = ? WHERE id = ? AND user_id = ?"
  ).run(next.title, next.notes, next.due_at, next.priority, next.list_id, req.params.id, req.uid);

  res.json(serializeTodo(next));
});

// DELETE /api/todos/:id
todosRouter.delete("/:id", (req, res) => {
  db.query("DELETE FROM todos WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});
