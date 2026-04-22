/**
 * Pluma Quoter - Shared pricing, eligibility and delivery logic.
 *
 * Flow (per the spec):
 *   1. Service type (Certified | Professional | Notarized) — Notarized
 *      always routes to a manual quote.
 *   2. Language pair (from / to). Either side = "other" → manual quote.
 *   3. Document upload → total page count. Unknown or >= 21 → manual quote.
 *   4. Turnaround (Standard | Express).
 *   5. Instant quote subtotal.
 *   6. Optional printed copy + shipping (adds Canada Post fee).
 *   7. Payment.
 *
 * Used by index.html (customer form) and quote.html (internal tool).
 */
const PlumaQuoter = (() => {
  // --- Service types -------------------------------------------------------
  // `requiresManualQuote` forces the manual-quote path regardless of other
  // inputs. Pricing for certified vs. professional is currently identical;
  // if that changes, only `getPriceMultiplier` needs to update.
  const SERVICE_TYPES = [
    {
      id: 'certified',
      label: 'Certified Translation',
      description:
        "A translation prepared and certified by a certified translator, " +
        "accompanied by a declaration and identifying information confirming " +
        "the translator's certified status.",
      requiresManualQuote: false,
      isDefault: true,
    },
    {
      id: 'professional',
      label: 'Professional Translation',
      description:
        'Standard, regular translation for individual and business use.',
      requiresManualQuote: false,
    },
    {
      id: 'notarized',
      label: 'Notarized Translation',
      description:
        'The act of a notary witnessing a signature or administering an oath. ' +
        'Not all documents require notarization, but some, such as apostilles ' +
        'for countries outside of Canada, do. You can consult our guide for ' +
        'more details. If you have further questions, please verify with the ' +
        'institution that requires your documents.',
      requiresManualQuote: true,
    },
  ];

  function getServiceType(id) {
    return SERVICE_TYPES.find(s => s.id === id) || null;
  }

  function getDefaultServiceType() {
    return SERVICE_TYPES.find(s => s.isDefault) || SERVICE_TYPES[0];
  }

  // --- Languages -----------------------------------------------------------
  // Spec: From = English / Spanish / German / Italian / Other
  //       To   = English / Spanish / Other
  // Either side = 'other' → manual quote.
  const FROM_LANGUAGES = [
    { id: 'en', label: 'English' },
    { id: 'es', label: 'Spanish' },
    { id: 'de', label: 'German' },
    { id: 'it', label: 'Italian' },
    { id: 'other', label: 'Other' },
  ];

  const TO_LANGUAGES = [
    { id: 'en', label: 'English' },
    { id: 'es', label: 'Spanish' },
    { id: 'other', label: 'Other' },
  ];

  function languageLabel(list, id) {
    var l = list.find(x => x.id === id);
    return l ? l.label : id;
  }

  function isManualLanguagePair(fromId, toId) {
    if (!fromId || !toId) return false; // not yet chosen — still neutral
    if (fromId === 'other' || toId === 'other') return true;
    if (fromId === toId) return true;   // same-language "translation" — manual review
    return false;
  }

  // --- Pricing -------------------------------------------------------------
  // Cumulative totals (not per-page) at each tier boundary; interpolated
  // between boundaries. Above 20 pages the flow is manual, so no
  // extrapolation is normally needed.
  const PRICING_TABLE = [
    { pages: 1,  standard: { price: 75,  days: 3 }, express: { price: 95,   days: 1 } },
    { pages: 2,  standard: { price: 140, days: 3 }, express: { price: 160,  days: 1 } },
    { pages: 3,  standard: { price: 175, days: 3 }, express: { price: 205,  days: 1 } },
    { pages: 4,  standard: { price: 210, days: 3 }, express: { price: 260,  days: 1 } },
    { pages: 5,  standard: { price: 245, days: 3 }, express: { price: 315,  days: 1 } },
    { pages: 10, standard: { price: 420, days: 5 }, express: { price: 590,  days: 2 } },
    { pages: 15, standard: { price: 595, days: 7 }, express: { price: 865,  days: 3 } },
    { pages: 20, standard: { price: 770, days: 8 }, express: { price: 1140, days: 4 } },
  ];

  const MAX_INSTANT_QUOTE_PAGES = 20; // >= 21 → manual quote per spec step 4
  const CUTOFF_HOUR = 17;             // 5 PM America/Vancouver

  // Canada Post shipping fee (domestic tracked, document-size envelope).
  // TODO: verify against current Canada Post rates; exposed as a single
  // constant so ops can update it in one place.
  const SHIPPING_FEE_CAD = 25;

  function getPriceMultiplier(serviceId) {
    // Hook for future per-service pricing. Both currently charge the same.
    if (serviceId === 'professional') return 1.0;
    if (serviceId === 'certified')    return 1.0;
    return 1.0;
  }

  function calculateSubtotal(pages, turnaround, serviceId) {
    pages = Math.max(1, Math.floor(pages) || 1);
    var type = turnaround === 'express' ? 'express' : 'standard';

    var base = null;

    // Exact boundary
    var exact = PRICING_TABLE.find(t => t.pages === pages);
    if (exact) {
      base = exact[type].price;
    } else {
      // Interpolate between tiers
      for (var i = 1; i < PRICING_TABLE.length; i++) {
        if (pages < PRICING_TABLE[i].pages) {
          var low = PRICING_TABLE[i - 1];
          var high = PRICING_TABLE[i];
          var perPage = (high[type].price - low[type].price) / (high.pages - low.pages);
          base = Math.round(low[type].price + (pages - low.pages) * perPage);
          break;
        }
      }
      // Defensive fallback (shouldn't be reached — >=21 routes to manual)
      if (base === null) {
        var last = PRICING_TABLE[PRICING_TABLE.length - 1];
        var prev = PRICING_TABLE[PRICING_TABLE.length - 2];
        var pp = (last[type].price - prev[type].price) / (last.pages - prev.pages);
        base = Math.round(last[type].price + (pages - last.pages) * pp);
      }
    }

    return Math.round(base * getPriceMultiplier(serviceId) * 100) / 100;
  }

  function calculateTotal(pages, turnaround, serviceId, includeShipping) {
    var subtotal = calculateSubtotal(pages, turnaround, serviceId);
    return includeShipping ? subtotal + SHIPPING_FEE_CAD : subtotal;
  }

  function getBusinessDays(pages, turnaround) {
    pages = Math.max(1, Math.floor(pages) || 1);
    var type = turnaround === 'express' ? 'express' : 'standard';
    for (var i = 0; i < PRICING_TABLE.length; i++) {
      if (pages <= PRICING_TABLE[i].pages) return PRICING_TABLE[i][type].days;
    }
    return PRICING_TABLE[PRICING_TABLE.length - 1][type].days;
  }

  function formatPrice(amount) {
    return '$' + Number(amount).toFixed(2);
  }

  // --- Manual-quote decision ----------------------------------------------
  // Single source of truth. UI calls this on every input change.
  // `pageCountKnown` is tri-state: true, false (couldn't detect), or null
  // (no file uploaded yet — still neutral).
  function getQuoteMode(inputs) {
    var service = getServiceType(inputs.serviceId);
    if (service && service.requiresManualQuote) {
      return { mode: 'manual', reason: 'notarized' };
    }
    if (isManualLanguagePair(inputs.fromLang, inputs.toLang)) {
      return { mode: 'manual', reason: 'language' };
    }
    if (inputs.pageCountKnown === false) {
      return { mode: 'manual', reason: 'pages-unknown' };
    }
    if (typeof inputs.pages === 'number' && inputs.pages > MAX_INSTANT_QUOTE_PAGES) {
      return { mode: 'manual', reason: 'pages-too-many' };
    }
    return { mode: 'instant', reason: null };
  }

  function manualQuoteReasonText(reason) {
    switch (reason) {
      case 'notarized':
        return 'Notarized translations require a personalized quote.';
      case 'language':
        return "We'll prepare a personalized quote for this language pair.";
      case 'pages-unknown':
        return "We couldn't automatically count the pages in your file(s), so we'll quote it manually.";
      case 'pages-too-many':
        return 'Documents longer than ' + MAX_INSTANT_QUOTE_PAGES +
               ' pages are quoted manually so we can match you with the right team.';
      default:
        return 'This request requires a personalized quote.';
    }
  }

  // --- Business-day / delivery --------------------------------------------
  function nthMonday(year, month, n) {
    var d = new Date(year, month, 1);
    var count = 0;
    while (count < n) { if (d.getDay() === 1) count++; if (count < n) d.setDate(d.getDate() + 1); }
    return d;
  }

  function getBCHolidays(year) {
    var a = year % 19, b = Math.floor(year / 100), c = year % 100;
    var dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    var day = ((h + l - 7 * m + 114) % 31) + 1;

    var vicDay = new Date(year, 4, 24);
    while (vicDay.getDay() !== 1) vicDay.setDate(vicDay.getDate() - 1);

    return [
      new Date(year, 0, 1),           // New Year's Day
      nthMonday(year, 1, 3),          // Family Day: 3rd Mon of Feb
      new Date(year, month, day - 2), // Good Friday
      vicDay,                         // Victoria Day
      new Date(year, 6, 1),           // Canada Day
      nthMonday(year, 7, 1),          // BC Day
      nthMonday(year, 8, 1),          // Labour Day
      new Date(year, 8, 30),          // Truth & Reconciliation
      nthMonday(year, 9, 2),          // Thanksgiving
      new Date(year, 10, 11),         // Remembrance Day
      new Date(year, 11, 25),         // Christmas
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

  function vancouverNow() {
    var s = new Date().toLocaleString('en-US', { timeZone: 'America/Vancouver' });
    return new Date(s);
  }

  function calculateDeliveryDate(turnaround, pages, fromDate) {
    const now = fromDate || vancouverNow();
    const days = getBusinessDays(pages || 1, turnaround);
    let start = new Date(now);
    if (now.getHours() >= CUTOFF_HOUR) {
      start = addBusinessDays(start, 1);
      start.setHours(0, 0, 0, 0);
    }
    return addBusinessDays(start, days);
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return {
    // Constants
    SERVICE_TYPES,
    FROM_LANGUAGES,
    TO_LANGUAGES,
    PRICING_TABLE,
    MAX_INSTANT_QUOTE_PAGES,
    SHIPPING_FEE_CAD,
    // Lookups
    getServiceType,
    getDefaultServiceType,
    languageLabel,
    // Eligibility
    isManualLanguagePair,
    getQuoteMode,
    manualQuoteReasonText,
    // Pricing
    calculateSubtotal,
    calculateTotal,
    getBusinessDays,
    formatPrice,
    // Delivery
    addBusinessDays,
    calculateDeliveryDate,
    formatDate,
    formatDateISO,
  };
})();
