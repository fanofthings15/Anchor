import { Router } from "express";
import { db } from "../db";

export const investmentsRouter = Router();

interface InvestmentAccountRow {
  id: string;
  user_id: string;
  name: string;
  account_type: string;
  notes: string;
  created_at: string;
}

interface InvestmentEntryRow {
  id: string;
  user_id: string;
  account_id: string;
  entry_date: string;
  balance_cents: number;
  contribution_cents: number;
  notes: string;
  created_at: string;
}

interface InvestmentGoalRow {
  id: string;
  user_id: string;
  name: string;
  target_amount_cents: number;
  target_date: string | null;
  notes: string;
  created_at: string;
}

function serializeAccount(row: InvestmentAccountRow) {
  return {
    id: row.id,
    name: row.name,
    account_type: row.account_type,
    notes: row.notes,
    created_at: row.created_at,
  };
}

function serializeEntry(row: InvestmentEntryRow) {
  return {
    id: row.id,
    account_id: row.account_id,
    entry_date: row.entry_date,
    balance_cents: row.balance_cents,
    contribution_cents: row.contribution_cents,
    notes: row.notes,
    created_at: row.created_at,
  };
}

function serializeGoal(row: InvestmentGoalRow) {
  return {
    id: row.id,
    name: row.name,
    target_amount_cents: row.target_amount_cents,
    target_date: row.target_date,
    notes: row.notes,
    created_at: row.created_at,
  };
}

investmentsRouter.get("/", (req, res) => {
  const accounts = db
    .query<InvestmentAccountRow, [string]>("SELECT * FROM investment_accounts WHERE user_id = ? ORDER BY created_at ASC")
    .all(req.uid);
  const entries = db
    .query<InvestmentEntryRow, [string]>("SELECT * FROM investment_entries WHERE user_id = ? ORDER BY entry_date ASC")
    .all(req.uid);
  const goals = db
    .query<InvestmentGoalRow, [string]>("SELECT * FROM investment_goals WHERE user_id = ? ORDER BY created_at ASC")
    .all(req.uid);
  res.json({
    accounts: accounts.map(serializeAccount),
    entries: entries.map(serializeEntry),
    goals: goals.map(serializeGoal),
  });
});

// ---------- Accounts ----------

investmentsRouter.post("/accounts", (req, res) => {
  const { name, account_type = "", notes = "" } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.query(
    "INSERT INTO investment_accounts (id, user_id, name, account_type, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, req.uid, name.trim(), typeof account_type === "string" ? account_type : "", typeof notes === "string" ? notes : "", now);
  const row = db.query<InvestmentAccountRow, [string]>("SELECT * FROM investment_accounts WHERE id = ?").get(id)!;
  res.status(201).json(serializeAccount(row));
});

investmentsRouter.delete("/accounts/:id", (req, res) => {
  db.query("DELETE FROM investment_entries WHERE account_id = ? AND user_id = ?").run(req.params.id, req.uid);
  db.query("DELETE FROM investment_accounts WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});

// ---------- Entries ----------

investmentsRouter.post("/entries", (req, res) => {
  const { account_id, entry_date, balance_cents, contribution_cents = 0, notes = "" } = req.body ?? {};
  if (typeof account_id !== "string" || !account_id) {
    res.status(400).json({ error: "account_id is required" });
    return;
  }
  if (typeof entry_date !== "string" || !entry_date) {
    res.status(400).json({ error: "entry_date is required" });
    return;
  }
  if (typeof balance_cents !== "number" || !Number.isFinite(balance_cents)) {
    res.status(400).json({ error: "balance_cents is required" });
    return;
  }
  const account = db
    .query<InvestmentAccountRow, [string, string]>("SELECT * FROM investment_accounts WHERE id = ? AND user_id = ?")
    .get(account_id, req.uid);
  if (!account) {
    res.status(404).json({ error: "account not found" });
    return;
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.query(
    "INSERT INTO investment_entries (id, user_id, account_id, entry_date, balance_cents, contribution_cents, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    req.uid,
    account_id,
    entry_date,
    Math.round(balance_cents),
    typeof contribution_cents === "number" && Number.isFinite(contribution_cents) ? Math.round(contribution_cents) : 0,
    typeof notes === "string" ? notes : "",
    now
  );
  const row = db.query<InvestmentEntryRow, [string]>("SELECT * FROM investment_entries WHERE id = ?").get(id)!;
  res.status(201).json(serializeEntry(row));
});

investmentsRouter.delete("/entries/:id", (req, res) => {
  db.query("DELETE FROM investment_entries WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});

// ---------- Goals ----------

investmentsRouter.post("/goals", (req, res) => {
  const { name, target_amount_cents, target_date = null, notes = "" } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (typeof target_amount_cents !== "number" || !Number.isFinite(target_amount_cents)) {
    res.status(400).json({ error: "target_amount_cents is required" });
    return;
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.query(
    "INSERT INTO investment_goals (id, user_id, name, target_amount_cents, target_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    req.uid,
    name.trim(),
    Math.round(target_amount_cents),
    typeof target_date === "string" && target_date ? target_date : null,
    typeof notes === "string" ? notes : "",
    now
  );
  const row = db.query<InvestmentGoalRow, [string]>("SELECT * FROM investment_goals WHERE id = ?").get(id)!;
  res.status(201).json(serializeGoal(row));
});

investmentsRouter.delete("/goals/:id", (req, res) => {
  db.query("DELETE FROM investment_goals WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});
