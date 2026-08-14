import { randomUUID } from 'node:crypto';
import Store from 'electron-store';
import type { QueueItem } from '../shared/types.js';

const store = new Store<{ items: QueueItem[] }>({
  name: 'reporter-queue',
  defaults: { items: [] },
});

export function listQueue(): QueueItem[] {
  return store.get('items');
}

export function addItem(partial: Omit<QueueItem, 'id' | 'status' | 'createdAt'>): QueueItem {
  const item: QueueItem = {
    ...partial,
    id: randomUUID(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  store.set('items', [item, ...store.get('items')]);
  return item;
}

export function updateItem(id: string, patch: Partial<QueueItem>): void {
  store.set(
    'items',
    store.get('items').map((i) => (i.id === id ? { ...i, ...patch } : i)),
  );
}

export function removeItem(id: string): void {
  store.set(
    'items',
    store.get('items').filter((i) => i.id !== id),
  );
}
