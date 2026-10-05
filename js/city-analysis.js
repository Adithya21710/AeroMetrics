/**
 * Unified City & Hub Analytics Engine
 * Supports instantaneous rendering and background cross-dataset aggregation across all 10 regional sheets.
 */

class CityAnalysisManager {
  constructor() {
    this.selectedAirport = null;
    this.scope = 'all'; // 'all' (combined cross-dataset) or 'active' (current dataset)
    this.activeRoutes = [];
    this.allDatasetsRoutes = null;
    this.aggregatedCityMarkets = [];
    this.filteredCityMarkets = [];
    this.sortColumn = 'pax';
    this.sortDirection = 'desc';
    this.searchQuery = '';
    this.isFetchingAll = false;
  }

  /**
   * Called by App on initial load or dataset switch
   */
  async populateCitySelector(activeRoutes, isDatasetSwitch = false) {
    this.activeRoutes = activeRoutes || [];
    if (isDatasetSwitch) {
      this.selectedAirport = null;
    }
    this.bindScopeSelector();

    // 1. Immediately render with current routes so UI is instant
    this.refreshCityList(isDatasetSwitch);

    // 2. Non-blocking background fetch for all datasets
    if (!this.allDatasetsRoutes && !this.isFetchingAll) {
      this.isFetchingAll = true;
      window.datasetStorage.getAllDatasetsRoutes().then(allRoutes => {
        this.allDatasetsRoutes = allRoutes || [];
        this.isFetchingAll = false;
        if (this.scope === 'all' && this.selectedAirport) {
          this.analyzeCity(this.selectedAirport);
        }
      }).catch(err => {
        console.warn('All-datasets fetch fallback:', err);
        this.allDatasetsRoutes = this.activeRoutes;
        this.isFetchingAll = false;
      });
    } else if (this.allDatasetsRoutes && this.scope === 'all' && this.selectedAirport) {
      this.analyzeCity(this.selectedAirport);
    }
  }

  bindScopeSelector() {
    const scopeSelect = document.getElementById('cityScopeSelect');
    if (scopeSelect && !scopeSelect.dataset.bound) {
      scopeSelect.dataset.bound = 'true';
      scopeSelect.value = this.scope;
      scopeSelect.addEventListener('change', (e) => {
        this.scope = e.target.value;
        this.refreshCityList(false);
      });
    }
  }

  getEffectiveRoutes() {
    if (this.scope === 'all' && this.allDatasetsRoutes && this.allDatasetsRoutes.length > 0) {
      return this.allDatasetsRoutes;
    }
    return this.activeRoutes || [];
  }

  refreshCityList(isDatasetSwitch = false) {
    const routes = this.getEffectiveRoutes();
    const selectEl = document.getElementById('citySelect');
    const quickHubsEl = document.getElementById('quickHubs');
    if (!selectEl) return;

    if (routes.length === 0 || !this.activeRoutes || this.activeRoutes.length === 0) {
      selectEl.innerHTML = '<option value="">No routes available</option>';
      return;
    }

    // Extract ONLY the regional airports belonging to the selected active dataset
    const regionalAirports = new Map();

    (this.activeRoutes || []).forEach(r => {
      const code = r.origin;
      if (!code) return;
      if (!regionalAirports.has(code)) {
        const info = getAirportInfo(code);
        regionalAirports.set(code, {
          code,
          name: info.name,
          city: info.city,
          country: info.country,
          routesCount: 0,
          paxCount: 0
        });
      }
      const stat = regionalAirports.get(code);
      stat.routesCount++;
      stat.paxCount += (r.pax || 0);
    });

    if (regionalAirports.size === 0) {
      selectEl.innerHTML = '<option value="">No airports found in dataset</option>';
      return;
    }

    // Sort all airports belonging to this dataset alphabetically by City Name (A to Z)
    const alphaAirports = Array.from(regionalAirports.values()).sort((a, b) => {
      const nameA = `${a.city || a.code} (${a.code})`;
      const nameB = `${b.city || b.code} (${b.code})`;
      return nameA.localeCompare(nameB);
    });

    selectEl.innerHTML = '<option value="">Choose airport / city (A–Z)...</option>';
    alphaAirports.forEach(ap => {
      const option = document.createElement('option');
      option.value = ap.code;
      option.textContent = `${ap.city} (${ap.code}) — ${ap.name}, ${ap.country} (${ap.routesCount} routes)`;
      selectEl.appendChild(option);
    });

    // Populate quick hubs bar with top hubs of the active dataset
    const topActiveHubs = Array.from(regionalAirports.values())
      .sort((a, b) => b.paxCount - a.paxCount)
      .slice(0, 6);

    if (quickHubsEl) {
      quickHubsEl.innerHTML = '';
      topActiveHubs.forEach(hub => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'px-2.5 py-1 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-sky-500 text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1 cursor-pointer';
        btn.innerHTML = `<span class="font-semibold text-slate-900 dark:text-white">${hub.code}</span> <span class="text-slate-400 text-[10px]">${hub.city}</span>`;
        btn.onclick = () => {
          selectEl.value = hub.code;
          this.analyzeCity(hub.code);
        };
        quickHubsEl.appendChild(btn);
      });
    }

