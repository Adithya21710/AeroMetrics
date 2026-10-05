/**
 * Unified Country Network & Market Intelligence Engine
 * Provides comprehensive country-level analytics, domestic vs. international breakdown,
 * operating airport hubs, partner countries, and full route directories across all 10 regional sheets.
 */

class CountryAnalysisManager {
  constructor() {
    this.selectedCountry = null;
    this.scope = 'all'; // 'all' (combined cross-dataset) or 'active' (current dataset)
    this.activeRoutes = [];
    this.allDatasetsRoutes = null;
    this.countryRoutes = [];
    this.filteredCountryRoutes = [];
    this.sortColumn = 'pax';
    this.sortDirection = 'desc';
    this.searchQuery = '';
    this.isFetchingAll = false;
  }

  /**
   * Called by App on initial load or dataset switch
   */
  async populateCountrySelector(activeRoutes, isDatasetSwitch = false) {
    this.activeRoutes = activeRoutes || [];
    if (isDatasetSwitch) {
      this.selectedCountry = null;
    }
    this.bindScopeSelector();

    // 1. Immediately render with active routes
    this.refreshCountryList(isDatasetSwitch);

    // 2. Non-blocking background fetch for all datasets
    if (!this.allDatasetsRoutes && !this.isFetchingAll) {
      this.isFetchingAll = true;
      window.datasetStorage.getAllDatasetsRoutes().then(allRoutes => {
        this.allDatasetsRoutes = allRoutes || [];
        this.isFetchingAll = false;
        if (this.scope === 'all' && this.selectedCountry) {
          this.analyzeCountry(this.selectedCountry);
        }
      }).catch(err => {
        console.warn('Country explorer all-datasets fetch fallback:', err);
        this.allDatasetsRoutes = this.activeRoutes;
        this.isFetchingAll = false;
      });
    } else if (this.allDatasetsRoutes && this.scope === 'all' && this.selectedCountry) {
      this.analyzeCountry(this.selectedCountry);
    }
  }

  bindScopeSelector() {
    const scopeSelect = document.getElementById('countryScopeSelect');
    if (scopeSelect && !scopeSelect.dataset.bound) {
      scopeSelect.dataset.bound = 'true';
      scopeSelect.value = this.scope;
      scopeSelect.addEventListener('change', (e) => {
        this.scope = e.target.value;
        this.refreshCountryList(false);
      });
    }
  }

  getEffectiveRoutes() {
    if (this.scope === 'all' && this.allDatasetsRoutes && this.allDatasetsRoutes.length > 0) {
      return this.allDatasetsRoutes;
    }
    return this.activeRoutes || [];
  }

