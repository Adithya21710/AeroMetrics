/**
 * Interactive Flight Route Map Manager
 * Features:
 * - Smart Route Density Filtering (defaults to Top 50 major corridors so map stays neat & legible)
 * - Filter & Sort by Country (focuses and zooms to routes connected to any country)
 * - Focus Hub Airport (isolates routes connected to a specific hub)
 * - Distance Stage Filter (Short / Medium / Long Haul)
 * - Dynamic route hover highlight & interactive airport analytics popups
 * - Automatic dynamic bounds zooming
 */

class RouteMapManager {
  constructor(mapContainerId = 'routeMap') {
    this.containerId = mapContainerId;
    this.map = null;
    this.tileLayer = null;
    this.routesLayer = null;
    this.airportsLayer = null;
    this.allRoutes = [];
    this.countryFilter = 'all';
    this.hubFilter = 'all';
    this.densityLimit = '50';
    this.haulFilter = 'all';
  }

  init() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    if (this.map) {
      this.map.remove();
      this.map = null;
    }

    this.map = L.map(this.containerId, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 14,
      worldCopyJump: true,
      zoomControl: true
    });

    this.routesLayer = L.layerGroup().addTo(this.map);
    this.airportsLayer = L.layerGroup().addTo(this.map);

    this.updateTileLayer();
    
    window.addEventListener('resize', () => {
      if (this.map) this.map.invalidateSize();
    });
  }

  updateTileLayer() {
    if (!this.map) return;
    const isDark = document.documentElement.classList.contains('dark') || !document.documentElement.classList.contains('light');

    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
    }

    const tileUrl = isDark
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';

    const attribution = '&copy; <a href="https://www.esri.com/">Esri</a> &copy; OpenStreetMap contributors';

    this.tileLayer = L.tileLayer(tileUrl, {
      attribution: attribution,
      maxZoom: 16
    }).addTo(this.map);
  }

  setRoutes(routes) {
    this.allRoutes = routes || [];
    this.populateControls();
    this.applyFiltersAndRender();
  }

  // Backwards compatibility
  renderRoutes(routes, focusedAirport = null) {
    if (focusedAirport) {
      this.hubFilter = focusedAirport.toUpperCase();
    }
    this.setRoutes(routes);
  }

  populateControls() {
    const countrySelect = document.getElementById('mapCountryFilter');
    const hubSelect = document.getElementById('mapHubFilter');
    const densitySelect = document.getElementById('mapDensityLimit');

    if (!countrySelect || !hubSelect) return;

    // 1. Countries
    const countryStats = new Map();
    this.allRoutes.forEach(r => {
      const c1 = r.originInfo?.country;
      const c2 = r.destInfo?.country;
      if (c1) countryStats.set(c1, (countryStats.get(c1) || 0) + 1);
      if (c2 && c2 !== c1) countryStats.set(c2, (countryStats.get(c2) || 0) + 1);
    });

    const sortedCountries = Array.from(countryStats.entries()).sort((a, b) => b[1] - a[1]);
    
    const prevCountry = countrySelect.value || this.countryFilter || 'all';
    countrySelect.innerHTML = `<option value="all">All Countries (${this.allRoutes.length} routes)</option>`;
    sortedCountries.forEach(([country, count]) => {
      const opt = document.createElement('option');
      opt.value = country;
      opt.textContent = `${country} (${count} routes)`;
      countrySelect.appendChild(opt);
    });

    if (Array.from(countrySelect.options).some(o => o.value === prevCountry)) {
      countrySelect.value = prevCountry;
      this.countryFilter = prevCountry;
    } else {
      this.countryFilter = 'all';
      countrySelect.value = 'all';
    }

    // 2. Hubs
    const hubStats = new Map();
    this.allRoutes.forEach(r => {
      [r.origin, r.destination].forEach(code => {
        if (!hubStats.has(code)) {
          const info = getAirportInfo(code);
          hubStats.set(code, { code, city: info.city, count: 0 });
        }
        hubStats.get(code).count++;
      });
    });

    const sortedHubs = Array.from(hubStats.values()).sort((a, b) => b.count - a.count);
    const prevHub = hubSelect.value || this.hubFilter || 'all';
    hubSelect.innerHTML = '<option value="all">All Airport Hubs</option>';
    sortedHubs.forEach(hub => {
      const opt = document.createElement('option');
      opt.value = hub.code;
      opt.textContent = `${hub.code} — ${hub.city} (${hub.count} routes)`;
      hubSelect.appendChild(opt);
    });

    if (Array.from(hubSelect.options).some(o => o.value === prevHub)) {
      hubSelect.value = prevHub;
      this.hubFilter = prevHub;
    } else {
      this.hubFilter = 'all';
      hubSelect.value = 'all';
    }

    // 3. Density default logic: default to 50 when dataset is large
    if (densitySelect) {
      if (this.allRoutes.length > 50 && (!this.densityLimit || this.densityLimit === 'all')) {
        this.densityLimit = '50';
        densitySelect.value = '50';
      } else if (this.densityLimit) {
        densitySelect.value = this.densityLimit;
      }
    }

    // 4. Haul Filter Sync
    const haulSelect = document.getElementById('mapHaulFilter');
    if (haulSelect) {
      if (this.haulFilter && this.haulFilter !== 'all') {
        haulSelect.value = this.haulFilter;
      } else {
        this.haulFilter = haulSelect.value || 'all';
      }
    }
  }

  setCountryFilter(country) {
    this.countryFilter = country;
    const el = document.getElementById('mapCountryFilter');
    if (el) el.value = country;
    this.applyFiltersAndRender();
  }

  setHubFilter(hub) {
    this.hubFilter = hub;
    const el = document.getElementById('mapHubFilter');
    if (el) el.value = hub;
    this.applyFiltersAndRender();
  }

  setDensityLimit(limit) {
    this.densityLimit = limit;
    const el = document.getElementById('mapDensityLimit');
    if (el) el.value = limit;
    this.applyFiltersAndRender();
  }

  setHaulFilter(haul) {
    this.haulFilter = haul;
    const el = document.getElementById('mapHaulFilter');
    if (el) el.value = haul;
    this.applyFiltersAndRender();
  }

  resetFilters() {
    this.countryFilter = 'all';
    this.hubFilter = 'all';
    this.haulFilter = 'all';
    this.densityLimit = this.allRoutes.length > 50 ? '50' : 'all';

    const cEl = document.getElementById('mapCountryFilter');
    const hEl = document.getElementById('mapHubFilter');
    const dEl = document.getElementById('mapDensityLimit');
    const haulEl = document.getElementById('mapHaulFilter');

    if (cEl) cEl.value = 'all';
    if (hEl) hEl.value = 'all';
    if (dEl) dEl.value = this.densityLimit;
    if (haulEl) haulEl.value = 'all';

    this.applyFiltersAndRender();
  }

  resetView() {
    this.resetFilters();
  }

  applyFiltersAndRender() {
    if (!this.map) this.init();
    if (!this.map) return;

    this.routesLayer.clearLayers();
    this.airportsLayer.clearLayers();

    // 1. Filter routes
    let filtered = this.allRoutes.filter(r => {
      if (this.countryFilter !== 'all') {
        const c1 = r.originInfo?.country;
        const c2 = r.destInfo?.country;
        if (c1 !== this.countryFilter && c2 !== this.countryFilter) return false;
      }
      if (this.hubFilter !== 'all') {
        if (r.origin !== this.hubFilter && r.destination !== this.hubFilter) return false;
      }
      if (this.haulFilter && this.haulFilter !== 'all') {
        const f = this.haulFilter.toLowerCase().replace(/[-_]/g, ' ').trim();
        const rHaul = (r.haulType || '').toLowerCase().replace(/[-_]/g, ' ').trim();
        const match = (rHaul === f) ||
                      (f === 'short' && rHaul.includes('short')) ||
                      (f === 'medium' && rHaul.includes('medium')) ||
                      (f === 'long' && rHaul.includes('long') && !rHaul.includes('ultra')) ||
                      (f === 'ultra' && rHaul.includes('ultra'));
        if (!match) return false;
      }
      return true;
    });

    // 2. Sort by passenger demand descending
    filtered.sort((a, b) => b.pax - a.pax);

    // 3. Slice for density limit if applicable
    let displayRoutes = filtered;
    if (this.densityLimit !== 'all') {
      const limit = parseInt(this.densityLimit, 10);
      if (!isNaN(limit) && limit > 0) {
        displayRoutes = filtered.slice(0, limit);
      }
    }

    // 4. Update Badge
    const badgeEl = document.getElementById('mapRoutesCountBadge');
    if (badgeEl) {
      if (displayRoutes.length === this.allRoutes.length) {
        badgeEl.textContent = `Showing all ${this.allRoutes.length} routes`;
      } else {
        badgeEl.textContent = `Showing ${displayRoutes.length} of ${this.allRoutes.length} routes`;
      }
    }

    // Hub Colors Palette
    const hubColors = {
      'DEL': '#0284c7',
      'BOM': '#f59e0b',
      'BLR': '#10b981',
      'HYD': '#6366f1',
      'MAA': '#ec4899',
      'CCU': '#8b5cf6',
      'GUM': '#0284c7',
      'NAN': '#f59e0b',
      'POM': '#10b981',
      'PPT': '#ec4899',
      'SYD': '#6366f1',
      'LHR': '#ef4444',
      'JFK': '#3b82f6',
      'LAX': '#06b6d4',
      'DXB': '#d97706',
      'SIN': '#14b8a6'
    };

    const airportMap = new Map();
    const bounds = L.latLngBounds([]);

    // 5. Draw Great-Circle Arcs
    displayRoutes.forEach(r => {
      const orig = r.originInfo;
      const dest = r.destInfo;

      if (!orig || !dest || (orig.lat === 0 && orig.lon === 0) || (dest.lat === 0 && dest.lon === 0)) {
        return;
      }

      if (!airportMap.has(r.origin)) {
        airportMap.set(r.origin, { info: orig, outbound: 0, inbound: 0, totalPax: 0 });
      }
      if (!airportMap.has(r.destination)) {
        airportMap.set(r.destination, { info: dest, outbound: 0, inbound: 0, totalPax: 0 });
      }

      airportMap.get(r.origin).outbound++;
      airportMap.get(r.origin).totalPax += r.pax;
      airportMap.get(r.destination).inbound++;
      airportMap.get(r.destination).totalPax += r.pax;

      bounds.extend([orig.lat, orig.lon]);
      bounds.extend([dest.lat, dest.lon]);

      const segments = this.calculateGreatCircleArc([orig.lat, orig.lon], [dest.lat, dest.lon]);
      const routeColor = hubColors[r.origin] || '#38bdf8';
      const weight = Math.max(1.2, Math.min(3.2, Math.sqrt(r.pax) / 200));
      const baseOpacity = displayRoutes.length > 100 ? 0.45 : (displayRoutes.length > 50 ? 0.6 : 0.75);

      const polyline = L.polyline(segments, {
        color: routeColor,
        weight: weight,
        opacity: baseOpacity,
        lineCap: 'round',
        smoothFactor: 1
      });

      // Hover glow effect
      polyline.on('mouseover', function () {
        this.setStyle({ weight: weight + 2.5, opacity: 1.0, color: '#f59e0b' });
        if (this.bringToFront) this.bringToFront();
      });

      polyline.on('mouseout', function () {
        this.setStyle({ weight: weight, opacity: baseOpacity, color: routeColor });
      });

      const popupContent = `
        <div class="p-1 min-w-[200px] text-slate-800 dark:text-slate-100 text-xs font-sans">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-1 mb-2 font-semibold">
            <span class="text-sky-600 dark:text-sky-400 font-bold">${r.origin} ↔ ${r.destination}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">${r.haulType}</span>
          </div>
          <div class="space-y-1 text-slate-600 dark:text-slate-300 text-[11px]">
            <p><strong>${orig.city}</strong> to <strong>${dest.city}</strong></p>
            <div class="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
              <div>Annual Traffic: <strong class="text-slate-900 dark:text-white block">${r.pax.toLocaleString()} PAX</strong></div>
              <div>Avg Ticket: <strong class="text-emerald-600 dark:text-emerald-400 block">$${r.avgFare.toFixed(2)}</strong></div>
              <div>Distance: <strong class="block">${r.distance.toLocaleString()} mi</strong></div>
              <div>Est. Revenue: <strong class="block">$${r.totalRevenue.toLocaleString()}</strong></div>
            </div>
          </div>
        </div>
      `;

      polyline.bindPopup(popupContent);
      this.routesLayer.addLayer(polyline);
    });

    // 6. Draw Airport Hub Dots
    airportMap.forEach((data, code) => {
      const { info, outbound, inbound, totalPax } = data;
      const totalRoutes = outbound + inbound;
      const isFocused = (this.hubFilter && this.hubFilter === code);

      // Sizing based on route density & significance
      const radius = isFocused ? 9 : (displayRoutes.length > 100 ? Math.max(3, Math.min(6, 2.5 + totalRoutes * 0.2)) : Math.max(4, Math.min(8, 3.5 + totalRoutes * 0.4)));

      const circle = L.circleMarker([info.lat, info.lon], {
        radius: radius,
        fillColor: isFocused ? '#ef4444' : (totalRoutes > 10 ? '#0284c7' : '#38bdf8'),
        color: '#ffffff',
        weight: isFocused ? 2 : 1,
        opacity: 0.9,
        fillOpacity: 0.85
      });

      const airportPopup = `
        <div class="p-1.5 min-w-[200px] text-slate-800 dark:text-slate-100 text-xs font-sans">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-1 mb-1.5">
            <span class="font-bold text-sky-600 dark:text-sky-400 font-mono text-sm">${code}</span>
            <span class="text-[10px] text-slate-400">${info.country}</span>
          </div>
          <p class="font-semibold text-slate-900 dark:text-white text-xs">${info.city}</p>
          <p class="text-[10px] text-slate-500 mb-2 truncate max-w-[190px]">${info.name}</p>
          
          <div class="grid grid-cols-2 gap-1 py-1.5 border-y border-slate-100 dark:border-slate-800 text-[11px] mb-2">
            <div>Routes: <strong>${totalRoutes}</strong></div>
            <div>Volume: <strong>${totalPax.toLocaleString()}</strong></div>
          </div>

          <div class="flex flex-col gap-1.5">
            <button onclick="window.routeMapManager.setHubFilter('${code}')" class="w-full text-center py-1 text-[11px] font-medium rounded bg-slate-100 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950 text-slate-700 dark:text-slate-300 hover:text-sky-600 transition-colors border border-slate-200 dark:border-slate-700">
              Focus Map on ${code}
            </button>
            <button onclick="window.app.selectCity('${code}')" class="w-full text-center py-1 text-[11px] font-medium rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors">
              Analyze ${code} in City Explorer
            </button>
          </div>
        </div>
      `;

      circle.bindPopup(airportPopup);
      this.airportsLayer.addLayer(circle);
    });

    // 7. Auto Zoom / Bounds
    if (bounds.isValid()) {
      const isSpecificFilter = (this.countryFilter !== 'all' || this.hubFilter !== 'all');
      const zoomPadding = isSpecificFilter ? [40, 40] : [30, 30];
      const maxZ = isSpecificFilter ? 8 : 4;
      this.map.fitBounds(bounds, { padding: zoomPadding, maxZoom: maxZ });
    }
  }

  /**
   * True Spherical Great Circle Geodesic (Orthodromic) Arc Generator
   * Handles accurate spherical geometry and cleanly splits at the antimeridian (+/-180 deg).
   */
  calculateGreatCircleArc(p1, p2, numPoints = 36) {
    const toRad = deg => deg * Math.PI / 180;
    const toDeg = rad => rad * 180 / Math.PI;

    const lat1 = toRad(p1[0]), lon1 = toRad(p1[1]);
    const lat2 = toRad(p2[0]), lon2 = toRad(p2[1]);

    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const d = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (d < 1e-6) return [[[p1[0], p1[1]], [p2[0], p2[1]]]];

    const rawPoints = [];
    for (let i = 0; i <= numPoints; i++) {
      const f = i / numPoints;
      const A = Math.sin((1 - f) * d) / Math.sin(d);
      const B = Math.sin(f * d) / Math.sin(d);

      const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
      const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
      const z = A * Math.sin(lat1) + B * Math.sin(lat2);

      const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
      const lon = toDeg(Math.atan2(y, x));
      rawPoints.push([lat, lon]);
    }

    // Split segments when crossing the antimeridian (+/-180 deg)
    const segments = [];
    let currentSegment = [rawPoints[0]];

    for (let i = 1; i < rawPoints.length; i++) {
      const prev = rawPoints[i - 1];
      const curr = rawPoints[i];
      const lonDiff = curr[1] - prev[1];

      if (Math.abs(lonDiff) > 180) {
        const sign = prev[1] > 0 ? 1 : -1;
        const targetLonPrev = 180 * sign;
        const targetLonCurr = -180 * sign;

        const fraction = (targetLonPrev - prev[1]) / (lonDiff - 360 * sign);
        const boundaryLat = prev[0] + (curr[0] - prev[0]) * Math.max(0, Math.min(1, fraction));

        currentSegment.push([boundaryLat, targetLonPrev]);
        segments.push(currentSegment);
        currentSegment = [[boundaryLat, targetLonCurr], curr];
      } else {
        currentSegment.push(curr);
      }
    }
    segments.push(currentSegment);
    return segments;
  }
}

window.routeMapManager = new RouteMapManager();
