/**
 * Hybrid Dataset Storage Manager
 * 1. Disk Mode: Connects to local server (/api/datasets) when run locally.
 * 2. Static / AWS Amplify Mode: Fetches all bundled CSV files from data/manifest.json for all web visitors.
 * 3. Offline Mode: IndexedDB client-side database.
 */

class DatasetStorage {
  constructor() {
    this.dbName = 'AeroMetricsAnalyticsDB';
    this.dbVersion = 3;
    this.storeName = 'datasets';
    this.db = null;
    this.activeDatasetIdKey = 'active_aerometrics_dataset_id';
    this.isServerActive = false;
  }

  async init() {
    // 1. Check if local Python API server is running
    try {
      const res = await fetch('/api/datasets', { method: 'GET' });
      if (res.ok) {
        this.isServerActive = true;
      }
    } catch (e) {
      this.isServerActive = false;
    }

    // 2. Initialize IndexedDB
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(this);
        return;
      }

      const request = window.indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this);
      };

      request.onerror = () => {
        resolve(this);
      };
    });
  }

  /**
   * List all datasets from server disk, static manifest (AWS Amplify), and local IndexedDB
   */
  async listDatasets() {
    const map = new Map();

    // 1. Local Server mode (Disk /data/ folder)
    if (this.isServerActive) {
      try {
        const res = await fetch('/api/datasets');
        if (res.ok) {
          const serverDatasets = await res.json();
          serverDatasets.forEach(d => map.set(d.id, d));
        }
      } catch (e) {
        console.warn('Could not fetch server datasets:', e);
      }
    } else {
      // 2. AWS Amplify / Static Hosting mode (fetch bundled CSVs from manifest.json)
      try {
        const res = await fetch('./data/manifest.json');
        if (res.ok) {
          const manifest = await res.json();
          for (const item of manifest) {
            try {
              const fileRes = await fetch(encodeURI(item.path));
              if (fileRes.ok) {
                const csvContent = await fileRes.text();
                const parseRes = AirlineCSVParser.parse(csvContent);
                map.set(item.id, {
                  id: item.id,
                  filename: item.filename,
                  name: item.name,
                  csvContent: csvContent,
                  rowCount: parseRes.routes.length,
                  createdAt: new Date().toISOString(),
                  isDefault: !!item.isDefault,
                  source: 'hosted'
                });
              }
            } catch (err) {
              console.warn(`Could not load manifest item: ${item.filename}`);
            }
          }
        }
      } catch (e) {
        // Fallback if manifest is not present
      }
    }

    // 3. User's local browser storage (IndexedDB)
    const localDatasets = await this.listFromLocalDB();
    localDatasets.forEach(d => {
      if (!map.has(d.id)) {
        map.set(d.id, d);
      }
    });

    const combined = Array.from(map.values());
    combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return combined;
  }

  /**
   * Save dataset
   */
  async saveDataset(name, csvContent, isDefault = false, filename = '') {
    const parseResult = AirlineCSVParser.parse(csvContent);
    const cleanFilename = filename || (name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '.csv');
    const id = isDefault ? 'pacific-routes-2026' : (this.isServerActive ? 'disk-' + cleanFilename : 'ds-' + Date.now());

    const dataset = {
      id,
      filename: cleanFilename,
      name: name || 'Route Dataset ' + new Date().toLocaleDateString(),
      csvContent,
      rowCount: parseResult.routes.length,
      headers: parseResult.headers,
      createdAt: new Date().toISOString(),
      isDefault: isDefault,
      source: this.isServerActive ? 'disk' : 'local'
    };

    if (this.isServerActive && !isDefault) {
      try {
        await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: cleanFilename,
            label: name,
            content: csvContent
          })
        });
      } catch (e) {
        console.warn('Failed to save to server disk:', e);
      }
    }

    await this.saveToLocalDB(dataset);
    return dataset;
  }

  async getDataset(id) {
    if (!id) return null;
    const datasets = await this.listDatasets();
    return datasets.find(d => d.id === id) || null;
  }

  async deleteDataset(id) {
    const ds = await this.getDataset(id);
    if (this.isServerActive && ds && ds.filename) {
      try {
        await fetch('/api/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: ds.filename })
        });
      } catch (e) {
        console.warn('Failed to delete on server:', e);
      }
    }

    if (this.db) {
      await new Promise((resolve) => {
        const tx = this.db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.delete(id);
        tx.oncomplete = () => resolve();
      });
    }

    if (this.getActiveDatasetId() === id) {
      const remaining = await this.listDatasets();
      if (remaining.length > 0) {
        this.setActiveDatasetId(remaining[0].id);
      } else {
        localStorage.removeItem(this.activeDatasetIdKey);
      }
    }
  }

  getActiveDatasetId() {
    return localStorage.getItem(this.activeDatasetIdKey) || 'pacific-routes-2026';
  }

  setActiveDatasetId(id) {
    localStorage.setItem(this.activeDatasetIdKey, id);
  }

  async saveToLocalDB(dataset) {
    if (!this.db) return;
    return new Promise((resolve) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put(dataset);
      tx.oncomplete = () => resolve();
    });
  }

  async listFromLocalDB() {
    if (!this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }
}

window.datasetStorage = new DatasetStorage();
