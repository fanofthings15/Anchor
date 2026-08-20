import { Router } from "express";
import { db } from "../db";

export const shoppingRouter = Router();

interface ShoppingListRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

interface ShoppingItemRow {
  id: string;
  user_id: string;
  list_id: string;
  name: string;
  quantity: string;
  checked: number;
  sort_order: number;
  created_at: string;
}

function serializeList(row: ShoppingListRow) {
  return {
    id: row.id,
    name: row.name,
    created_at: row.created_at,
  };
}

function serializeItem(row: ShoppingItemRow) {
  return {
    id: row.id,
    list_id: row.list_id,
    name: row.name,
    quantity: row.quantity,
    checked: row.checked === 1,
    sort_order: row.sort_order,
    created_at: row.created_at,
  };
}

// ---------- Lists ----------

shoppingRouter.get("/", (req, res) => {
  const lists = db
    .query<ShoppingListRow, [string]>("SELECT * FROM shopping_lists WHERE user_id = ? ORDER BY created_at ASC")
    .all(req.uid);
  const items = db
    .query<ShoppingItemRow, [string]>("SELECT * FROM shopping_items WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC")
    .all(req.uid);
  res.json({ lists: lists.map(serializeList), items: items.map(serializeItem) });
});

shoppingRouter.post("/lists", (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.query("INSERT INTO shopping_lists (id, user_id, name, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    req.uid,
    name.trim(),
    now
  );
  const row = db.query<ShoppingListRow, [string]>("SELECT * FROM shopping_lists WHERE id = ?").get(id)!;
  res.status(201).json(serializeList(row));
});

shoppingRouter.delete("/lists/:id", (req, res) => {
  db.query("DELETE FROM shopping_items WHERE list_id = ? AND user_id = ?").run(req.params.id, req.uid);
  db.query("DELETE FROM shopping_lists WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});

// ---------- Items ----------

shoppingRouter.post("/items", (req, res) => {
  const { list_id, name, quantity = "" } = req.body ?? {};
  if (typeof list_id !== "string" || !list_id) {
    res.status(400).json({ error: "list_id is required" });
    return;
  }
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const list = db
    .query<ShoppingListRow, [string, string]>("SELECT * FROM shopping_lists WHERE id = ? AND user_id = ?")
    .get(list_id, req.uid);
  if (!list) {
    res.status(404).json({ error: "list not found" });
    return;
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const maxOrder = db
    .query<{ maxOrder: number | null }, [string]>("SELECT MAX(sort_order) as maxOrder FROM shopping_items WHERE list_id = ?")
    .get(list_id);
  const sortOrder = (maxOrder?.maxOrder ?? -1) + 1;
  db.query(
    "INSERT INTO shopping_items (id, user_id, list_id, name, quantity, checked, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)"
  ).run(id, req.uid, list_id, name.trim(), quantity, sortOrder, now);
  const row = db.query<ShoppingItemRow, [string]>("SELECT * FROM shopping_items WHERE id = ?").get(id)!;
  res.status(201).json(serializeItem(row));
});

shoppingRouter.patch("/items/:id", (req, res) => {
  const existing = db
    .query<ShoppingItemRow, [string, string]>("SELECT * FROM shopping_items WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.uid);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { name, quantity, checked } = req.body ?? {};
  const next: ShoppingItemRow = {
    ...existing,
    name: typeof name === "string" && name.trim() ? name.trim() : existing.name,
    quantity: typeof quantity === "string" ? quantity : existing.quantity,
    checked: typeof checked === "boolean" ? (checked ? 1 : 0) : existing.checked,
  };
  db.query("UPDATE shopping_items SET name = ?, quantity = ?, checked = ? WHERE id = ? AND user_id = ?").run(
    next.name,
    next.quantity,
    next.checked,
    req.params.id,
    req.uid
  );
  res.json(serializeItem(next));
});

shoppingRouter.patch("/items/:id/check", (req, res) => {
  const existing = db
    .query<ShoppingItemRow, [string, string]>("SELECT * FROM shopping_items WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.uid);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { checked } = req.body ?? {};
  if (typeof checked !== "boolean") {
    res.status(400).json({ error: "checked must be a boolean" });
    return;
  }
  const next: ShoppingItemRow = { ...existing, checked: checked ? 1 : 0 };
  db.query("UPDATE shopping_items SET checked = ? WHERE id = ? AND user_id = ?").run(
    next.checked,
    req.params.id,
    req.uid
  );
  res.json(serializeItem(next));
});

shoppingRouter.delete("/items/:id", (req, res) => {
  db.query("DELETE FROM shopping_items WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});
