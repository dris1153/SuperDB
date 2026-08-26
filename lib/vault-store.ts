/**
 * Keeps the unlocked vault key alive across page reloads.
 *
 * IndexedDB rather than localStorage or sessionStorage: structured clone stores a `CryptoKey` object
 * directly, and a non-extractable key cannot be read back out as bytes. Script on this origin can
 * still *use* it while the vault is unlocked — that is true of every in-browser password manager and
 * is why the entry expires.
 */

const DB_NAME = "superdb-vault";
const STORE = "keys";
const RECORD_ID = "vault-key";
const MAX_AGE_MS = 8 * 60 * 60 * 1000;

type Stored = { id: string; key: CryptoKey; storedAt: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(store: IDBObjectStore, request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    void store;
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>) {
  const db = await openDb();
  try {
    return await fn(db.transaction(STORE, mode).objectStore(STORE));
  } finally {
    db.close();
  }
}

export async function rememberKey(key: CryptoKey): Promise<void> {
  try {
    await withStore("readwrite", (store) =>
      run(store, store.put({ id: RECORD_ID, key, storedAt: Date.now() } satisfies Stored)),
    );
  } catch {
    // Private browsing and blocked site data both throw here. The vault still works for this page.
  }
}

export async function recallKey(): Promise<CryptoKey | null> {
  try {
    const stored = await withStore("readonly", (store) =>
      run<Stored | undefined>(store, store.get(RECORD_ID)),
    );
    if (!stored) return null;
    if (Date.now() - stored.storedAt > MAX_AGE_MS) {
      await forgetKey();
      return null;
    }
    return stored.key;
  } catch {
    return null;
  }
}

export async function forgetKey(): Promise<void> {
  try {
    await withStore("readwrite", (store) => run(store, store.delete(RECORD_ID)));
  } catch {
    // Nothing to clean up if the store was never reachable.
  }
}
