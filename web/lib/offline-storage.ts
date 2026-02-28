/**
 * Offline storage using IndexedDB for caching user progress and data
 */

const DB_NAME = "mathbot_offline";
const DB_VERSION = 1;
const STORE_PROGRESS = "progress";
const STORE_CACHE = "cache";

interface ProgressEntry {
  taskId: number;
  status: string;
  timestamp: number;
}

interface CacheEntry {
  key: string;
  data: any;
  timestamp: number;
  ttl: number;
}

class OfflineStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create progress store
        if (!db.objectStoreNames.contains(STORE_PROGRESS)) {
          const progressStore = db.createObjectStore(STORE_PROGRESS, { keyPath: "taskId" });
          progressStore.createIndex("timestamp", "timestamp", { unique: false });
        }

        // Create cache store
        if (!db.objectStoreNames.contains(STORE_CACHE)) {
          const cacheStore = db.createObjectStore(STORE_CACHE, { keyPath: "key" });
          cacheStore.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
    });
  }

  async saveProgress(taskId: number, status: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_PROGRESS], "readwrite");
      const store = transaction.objectStore(STORE_PROGRESS);
      const entry: ProgressEntry = {
        taskId,
        status,
        timestamp: Date.now(),
      };
      const request = store.put(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getProgress(taskId: number): Promise<ProgressEntry | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_PROGRESS], "readonly");
      const store = transaction.objectStore(STORE_PROGRESS);
      const request = store.get(taskId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async getAllProgress(): Promise<ProgressEntry[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_PROGRESS], "readonly");
      const store = transaction.objectStore(STORE_PROGRESS);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async saveCache(key: string, data: any, ttl: number = 3600000): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_CACHE], "readwrite");
      const store = transaction.objectStore(STORE_CACHE);
      const entry: CacheEntry = {
        key,
        data,
        timestamp: Date.now(),
        ttl,
      };
      const request = store.put(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getCache(key: string): Promise<any | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_CACHE], "readonly");
      const store = transaction.objectStore(STORE_CACHE);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > entry.ttl) {
          // Delete expired entry
          this.deleteCache(key);
          resolve(null);
          return;
        }

        resolve(entry.data);
      };
    });
  }

  async deleteCache(key: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_CACHE], "readwrite");
      const store = transaction.objectStore(STORE_CACHE);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clearExpiredCache(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_CACHE], "readwrite");
      const store = transaction.objectStore(STORE_CACHE);
      const index = store.index("timestamp");
      const request = index.openCursor();

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor) {
          resolve();
          return;
        }

        const entry = cursor.value as CacheEntry;
        if (Date.now() - entry.timestamp > entry.ttl) {
          cursor.delete();
        }
        cursor.continue();
      };
    });
  }
}

export const offlineStorage = new OfflineStorage();

// Initialize on module load
if (typeof window !== "undefined") {
  offlineStorage.init().catch(console.error);
}

