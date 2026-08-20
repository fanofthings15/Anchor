import { useEffect, useState } from "react";
import { api, type Bill, type Recurrence } from "../api/client";

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: "none", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// next_due_at is stored as UTC midnight of the intended calendar day, matching the
// backend's own `date('now')` (UTC) definition of overdue in today.ts — comparing UTC
// calendar days here (rather than raw instants, or a local-timezone conversion) keeps a
// bill from flipping to "Overdue" hours early or late depending on the viewer's timezone.
function daysUntil(iso: string): number {
  const due = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((due - today) / 86_400_000);
}

function paidThisCycle(bill: Bill): boolean {
  return bill.last_paid_at !== null && bill.last_paid_at >= bill.next_due_at;
}

function sortBills(a: Bill, b: Bill) {
  return a.next_due_at.localeCompare(b.next_due_at);
}

function inCurrentMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

export default function Bills() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [autopay, setAutopay] = useState(false);
  const [recurrence, setRecurrence] = useState<Recurrence>("monthly");
  const [intervalDays, setIntervalDays] = useState("30");
  const [nextDueAt, setNextDueAt] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editAutopay, setEditAutopay] = useState(false);
  const [editRecurrence, setEditRecurrence] = useState<Recurrence>("monthly");
  const [editIntervalDays, setEditIntervalDays] = useState("30");
  const [editNextDueAt, setEditNextDueAt] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setBills(await api.listBills());
    } finally {
      setLoading(false);
    }
  }

  async function addBill(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const dollars = Number(amount);
    if (!trimmedName || !Number.isFinite(dollars) || !nextDueAt) return;

    const bill = await api.createBill({
      name: trimmedName,
      amount_cents: Math.round(dollars * 100),
      category: category.trim(),
      autopay,
      recurrence,
      recurrence_interval_days: recurrence === "custom" ? Number(intervalDays) || null : null,
      next_due_at: new Date(nextDueAt).toISOString(),
    });
    setBills((prev) => [...prev, bill].sort(sortBills));

    setName("");
    setAmount("");
    setCategory("");
    setAutopay(false);
    setRecurrence("monthly");
    setIntervalDays("30");
    setNextDueAt("");
    setShowForm(false);
  }

  async function markPaid(id: string) {
    const updated = await api.payBill(id);
    setBills((prev) => prev.map((b) => (b.id === id ? updated : b)).sort(sortBills));
  }

  async function remove(id: string) {
    await api.deleteBill(id);
    setBills((prev) => prev.filter((b) => b.id !== id));
  }

  function startEdit(bill: Bill) {
    setEditingId(bill.id);
    setEditName(bill.name);
    setEditAmount((bill.amount_cents / 100).toFixed(2));
    setEditCategory(bill.category);
    setEditAutopay(bill.autopay);
    setEditRecurrence(bill.recurrence);
    setEditIntervalDays(bill.recurrence_interval_days != null ? String(bill.recurrence_interval_days) : "30");
    setEditNextDueAt(bill.next_due_at.slice(0, 10));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(e: React.FormEvent, id: string) {
    e.preventDefault();
    const trimmedName = editName.trim();
    const dollars = Number(editAmount);
    if (!trimmedName || !Number.isFinite(dollars) || !editNextDueAt) return;
    const updated = await api.updateBill(id, {
      name: trimmedName,
      amount_cents: Math.round(dollars * 100),
      category: editCategory.trim(),
      autopay: editAutopay,
      recurrence: editRecurrence,
      recurrence_interval_days: editRecurrence === "custom" ? Number(editIntervalDays) || null : null,
      next_due_at: new Date(editNextDueAt).toISOString(),
    });
    setBills((prev) => prev.map((b) => (b.id === id ? updated : b)).sort(sortBills));
    setEditingId(null);
  }

  const leftToPayCents = bills
    .filter((b) => !paidThisCycle(b) && inCurrentMonth(b.next_due_at))
    .reduce((sum, b) => sum + b.amount_cents, 0);
  const paidThisMonthCents = bills
    .filter((b) => b.last_paid_at && inCurrentMonth(b.last_paid_at))
    .reduce((sum, b) => sum + b.amount_cents, 0);
  const totalThisMonthCents = leftToPayCents + paidThisMonthCents;

  return (
    <div>
      <h1>Bills</h1>

      {!loading && bills.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row" style={{ justifyContent: "center", gap: 32, flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{formatCents(totalThisMonthCents)}</div>
              <div className="text-dim" style={{ fontSize: 12 }}>
                Total this month
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: leftToPayCents > 0 ? "var(--warning)" : "var(--success)" }}>
                {formatCents(leftToPayCents)}
              </div>
              <div className="text-dim" style={{ fontSize: 12 }}>
                Left to pay
              </div>
            </div>
          </div>
        </div>
      )}

      {!showForm ? (
        <button type="button" className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => setShowForm(true)}>
          + Add bill
        </button>
      ) : (
      <form className="card" onSubmit={addBill}>
        <div className="field">
          <label htmlFor="bill-name">Name</label>
          <input id="bill-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Electric bill" />
        </div>

        <div className="field">
          <label htmlFor="bill-amount">Amount</label>
          <input
            id="bill-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div className="field">
          <label htmlFor="bill-category">Category</label>
          <input id="bill-category" type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Utilities" />
        </div>

        <div className="field">
          <label htmlFor="bill-due">Next due date</label>
          <input id="bill-due" type="date" value={nextDueAt} onChange={(e) => setNextDueAt(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="bill-recurrence">Recurrence</label>
          <select id="bill-recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
            {RECURRENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {recurrence === "custom" && (
          <div className="field">
            <label htmlFor="bill-interval">Repeat every (days)</label>
            <input
              id="bill-interval"
              type="number"
              inputMode="numeric"
              min="1"
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value)}
            />
          </div>
        )}

        <div className="row">
          <input id="bill-autopay" type="checkbox" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} />
          <label htmlFor="bill-autopay">Autopay</label>
        </div>

        <div className="form-actions">
          <button type="button" className="btn" onClick={() => setShowForm(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit">
            Add bill
          </button>
        </div>
      </form>
      )}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : bills.length === 0 ? (
        <div className="empty-state">No bills yet — add one above.</div>
      ) : (
        <div className="list">
          {bills.map((bill) => {
            if (editingId === bill.id) {
              return (
                <form className="card" key={bill.id} onSubmit={(e) => saveEdit(e, bill.id)}>
                  <div className="field">
                    <label htmlFor={`edit-bill-name-${bill.id}`}>Name</label>
                    <input
                      id={`edit-bill-name-${bill.id}`}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`edit-bill-amount-${bill.id}`}>Amount</label>
                    <input
                      id={`edit-bill-amount-${bill.id}`}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`edit-bill-category-${bill.id}`}>Category</label>
                    <input
                      id={`edit-bill-category-${bill.id}`}
                      type="text"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`edit-bill-due-${bill.id}`}>Next due date</label>
                    <input
                      id={`edit-bill-due-${bill.id}`}
                      type="date"
                      value={editNextDueAt}
                      onChange={(e) => setEditNextDueAt(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`edit-bill-recurrence-${bill.id}`}>Recurrence</label>
                    <select
                      id={`edit-bill-recurrence-${bill.id}`}
                      value={editRecurrence}
                      onChange={(e) => setEditRecurrence(e.target.value as Recurrence)}
                    >
                      {RECURRENCE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {editRecurrence === "custom" && (
                    <div className="field">
                      <label htmlFor={`edit-bill-interval-${bill.id}`}>Repeat every (days)</label>
                      <input
                        id={`edit-bill-interval-${bill.id}`}
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={editIntervalDays}
                        onChange={(e) => setEditIntervalDays(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="row">
                    <input
                      id={`edit-bill-autopay-${bill.id}`}
                      type="checkbox"
                      checked={editAutopay}
                      onChange={(e) => setEditAutopay(e.target.checked)}
                    />
                    <label htmlFor={`edit-bill-autopay-${bill.id}`}>Autopay</label>
                  </div>
                  <div className="form-actions">
                    <button type="button" className="btn" onClick={cancelEdit}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Save
                    </button>
                  </div>
                </form>
              );
            }

            const paid = paidThisCycle(bill);
            const diff = daysUntil(bill.next_due_at);
            const overdue = !paid && diff < 0;
            const dueSoon = !paid && !overdue && diff <= 3;

            return (
              <div className="card" key={bill.id}>
                <div className="row-between">
                  <strong>{bill.name}</strong>
                  <span>{formatCents(bill.amount_cents)}</span>
                </div>
                <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                  {bill.category && <span className="chip">{bill.category}</span>}
                  {bill.autopay && <span className="chip chip-accent">Autopay</span>}
                  {overdue && <span className="chip chip-danger">Overdue</span>}
                  {dueSoon && <span className="chip chip-warning">Due soon</span>}
                </div>
                <div className="row-between" style={{ marginTop: 10 }}>
                  <span className="text-dim">Due {formatDate(bill.next_due_at)}</span>
                  <div className="row">
                    <button type="button" className="btn btn-primary" onClick={() => markPaid(bill.id)}>
                      Mark paid
                    </button>
                    <button type="button" className="btn-icon" onClick={() => startEdit(bill)} aria-label="Edit bill">
                      ✎
                    </button>
                    <button type="button" className="btn-icon text-danger" onClick={() => remove(bill.id)} aria-label="Delete bill">
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
