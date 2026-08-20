import { useEffect, useMemo, useState } from "react";
import { api, type ShoppingItem, type ShoppingList } from "../api/client";

export default function Shopping() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const [newListName, setNewListName] = useState("");
  const [showNewList, setShowNewList] = useState(false);

  const [itemName, setItemName] = useState("");
  const [itemQuantity, setItemQuantity] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getShopping();
      setLists(data.lists);
      setItems(data.items);
      setSelectedListId((prev) => prev ?? data.lists[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }

  const listItems = useMemo(
    () =>
      items
        .filter((i) => i.list_id === selectedListId)
        .sort((a, b) => {
          if (a.checked !== b.checked) return a.checked ? 1 : -1;
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return a.created_at.localeCompare(b.created_at);
        }),
    [items, selectedListId]
  );

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newListName.trim();
    if (!trimmed) return;
    const list = await api.createShoppingList(trimmed);
    setLists((prev) => [...prev, list]);
    setSelectedListId(list.id);
    setNewListName("");
    setShowNewList(false);
  }

  async function removeList(id: string) {
    await api.deleteShoppingList(id);
    setLists((prev) => prev.filter((l) => l.id !== id));
    setItems((prev) => prev.filter((i) => i.list_id !== id));
    setSelectedListId((prev) => (prev === id ? null : prev));
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = itemName.trim();
    if (!trimmed || !selectedListId) return;
    setItemName("");
    setItemQuantity("");
    const item = await api.createShoppingItem({ list_id: selectedListId, name: trimmed, quantity: itemQuantity.trim() });
    setItems((prev) => [...prev, item]);
  }

  async function toggleChecked(item: ShoppingItem) {
    const updated = await api.checkShoppingItem(item.id, !item.checked);
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
  }

  async function removeItem(id: string) {
    await api.deleteShoppingItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div>
      <h1>Shopping Lists</h1>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <>
          <div className="tabs" style={{ flexWrap: "wrap" }}>
            {lists.map((list) => (
              <button
                key={list.id}
                type="button"
                className={`tab ${selectedListId === list.id ? "active" : ""}`}
                onClick={() => setSelectedListId(list.id)}
              >
                {list.name}
              </button>
            ))}
            <button type="button" className="tab" onClick={() => setShowNewList((v) => !v)}>
              + New list
            </button>
          </div>

          {showNewList && (
            <form className="quick-add" onSubmit={createList}>
              <input
                type="text"
                placeholder="List name…"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn btn-primary">
                Create
              </button>
            </form>
          )}

          {lists.length === 0 ? (
            <div className="empty-state">No shopping lists yet — create one above.</div>
          ) : !selectedListId ? (
            <div className="empty-state">Select a list.</div>
          ) : (
            <>
              <div className="row-between" style={{ marginBottom: 4 }}>
                <span className="text-dim" style={{ fontSize: 13 }}>
                  {lists.find((l) => l.id === selectedListId)?.name}
                </span>
                <button type="button" className="btn-icon text-danger" onClick={() => removeList(selectedListId)} aria-label="Delete list">
                  ✕
                </button>
              </div>

              <form className="quick-add" onSubmit={addItem}>
                <input type="text" placeholder="Add item…" value={itemName} onChange={(e) => setItemName(e.target.value)} />
                <input
                  type="text"
                  placeholder="Qty"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(e.target.value)}
                  style={{ maxWidth: 90 }}
                />
                <button type="submit" className="btn btn-primary">
                  Add
                </button>
              </form>

              {listItems.length === 0 ? (
                <div className="empty-state">No items yet — add one above.</div>
              ) : (
                <div className="list">
                  {listItems.map((item) => (
                    <div className="card row-between" key={item.id}>
                      <div className="row">
                        <button
                          type="button"
                          className={`checkbox-btn ${item.checked ? "checked" : ""}`}
                          onClick={() => toggleChecked(item)}
                          aria-label={item.checked ? "Mark item unchecked" : "Mark item checked"}
                        />
                        <span className={item.checked ? "text-strike" : ""}>{item.name}</span>
                        {item.quantity && <span className="text-dim">{item.quantity}</span>}
                      </div>
                      <button type="button" className="btn-icon" onClick={() => removeItem(item.id)} aria-label="Delete item">
                        ✕
                      </button>
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
