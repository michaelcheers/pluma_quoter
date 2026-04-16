/**
 * Pluma Quoter - Shared pricing and delivery logic
 * Used by index.html (main form) and quote.html (internal tool)
 */

const PlumaQuoter = (() => {
  // Tiered pricing: { maxPages, standard: { price, days }, express: { price, days } }
  // Prices are cumulative totals (not per-page) for each tier boundary
  const PRICING_TABLE = [
    { pages: 1,  standard: { price: 75,  days: 3 }, express: { price: 95,  days: 1 } },
    { pages: 2,  standard: { price: 140, days: 3 }, express: { price: 160, days: 1 } },
    { pages: 3,  standard: { price: 175, days: 3 }, express: { price: 205, days: 1 } },
    { pages: 4,  standard: { price: 210, days: 3 }, express: { price: 260, days: 1 } },
    { pages: 5,  standard: { price: 245, days: 3 }, express: { price: 315, days: 1 } },
    { pages: 10, standard: { price: 420, days: 5 }, express: { price: 590, days: 2 } },
    { pages: 15, standard: { price: 595, days: 7 }, express: { price: 865, days: 3 } },
    { pages: 20, standard: { price: 770, days: 8 }, express: { price: 1140, days: 4 } },
  ];

  const EXPRESS_MAX_PAGES = 20;
  const CUTOFF_HOUR = 17; // 5:00 PM local time

  // Supported in-house language combinations
  const OUR_COMBOS = new Set(['es-en', 'fr-en', 'de-en', 'it-en', 'en-es']);

  function isOurCombination(langCombo) {
    return OUR_COMBOS.has(langCombo);
  }

  function calculatePrice(pages, serviceType) {
    pages = Math.max(1, Math.floor(pages) || 1);
    var type = serviceType === 'express' ? 'express' : 'standard';

    // Exact match in table
    for (var i = 0; i < PRICING_TABLE.length; i++) {
      if (pages === PRICING_TABLE[i].pages) return PRICING_TABLE[i][type].price;
    }

    // Interpolate between tiers
    for (var i = 1; i < PRICING_TABLE.length; i++) {
      if (pages < PRICING_TABLE[i].pages) {
        var low = PRICING_TABLE[i - 1];
        var high = PRICING_TABLE[i];
        var pagesInTier = pages - low.pages;
        var tierSpan = high.pages - low.pages;
        var pricePerPage = (high[type].price - low[type].price) / tierSpan;
        return Math.round(low[type].price + pagesInTier * pricePerPage);
      }
    }

    // Beyond table: extrapolate from last two tiers
    var last = PRICING_TABLE[PRICING_TABLE.length - 1];
    var prev = PRICING_TABLE[PRICING_TABLE.length - 2];
    var perPage = (last[type].price - prev[type].price) / (last.pages - prev.pages);
    return Math.round(last[type].price + (pages - last.pages) * perPage);
  }

  function getBusinessDays(pages, serviceType) {
    pages = Math.max(1, Math.floor(pages) || 1);
    var type = serviceType === 'express' ? 'express' : 'standard';
    for (var i = 0; i < PRICING_TABLE.length; i++) {
      if (pages <= PRICING_TABLE[i].pages) return PRICING_TABLE[i][type].days;
    }
    return PRICING_TABLE[PRICING_TABLE.length - 1][type].days;
  }

  function formatPrice(amount) {
    return '$' + amount.toFixed(2);
  }

  // BC statutory holidays (11 total)
  function nthMonday(year, month, n) {
    var d = new Date(year, month, 1);
    var count = 0;
    while (count < n) { if (d.getDay() === 1) count++; if (count < n) d.setDate(d.getDate() + 1); }
    return d;
  }

  function getBCHolidays(year) {
    // Good Friday: Easter Sunday - 2 (Anonymous Gregorian algorithm)
    var a = year % 19, b = Math.floor(year / 100), c = year % 100;
    var dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    var day = ((h + l - 7 * m + 114) % 31) + 1;

    // Victoria Day: last Monday before May 25
    var vicDay = new Date(year, 4, 24);
    while (vicDay.getDay() !== 1) vicDay.setDate(vicDay.getDate() - 1);

    return [
      new Date(year, 0, 1),          // New Year's Day
      nthMonday(year, 1, 3),         // Family Day: 3rd Monday of Feb
      new Date(year, month, day - 2),// Good Friday
      vicDay,                         // Victoria Day
      new Date(year, 6, 1),          // Canada Day
      nthMonday(year, 7, 1),         // BC Day: 1st Monday of Aug
      nthMonday(year, 8, 1),         // Labour Day: 1st Monday of Sep
      new Date(year, 8, 30),         // National Day for Truth and Reconciliation
      nthMonday(year, 9, 2),         // Thanksgiving: 2nd Monday of Oct
      new Date(year, 10, 11),        // Remembrance Day
      new Date(year, 11, 25),        // Christmas Day
    ];
  }

  function isHoliday(date) {
    var holidays = getBCHolidays(date.getFullYear());
    var t = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    for (var i = 0; i < holidays.length; i++) {
      var h = holidays[i];
      var ht = h.getFullYear() * 10000 + (h.getMonth() + 1) * 100 + h.getDate();
      if (t === ht) return true;
    }
    return false;
  }

  function addBusinessDays(date, days) {
    const result = new Date(date);
    let added = 0;
    while (added < days) {
      result.setDate(result.getDate() + 1);
      const dow = result.getDay();
      if (dow !== 0 && dow !== 6 && !isHoliday(result)) added++;
    }
    return result;
  }

  // Get current date/time in Vancouver timezone
  function vancouverNow() {
    var s = new Date().toLocaleString('en-US', { timeZone: 'America/Vancouver' });
    return new Date(s);
  }

  function calculateDeliveryDate(serviceType, pages, fromDate) {
    const now = fromDate || vancouverNow();
    const days = getBusinessDays(pages || 1, serviceType);

    // If past cutoff (5 PM Vancouver time), start from next business day
    let start = new Date(now);
    if (now.getHours() >= CUTOFF_HOUR) {
      start = addBusinessDays(start, 1);
      start.setHours(0, 0, 0, 0);
    }

    return addBusinessDays(start, days);
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function isExpressAvailable(pages) {
    return pages <= EXPRESS_MAX_PAGES;
  }

  return {
    PRICING_TABLE,
    EXPRESS_MAX_PAGES,
    OUR_COMBOS,
    isOurCombination,
    calculatePrice,
    getBusinessDays,
    formatPrice,
    addBusinessDays,
    calculateDeliveryDate,
    formatDate,
    formatDateISO,
    isExpressAvailable
  };
})();
