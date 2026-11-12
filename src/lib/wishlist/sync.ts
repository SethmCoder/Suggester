import type { WishlistCollection, WishlistItem, WishlistItemInput } from "./types";
import * as store from "./store";

function mergeById<T extends { id: string }>(remote: T[], local: T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of local) byId.set(row.id, row);
  for (const row of remote) byId.set(row.id, row);
  return [...byId.values()];
}

export async function loadWishlist(): Promise<{
  collections: WishlistCollection[];
  items: WishlistItem[];
  source: "remote" | "local" | "merged";
}> {
  const local = {
    collections: store.listCollections(),
    items: store.listItems(),
  };
  try {
    const res = await fetch("/api/wishlist");
    if (!res.ok) return { ...local, source: "local" };
    const data = (await res.json()) as {
      offline?: boolean;
      collections?: WishlistCollection[];
      items?: WishlistItem[];
    };
    if (data.offline || !data.collections || !data.items) {
      return { ...local, source: "local" };
    }
    const collections = mergeById(data.collections, local.collections);
    const items = mergeById(data.items, local.items);
    store.replaceWishlistState({ collections, items });
    return {
      collections,
      items,
      source: data.collections.length || data.items.length ? "merged" : "local",
    };
  } catch {
    return { ...local, source: "local" };
  }
}

export async function saveWishlistItem(input: WishlistItemInput): Promise<WishlistItem> {
  const local = store.upsertItem(input);
  void import("@/lib/intelligence/sync")
    .then(({ postIntelligenceSignal }) =>
      postIntelligenceSignal({
        type: "wishlist_save",
        category: input.category,
        location: input.location,
        name: input.name,
      }),
    )
    .catch(() => undefined);

  let saved = local;
  try {
    const res = await fetch("/api/wishlist/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) {
      const data = (await res.json()) as { offline?: boolean; item?: WishlistItem };
      if (data.item && !data.offline) {
        store.updateItem(local.id, data.item);
        if (data.item.id !== local.id) {
          store.removeItem(local.id);
          store.replaceWishlistState({
            collections: store.listCollections(),
            items: [
              data.item,
              ...store.listItems().filter((item) => item.id !== data.item!.id),
            ],
          });
        }
        saved = data.item;
      }
    }
  } catch {
    /* keep local */
  }

  try {
    const { ensureFutureTripForWishlistItem } = await import(
      "@/lib/wishlist/future-link"
    );
    await ensureFutureTripForWishlistItem(saved);
  } catch {
    /* offline */
  }
  return store.getItem(saved.id) ?? saved;
}

export async function patchWishlistItem(
  id: string,
  patch: Partial<WishlistItemInput>,
): Promise<WishlistItem | null> {
  const local = store.updateItem(id, patch);
  try {
    await fetch("/api/wishlist/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  } catch {
    /* local already updated */
  }
  return local;
}

export async function deleteWishlistItem(id: string) {
  const existing = store.listItems().find((item) => item.id === id);
  store.removeItem(id);
  if (existing) {
    void import("@/lib/intelligence/sync")
      .then(({ postIntelligenceSignal }) =>
        postIntelligenceSignal({
          type: "wishlist_remove",
          category: existing.category,
        }),
      )
      .catch(() => undefined);
  }
  try {
    await fetch(`/api/wishlist/items?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    /* local already removed */
  }
}

export async function saveCollection(input: {
  name: string;
  description?: string;
}): Promise<WishlistCollection> {
  const local = store.createCollection(input);
  try {
    const res = await fetch("/api/wishlist/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return local;
    const data = (await res.json()) as { offline?: boolean; collection?: WishlistCollection };
    if (data.offline || !data.collection) return local;
    store.replaceWishlistState({
      collections: [
        data.collection,
        ...store.listCollections().filter((c) => c.id !== local.id),
      ],
      items: store.listItems(),
    });
    return data.collection;
  } catch {
    return local;
  }
}

export async function removeCollection(id: string) {
  store.deleteCollection(id);
  try {
    await fetch(`/api/wishlist/collections?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch {
    /* local already removed */
  }
}
