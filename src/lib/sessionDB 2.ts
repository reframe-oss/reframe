const DB_NAME = "reframe-session";
const STORE_NAME = "files";

export async function saveSessionFile(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(file, "currentVideo");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
}

export async function loadSessionFile(): Promise<File | null> {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.close();
          return resolve(null);
        }
        const tx = db.transaction(STORE_NAME, "readonly");
        const getReq = tx.objectStore(STORE_NAME).get("currentVideo");
        getReq.onsuccess = () => {
          db.close();
          resolve(getReq.result || null);
        };
        getReq.onerror = () => reject(getReq.error);
      };
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
}

export async function clearSessionFile(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.close();
          return resolve();
        }
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
}