  refreshCountryList(isDatasetSwitch = false) {
    const routes = this.getEffectiveRoutes();
    const selectEl = document.getElementById('countrySelect');
    const quickCountriesEl = document.getElementById('quickCountries');
    if (!selectEl) return;

    if (routes.length === 0 || !this.activeRoutes || this.activeRoutes.length === 0) {
      selectEl.innerHTML = '<option value="">No routes available</option>';
      return;
    }

    // Extract ONLY the regional countries belonging to the selected active dataset
    const regionalCountries = new Map();

    (this.activeRoutes || []).forEach(r => {
      const c = r.originInfo?.country;
      if (!c || c === 'Unknown' || c === 'International') return;
      if (!regionalCountries.has(c)) {
        regionalCountries.set(c, {
          country: c,
          routesCount: 0,
          paxCount: 0,
          airports: new Set()
        });
      }
      const stat = regionalCountries.get(c);
      stat.routesCount++;
      stat.paxCount += (r.pax || 0);
      if (r.origin) stat.airports.add(r.origin);
    });

    if (regionalCountries.size === 0) {
      selectEl.innerHTML = '<option value="">No countries found in dataset</option>';
      return;
    }

    // Sort all countries belonging to this dataset alphabetically (A to Z)
    const alphaCountries = Array.from(regionalCountries.values()).sort((a, b) => {
      return (a.country || '').localeCompare(b.country || '');
    });

    selectEl.innerHTML = '<option value="">Choose country (A–Z)...</option>';
    alphaCountries.forEach(item => {
      const flag = this.getCountryFlag(item.country);
      const option = document.createElement('option');
      option.value = item.country;
      option.textContent = `${flag} ${item.country} (${item.routesCount} routes • ${item.airports.size} hubs)`;
      selectEl.appendChild(option);
    });

    // Populate quick countries bar with top aviation nations of the active dataset
    const topActiveCountries = Array.from(regionalCountries.values())
      .sort((a, b) => b.paxCount - a.paxCount)
      .slice(0, 6);

    if (quickCountriesEl) {
      quickCountriesEl.innerHTML = '';
      topActiveCountries.forEach(item => {
        const flag = this.getCountryFlag(item.country);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'px-2.5 py-1 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-sky-500 text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1 cursor-pointer';
        btn.innerHTML = `<span>${flag}</span> <span class="font-semibold text-slate-900 dark:text-white">${item.country}</span>`;
        btn.onclick = () => {
          selectEl.value = item.country;
          this.analyzeCountry(item.country);
        };
        quickCountriesEl.appendChild(btn);
      });
    }

    // Determine target selection on dataset switch or initial load
    if (isDatasetSwitch || !this.selectedCountry) {
      const defaultCountry = topActiveCountries[0]?.country || alphaCountries[0]?.country;
      if (defaultCountry) {
        this.selectedCountry = defaultCountry;
        selectEl.value = this.selectedCountry;
        this.analyzeCountry(this.selectedCountry);
      }
    } else if (this.selectedCountry) {
      const exists = regionalCountries.has(this.selectedCountry);
      if (exists) {
        selectEl.value = this.selectedCountry;
        this.analyzeCountry(this.selectedCountry);
      } else {
        const defaultCountry = topActiveCountries[0]?.country || alphaCountries[0]?.country;
        if (defaultCountry) {
          this.selectedCountry = defaultCountry;
          selectEl.value = this.selectedCountry;
          this.analyzeCountry(this.selectedCountry);
        }
      }
    }
  }

