import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type InvestmentAccount, type InvestmentEntry, type InvestmentGoal } from "../api/client";

// Dark-mode categorical palette (Anchor's dataviz reference palette, dark column).
// Fixed order, never cycled per-series-count — assigned by account index.
const ACCOUNT_COLORS = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
];

const GOAL_LINE_COLOR = "#6b7280"; // text-faint — reference lines are chrome, not a series

function colorForAccount(index: number) {
  return ACCOUNT_COLORS[index % ACCOUNT_COLORS.length];
}

function formatDollars(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseDollarsToCents(value: string): number | null {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export default function Investments() {
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [entries, setEntries] = useState<InvestmentEntry[]>([]);
  const [goals, setGoals] = useState<InvestmentGoal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getInvestments();
      setAccounts(data.accounts);
      setEntries(data.entries);
      setGoals(data.goals);
    } finally {
      setLoading(false);
    }
  }

  async function addAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    const account = await api.createInvestmentAccount({
      name,
      account_type: String(data.get("account_type") ?? "").trim(),
      notes: String(data.get("notes") ?? "").trim(),
    });
    setAccounts((prev) => [...prev, account]);
    form.reset();
  }

  async function removeAccount(id: string) {
    await api.deleteInvestmentAccount(id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    setEntries((prev) => prev.filter((e) => e.account_id !== id));
  }

  async function addEntry(accountId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const entryDate = String(data.get("entry_date") ?? "");
    const balanceCents = parseDollarsToCents(String(data.get("balance") ?? ""));
    if (!entryDate || balanceCents === null) return;
    const contributionRaw = String(data.get("contribution") ?? "").trim();
    const contributionCents = contributionRaw ? parseDollarsToCents(contributionRaw) ?? 0 : 0;
    const entry = await api.createInvestmentEntry({
      account_id: accountId,
      entry_date: entryDate,
      balance_cents: balanceCents,
      contribution_cents: contributionCents,
      notes: String(data.get("notes") ?? "").trim(),
    });
    setEntries((prev) => [...prev, entry]);
    form.reset();
  }

  async function removeEntry(id: string) {
    await api.deleteInvestmentEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function addGoal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const targetCents = parseDollarsToCents(String(data.get("target_amount") ?? ""));
    if (!name || targetCents === null) return;
    const targetDate = String(data.get("target_date") ?? "").trim();
    const goal = await api.createInvestmentGoal({
      name,
      target_amount_cents: targetCents,
      target_date: targetDate || null,
      notes: String(data.get("notes") ?? "").trim(),
    });
    setGoals((prev) => [...prev, goal]);
    form.reset();
  }

  async function removeGoal(id: string) {
    await api.deleteInvestmentGoal(id);
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }

  // One merged x-axis (every distinct entry_date across all accounts), each account's
  // own value keyed by account id so its Line only plots that account's own entries,
  // sorted by entry_date, connected across the gaps left by other accounts' dates —
  // no cross-account interpolation or combined-total series (out of scope for v1).
  const chartData = useMemo(() => {
    const dates = Array.from(new Set(entries.map((e) => e.entry_date))).sort();
    return dates.map((date) => {
      const row: Record<string, string | number> = { entry_date: date };
      for (const account of accounts) {
        const match = entries.find((e) => e.account_id === account.id && e.entry_date === date);
        if (match) row[account.id] = match.balance_cents / 100;
      }
      return row;
    });
  }, [entries, accounts]);

  const hasChartData = entries.length > 0;

  if (loading) {
    return (
      <div>
        <h1>Investments</h1>
        <div className="empty-state">Loading…</div>
      </div>
    );
  }

  return (
    <div>
      <h1>Investments</h1>

      <div className="chart-container">
        {hasChartData ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="entry_date" tick={{ fill: "var(--text-dim)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
              <YAxis
                tick={{ fill: "var(--text-dim)", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`)}
                width={48}
              />
              <Tooltip
                contentStyle={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
                labelStyle={{ color: "var(--text)" }}
                formatter={(value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              />
              {accounts.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-dim)" }} />}
              {accounts.map((account, i) => (
                <Line
                  key={account.id}
                  type="monotone"
                  dataKey={account.id}
                  name={account.name}
                  stroke={colorForAccount(i)}
                  strokeWidth={2}
                  dot={{ r: 4, fill: colorForAccount(i), strokeWidth: 0 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
              {goals.map((goal) => (
                <ReferenceLine
                  key={goal.id}
                  y={goal.target_amount_cents / 100}
                  stroke={GOAL_LINE_COLOR}
                  strokeDasharray="4 4"
                  label={{ value: goal.name, position: "insideTopRight", fill: "var(--text-dim)", fontSize: 11 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-state">No balance entries yet — add an account and a snapshot below to see your chart.</div>
        )}
      </div>

      <h2>Accounts</h2>

      <form className="card" onSubmit={addAccount}>
        <div className="field">
          <label htmlFor="acct-name">Account name</label>
          <input id="acct-name" type="text" name="name" placeholder="e.g. Fidelity 401k" required />
        </div>
        <div className="field">
          <label htmlFor="acct-type">Account type</label>
          <input id="acct-type" type="text" name="account_type" placeholder="e.g. 401k, brokerage, IRA" />
        </div>
        <div className="field">
          <label htmlFor="acct-notes">Notes</label>
          <textarea id="acct-notes" name="notes" placeholder="Optional notes" />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit">
            Add account
          </button>
        </div>
      </form>

      {accounts.length === 0 ? (
        <div className="empty-state">No accounts yet — add one above.</div>
      ) : (
        <div className="list">
          {accounts.map((account, i) => {
            const accountEntries = entries
              .filter((e) => e.account_id === account.id)
              .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at));
            return (
              <div className="card" key={account.id}>
                <div className="row-between">
                  <div className="row">
                    <span
                      aria-hidden="true"
                      style={{ width: 10, height: 10, borderRadius: "50%", background: colorForAccount(i), flexShrink: 0 }}
                    />
                    <strong>{account.name}</strong>
                    {account.account_type && <span className="chip">{account.account_type}</span>}
                  </div>
                  <button type="button" className="btn-icon text-danger" onClick={() => removeAccount(account.id)} aria-label={`Delete ${account.name}`}>
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
                {account.notes && <p className="text-dim" style={{ marginTop: 6 }}>{account.notes}</p>}

                <form className="row" style={{ flexWrap: "wrap", marginTop: 12 }} onSubmit={(e) => addEntry(account.id, e)}>
                  <div className="field" style={{ flex: "1 1 140px" }}>
                    <label htmlFor={`date-${account.id}`}>Date</label>
                    <input id={`date-${account.id}`} type="date" name="entry_date" defaultValue={todayIso()} required />
                  </div>
                  <div className="field" style={{ flex: "1 1 120px" }}>
                    <label htmlFor={`balance-${account.id}`}>Balance ($)</label>
                    <input id={`balance-${account.id}`} type="number" step="0.01" name="balance" placeholder="0.00" required />
                  </div>
                  <div className="field" style={{ flex: "1 1 120px" }}>
                    <label htmlFor={`contribution-${account.id}`}>Contribution ($)</label>
                    <input id={`contribution-${account.id}`} type="number" step="0.01" name="contribution" placeholder="0.00" />
                  </div>
                  <div className="field" style={{ flex: "1 1 100%" }}>
                    <label htmlFor={`notes-${account.id}`}>Notes</label>
                    <input id={`notes-${account.id}`} type="text" name="notes" placeholder="Optional notes" />
                  </div>
                  <div className="form-actions" style={{ flex: "1 1 100%" }}>
                    <button className="btn btn-primary" type="submit">
                      Add snapshot
                    </button>
                  </div>
                </form>

                {accountEntries.length === 0 ? (
                  <div className="empty-state">No balance snapshots yet.</div>
                ) : (
                  <div className="list" style={{ marginTop: 10 }}>
                    {accountEntries.map((entry) => (
                      <div className="row-between" key={entry.id}>
                        <div>
                          <div>
                            <strong>{formatDollars(entry.balance_cents)}</strong>{" "}
                            <span className="text-dim">on {entry.entry_date}</span>
                          </div>
                          {entry.contribution_cents !== 0 && (
                            <div className="text-dim">contribution {formatDollars(entry.contribution_cents)}</div>
                          )}
                          {entry.notes && <div className="text-dim">{entry.notes}</div>}
                        </div>
                        <button type="button" className="btn-icon text-danger" onClick={() => removeEntry(entry.id)} aria-label="Delete entry">
                          <X size={18} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <h2>Goals</h2>

      <form className="card" onSubmit={addGoal}>
        <div className="field">
          <label htmlFor="goal-name">Goal name</label>
          <input id="goal-name" type="text" name="name" placeholder="e.g. Retire by 60" required />
        </div>
        <div className="field">
          <label htmlFor="goal-amount">Target amount ($)</label>
          <input id="goal-amount" type="number" step="0.01" name="target_amount" placeholder="0.00" required />
        </div>
        <div className="field">
          <label htmlFor="goal-date">Target date</label>
          <input id="goal-date" type="date" name="target_date" />
        </div>
        <div className="field">
          <label htmlFor="goal-notes">Notes</label>
          <textarea id="goal-notes" name="notes" placeholder="Optional notes" />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit">
            Add goal
          </button>
        </div>
      </form>

      {goals.length === 0 ? (
        <div className="empty-state">No goals yet — add one above.</div>
      ) : (
        <div className="list">
          {goals.map((goal) => (
            <div className="card" key={goal.id}>
              <div className="row-between">
                <div>
                  <strong>{goal.name}</strong>
                  <div className="text-dim">
                    {formatDollars(goal.target_amount_cents)}
                    {goal.target_date ? ` by ${goal.target_date}` : ""}
                  </div>
                  {goal.notes && <div className="text-dim">{goal.notes}</div>}
                </div>
                <button type="button" className="btn-icon text-danger" onClick={() => removeGoal(goal.id)} aria-label={`Delete ${goal.name}`}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
