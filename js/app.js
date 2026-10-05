/**
 * Main Application Orchestrator
 * Coordinates dataset storage, filtering, views, and events.
 */

class AirlineAnalyticsApp {
  constructor() {
    this.currentDataset = null;
    this.allRoutes = [];
    this.filteredRoutes = [];
    this.activeTab = 'overview';
    this.filters = {
      origin: '',
      destination: '',
      haulType: '',
      search: ''
    };
  }

  async init() {
    this.setupTheme();
    this.bindEvents(); // Bind buttons/tabs FIRST so everything is immediately clickable

    try {
      await window.datasetStorage.init();
    } catch (e) {
      console.warn('Storage init fallback:', e);
    }

    try {
      await this.populateDatasetSelector();
      const datasets = await window.datasetStorage.listDatasets();
      if (datasets.length > 0) {
        const activeId = window.datasetStorage.getActiveDatasetId();
        let activeDs = null;
        if (activeId) {
          activeDs = await window.datasetStorage.getDataset(activeId);
        }
        if (!activeDs && datasets.length > 0) {
          activeDs = await window.datasetStorage.getDataset(datasets[0].id);
        }
        if (activeDs) {
          this.loadDataset(activeDs);
        } else {
          await this.loadDefaultDataset();
        }
      } else {
        await this.loadDefaultDataset();
      }
    } catch (err) {
      console.error('Initialization dataset loading error:', err);
      await this.loadDefaultDataset();
    }

    this.renderDatasetList();
  }

  async populateDatasetSelector() {
    const select = document.getElementById('globalDatasetSelect');
    if (!select) return;

    try {
      const datasets = await window.datasetStorage.listDatasets();
      const activeId = window.datasetStorage.getActiveDatasetId();

      select.innerHTML = '';
      datasets.forEach(ds => {
        const opt = document.createElement('option');
        opt.value = ds.id;
        opt.textContent = ds.name;
        if (ds.id === activeId) opt.selected = true;
        select.appendChild(opt);
      });

      select.onchange = async (e) => {
        const selectedId = e.target.value;
        if (!selectedId) return;
        this.setLoadingState(true);
        this.showToast('Loading dataset...', 'info');

        try {
          // Reset origin/dest filters when switching datasets so new continent's routes are not filtered out
          this.resetFiltersSilent();

          const ds = await window.datasetStorage.getDataset(selectedId);
          if (ds) {
            this.loadDataset(ds, true);
            this.renderDatasetList();
            this.showToast(`Loaded "${ds.name}" (${ds.rowCount || this.allRoutes.length} routes)`, 'success');
          }
        } catch (err) {
          console.error('Failed to load dataset:', err);
          this.showToast(`Error: ${err.message}`, 'error');
        } finally {
          this.setLoadingState(false);
        }
      };
    } catch (e) {
      console.warn('Failed to populate dataset selector:', e);
    }
  }

  setLoadingState(isLoading) {
    const icon = document.getElementById('refreshIcon');
    const btn = document.getElementById('refreshDatasetBtn');
    const select = document.getElementById('globalDatasetSelect');

    if (icon) {
      if (isLoading) {
        icon.classList.add('animate-spin');
      } else {
        icon.classList.remove('animate-spin');
      }
    }
    if (btn) btn.disabled = isLoading;
    if (select) select.disabled = isLoading;
  }