  analyzeCountry(countryName) {
    if (!countryName) return;
    this.selectedCountry = countryName.trim();
    this.searchQuery = (document.getElementById('countryTableSearch')?.value || '').trim().toLowerCase();

    const routes = this.getEffectiveRoutes();
    const targetCountry = this.selectedCountry.toLowerCase();

    // Filter all routes connected to this country (Domestic, Inbound, or Outbound)
    const matchedRoutes = routes.filter(r => {
      const c1 = (r.originInfo?.country || '').toLowerCase();
      const c2 = (r.destInfo?.country || '').toLowerCase();
      return c1 === targetCountry || c2 === targetCountry;
    });

    if (matchedRoutes.length === 0) {
      this.renderEmptyState(this.selectedCountry);
      return;
    }

    const contributingSheets = new Set();
    const inCountryAirports = new Map();
    const partnerCountries = new Map();

    let domesticPax = 0;
    let internationalPax = 0;
    let domesticRev = 0;
    let internationalRev = 0;

    const formattedRoutes = matchedRoutes.map((r, idx) => {
      const origCountry = r.originInfo?.country || 'International';
      const destCountry = r.destInfo?.country || 'International';
      const isOrigInCountry = origCountry.toLowerCase() === targetCountry;
      const isDestInCountry = destCountry.toLowerCase() === targetCountry;
      const isDomestic = isOrigInCountry && isDestInCountry;

      const sheetName = r.sourceDatasetName || (window.app?.currentDataset?.name ? window.app.currentDataset.name.replace(/^PAX Data 2025-26\s*—\s*/i, '') : 'Active Dataset');
      if (r.sourceSheetsList && Array.isArray(r.sourceSheetsList)) {
        r.sourceSheetsList.forEach(s => contributingSheets.add(s));
      } else if (sheetName) {
        contributingSheets.add(sheetName);
      }

      // Track in-country airport hubs
      if (isOrigInCountry) {
        if (!inCountryAirports.has(r.origin)) {
          inCountryAirports.set(r.origin, { code: r.origin, city: r.originInfo.city, pax: 0, routes: 0 });
        }
        const a = inCountryAirports.get(r.origin);
        a.pax += r.pax;
        a.routes++;
      }
      if (isDestInCountry && r.destination !== r.origin) {
        if (!inCountryAirports.has(r.destination)) {
          inCountryAirports.set(r.destination, { code: r.destination, city: r.destInfo.city, pax: 0, routes: 0 });
        }
        const a = inCountryAirports.get(r.destination);
        a.pax += r.pax;
        a.routes++;
      }

      // Track partner countries
      if (!isDomestic) {
        const partner = isOrigInCountry ? destCountry : origCountry;
        if (partner && partner !== 'International') {
          if (!partnerCountries.has(partner)) {
            partnerCountries.set(partner, { country: partner, pax: 0, routes: 0 });
          }
          const pc = partnerCountries.get(partner);
          pc.pax += r.pax;
          pc.routes++;
        }
        internationalPax += r.pax;
        internationalRev += r.totalRevenue;
      } else {
        domesticPax += r.pax;
        domesticRev += r.totalRevenue;
      }

      // Standardize domestic hub vs partner destination
      const hubCode = isOrigInCountry ? r.origin : r.destination;
      const hubCity = isOrigInCountry ? r.originInfo.city : r.destInfo.city;
      const partnerCode = isOrigInCountry ? r.destination : r.origin;
      const partnerCity = isOrigInCountry ? r.destInfo.city : r.originInfo.city;
      const partnerCountryName = isDomestic ? 'Domestic' : (isOrigInCountry ? destCountry : origCountry);

      return {
        id: idx,
        routeKey: r.routeKey,
        hubCode,
        hubCity,
        partnerCode,
        partnerCity,
        partnerCountry: partnerCountryName,
        isDomestic,
        routeType: isDomestic ? 'Domestic' : 'International',
        pax: r.pax,
        dailyPax: r.dailyPax,
        avgFare: r.avgFare,
        distance: r.distance,
        rpm: r.rpm,
        totalRevenue: r.totalRevenue,
        sourceSheet: sheetName,
        haulType: r.haulType
      };
    });

    this.countryRoutes = formattedRoutes;
    this.filteredCountryRoutes = [...formattedRoutes];

    // Country Aggregate Totals
    const totalPax = formattedRoutes.reduce((acc, r) => acc + r.pax, 0);
    const totalRevenue = formattedRoutes.reduce((acc, r) => acc + r.totalRevenue, 0);
    const avgFare = totalPax > 0 ? Math.round(totalRevenue / totalPax) : 0;
    const avgDistance = Math.round(formattedRoutes.reduce((acc, r) => acc + r.distance, 0) / (formattedRoutes.length || 1));
    const avgRpm = (formattedRoutes.reduce((acc, r) => acc + r.rpm, 0) / (formattedRoutes.length || 1)).toFixed(4);

    const sortedAirports = Array.from(inCountryAirports.values()).sort((a, b) => b.pax - a.pax);
    const sortedPartners = Array.from(partnerCountries.values()).sort((a, b) => b.pax - a.pax);

    this.updateCountryHero({
      countryName: this.selectedCountry,
      totalRoutes: formattedRoutes.length,
      totalPax,
      totalRevenue,
      avgFare,
      avgDistance,
      avgRpm,
      domesticPax,
      internationalPax,
      airportsCount: sortedAirports.length,
      partnerCount: sortedPartners.length,
      sheetsCount: contributingSheets.size,
      scope: this.scope
    });

    this.renderInCountryHubs(sortedAirports);
    this.renderPartnerCountries(sortedPartners);
    this.applySortAndRenderTable();
  }

