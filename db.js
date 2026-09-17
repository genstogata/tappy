(() => {
  "use strict";

  const DB_NAME = "tappy-db";
  const DB_VERSION = 1;
  const STORE_KV = "kv";

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
    });
    return dbPromise;
  }

  function transact(mode, work) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KV, mode);
      const store = tx.objectStore(STORE_KV);
      let result;
      try {
        result = work(store);
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    }));
  }

  function getValue(key) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KV, "readonly");
      const req = tx.objectStore(STORE_KV).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
      req.onerror = () => reject(req.error || new Error("IndexedDB read failed"));
    }));
  }

  function setValue(key, value) {
    return transact("readwrite", (store) => {
      store.put({ key, value });
    });
  }

  function removeValue(key) {
    return transact("readwrite", (store) => {
      store.delete(key);
    });
  }

  function bool(value) {
    return value === true;
  }

  window.TappyDB = {
    init: openDb,
    getMeta: getValue,
    setMeta: setValue,
    removeMeta: removeValue,

    loadState: () => getValue("appState"),
    saveState: (state) => setValue("appState", state),

    loadHistory: async () => {
      const rows = await getValue("historyLog");
      return Array.isArray(rows) ? rows : [];
    },
    saveHistory: (rows) => setValue("historyLog", Array.isArray(rows) ? rows : []),

    loadLogSeeded: async () => bool(await getValue("logSeeded")),
    saveLogSeeded: (seeded) => setValue("logSeeded", bool(seeded)),

    loadLock: async () => ({
      pin: String((await getValue("lockPin")) || ""),
      locked: bool(await getValue("locked"))
    }),
    saveLockPin: (pin) => setValue("lockPin", String(pin || "")),
    saveLocked: (locked) => setValue("locked", bool(locked)),

    loadLastImportKeys: async () => {
      const keys = await getValue("lastImportKeys");
      return Array.isArray(keys) ? keys.filter(k => typeof k === "string") : [];
    },
    saveLastImportKeys: (keys) => setValue("lastImportKeys", Array.isArray(keys) ? keys.filter(k => typeof k === "string") : []),
  };
})();
