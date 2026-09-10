import { ChatMessage } from '../types';

const DB_NAME = 'cipherchat_p2p_v1';
const DB_VERSION = 1;
const STORE_NAME = 'messages';

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('burnExpiresAt', 'burnExpiresAt', { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export const LocalStorageService = {
  /**
   * Save a message locally
   */
  async saveMessage(message: ChatMessage, ghostMode = false): Promise<void> {
    if (ghostMode) return; // Do not persist in ghost mode

    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(message);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.error('Failed to save message to IndexedDB:', e);
    }
  },

  /**
   * Load all saved messages for local device
   */
  async loadMessages(): Promise<ChatMessage[]> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const now = Date.now();
          const messages = (request.result as ChatMessage[]) || [];
          // Filter out expired burned messages
          const valid = messages.filter(msg => !msg.burnExpiresAt || msg.burnExpiresAt > now);
          resolve(valid.sort((a, b) => a.timestamp - b.timestamp));
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      return [];
    }
  },

  /**
   * Remove a specific message (e.g. upon burn countdown)
   */
  async deleteMessage(id: string): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
    } catch (e) {
      console.error('Failed to delete message:', e);
    }
  },

  /**
   * Emergency Panic Wipe: Purges all local databases, localStorage, sessionStorage
   */
  async emergencyWipe(): Promise<void> {
    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
    }

    try {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    } catch {
      // Continue wiping
    }

    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
  }
};