  updateCountryHero(stats) {
    const flag = this.getCountryFlag(stats.countryName);
    this.setText('countryHeroFlag', flag);
    this.setText('countryHeroName', stats.countryName);
    this.setText('countryHeroSubtitle', `${stats.airportsCount} Active Airport Hubs • ${stats.partnerCount} Partner Nations Connected`);
    this.setText('countryHeroRoutesBadge', `${stats.totalRoutes.toLocaleString()} Connected Corridors`);

    const sheetsBadge = document.getElementById('countrySheetsBadge');
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

    this.setText('countryStatPax', stats.totalPax >= 1000000 ? (stats.totalPax / 1000000).toFixed(2) + 'M' : stats.totalPax.toLocaleString());
    this.setText('countryStatPaxSub', `${stats.totalPax.toLocaleString()} passengers`);

    this.setText('countryStatRevenue', '$' + (stats.totalRevenue >= 1000000000 ? (stats.totalRevenue / 1000000000).toFixed(2) + 'B' : (stats.totalRevenue >= 1000000 ? (stats.totalRevenue / 1000000).toFixed(1) + 'M' : (stats.totalRevenue / 1000).toFixed(0) + 'k')));
    this.setText('countryStatRevenueSub', `$${stats.totalRevenue.toLocaleString()}`);

    this.setText('countryStatAvgFare', '$' + stats.avgFare);
    this.setText('countryStatAvgDist', stats.avgDistance.toLocaleString() + ' mi');
    this.setText('countryStatAvgRpm', '$' + stats.avgRpm + '/mi');

    const domPct = stats.totalPax > 0 ? Math.round((stats.domesticPax / stats.totalPax) * 100) : 0;
    const intlPct = stats.totalPax > 0 ? (100 - domPct) : 0;
    this.setText('countryStatDomestic', `${domPct}%`);
    this.setText('countryStatDomesticSub', `${stats.domesticPax.toLocaleString()} domestic PAX`);
    this.setText('countryStatIntl', `${intlPct}%`);
    this.setText('countryStatIntlSub', `${stats.internationalPax.toLocaleString()} int'l PAX`);
  }

