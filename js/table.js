/**
 * Clean Data Table Manager
 * Fast sorting, live filtering, and pagination.
 */

class DataTableManager {
  constructor() {
    this.routes = [];
    this.filteredRoutes = [];
    this.currentPage = 1;
    this.pageSize = 20;
    this.sortColumn = 'pax';
    this.sortDirection = 'desc';
    this.searchQuery = '';
  }

  init(routes) {
    this.routes = routes;
    this.filteredRoutes = [...routes];
    this.currentPage = 1;
    this.applySort();
    this.render();
  }

  setSearchQuery(q) {
    this.searchQuery = (q || '').trim().toLowerCase();
    this.applyFilters();
  }

  setPageSize(size) {
    this.pageSize = size === 'all' ? 999999 : parseInt(size, 10);
    this.currentPage = 1;
    this.render();
  }

  setPage(page) {
    this.currentPage = page;
    this.render();
  }

  sortBy(column) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc';
    }
    this.applySort();
    this.render();
  }

  applySort() {
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    const col = this.sortColumn;

    this.filteredRoutes.sort((a, b) => {
      let valA = a[col];
      let valB = b[col];

      if (typeof valA === 'string') {
        return valA.localeCompare(valB) * dir;
      }
      return (valA - valB) * dir;
    });
  }

  applyFilters() {
    let result = [...this.routes];

    if (this.searchQuery) {
      const q = this.searchQuery;
      result = result.filter(r => {
        return r.origin.toLowerCase().includes(q) ||
               r.destination.toLowerCase().includes(q) ||
               r.originInfo.city.toLowerCase().includes(q) ||
               r.destInfo.city.toLowerCase().includes(q) ||
               r.originInfo.country.toLowerCase().includes(q) ||
               r.destInfo.country.toLowerCase().includes(q);
      });
    }

    this.filteredRoutes = result;
    this.currentPage = 1;
    this.applySort();
    this.render();
  }

  render() {
    const tbody = document.getElementById('routesTableBody');
    const paginationEl = document.getElementById('tablePagination');
    const countInfoEl = document.getElementById('tableCountInfo');
    if (!tbody) return;

    tbody.innerHTML = '';

    const total = this.filteredRoutes.length;
    const startIdx = (this.currentPage - 1) * this.pageSize;
    const endIdx = Math.min(startIdx + this.pageSize, total);
    const pageItems = this.filteredRoutes.slice(startIdx, endIdx);

    if (pageItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-8 text-slate-400">
            No matching routes found.
          </td>
        </tr>
      `;
      if (countInfoEl) countInfoEl.textContent = '0 routes';
      if (paginationEl) paginationEl.innerHTML = '';
      return;
    }

    pageItems.forEach((r, idx) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-xs text-slate-700 dark:text-slate-300 transition-colors';

      tr.innerHTML = `
        <td class="py-2.5 px-4 font-mono text-slate-400 text-center w-10">${startIdx + idx + 1}</td>
        <td class="py-2.5 px-4">
          <span class="font-semibold text-slate-900 dark:text-white">${r.origin}</span>
          <span class="text-slate-400 text-[11px] ml-1">(${r.originInfo.city})</span>
        </td>
        <td class="py-2.5 px-4">
          <span class="font-semibold text-slate-900 dark:text-white">${r.destination}</span>
          <span class="text-slate-400 text-[11px] ml-1">(${r.destInfo.city})</span>
        </td>
        <td class="py-2.5 px-4 text-right font-medium text-slate-900 dark:text-white">${r.pax.toLocaleString()}</td>
        <td class="py-2.5 px-4 text-right font-medium text-emerald-600 dark:text-emerald-400">$${r.avgFare.toFixed(2)}</td>
        <td class="py-2.5 px-4 text-right text-slate-500">${r.distance.toLocaleString()} mi</td>
        <td class="py-2.5 px-4 text-right font-mono text-slate-600 dark:text-slate-300">$${r.rpm.toFixed(4)}</td>
        <td class="py-2.5 px-4 text-right font-semibold text-slate-900 dark:text-white">$${r.totalRevenue.toLocaleString()}</td>
      `;

      tbody.appendChild(tr);
    });

    if (countInfoEl) {
      countInfoEl.textContent = `Showing ${startIdx + 1}–${endIdx} of ${total} routes`;
    }

    this.renderPagination(paginationEl, total);
    this.updateSortIcons();
  }

  renderPagination(container, total) {
    if (!container) return;
    container.innerHTML = '';

    const totalPages = Math.ceil(total / this.pageSize);
    if (totalPages <= 1) return;

    const prevBtn = document.createElement('button');
    prevBtn.className = `px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 ${this.currentPage === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`;
    prevBtn.innerHTML = '&larr; Prev';
    prevBtn.disabled = this.currentPage === 1;
    prevBtn.onclick = () => this.setPage(this.currentPage - 1);
    container.appendChild(prevBtn);

    const infoSpan = document.createElement('span');
    infoSpan.className = 'text-xs text-slate-500 px-2 flex items-center font-medium';
    infoSpan.textContent = `${this.currentPage} / ${totalPages}`;
    container.appendChild(infoSpan);

    const nextBtn = document.createElement('button');
    nextBtn.className = `px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 ${this.currentPage === totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`;
    nextBtn.innerHTML = 'Next &rarr;';
    nextBtn.disabled = this.currentPage === totalPages;
    nextBtn.onclick = () => this.setPage(this.currentPage + 1);
    container.appendChild(nextBtn);
  }

  updateSortIcons() {
    const headers = document.querySelectorAll('th[data-sort]');
    headers.forEach(th => {
      const col = th.getAttribute('data-sort');
      const iconSpan = th.querySelector('.sort-icon');
      if (iconSpan) {
        if (this.sortColumn === col) {
          iconSpan.textContent = this.sortDirection === 'asc' ? '↑' : '↓';
          iconSpan.className = 'sort-icon text-sky-500 font-bold ml-1 text-xs';
        } else {
          iconSpan.textContent = '↕';
          iconSpan.className = 'sort-icon opacity-30 ml-1 text-xs';
        }
      }
    });
  }

  exportCSV() {
    const headers = ['ORIGIN', 'ORIGIN_CITY', 'DESTINATION', 'DEST_CITY', 'PAX IN/OUT', 'DAILY PAX', 'AVG. FARE ($)', 'DISTANCE (MI)', 'RPM ($/MI)', 'EST. REVENUE ($)'];
    const rows = this.filteredRoutes.map(r => [
      r.origin,
      `"${r.originInfo.city}"`,
      r.destination,
      `"${r.destInfo.city}"`,
      r.pax,
      r.dailyPax,
      r.avgFare.toFixed(2),
      r.distance,
      r.rpm.toFixed(4),
      r.totalRevenue
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `airline_routes_${Date.now()}.csv`;
    link.click();
  }

  exportJSON() {
    const jsonStr = JSON.stringify(this.filteredRoutes, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `airline_routes_${Date.now()}.json`;
    link.click();
  }
}

window.dataTableManager = new DataTableManager();
