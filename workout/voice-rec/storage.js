// מאגר נפרד במכשיר; אינו קורא או כותב את נתוני האימונים.
export async function openRecordings() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('kidfit-voice-recordings', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('clips', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  return {
    all: () => new Promise((resolve, reject) => {
      const request = db.transaction('clips').objectStore('clips').getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    }),
    save: clip => new Promise((resolve, reject) => {
      const tx = db.transaction('clips', 'readwrite'); tx.objectStore('clips').put(clip);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    }),
  };
}