  renderInCountryHubs(hubs) {
    const container = document.getElementById('countryHubsList');
    if (!container) return;

    container.innerHTML = '';
    if (hubs.length === 0) {
      container.innerHTML = '<span class="text-xs text-slate-400">No airports recorded.</span>';
      return;
    }

    const displayHubs = hubs.slice(0, 10);
    displayHubs.forEach(hub => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-sky-500 text-left transition-colors flex items-center justify-between gap-2 group cursor-pointer shadow-xs';
      chip.innerHTML = `
        <div class="flex items-center gap-1.5 truncate">
          <span class="font-mono font-bold text-xs text-sky-600 dark:text-sky-400 group-hover:text-sky-500">${hub.code}</span>
          <span class="text-[11px] text-slate-600 dark:text-slate-300 truncate">${hub.city}</span>
        </div>
        <span class="text-[10px] text-slate-400 font-mono">${(hub.pax >= 1000000 ? (hub.pax / 1000000).toFixed(1) + 'M' : (hub.pax / 1000).toFixed(0) + 'k')}</span>
      `;
      chip.title = `Explore ${hub.code} (${hub.city}) in City Explorer`;
      chip.onclick = () => {
        if (window.app && window.app.selectCity) {
          window.app.selectCity(hub.code);
        }
      };
      container.appendChild(chip);
    });
  }

  renderPartnerCountries(partners) {
    const container = document.getElementById('countryPartnersList');
    if (!container) return;

    container.innerHTML = '';
    if (partners.length === 0) {
      container.innerHTML = '<span class="text-xs text-slate-400">Domestic market only.</span>';
      return;
    }

    const displayPartners = partners.slice(0, 10);
    displayPartners.forEach(p => {
      const flag = this.getCountryFlag(p.country);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:border-sky-500 text-left transition-colors flex items-center justify-between gap-2 group cursor-pointer shadow-xs';
      chip.innerHTML = `
        <div class="flex items-center gap-1.5 truncate">
          <span>${flag}</span>
          <span class="text-[11px] font-medium text-slate-800 dark:text-slate-200 group-hover:text-sky-500 truncate">${p.country}</span>
        </div>
        <span class="text-[10px] text-slate-400 font-mono">${p.routes} routes</span>
      `;
      chip.title = `Switch Country Explorer to ${p.country}`;
      chip.onclick = () => {
        const select = document.getElementById('countrySelect');
        if (select) select.value = p.country;
        this.analyzeCountry(p.country);
      };
      container.appendChild(chip);
    });
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
    let list = [...this.countryRoutes];

    if (this.searchQuery) {
      const q = this.searchQuery;
      list = list.filter(r => {
        return r.hubCode.toLowerCase().includes(q) ||
               r.hubCity.toLowerCase().includes(q) ||
               r.partnerCode.toLowerCase().includes(q) ||
               r.partnerCity.toLowerCase().includes(q) ||
               r.partnerCountry.toLowerCase().includes(q) ||
               r.routeType.toLowerCase().includes(q) ||
               (r.sourceSheet && r.sourceSheet.toLowerCase().includes(q));
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

    this.filteredCountryRoutes = list;
    this.renderCountryTable();
    this.updateSortIcons();
  }

  renderCountryTable() {
    const tbody = document.getElementById('countryRoutesTableBody');
    const countEl = document.getElementById('countryRouteCountInfo');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.filteredCountryRoutes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-slate-400">No matching flight corridors found for this country.</td></tr>';
      if (countEl) countEl.textContent = '0 corridors';
      return;
    }

    if (countEl) {
      countEl.textContent = `${this.filteredCountryRoutes.length} of ${this.countryRoutes.length} flight corridors`;
    }

    this.filteredCountryRoutes.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors text-xs';

      const sheetBadge = this.formatSheetBadge(r.sourceSheet);
      const typeBadge = r.isDomestic
        ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Domestic</span>'
        : '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">International</span>';

      tr.innerHTML = `
        <td class="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
          <span class="font-mono text-sky-600 dark:text-sky-400 font-bold">${r.hubCode}</span>
          <span class="text-slate-500 font-normal ml-1">(${r.hubCity})</span>
        </td>
        <td class="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
          <span class="font-mono text-slate-800 dark:text-slate-200 font-bold">${r.partnerCode}</span>
          <span class="text-slate-500 font-normal ml-1">(${r.partnerCity})</span>
        </td>
        <td class="py-2.5 px-3 text-slate-600 dark:text-slate-300 truncate max-w-[130px]">${r.partnerCountry}</td>
        <td class="py-2.5 px-3">${typeBadge}</td>
        <td class="py-2.5 px-3">${sheetBadge}</td>
        <td class="py-2.5 px-3 font-medium text-right text-slate-900 dark:text-white">${r.pax.toLocaleString()}</td>
        <td class="py-2.5 px-3 font-medium text-right text-emerald-600 dark:text-emerald-400">$${r.avgFare.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-right text-slate-500">${r.distance.toLocaleString()} mi</td>
        <td class="py-2.5 px-3 font-semibold text-right text-slate-900 dark:text-white">$${r.totalRevenue.toLocaleString()}</td>
      `;

      tbody.appendChild(tr);
    });
  }

  formatSheetBadge(sheetName) {
    if (!sheetName) return '<span class="text-slate-400 text-[10px]">—</span>';
    const sheets = typeof sheetName === 'string' ? sheetName.split(',').map(s => s.trim()) : (Array.isArray(sheetName) ? sheetName : [sheetName]);
    
    return sheets.map(sheet => {
      let colorClass = 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
      const s = sheet.toLowerCase();
      if (s.includes('india')) colorClass = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      else if (s.includes('europe')) colorClass = 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20';
      else if (s.includes('asia')) colorClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      else if (s.includes('united states') || s.includes('us')) colorClass = 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
      else if (s.includes('middle east')) colorClass = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
      else if (s.includes('africa')) colorClass = 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20';
      else if (s.includes('latin')) colorClass = 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20';
      else if (s.includes('canada')) colorClass = 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      else if (s.includes('oceania') || s.includes('pacific')) colorClass = 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20';

      return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${colorClass} whitespace-nowrap">${sheet}</span>`;
    }).join(' ');
  }

  updateSortIcons() {
    const headers = document.querySelectorAll('#countryRoutesTable th[data-country-sort]');
    headers.forEach(th => {
      const col = th.getAttribute('data-country-sort');
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

  renderEmptyState(countryName) {
    this.setText('countryHeroName', countryName);
    const tbody = document.getElementById('countryRoutesTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-slate-400">No routes found for this country in the selected scope.</td></tr>';
  }

  getCountryFlag(countryName) {
    if (!countryName) return '🌐';
    const c = countryName.toLowerCase();
    if (c.includes('india')) return '🇮🇳';
    if (c.includes('united states') || c === 'usa' || c === 'us') return '🇺🇸';
    if (c.includes('united kingdom') || c === 'uk' || c.includes('britain') || c.includes('england')) return '🇬🇧';
    if (c.includes('emirates') || c === 'uae' || c.includes('dubai')) return '🇦🇪';
    if (c.includes('germany')) return '🇩🇪';
    if (c.includes('france')) return '🇫🇷';
    if (c.includes('singapore')) return '🇸🇬';
    if (c.includes('japan')) return '🇯🇵';
    if (c.includes('australia')) return '🇦🇺';
    if (c.includes('canada')) return '🇨🇦';
    if (c.includes('saudi')) return '🇸🇦';
    if (c.includes('qatar')) return '🇶🇦';
    if (c.includes('china')) return '🇨🇳';
    if (c.includes('thailand')) return '🇹🇭';
    if (c.includes('malaysia')) return '🇲🇾';
    if (c.includes('indonesia')) return '🇮🇩';
    if (c.includes('spain')) return '🇪🇸';
    if (c.includes('italy')) return '🇮🇹';
    if (c.includes('switzerland')) return '🇨🇭';
    if (c.includes('netherlands')) return '🇳🇱';
    if (c.includes('turkey')) return '🇹🇷';
    if (c.includes('korea')) return '🇰🇷';
    if (c.includes('brazil')) return '🇧🇷';
    if (c.includes('mexico')) return '🇲🇽';
    if (c.includes('south africa')) return '🇿🇦';
    if (c.includes('egypt')) return '🇪🇬';
    if (c.includes('kenya')) return '🇰🇪';
    if (c.includes('fiji')) return '🇫🇯';
    if (c.includes('new zealand')) return '🇳🇿';
    if (c.includes('papua')) return '🇵🇬';
    if (c.includes('polynesia')) return '🇵🇫';
    if (c.includes('guam')) return '🇬🇺';
    if (c.includes('maldives')) return '🇲🇻';
    if (c.includes('sri lanka')) return '🇱🇰';
    if (c.includes('bangladesh')) return '🇧🇩';
    if (c.includes('nepal')) return '🇳🇵';
    if (c.includes('philippines')) return '🇵🇭';
    if (c.includes('vietnam')) return '🇻🇳';
    if (c.includes('ireland')) return '🇮🇪';
    if (c.includes('greece')) return '🇬🇷';
    if (c.includes('portugal')) return '🇵🇹';
    if (c.includes('austria')) return '🇦🇹';
    if (c.includes('belgium')) return '🇧🇪';
    if (c.includes('sweden')) return '🇸🇪';
    if (c.includes('norway')) return '🇳🇴';
    if (c.includes('denmark')) return '🇩🇰';
    if (c.includes('finland')) return '🇫🇮';
    if (c.includes('russia')) return '🇷🇺';
    if (c.includes('argentina')) return '🇦🇷';
    if (c.includes('chile')) return '🇨🇱';
    if (c.includes('colombia')) return '🇨🇴';
    if (c.includes('peru')) return '🇵🇪';
    return '🌐';
  }

  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}

window.countryAnalysisManager = new CountryAnalysisManager();
