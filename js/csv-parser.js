/**
 * Robust Airline CSV Parser
 * Handles escaped quotes, commas inside fields, currency signs, distance units, and flexible column aliases.
 */

class AirlineCSVParser {
  /**
   * Parse raw CSV text into structured route objects
   */
  static parse(csvText) {
    if (!csvText || typeof csvText !== 'string') {
      throw new Error('CSV text is empty or invalid.');
    }

    const lines = this.splitCSVLines(csvText.trim());
    if (lines.length < 2) {
      throw new Error('CSV must contain at least a header row and one data row.');
    }

    const rawHeaders = this.parseCSVLine(lines[0]);
    const headerMap = this.mapHeaders(rawHeaders);

    if (headerMap.origin === undefined || headerMap.destination === undefined) {
      throw new Error('CSV must contain at least "ORIGIN" and "DESTINATION" columns.');
    }

    const routes = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const lineStr = lines[i].trim();
      if (!lineStr) continue;

      try {
        const row = this.parseCSVLine(lineStr);
        if (row.length === 0) continue;

        const origin = (row[headerMap.origin] || '').trim().toUpperCase();
        const destination = (row[headerMap.destination] || '').trim().toUpperCase();

        if (!origin || !destination) {
          continue;
        }

        const rawPax = headerMap.pax !== undefined ? row[headerMap.pax] : '0';
        const rawFare = headerMap.avgFare !== undefined ? row[headerMap.avgFare] : '0';
        const rawDistance = headerMap.distance !== undefined ? row[headerMap.distance] : '0';
        const rawDailyPax = headerMap.dailyPax !== undefined ? row[headerMap.dailyPax] : '';
        const rawRpm = headerMap.rpm !== undefined ? row[headerMap.rpm] : '';

        const pax = this.cleanNumber(rawPax);
        const avgFare = this.cleanNumber(rawFare);
        const distance = this.cleanNumber(rawDistance);
        
        let dailyPax = rawDailyPax !== '' && rawDailyPax !== undefined ? this.cleanNumber(rawDailyPax) : (pax > 0 ? Math.round(pax / 365) : 0);
        let rpm = rawRpm !== '' && rawRpm !== undefined ? this.cleanNumber(rawRpm) : 0;
        
        if (rpm === 0 && distance > 0 && avgFare > 0) {
          rpm = parseFloat((avgFare / distance).toFixed(4));
        }

        const totalRevenue = Math.round(pax * avgFare);
        const routeKey = `${origin}-${destination}`;

        // Get airport metadata
        const originInfo = typeof getAirportInfo === 'function' ? getAirportInfo(origin) : { code: origin, city: origin, country: 'Unknown', name: `${origin} Airport`, lat: 0, lon: 0, flag: '✈️' };
        const destInfo = typeof getAirportInfo === 'function' ? getAirportInfo(destination) : { code: destination, city: destination, country: 'Unknown', name: `${destination} Airport`, lat: 0, lon: 0, flag: '✈️' };

        // Classify haul type
        let haulType = 'Short Haul';
        if (distance >= 5000) haulType = 'Ultra Long Haul';
        else if (distance >= 2000) haulType = 'Long Haul';
        else if (distance >= 600) haulType = 'Medium Haul';

        // Classify fare tier
        let fareTier = 'Budget (< $200)';
        if (avgFare >= 1000) fareTier = 'Premium Flagship (>$1,000)';
        else if (avgFare >= 500) fareTier = 'High Value ($500-$1,000)';
        else if (avgFare >= 200) fareTier = 'Standard ($200-$500)';

        routes.push({
          id: i,
          origin,
          destination,
          routeKey,
          pax,
          dailyPax,
          avgFare,
          distance,
          rpm,
          totalRevenue,
          haulType,
          fareTier,
          originInfo,
          destInfo,
          raw: row
        });
      } catch (err) {
        errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    return {
      routes,
      headers: rawHeaders,
      totalRows: lines.length - 1,
      validRows: routes.length,
      errors
    };
  }

  /**
   * Split CSV text taking into account quoted newlines
   */
  static splitCSVLines(text) {
    const lines = [];
    let curLine = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        inQuotes = !inQuotes;
        curLine += char;
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && text[i + 1] === '\n') {
          i++; // Skip \n in \r\n
        }
        if (curLine.trim().length > 0) {
          lines.push(curLine);
        }
        curLine = '';
      } else {
        curLine += char;
      }
    }
    if (curLine.trim().length > 0) {
      lines.push(curLine);
    }
    return lines;
  }

  /**
   * Parse a single CSV line into an array of fields
   */
  static parseCSVLine(line) {
    const result = [];
    let curField = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          curField += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(curField.trim());
        curField = '';
      } else {
        curField += char;
      }
    }
    result.push(curField.trim());
    return result;
  }

  /**
   * Clean numeric values by removing $, commas, mi, spaces
   */
  static cleanNumber(val) {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    
    let str = String(val).trim();
    // Remove $, commas, mi, km, quotes, spaces
    str = str.replace(/[$,"'mi\s]/gi, '');
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Map standard and alias header names to standard keys
   */
  static mapHeaders(headers) {
    const map = {};
    const lowerHeaders = headers.map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));

    lowerHeaders.forEach((h, idx) => {
      if (['origin', 'orig', 'from', 'src', 'source', 'departure'].includes(h)) {
        map.origin = idx;
      } else if (['destination', 'dest', 'to', 'arrival', 'target'].includes(h)) {
        map.destination = idx;
      } else if (h.includes('paxinout') || (h.includes('pax') && !h.includes('daily')) || h.includes('passenger') || h.includes('volume') || h.includes('traffic')) {
        map.pax = idx;
      } else if (h.includes('avgfare') || h.includes('fare') || h.includes('price') || h.includes('ticket') || h.includes('avgprice')) {
        map.avgFare = idx;
      } else if (h.includes('distance') || h.includes('dist') || h.includes('miles') || h.includes('length')) {
        map.distance = idx;
      } else if (h.includes('dailypax') || h.includes('daily') || h.includes('dailyio')) {
        map.dailyPax = idx;
      } else if (h.includes('rpm') || h.includes('yield') || h.includes('rpmmi') || h.includes('revpermile')) {
        map.rpm = idx;
      }
    });

    // Fallbacks if not found by pattern
    if (map.origin === undefined && headers.length > 0) map.origin = 0;
    if (map.destination === undefined && headers.length > 1) map.destination = 1;
    if (map.pax === undefined && headers.length > 2) map.pax = 2;
    if (map.avgFare === undefined && headers.length > 3) map.avgFare = 3;
    if (map.distance === undefined && headers.length > 4) map.distance = 4;
    if (map.dailyPax === undefined && headers.length > 5) map.dailyPax = 5;
    if (map.rpm === undefined && headers.length > 6) map.rpm = 6;

    return map;
  }
}

if (typeof window !== 'undefined') {
  window.AirlineCSVParser = AirlineCSVParser;
}
