/**
 * Modern Chart Manager for Airline Analytics
 * Refined, minimalist visualizations with human-readable numbers and high-contrast styling.
 */

class RouteChartsManager {
  constructor() {
    this.instances = {};
  }

  isDarkMode() {
    return document.documentElement.classList.contains('dark') || !document.documentElement.classList.contains('light');
  }

  getTheme() {
    const dark = this.isDarkMode();
    return {
      textColor: dark ? '#94a3b8' : '#64748b',
      titleColor: dark ? '#f8fafc' : '#0f172a',
      gridColor: dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
      tooltipBg: dark ? '#0f172a' : '#ffffff',
      tooltipText: dark ? '#f8fafc' : '#0f172a',
      tooltipBorder: dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)'
    };
  }

  destroyChart(id) {
    if (this.instances[id]) {
      this.instances[id].destroy();
      delete this.instances[id];
    }
  }

  destroyAll() {
    Object.keys(this.instances).forEach(id => this.destroyChart(id));
  }

  /**
   * Top Routes by Passenger Volume
   */
  renderTopPaxChart(canvasId, routes, limit = 10) {
    this.destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const theme = this.getTheme();
    const sorted = [...routes].sort((a, b) => b.pax - a.pax).slice(0, limit);
    const labels = sorted.map(r => `${r.origin} → ${r.destination}`);
    const dataPax = sorted.map(r => r.pax);

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 450, 0);
    gradient.addColorStop(0, '#0284c7');
    gradient.addColorStop(1, '#3b82f6');

    this.instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Annual Passenger Traffic',
          data: dataPax,
          backgroundColor: gradient,
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            padding: 12,
            boxPadding: 4,
            callbacks: {
              title: (items) => {
                const r = sorted[items[0].dataIndex];
                return `${r.origin} (${r.originInfo.city}) → ${r.destination} (${r.destInfo.city})`;
              },
              label: (context) => {
                const r = sorted[context.dataIndex];
                return [
                  ` Passengers: ${r.pax.toLocaleString()} PAX`,
                  ` Daily Traffic: ~${r.dailyPax.toLocaleString()} passengers/day`,
                  ` Avg Fare: $${r.avgFare.toFixed(2)}`,
                  ` Distance: ${r.distance.toLocaleString()} miles`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: theme.gridColor },
            ticks: {
              color: theme.textColor,
              callback: (val) => val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : val >= 1000 ? (val / 1000) + 'k' : val
            }
          },
          y: {
            grid: { display: false },
            ticks: {
              color: theme.textColor,
              font: { weight: '500', size: 12 }
            }
          }
        }
      }
    });
  }

  /**
   * Top Routes by Revenue ($)
   */
  renderTopRevenueChart(canvasId, routes, limit = 10) {
    this.destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const theme = this.getTheme();
    const sorted = [...routes].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, limit);
    const labels = sorted.map(r => `${r.origin} → ${r.destination}`);
    const dataRev = sorted.map(r => r.totalRevenue);

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 450, 0);
    gradient.addColorStop(0, '#059669');
    gradient.addColorStop(1, '#10b981');

    this.instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Estimated Route Revenue',
          data: dataRev,
          backgroundColor: gradient,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            padding: 12,
            callbacks: {
              title: (items) => {
                const r = sorted[items[0].dataIndex];
                return `${r.origin} (${r.originInfo.city}) → ${r.destination} (${r.destInfo.city})`;
              },
              label: (context) => {
                const r = sorted[context.dataIndex];
                return [
                  ` Est. Revenue: $${(r.totalRevenue / 1000000).toFixed(2)}M ($${r.totalRevenue.toLocaleString()})`,
                  ` Passenger Traffic: ${r.pax.toLocaleString()} PAX`,
                  ` Average Fare: $${r.avgFare.toFixed(2)}`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: theme.gridColor },
            ticks: {
              color: theme.textColor,
              callback: (val) => '$' + (val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : (val / 1000) + 'k')
            }
          },
          y: {
            grid: { display: false },
            ticks: {
              color: theme.textColor,
              font: { weight: '500', size: 12 }
            }
          }
        }
      }
    });
  }

  /**
   * Top Yield (RPM $/mi) Chart
   */
  renderTopYieldChart(canvasId, routes, limit = 10) {
    this.destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const theme = this.getTheme();
    const sorted = [...routes].filter(r => r.rpm > 0).sort((a, b) => b.rpm - a.rpm).slice(0, limit);
    const labels = sorted.map(r => `${r.origin} → ${r.destination}`);
    const dataRpm = sorted.map(r => r.rpm);

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 450, 0);
    gradient.addColorStop(0, '#d97706');
    gradient.addColorStop(1, '#f59e0b');

    this.instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Yield RPM ($ / mi)',
          data: dataRpm,
          backgroundColor: gradient,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            padding: 12,
            callbacks: {
              title: (items) => {
                const r = sorted[items[0].dataIndex];
                return `${r.origin} (${r.originInfo.city}) → ${r.destination} (${r.destInfo.city})`;
              },
              label: (context) => {
                const r = sorted[context.dataIndex];
                return [
                  ` Yield (RPM): $${r.rpm.toFixed(4)} / mi`,
                  ` Distance: ${r.distance} miles`,
                  ` Average Fare: $${r.avgFare.toFixed(2)}`,
                  ` Volume: ${r.pax.toLocaleString()} PAX`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: theme.gridColor },
            ticks: {
              color: theme.textColor,
              callback: (val) => '$' + val.toFixed(2)
            }
          },
          y: {
            grid: { display: false },
            ticks: {
              color: theme.textColor,
              font: { weight: '500', size: 12 }
            }
          }
        }
      }
    });
  }

  /**
   * Distance vs Average Fare Scatter Plot with Trendline
   */
  renderScatterPlot(canvasId, routes) {
    this.destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const theme = this.getTheme();
    const validRoutes = routes.filter(r => r.distance > 0 && r.avgFare > 0);

    const scatterPoints = validRoutes.map(r => ({
      x: r.distance,
      y: r.avgFare,
      route: r
    }));

    // Linear regression
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    const n = validRoutes.length;
    validRoutes.forEach(r => {
      sumX += r.distance;
      sumY += r.avgFare;
      sumXY += r.distance * r.avgFare;
      sumXX += r.distance * r.distance;
    });

    const m = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
    const c = (sumY - m * sumX) / (n || 1);

    const maxDist = Math.max(...validRoutes.map(r => r.distance), 1000);
    const trendlinePoints = [
      { x: 0, y: Math.max(0, Math.round(c)) },
      { x: maxDist, y: Math.round(m * maxDist + c) }
    ];

    const ctx = canvas.getContext('2d');
    this.instances[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Flight Routes',
            data: scatterPoints,
            backgroundColor: 'rgba(2, 132, 199, 0.65)',
            borderColor: '#0284c7',
            pointRadius: (ctx) => {
              const r = ctx.raw?.route;
              if (!r) return 4;
              return Math.min(12, Math.max(4, Math.sqrt(r.pax) / 50));
            },
            pointHoverRadius: 7
          },
          {
            label: `Trendline ($${m.toFixed(3)}/mi + $${Math.max(0, Math.round(c))})`,
            data: trendlinePoints,
            type: 'line',
            borderColor: '#e11d48',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0,
            hoverRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: theme.textColor, boxWidth: 12 }
          },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            padding: 12,
            callbacks: {
              title: (items) => {
                const item = items[0];
                if (item.datasetIndex === 1) return 'Linear Pricing Trend';
                const r = item.raw.route;
                return `${r.origin} (${r.originInfo.city}) → ${r.destination} (${r.destInfo.city})`;
              },
              label: (context) => {
                if (context.datasetIndex === 1) return `Expected Fare: $${context.raw.y.toFixed(2)}`;
                const r = context.raw.route;
                return [
                  ` Distance: ${r.distance.toLocaleString()} miles`,
                  ` Average Fare: $${r.avgFare.toFixed(2)}`,
                  ` Passenger Traffic: ${r.pax.toLocaleString()} PAX`,
                  ` Yield (RPM): $${r.rpm.toFixed(4)}/mi`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Distance (Miles)', color: theme.textColor, font: { size: 11, weight: '500' } },
            grid: { color: theme.gridColor },
            ticks: {
              color: theme.textColor,
              callback: (val) => val.toLocaleString() + ' mi'
            }
          },
          y: {
            title: { display: true, text: 'Average Fare ($)', color: theme.textColor, font: { size: 11, weight: '500' } },
            grid: { color: theme.gridColor },
            ticks: {
              color: theme.textColor,
              callback: (val) => '$' + val.toLocaleString()
            }
          }
        }
      }
    });
  }

  /**
   * Route Haul Distribution
   */
  renderHaulChart(canvasId, routes) {
    this.destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const theme = this.getTheme();
    const haulCounts = {
      'Short (<600 mi)': 0,
      'Medium (600-2k mi)': 0,
      'Long (2k-5k mi)': 0,
      'Ultra Long (>5k mi)': 0
    };

    routes.forEach(r => {
      if (r.distance < 600) haulCounts['Short (<600 mi)']++;
      else if (r.distance < 2000) haulCounts['Medium (600-2k mi)']++;
      else if (r.distance < 5000) haulCounts['Long (2k-5k mi)']++;
      else haulCounts['Ultra Long (>5k mi)']++;
    });

    this.instances[canvasId] = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(haulCounts),
        datasets: [{
          data: Object.values(haulCounts),
          backgroundColor: ['#0284c7', '#3b82f6', '#6366f1', '#a855f7'],
          borderWidth: 2,
          borderColor: this.isDarkMode() ? '#111827' : '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: theme.textColor, boxWidth: 10, font: { size: 11 } }
          },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            padding: 10
          }
        }
      }
    });
  }

  /**
   * Custom Chart Studio
   */
  renderCustomChart(canvasId, routes, config) {
    this.destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const theme = this.getTheme();
    const { xAxis, yAxis, aggregation, chartType, topN } = config;

    const groups = {};
    routes.forEach(r => {
      let key = 'Other';
      if (xAxis === 'origin') key = `${r.origin} (${r.originInfo.city})`;
      else if (xAxis === 'destination') key = `${r.destination} (${r.destInfo.city})`;
      else if (xAxis === 'destCountry') key = r.destInfo.country || 'Unknown';
      else if (xAxis === 'haulType') key = r.haulType;
      else if (xAxis === 'fareTier') key = r.fareTier;
      else if (xAxis === 'route') key = `${r.origin}-${r.destination}`;

      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    let entries = Object.keys(groups).map(key => {
      const groupRoutes = groups[key];
      let val = 0;
      const count = groupRoutes.length;

      if (yAxis === 'count') {
        val = count;
      } else {
        const values = groupRoutes.map(r => {
          if (yAxis === 'pax') return r.pax;
          if (yAxis === 'avgFare') return r.avgFare;
          if (yAxis === 'distance') return r.distance;
          if (yAxis === 'rpm') return r.rpm;
          if (yAxis === 'totalRevenue') return r.totalRevenue;
          if (yAxis === 'dailyPax') return r.dailyPax;
          return 0;
        });

        if (aggregation === 'sum') {
          val = values.reduce((a, b) => a + b, 0);
        } else if (aggregation === 'avg') {
          val = values.reduce((a, b) => a + b, 0) / (count || 1);
        } else if (aggregation === 'max') {
          val = Math.max(...values);
        } else if (aggregation === 'min') {
          val = Math.min(...values);
        }
      }

      return { key, val: parseFloat(val.toFixed(2)), count };
    });

    entries.sort((a, b) => b.val - a.val);
    if (topN && topN > 0) {
      entries = entries.slice(0, topN);
    }

    const labels = entries.map(e => e.key);
    const dataValues = entries.map(e => e.val);

    const palette = ['#0284c7', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#14b8a6'];
    const isPieOrDoughnut = ['pie', 'doughnut'].includes(chartType);

    const ctx = canvas.getContext('2d');
    this.instances[canvasId] = new Chart(ctx, {
      type: chartType === 'horizontalBar' ? 'bar' : chartType,
      data: {
        labels: labels,
        datasets: [{
          label: `${aggregation.toUpperCase()} of ${yAxis}`,
          data: dataValues,
          backgroundColor: isPieOrDoughnut ? palette : '#0284c7',
          borderColor: isPieOrDoughnut ? (this.isDarkMode() ? '#111827' : '#fff') : '#0369a1',
          borderWidth: 1,
          borderRadius: chartType.includes('bar') ? 4 : 0
        }]
      },
      options: {
        indexAxis: chartType === 'horizontalBar' ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: isPieOrDoughnut,
            labels: { color: theme.textColor }
          },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (ctx) => ` ${ctx.label || ctx.dataset.label}: ${typeof ctx.raw === 'number' ? ctx.raw.toLocaleString() : ctx.raw}`
            }
          }
        },
        scales: isPieOrDoughnut ? {} : {
          x: {
            grid: { color: theme.gridColor },
            ticks: { color: theme.textColor, maxRotation: 45 }
          },
          y: {
            grid: { color: theme.gridColor },
            ticks: {
              color: theme.textColor,
              callback: (val) => typeof val === 'number' && val >= 1000 ? val.toLocaleString() : val
            }
          }
        }
      }
    });
  }
}

window.routeChartsManager = new RouteChartsManager();
