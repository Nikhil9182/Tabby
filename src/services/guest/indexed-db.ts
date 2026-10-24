// src/services/guest/indexed-db.ts
// Robust, typed IndexedDB storage wrapper for Tabby Guest Mode.

export const GUEST_DB_NAME = 'tabby_guest_db';
export const GUEST_DB_VERSION = 1;

export const STORES = {
  META: 'meta',
  FRIENDS: 'friends',
  FRIENDSHIPS: 'friendships',
  GROUPS: 'groups',
  GROUP_MEMBERS: 'group_members',
  EXPENSES: 'expenses',
  EXPENSE_SPLITS: 'expense_splits',
  SETTLEMENTS: 'settlements',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openGuestDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(GUEST_DB_NAME, GUEST_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Meta (Key-value store)
      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'key' });
      }

      // 2. Friends
      if (!db.objectStoreNames.contains(STORES.FRIENDS)) {
        const store = db.createObjectStore(STORES.FRIENDS, { keyPath: 'id' });
        store.createIndex('email', 'email', { unique: false });
      }

      // 3. Friendships
      if (!db.objectStoreNames.contains(STORES.FRIENDSHIPS)) {
        const store = db.createObjectStore(STORES.FRIENDSHIPS, { keyPath: 'id' });
        store.createIndex('userId1', 'userId1', { unique: false });
        store.createIndex('userId2', 'userId2', { unique: false });
      }

      // 4. Groups
      if (!db.objectStoreNames.contains(STORES.GROUPS)) {
        const store = db.createObjectStore(STORES.GROUPS, { keyPath: 'id' });
        store.createIndex('createdBy', 'createdBy', { unique: false });
      }

      // 5. Group Members
      if (!db.objectStoreNames.contains(STORES.GROUP_MEMBERS)) {
        const store = db.createObjectStore(STORES.GROUP_MEMBERS, { keyPath: 'id' });
        store.createIndex('groupId', 'groupId', { unique: false });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('groupUser', ['groupId', 'userId'], { unique: true });
      }

      // 6. Expenses
      if (!db.objectStoreNames.contains(STORES.EXPENSES)) {
        const store = db.createObjectStore(STORES.EXPENSES, { keyPath: 'id' });
        store.createIndex('groupId', 'groupId', { unique: false });
        store.createIndex('contextType', 'contextType', { unique: false });
        store.createIndex('paidBy', 'paidBy', { unique: false });
        store.createIndex('expenseDate', 'expenseDate', { unique: false });
      }

      // 7. Expense Splits
      if (!db.objectStoreNames.contains(STORES.EXPENSE_SPLITS)) {
        const store = db.createObjectStore(STORES.EXPENSE_SPLITS, { keyPath: 'id' });
        store.createIndex('groupExpenseId', 'groupExpenseId', { unique: false });
        store.createIndex('userId', 'userId', { unique: false });
      }

      // 8. Settlements
      if (!db.objectStoreNames.contains(STORES.SETTLEMENTS)) {
        const store = db.createObjectStore(STORES.SETTLEMENTS, { keyPath: 'id' });
        store.createIndex('groupId', 'groupId', { unique: false });
        store.createIndex('contextType', 'contextType', { unique: false });
        store.createIndex('fromUserId', 'fromUserId', { unique: false });
        store.createIndex('toUserId', 'toUserId', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

export async function getRecord<T>(storeName: StoreName, key: IDBValidKey): Promise<T | null> {
  const db = await openGuestDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllRecords<T>(storeName: StoreName): Promise<T[]> {
  const db = await openGuestDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function putRecord<T>(storeName: StoreName, value: T): Promise<void> {
  const db = await openGuestDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRecord(storeName: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openGuestDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearStore(storeName: StoreName): Promise<void> {
  const db = await openGuestDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllGuestStores(): Promise<void> {
  const stores = Object.values(STORES);
  for (const store of stores) {
    try {
      await clearStore(store);
    } catch {
      // Continue clearing others even if one store fails
    }
  }
}

/** Resets connection, used in tests */
export function closeGuestDB(): void {
  if (dbPromise) {
    dbPromise.then((db) => db.close()).catch(() => {});
    dbPromise = null;
  }
}
