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

  function addBusinessDays(date, days) {
    const result = new Date(date);
    let added = 0;
    while (added < days) {
      result.setDate(result.getDate() + 1);
      const dow = result.getDay();
      if (dow !== 0 && dow !== 6) added++;
    }
    return result;
  }

  function calculateDeliveryDate(serviceType, fromDate) {
    const now = fromDate || new Date();
    const rate = RATES[serviceType] || RATES.standard;

    // If past cutoff, start from next business day
    let start = new Date(now);
    if (now.getHours() >= CUTOFF_HOUR) {
      start = addBusinessDays(start, 1);
      // Reset to start of that day for clean calculation
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