    // Determine target selection on dataset switch or initial load
    if (isDatasetSwitch || !this.selectedAirport) {
      const defaultCode = topActiveHubs[0]?.code || alphaAirports[0]?.code;
      if (defaultCode) {
        this.selectedAirport = defaultCode;
        selectEl.value = this.selectedAirport;
        this.analyzeCity(this.selectedAirport);
      }
    } else if (this.selectedAirport) {
      const exists = regionalAirports.has(this.selectedAirport);
      if (exists) {
        selectEl.value = this.selectedAirport;
        this.analyzeCity(this.selectedAirport);
      } else {
        const defaultCode = topActiveHubs[0]?.code || alphaAirports[0]?.code;
        if (defaultCode) {
          this.selectedAirport = defaultCode;
          selectEl.value = this.selectedAirport;
          this.analyzeCity(this.selectedAirport);
        }
      }
    }
  }

  analyzeCity(airportCode) {
    if (!airportCode) return;
    this.selectedAirport = airportCode.toUpperCase();
    this.searchQuery = (document.getElementById('cityTableSearch')?.value || '').trim().toLowerCase();

    const info = getAirportInfo(this.selectedAirport);
    const routes = this.getEffectiveRoutes();
    const relatedRoutes = routes.filter(r => r.origin === this.selectedAirport || r.destination === this.selectedAirport);

    if (relatedRoutes.length === 0) {
      this.renderEmptyState(info);
      return;
    }

    // Two-way market aggregation: Group by destination and aggregate metrics & source sheets
    const destMap = new Map();
    const contributingSheets = new Set();

    relatedRoutes.forEach(r => {
      const targetCode = r.origin === this.selectedAirport ? r.destination : r.origin;
      const targetInfo = r.origin === this.selectedAirport ? r.destInfo : r.originInfo;
      const sheetName = r.sourceDatasetName || (window.app?.currentDataset?.name ? window.app.currentDataset.name.replace(/^PAX Data 2025-26\s*—\s*/i, '') : 'Active Dataset');
      
      if (r.sourceSheetsList && Array.isArray(r.sourceSheetsList)) {
        r.sourceSheetsList.forEach(s => contributingSheets.add(s));
      } else if (sheetName) {
        contributingSheets.add(sheetName);
      }

      if (!destMap.has(targetCode)) {
        destMap.set(targetCode, {
          destination: targetCode,
          destInfo: targetInfo,
          pax: r.pax || 0,
          dailyPax: r.dailyPax || 0,
          totalRevenue: r.totalRevenue || 0,
          distance: r.distance || 0,
          avgFare: r.avgFare || 0,
          rpm: r.rpm || 0,
          fares: r.avgFare > 0 ? [r.avgFare] : [],
          rpms: r.rpm > 0 ? [r.rpm] : [],
          sourceSheets: new Set(r.sourceSheetsList || [sheetName])
        });
      } else {
        const item = destMap.get(targetCode);
        if (r.sourceSheetsList && Array.isArray(r.sourceSheetsList)) {
          r.sourceSheetsList.forEach(s => item.sourceSheets.add(s));
        } else if (sheetName) {
          item.sourceSheets.add(sheetName);
        }
      }
    });

    this.aggregatedCityMarkets = Array.from(destMap.values()).map(item => {
      const avgFare = item.avgFare > 0 ? item.avgFare : (item.pax > 0 && item.totalRevenue > 0
        ? parseFloat((item.totalRevenue / item.pax).toFixed(2))
        : (item.fares.length > 0 ? parseFloat((item.fares.reduce((a, b) => a + b, 0) / item.fares.length).toFixed(2)) : 0));

      const rpm = item.rpm > 0 ? item.rpm : (item.distance > 0 && avgFare > 0
        ? parseFloat((avgFare / item.distance).toFixed(4))
        : (item.rpms.length > 0 ? parseFloat((item.rpms.reduce((a, b) => a + b, 0) / item.rpms.length).toFixed(4)) : 0));

      const sheetsArr = Array.from(item.sourceSheets);
      const regionStr = sheetsArr.join(', ');

      return {
        ...item,
        avgFare,
        rpm,
        country: item.destInfo?.country || 'International',
        city: item.destInfo?.city || item.destination,
        sourceSheetsList: sheetsArr,
        region: regionStr
      };
    });

    this.filteredCityMarkets = [...this.aggregatedCityMarkets];

    // Compute aggregate city summary stats
    const totalPax = this.aggregatedCityMarkets.reduce((acc, r) => acc + r.pax, 0);
    const totalRevenue = this.aggregatedCityMarkets.reduce((acc, r) => acc + r.totalRevenue, 0);
    const avgFare = totalPax > 0 ? Math.round(totalRevenue / totalPax) : 0;
    const avgDistance = Math.round(this.aggregatedCityMarkets.reduce((acc, r) => acc + r.distance, 0) / (this.aggregatedCityMarkets.length || 1));
    const avgRpm = (this.aggregatedCityMarkets.reduce((acc, r) => acc + r.rpm, 0) / (this.aggregatedCityMarkets.length || 1)).toFixed(4);

    this.updateCityHero(info, {
      totalMarkets: this.aggregatedCityMarkets.length,
      totalPax,
      totalRevenue,
      avgFare,
      avgDistance,
      avgRpm,
      sheetsCount: contributingSheets.size,
      scope: this.scope
    });

    this.applySortAndRenderTable();
  }

  updateCityHero(info, stats) {
    this.setText('cityHeroCode', info.code);
    this.setText('cityHeroCity', info.city);
    this.setText('cityHeroSubtitle', `${info.name} • ${info.country}`);
    this.setText('cityHeroBadge', `${stats.totalMarkets} Connected Destinations`);

    const sheetsBadge = document.getElementById('citySheetsBadge');
    if (sheetsBadge) {
      if (stats.scope === 'all') {
        sheetsBadge.textContent = `Across ${stats.sheetsCount} Regional Sheet${stats.sheetsCount === 1 ? '' : 's'}`;
        sheetsBadge.className = 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
        sheetsBadge.style.display = 'inline-block';
      } else {
        sheetsBadge.textContent = 'Single Dataset Scope';
        sheetsBadge.className = 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20';
        sheetsBadge.style.display = 'inline-block';
      }
    }

    this.setText('cityStatPax', stats.totalPax >= 1000000 ? (stats.totalPax / 1000000).toFixed(2) + 'M' : stats.totalPax.toLocaleString());
    this.setText('cityStatPaxSub', `${stats.totalPax.toLocaleString()} passengers`);

    this.setText('cityStatRevenue', '$' + (stats.totalRevenue >= 1000000000 ? (stats.totalRevenue / 1000000000).toFixed(2) + 'B' : (stats.totalRevenue >= 1000000 ? (stats.totalRevenue / 1000000).toFixed(1) + 'M' : (stats.totalRevenue / 1000).toFixed(0) + 'k')));
    this.setText('cityStatRevenueSub', `$${stats.totalRevenue.toLocaleString()}`);

    this.setText('cityStatAvgFare', '$' + stats.avgFare);
    this.setText('cityStatAvgDist', stats.avgDistance.toLocaleString() + ' mi');
    this.setText('cityStatAvgRpm', '$' + stats.avgRpm + '/mi');
  }

  setSearchQuery(q) {
    this.searchQuery = (q || '').trim().toLowerCase();
    this.applySortAndRenderTable();
  }

  sortBy(column) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc';
    }
    this.applySortAndRenderTable();
  }

  applySortAndRenderTable() {
    let list = [...this.aggregatedCityMarkets];

    if (this.searchQuery) {
      const q = this.searchQuery;
      list = list.filter(r => {
        return r.destination.toLowerCase().includes(q) ||
               r.city.toLowerCase().includes(q) ||
               r.country.toLowerCase().includes(q) ||
               (r.region && r.region.toLowerCase().includes(q));
      });
    }

    const dir = this.sortDirection === 'asc' ? 1 : -1;
    const col = this.sortColumn;

    list.sort((a, b) => {
      let valA = a[col];
      let valB = b[col];

      if (typeof valA === 'string') {
        return (valA || '').localeCompare(valB || '') * dir;
      }
      return ((valA || 0) - (valB || 0)) * dir;
    });

    this.filteredCityMarkets = list;
    this.renderCityTable();
    this.updateSortIcons();
  }

  renderCityTable() {
    const tbody = document.getElementById('cityRoutesTableBody');
    const countEl = document.getElementById('cityMarketCountInfo');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.filteredCityMarkets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-slate-400">No matching destination markets found.</td></tr>';
      if (countEl) countEl.textContent = '0 destinations';
      return;
    }

    if (countEl) {
      countEl.textContent = `${this.filteredCityMarkets.length} of ${this.aggregatedCityMarkets.length} destinations`;
    }

    this.filteredCityMarkets.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors text-xs';

      const badgesHtml = this.formatRegionBadges(r.sourceSheetsList);

      tr.innerHTML = `
        <td class="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
          <span class="font-mono text-sky-600 dark:text-sky-400 font-bold">${r.destination}</span>
          <span class="text-slate-500 font-normal ml-1">(${r.city})</span>
        </td>
        <td class="py-2.5 px-3 text-slate-500 truncate max-w-[120px]">${r.country}</td>
        <td class="py-2.5 px-3">
          <div class="flex flex-wrap gap-1 items-center">
            ${badgesHtml}
          </div>
        </td>
        <td class="py-2.5 px-3 font-medium text-right text-slate-900 dark:text-white">${r.pax.toLocaleString()}</td>
        <td class="py-2.5 px-3 font-medium text-right text-emerald-600 dark:text-emerald-400">$${r.avgFare.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-right text-slate-500">${r.distance.toLocaleString()} mi</td>
        <td class="py-2.5 px-3 font-semibold text-right text-slate-900 dark:text-white">$${r.totalRevenue.toLocaleString()}</td>
      `;

      tbody.appendChild(tr);
    });
  }

  formatRegionBadges(sheetNames) {
    if (!sheetNames || sheetNames.length === 0) {
      return '<span class="text-slate-400 text-[10px]">—</span>';
    }

    return sheetNames.map(sheet => {
      let colorClass = 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
      const s = sheet.toLowerCase();
      if (s.includes('india')) {
        colorClass = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      } else if (s.includes('europe')) {
        colorClass = 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20';
      } else if (s.includes('asia')) {
        colorClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      } else if (s.includes('united states') || s.includes('us')) {
        colorClass = 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
      } else if (s.includes('middle east')) {
        colorClass = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
      } else if (s.includes('africa')) {
        colorClass = 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20';
      } else if (s.includes('latin')) {
        colorClass = 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20';
      } else if (s.includes('canada')) {
        colorClass = 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      } else if (s.includes('oceania') || s.includes('pacific')) {
        colorClass = 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20';
      }

      return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${colorClass} whitespace-nowrap">${sheet}</span>`;
    }).join('');
  }

  updateSortIcons() {
    const headers = document.querySelectorAll('#cityRoutesTable th[data-city-sort]');
    headers.forEach(th => {
      const col = th.getAttribute('data-city-sort');
      const iconSpan = th.querySelector('.sort-icon');
      if (iconSpan) {
        if (this.sortColumn === col) {
          iconSpan.textContent = this.sortDirection === 'asc' ? '↑' : '↓';
          iconSpan.className = 'sort-icon text-sky-500 font-bold ml-0.5 text-xs';
        } else {
          iconSpan.textContent = '↕';
          iconSpan.className = 'sort-icon opacity-30 ml-0.5 text-xs';
        }
      }
    });
  }

  renderEmptyState(info) {
    this.setText('cityHeroCode', info.code);
    this.setText('cityHeroCity', info.city);
    const tbody = document.getElementById('cityRoutesTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-slate-400">No routes found for this airport in the selected scope.</td></tr>';
  }

  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}

window.cityAnalysisManager = new CityAnalysisManager();
