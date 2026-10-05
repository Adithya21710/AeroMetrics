/**
 * Hybrid Fast Dataset Storage Manager
 * 1. Disk Mode: Connects to local server (/api/datasets) when run locally.
 * 2. Static / AWS Amplify Mode: Reads metadata from data/manifest.json instantly, loads CSV on demand.
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
    this.cache = new Map();
  }

  async init() {
    // 1. Non-blocking check for local server
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 800);
      const res = await fetch('/api/datasets', { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
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

      try {
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
      } catch (err) {
        resolve(this);
      }
    });
  }

  /**
   * Fast metadata listing (does NOT block or download all CSV files simultaneously)
   */
  async listDatasets() {
    const map = new Map();

    // 1. Local Server mode (Disk /data/ folder)
    if (this.isServerActive) {
      try {
        const res = await fetch('/api/datasets');
        if (res.ok) {
          const serverDatasets = await res.json();
          serverDatasets.forEach(d => {
            map.set(d.id, d);
            if (d.csvContent) this.cache.set(d.id, d);
          });
        }
      } catch (e) {
        console.warn('Could not fetch server datasets:', e);
      }
    } else {
      // 2. AWS Amplify / Static Hosting mode (fetch manifest.json metadata instantly)
      try {
        const res = await fetch('./data/manifest.json');
        if (res.ok) {
          const manifest = await res.json();
          manifest.forEach(item => {
            const cached = this.cache.get(item.id);
            map.set(item.id, {
              id: item.id,
              filename: item.filename,
              name: item.name,
              path: item.path,
              csvContent: cached ? cached.csvContent : null,
              rowCount: cached ? cached.rowCount : 0,
              createdAt: item.createdAt || new Date().toISOString(),
              isDefault: !!item.isDefault,
              source: 'hosted'
            });
          });
        }
      } catch (e) {
        // Fallback if manifest is not present
      }
    }

    // 3. User's local browser storage (IndexedDB)
    try {
      const localDatasets = await this.listFromLocalDB();
      localDatasets.forEach(d => {
        if (!map.has(d.id)) {
          map.set(d.id, d);
        }
        if (d.csvContent) this.cache.set(d.id, d);
      });
    } catch (e) {
      console.warn('IndexedDB read fallback:', e);
    }

    const combined = Array.from(map.values());
    const getCleanName = (name) => (name || '').replace(/^PAX Data 2025-26\s*—\s*/i, '').trim();
    combined.sort((a, b) => getCleanName(a.name).localeCompare(getCleanName(b.name)));
    return combined;
  }

  /**
   * Fetch and load a specific dataset on-demand
   */
  async getDataset(id) {
    if (!id) return null;

    if (this.cache.has(id) && this.cache.get(id).csvContent) {
      return this.cache.get(id);
    }

    const datasets = await this.listDatasets();
    let ds = datasets.find(d => d.id === id);
    if (!ds) return null;

    // If CSV content is already present
    if (ds.csvContent) {
      this.cache.set(id, ds);
      return ds;
    }

    // If hosted on AWS/Azure, fetch the CSV file on-demand
    if (ds.path) {
      try {
        const fileRes = await fetch(encodeURI(ds.path));
        if (fileRes.ok) {
          const csvContent = await fileRes.text();
          const parseRes = AirlineCSVParser.parse(csvContent);
          ds.csvContent = csvContent;
          ds.rowCount = parseRes.routes.length;
          this.cache.set(id, ds);
          return ds;
        }
      } catch (err) {
        console.error(`Failed to load CSV content for ${ds.name}:`, err);
      }
    }

    return ds;
  }

  /**
   * Loads unique market corridors across all available datasets (parallelized with caching & deduplication)
   */
  async getAllDatasetsRoutes() {
    if (this._cachedAllRoutes && this._cachedAllRoutes.length > 0) {
      return this._cachedAllRoutes;
    }

    const datasets = await this.listDatasets();
    const marketMap = new Map(); // Canonical key: "A|B" sorted

    const fetchPromises = datasets.map(async (dsInfo) => {
      const fullDs = await this.getDataset(dsInfo.id);
      if (fullDs && fullDs.csvContent) {
        try {
          const parsed = AirlineCSVParser.parse(fullDs.csvContent);
          const shortName = fullDs.name.replace(/^PAX Data 2025-26\s*—\s*/i, '');
          return {
            id: fullDs.id,
            shortName,
            routes: parsed.routes
          };
        } catch (e) {
          return null;
        }
      }
      return null;
    });

    const results = await Promise.all(fetchPromises);
    results.forEach(dsData => {
      if (!dsData || !dsData.routes) return;
      dsData.routes.forEach(r => {
        const minCode = r.origin < r.destination ? r.origin : r.destination;
        const maxCode = r.origin < r.destination ? r.destination : r.origin;
        const canonicalKey = `${minCode}|${maxCode}`;

        if (!marketMap.has(canonicalKey)) {
          marketMap.set(canonicalKey, {
            ...r,
            canonicalKey,
            sourceDatasetIds: [dsData.id],
            sourceSheetsList: [dsData.shortName],
            sourceDatasetName: dsData.shortName
          });
        } else {
          // Corridor recorded in another regional sheet (e.g. intercontinental route between Europe and US)
          const existing = marketMap.get(canonicalKey);
          if (!existing.sourceDatasetIds.includes(dsData.id)) {
            existing.sourceDatasetIds.push(dsData.id);
            existing.sourceSheetsList.push(dsData.shortName);
            existing.sourceDatasetName = existing.sourceSheetsList.join(', ');
          }
          // Preserve metrics (do not double sum as both sheets record the same two-way market)
        }
      });
    });

    const allRoutes = Array.from(marketMap.values());
    this._cachedAllRoutes = allRoutes;
    return allRoutes;
  }

  /**
   * Save dataset (user upload)
   */
  async saveDataset(name, csvContent, isDefault = false, filename = '') {
    const parseResult = AirlineCSVParser.parse(csvContent);
    const cleanFilename = filename || (name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '.csv');
    const id = isDefault ? 'pax-indian-subcon-2025-26' : (this.isServerActive ? 'disk-' + cleanFilename : 'ds-' + Date.now());

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
    this.cache.set(id, dataset);
    return dataset;
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
        try {
          const tx = this.db.transaction(this.storeName, 'readwrite');
          const store = tx.objectStore(this.storeName);
          store.delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) {
          resolve();
        }
      });
    }

    this.cache.delete(id);

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
    return localStorage.getItem(this.activeDatasetIdKey) || 'pax-indian-subcon-2025-26';
  }

  setActiveDatasetId(id) {
    localStorage.setItem(this.activeDatasetIdKey, id);
  }

  async saveToLocalDB(dataset) {
    if (!this.db) return;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.put(dataset);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  async listFromLocalDB() {
    if (!this.db) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }
}

window.datasetStorage = new DatasetStorage();
