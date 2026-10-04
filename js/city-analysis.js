/**
 * Unified City & Hub Analytics Engine
 * Cohesive integration of city profile, interactive destination charts, and sortable route directory.
 */

class CityAnalysisManager {
  constructor() {
    this.selectedAirport = null;
    this.routes = [];
    this.aggregatedCityMarkets = [];
    this.filteredCityMarkets = [];
    this.sortColumn = 'pax';
    this.sortDirection = 'desc';
    this.searchQuery = '';
  }

  populateCitySelector(routes) {
    this.routes = routes;
    const selectEl = document.getElementById('citySelect');
    const quickHubsEl = document.getElementById('quickHubs');
    if (!selectEl) return;

    const airportStats = new Map();

    routes.forEach(r => {
      [r.origin, r.destination].forEach(code => {
        if (!airportStats.has(code)) {
          const info = getAirportInfo(code);
          airportStats.set(code, {
            code,
            name: info.name,
            city: info.city,
            country: info.country,
            routesCount: 0,
            paxCount: 0
          });
        }
        const stat = airportStats.get(code);
        stat.routesCount++;
        stat.paxCount += r.pax;
      });
    });

    const sortedAirports = Array.from(airportStats.values()).sort((a, b) => b.paxCount - a.paxCount);

    selectEl.innerHTML = '<option value="">Choose airport / city...</option>';
    sortedAirports.forEach(ap => {
      const option = document.createElement('option');
      option.value = ap.code;
      option.textContent = `${ap.code} — ${ap.city}, ${ap.country} (${ap.routesCount} routes)`;
      selectEl.appendChild(option);
    });

    if (quickHubsEl) {
      quickHubsEl.innerHTML = '';
      const topHubs = sortedAirports.slice(0, 6);
      topHubs.forEach(hub => {
        const btn = document.createElement('button');
        btn.className = 'px-2.5 py-1 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-sky-500 text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1';
        btn.innerHTML = `<span class="font-semibold text-slate-900 dark:text-white">${hub.code}</span> <span class="text-slate-400 text-[10px]">${hub.city}</span>`;
        btn.onclick = () => {
          selectEl.value = hub.code;
          this.analyzeCity(hub.code);
        };
        quickHubsEl.appendChild(btn);
      });
    }

    if (!this.selectedAirport && sortedAirports.length > 0) {
      this.selectedAirport = sortedAirports[0].code;
      selectEl.value = this.selectedAirport;
      this.analyzeCity(this.selectedAirport);
    } else if (this.selectedAirport) {
      selectEl.value = this.selectedAirport;
      this.analyzeCity(this.selectedAirport);
    }
  }

  analyzeCity(airportCode) {
    if (!airportCode) return;
    this.selectedAirport = airportCode.toUpperCase();
    this.searchQuery = (document.getElementById('cityTableSearch')?.value || '').trim().toLowerCase();

    const info = getAirportInfo(this.selectedAirport);
    const relatedRoutes = this.routes.filter(r => r.origin === this.selectedAirport || r.destination === this.selectedAirport);

    if (relatedRoutes.length === 0) {
      this.renderEmptyState(info);
      return;
    }

    // Two-way market aggregation: Group by destination and sum always
    const destMap = new Map();

    relatedRoutes.forEach(r => {
      const targetCode = r.origin === this.selectedAirport ? r.destination : r.origin;
      const targetInfo = r.origin === this.selectedAirport ? r.destInfo : r.originInfo;

      if (!destMap.has(targetCode)) {
        destMap.set(targetCode, {
          destination: targetCode,
          destInfo: targetInfo,
          pax: 0,
          dailyPax: 0,
          totalRevenue: 0,
          distance: r.distance,
          fares: [],
          rpms: []
        });
      }

      const item = destMap.get(targetCode);
      item.pax += r.pax;
      item.dailyPax += r.dailyPax;
      item.totalRevenue += r.totalRevenue;
      if (r.distance > item.distance) item.distance = r.distance;
      if (r.avgFare > 0) item.fares.push(r.avgFare);
      if (r.rpm > 0) item.rpms.push(r.rpm);
    });

    this.aggregatedCityMarkets = Array.from(destMap.values()).map(item => {
      const avgFare = item.pax > 0 && item.totalRevenue > 0
        ? parseFloat((item.totalRevenue / item.pax).toFixed(2))
        : (item.fares.length > 0 ? parseFloat((item.fares.reduce((a, b) => a + b, 0) / item.fares.length).toFixed(2)) : 0);

      const rpm = item.distance > 0 && avgFare > 0
        ? parseFloat((avgFare / item.distance).toFixed(4))
        : (item.rpms.length > 0 ? parseFloat((item.rpms.reduce((a, b) => a + b, 0) / item.rpms.length).toFixed(4)) : 0);

      return {
        ...item,
        avgFare,
        rpm,
        country: item.destInfo.country || 'International',
        city: item.destInfo.city || item.destination
      };
    });

    this.filteredCityMarkets = [...this.aggregatedCityMarkets];

    // City Totals
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
      avgRpm
    });

    this.applySortAndRenderTable();
  }

  updateCityHero(info, stats) {
    this.setText('cityHeroCode', info.code);
    this.setText('cityHeroCity', info.city);
    this.setText('cityHeroSubtitle', `${info.name} • ${info.country}`);
    this.setText('cityHeroBadge', `${stats.totalMarkets} Connected Destinations`);

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
               r.country.toLowerCase().includes(q);
      });
    }

    const dir = this.sortDirection === 'asc' ? 1 : -1;
    const col = this.sortColumn;

    list.sort((a, b) => {
      let valA = a[col];
      let valB = b[col];

      if (typeof valA === 'string') {
        return valA.localeCompare(valB) * dir;
      }
      return (valA - valB) * dir;
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
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400">No matching destination markets found.</td></tr>';
      if (countEl) countEl.textContent = '0 destinations';
      return;
    }

    if (countEl) {
      countEl.textContent = `${this.filteredCityMarkets.length} of ${this.aggregatedCityMarkets.length} destinations`;
    }

    this.filteredCityMarkets.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors text-xs';

      tr.innerHTML = `
        <td class="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
          <span class="font-mono text-sky-600 dark:text-sky-400 font-bold">${r.destination}</span>
          <span class="text-slate-500 font-normal ml-1">(${r.city})</span>
        </td>
        <td class="py-2 px-3 text-slate-500 truncate max-w-[120px]">${r.country}</td>
        <td class="py-2 px-3 font-medium text-right text-slate-900 dark:text-white">${r.pax.toLocaleString()}</td>
        <td class="py-2 px-3 font-medium text-right text-emerald-600 dark:text-emerald-400">$${r.avgFare.toFixed(2)}</td>
        <td class="py-2 px-3 text-right text-slate-500">${r.distance.toLocaleString()} mi</td>
        <td class="py-2 px-3 font-semibold text-right text-slate-900 dark:text-white">$${r.totalRevenue.toLocaleString()}</td>
      `;

      tbody.appendChild(tr);
    });
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
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400">No routes found for this airport.</td></tr>';
  }

  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}

window.cityAnalysisManager = new CityAnalysisManager();