  async refreshCurrentDataset() {
    this.setLoadingState(true);
    this.showToast('Refreshing dataset...', 'info');

    try {
      const activeId = window.datasetStorage.getActiveDatasetId();
      if (activeId) {
        // Clear memory cache to ensure fresh read
        window.datasetStorage.cache.delete(activeId);
        const ds = await window.datasetStorage.getDataset(activeId);
        if (ds) {
          this.resetFiltersSilent();
          this.loadDataset(ds, true);
          this.renderDatasetList();
          this.showToast(`Refreshed "${ds.name}" (${this.allRoutes.length} routes)`, 'success');
        }
      }
    } catch (err) {
      console.error('Failed to refresh dataset:', err);
      this.showToast(`Refresh failed: ${err.message}`, 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  async loadDefaultDataset() {
    try {
      const defaultId = 'pax-indian-subcon-2025-26';
      let ds = await window.datasetStorage.getDataset(defaultId);
      if (ds) {
        this.loadDataset(ds, true);
        return;
      }
      const response = await fetch('./data/PAX_DATA_2025-26 - Indian Subcon.csv');
      if (response.ok) {
        const csvText = await response.text();
        const dataset = await window.datasetStorage.saveDataset('PAX Data 2025-26 — Indian Subcontinent', csvText, true, 'PAX_DATA_2025-26 - Indian Subcon.csv');
        this.loadDataset(dataset, true);
      }
    } catch (e) {
      console.warn('Fallback loading default dataset:', e);
    }
  }

  loadDataset(dataset, isDatasetSwitch = false) {
    if (!dataset || !dataset.csvContent) return;
    this.currentDataset = dataset;
    window.datasetStorage.setActiveDatasetId(dataset.id);

    // Sync global dropdown on landing page
    const globalSelect = document.getElementById('globalDatasetSelect');
    if (globalSelect && globalSelect.value !== dataset.id) {
      globalSelect.value = dataset.id;
    }

    try {
      const parseResult = AirlineCSVParser.parse(dataset.csvContent);
      this.allRoutes = parseResult.routes;
      this.filteredRoutes = [...this.allRoutes];

      const dsNameEl = document.getElementById('activeDatasetName');
      if (dsNameEl) {
        dsNameEl.textContent = dataset.name;
      }

      this.populateFilterDropdowns();
      this.applyFilters(isDatasetSwitch);
    } catch (err) {
      console.error('Failed to parse dataset:', err);
      this.showToast(`Error: ${err.message}`, 'error');
    }
  }

  populateFilterDropdowns() {
    const originSelect = document.getElementById('filterOrigin');
    const destSelect = document.getElementById('filterDest');

    const origins = new Set();
    const destinations = new Set();

    this.allRoutes.forEach(r => {
      origins.add(r.origin);
      destinations.add(r.destination);
    });

    // Sort alphabetically by City Name (A to Z)
    const sortedOrigins = Array.from(origins).map(code => ({
      code,
      info: getAirportInfo(code)
    })).sort((a, b) => (a.info.city || a.code).localeCompare(b.info.city || b.code));

    const sortedDestinations = Array.from(destinations).map(code => ({
      code,
      info: getAirportInfo(code)
    })).sort((a, b) => (a.info.city || a.code).localeCompare(b.info.city || b.code));

    if (originSelect) {
      originSelect.innerHTML = '<option value="">All Origins (A–Z)</option>';
      sortedOrigins.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.code;
        opt.textContent = `${item.info.city} (${item.code})`;
        originSelect.appendChild(opt);
      });
      if (this.filters.origin && origins.has(this.filters.origin)) {
        originSelect.value = this.filters.origin;
      } else {
        this.filters.origin = '';
        originSelect.value = '';
      }
    }

    if (destSelect) {
      destSelect.innerHTML = '<option value="">All Destinations (A–Z)</option>';
      sortedDestinations.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.code;
        opt.textContent = `${item.info.city} (${item.code})`;
        destSelect.appendChild(opt);
      });
      if (this.filters.destination && destinations.has(this.filters.destination)) {
        destSelect.value = this.filters.destination;
      } else {
        this.filters.destination = '';
        destSelect.value = '';
      }
    }
  }

  applyFilters(isDatasetSwitch = false) {
    this.filteredRoutes = this.allRoutes.filter(r => {
      if (this.filters.origin && r.origin !== this.filters.origin) return false;
      if (this.filters.destination && r.destination !== this.filters.destination) return false;
      if (this.filters.haulType && r.haulType !== this.filters.haulType) return false;

      if (this.filters.search) {
        const q = this.filters.search.toLowerCase();
        const match = r.origin.toLowerCase().includes(q) ||
                      r.destination.toLowerCase().includes(q) ||
                      r.originInfo.city.toLowerCase().includes(q) ||
                      r.destInfo.city.toLowerCase().includes(q) ||
                      r.originInfo.country.toLowerCase().includes(q) ||
                      r.destInfo.country.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });

    this.updateKPIs();
    this.renderActiveViews(isDatasetSwitch);
  }

  updateKPIs() {
    const totalRoutes = this.filteredRoutes.length;
    const totalPax = this.filteredRoutes.reduce((a, b) => a + b.pax, 0);
    const totalRevenue = this.filteredRoutes.reduce((a, b) => a + b.totalRevenue, 0);
    const avgFare = totalRoutes > 0 ? Math.round(this.filteredRoutes.reduce((a, b) => a + b.avgFare, 0) / totalRoutes) : 0;
    const avgDist = totalRoutes > 0 ? Math.round(this.filteredRoutes.reduce((a, b) => a + b.distance, 0) / totalRoutes) : 0;
    const avgRpm = totalRoutes > 0 ? (this.filteredRoutes.reduce((a, b) => a + b.rpm, 0) / totalRoutes).toFixed(4) : '0.0000';

    this.setText('kpiTotalRoutes', totalRoutes.toLocaleString());
    this.setText('kpiTotalPax', totalPax >= 1000000 ? (totalPax / 1000000).toFixed(2) + 'M' : totalPax.toLocaleString());
    this.setText('kpiTotalPaxSub', `${totalPax.toLocaleString()} passengers`);
    this.setText('kpiTotalRevenue', '$' + (totalRevenue >= 1000000000 ? (totalRevenue / 1000000000).toFixed(2) + 'B' : (totalRevenue / 1000000).toFixed(1) + 'M'));
    this.setText('kpiTotalRevenueSub', `$${totalRevenue.toLocaleString()}`);
    this.setText('kpiAvgFare', '$' + avgFare);
    this.setText('kpiAvgDistance', avgDist.toLocaleString() + ' mi');
    this.setText('kpiAvgRpm', '$' + avgRpm + '/mi');

    const resetBtn = document.getElementById('resetFiltersBtn');
    const hasActiveFilters = this.filters.origin || this.filters.destination || this.filters.haulType || this.filters.search;
    if (resetBtn) {
      resetBtn.style.display = hasActiveFilters ? 'inline-flex' : 'none';
    }
  }

  renderActiveViews(isDatasetSwitch = false) {
    window.dataTableManager.init(this.filteredRoutes);
    window.cityAnalysisManager?.populateCitySelector(this.allRoutes, isDatasetSwitch);
    window.countryAnalysisManager?.populateCountrySelector(this.allRoutes, isDatasetSwitch);

    if (this.activeTab === 'overview') {
      window.routeChartsManager.renderTopPaxChart('topPaxChart', this.filteredRoutes, 10);
      window.routeChartsManager.renderTopRevenueChart('topRevenueChart', this.filteredRoutes, 10);
      window.routeChartsManager.renderScatterPlot('scatterPlot', this.filteredRoutes);
      window.routeChartsManager.renderHaulChart('haulChart', this.filteredRoutes);
    }

    if (this.activeTab === 'studio') {
      this.renderCustomStudioChart();
    }
  }

  switchTab(tabId) {
    this.activeTab = tabId;

    document.querySelectorAll('.tab-btn').forEach(btn => {
      const target = btn.getAttribute('data-tab');
      if (target === tabId) {
        btn.classList.add('bg-slate-900', 'text-white', 'dark:bg-white', 'dark:text-slate-900', 'shadow-sm');
        btn.classList.remove('text-slate-600', 'dark:text-slate-400', 'hover:text-slate-900', 'dark:hover:text-white');
      } else {
        btn.classList.remove('bg-slate-900', 'text-white', 'dark:bg-white', 'dark:text-slate-900', 'shadow-sm');
        btn.classList.add('text-slate-600', 'dark:text-slate-400', 'hover:text-slate-900', 'dark:hover:text-white');
      }
    });

    document.querySelectorAll('.view-pane').forEach(pane => {
      if (pane.id === `view-${tabId}`) {
        pane.classList.remove('hidden');
      } else {
        pane.classList.add('hidden');
      }
    });

    if (tabId === 'overview') {
      this.renderActiveViews();
    }

    if (tabId === 'city') {
      window.cityAnalysisManager?.populateCitySelector(this.allRoutes);
    }

    if (tabId === 'country') {
      window.countryAnalysisManager?.populateCountrySelector(this.allRoutes);
    }

    if (tabId === 'table') {
      window.dataTableManager.init(this.filteredRoutes);
    }

    if (tabId === 'studio') {
      this.renderCustomStudioChart();
    }
  }

  renderCustomStudioChart() {
    const xAxis = document.getElementById('studioXAxis')?.value || 'origin';
    const yAxis = document.getElementById('studioYAxis')?.value || 'pax';
    const aggregation = document.getElementById('studioAgg')?.value || 'sum';
    const chartType = document.getElementById('studioChartType')?.value || 'bar';
    const topN = parseInt(document.getElementById('studioTopN')?.value || '15', 10);

    window.routeChartsManager.renderCustomChart('customStudioChart', this.filteredRoutes, {
      xAxis,
      yAxis,
      aggregation,
      chartType,
      topN
    });
  }

  selectCity(code) {
    this.switchTab('city');
    const select = document.getElementById('citySelect');
    if (select) {
      select.value = code;
      window.cityAnalysisManager?.analyzeCity(code);
    }
  }

  selectCountry(countryName) {
    this.switchTab('country');
    const select = document.getElementById('countrySelect');
    if (select) {
      select.value = countryName;
      window.countryAnalysisManager?.analyzeCountry(countryName);
    }
  }

  async renderDatasetList() {
    const container = document.getElementById('datasetsList');
    if (!container) return;

    const datasets = await window.datasetStorage.listDatasets();
    const activeId = window.datasetStorage.getActiveDatasetId();

    container.innerHTML = '';

    if (datasets.length === 0) {
      container.innerHTML = '<p class="text-slate-400 text-xs py-3">No stored datasets.</p>';
      return;
    }

    datasets.forEach(ds => {
      const isActive = ds.id === activeId;
      const card = document.createElement('div');
      card.className = `p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isActive ? 'bg-sky-50/50 dark:bg-sky-950/20 border-sky-500/50' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`;

      const dateStr = new Date(ds.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

      card.innerHTML = `
        <div>
          <div class="flex items-center gap-2">
            <h4 class="font-semibold text-sm text-slate-900 dark:text-white">${ds.name}</h4>
            ${isActive ? '<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-600 text-white">Active</span>' : ''}
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            ${ds.rowCount} Routes • Uploaded on ${dateStr}
          </p>
        </div>
        <div class="flex items-center gap-2">
          ${!isActive ? `<button onclick="window.app.switchToDataset('${ds.id}')" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer">Set Active</button>` : ''}
          <button onclick="window.app.exportDatasetById('${ds.id}')" class="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">Export</button>
          ${!ds.isDefault ? `<button onclick="window.app.deleteDatasetById('${ds.id}')" class="px-3 py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer">Delete</button>` : ''}
        </div>
      `;

      container.appendChild(card);
    });
  }

  async switchToDataset(id) {
    this.setLoadingState(true);
    try {
      this.resetFiltersSilent();
      const ds = await window.datasetStorage.getDataset(id);
      if (ds) {
        this.loadDataset(ds, true);
        this.renderDatasetList();
        this.showToast(`Switched to "${ds.name}"`, 'info');
      }
    } catch (e) {
      console.error('Error switching dataset:', e);
    } finally {
      this.setLoadingState(false);
    }
  }

  async deleteDatasetById(id) {
    if (confirm('Delete this dataset?')) {
      await window.datasetStorage.deleteDataset(id);
      await this.populateDatasetSelector();
      const datasets = await window.datasetStorage.listDatasets();
      if (datasets.length > 0) {
        const activeDs = await window.datasetStorage.getDataset(window.datasetStorage.getActiveDatasetId() || datasets[0].id);
        if (activeDs) this.loadDataset(activeDs, true);
      }
      this.renderDatasetList();
      this.showToast('Dataset deleted', 'info');
    }
  }

  async exportDatasetById(id) {
    const ds = await window.datasetStorage.getDataset(id);
    if (!ds) return;
    const blob = new Blob([ds.csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${ds.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.csv`;
    link.click();
  }

  async handleFileUpload(file, customName = '') {
    if (!file) return;
    try {
      const text = await file.text();
      const name = customName.trim() || file.name.replace(/\.[^/.]+$/, '');
      const dataset = await window.datasetStorage.saveDataset(name, text, false);
      await this.populateDatasetSelector();
      this.resetFiltersSilent();
      this.loadDataset(dataset, true);
      this.renderDatasetList();
      this.showToast(`Uploaded "${name}" (${dataset.rowCount} routes)`, 'success');
      this.closeUploadModal();
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    }
  }

  bindEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Refresh Dataset Button
    document.getElementById('refreshDatasetBtn')?.addEventListener('click', () => {
      this.refreshCurrentDataset();
    });

    // City Refresh Button
    document.getElementById('cityRefreshBtn')?.addEventListener('click', () => {
      window.cityAnalysisManager?.populateCitySelector(this.allRoutes);
      this.showToast('City Explorer data refreshed', 'info');
    });

    // Country Refresh Button
    document.getElementById('countryRefreshBtn')?.addEventListener('click', () => {
      window.countryAnalysisManager?.populateCountrySelector(this.allRoutes);
      this.showToast('Country Explorer data refreshed', 'info');
    });

    document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
      this.toggleTheme();
    });

    document.getElementById('filterOrigin')?.addEventListener('change', (e) => {
      this.filters.origin = e.target.value;
      this.applyFilters();
    });

    document.getElementById('filterDest')?.addEventListener('change', (e) => {
      this.filters.destination = e.target.value;
      this.applyFilters();
    });

    document.getElementById('filterHaul')?.addEventListener('change', (e) => {
      this.filters.haulType = e.target.value;
      this.applyFilters();
    });

    document.getElementById('globalSearchInput')?.addEventListener('input', (e) => {
      this.filters.search = e.target.value;
      this.applyFilters();
    });

    document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
      this.resetFilters();
    });

    document.getElementById('citySelect')?.addEventListener('change', (e) => {
      window.cityAnalysisManager?.analyzeCity(e.target.value);
    });

    document.getElementById('cityTableSearch')?.addEventListener('input', (e) => {
      window.cityAnalysisManager?.setSearchQuery(e.target.value);
    });

    document.getElementById('countrySelect')?.addEventListener('change', (e) => {
      window.countryAnalysisManager?.analyzeCountry(e.target.value);
    });

    document.getElementById('countryTableSearch')?.addEventListener('input', (e) => {
      window.countryAnalysisManager?.setSearchQuery(e.target.value);
    });

    ['studioXAxis', 'studioYAxis', 'studioAgg', 'studioChartType', 'studioTopN'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => {
        this.renderCustomStudioChart();
      });
    });

    document.getElementById('tableSearchInput')?.addEventListener('input', (e) => {
      window.dataTableManager.setSearchQuery(e.target.value);
    });

    document.getElementById('pageSizeSelect')?.addEventListener('change', (e) => {
      window.dataTableManager.setPageSize(e.target.value);
    });

    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-sort');
        window.dataTableManager.sortBy(col);
      });
    });

    document.querySelectorAll('th[data-city-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-city-sort');
        window.cityAnalysisManager?.sortBy(col);
      });
    });

    document.querySelectorAll('th[data-country-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-country-sort');
        window.countryAnalysisManager?.sortBy(col);
      });
    });

    document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
      window.dataTableManager.exportCSV();
    });

    document.getElementById('exportJsonBtn')?.addEventListener('click', () => {
      window.dataTableManager.exportJSON();
    });

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('csvFileInput');

    if (dropZone && fileInput) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-sky-500', 'bg-sky-50/10');
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-sky-500', 'bg-sky-50/10');
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-sky-500', 'bg-sky-50/10');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleFileUpload(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          const dsName = document.getElementById('customDatasetNameInput')?.value || '';
          this.handleFileUpload(e.target.files[0], dsName);
        }
      });
    }

    document.getElementById('openUploadModalBtn')?.addEventListener('click', () => {
      this.openUploadModal();
    });
    document.getElementById('closeUploadModalBtn')?.addEventListener('click', () => {
      this.closeUploadModal();
    });
  }

  resetFiltersSilent() {
    this.filters = { origin: '', destination: '', haulType: '', search: '' };
    ['filterOrigin', 'filterDest', 'filterHaul', 'globalSearchInput'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  resetFilters() {
    this.resetFiltersSilent();
    this.applyFilters();
  }

  openUploadModal() {
    document.getElementById('uploadModal')?.classList.remove('hidden');
  }

  closeUploadModal() {
    document.getElementById('uploadModal')?.classList.add('hidden');
    const input = document.getElementById('csvFileInput');
    if (input) input.value = '';
  }

  setupTheme() {
    const saved = localStorage.getItem('theme_preference') || 'dark';
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }

  toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      localStorage.setItem('theme_preference', 'light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme_preference', 'dark');
    }
    this.renderActiveViews();
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'px-4 py-2 rounded-lg text-xs font-medium shadow-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 transition-all duration-200 opacity-0 translate-y-1';
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => { toast.classList.remove('opacity-0', 'translate-y-1'); }, 10);
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-1');
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }

  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}

window.app = new AirlineAnalyticsApp();
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
