/**
 * Pluma Quoter - Shared pricing and delivery logic
 * Used by index.html (main form) and quote.html (internal tool)
 */

const PlumaQuoter = (() => {
  const RATES = {
    standard: { firstPage: 75, additionalPage: 40, businessDays: 3 },
    express:  { firstPage: 95, additionalPage: 55, businessDays: 1 }
  };

  const EXPRESS_MAX_PAGES = 5;
  const CUTOFF_HOUR = 17; // 5:00 PM local time

  function calculatePrice(pages, serviceType) {
    pages = Math.max(1, Math.floor(pages) || 1);
    const rate = RATES[serviceType] || RATES.standard;
    return rate.firstPage + Math.max(0, pages - 1) * rate.additionalPage;
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

  function calculateDeliveryDate(serviceType, fromDate) {
    const now = fromDate || vancouverNow();
    const rate = RATES[serviceType] || RATES.standard;

    // If past cutoff (5 PM Vancouver time), start from next business day
    let start = new Date(now);
    if (now.getHours() >= CUTOFF_HOUR) {
      start = addBusinessDays(start, 1);
      start.setHours(0, 0, 0, 0);
    }

    return addBusinessDays(start, rate.businessDays);
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
    RATES,
    EXPRESS_MAX_PAGES,
    calculatePrice,
    formatPrice,
    addBusinessDays,
    calculateDeliveryDate,
    formatDate,
    formatDateISO,
    isExpressAvailable
  };
})();
