/* Reply guards for the Cambyte assistant widget and the salon demo. One file, no network, no storage.
 *
 *   window.CambyteGuards.checkReply(text, opts) -> { ok, text, reason }
 *
 * The shared core between CORE-BEGIN and CORE-END is copied from worker/src/guards.js by
 * tools/sync-guards.js; edit it there, never here. Nothing in this file is specific to one site:
 * every allowed amount, the contact address, link host and tier price comes in through opts.
 * The server runs the same core and is authoritative.
 *
 * opts (all optional; the defaults allow nothing):
 *   allowedAmounts  numbers that may appear as money              default []
 *   contactEmail    the only email address that may appear        default ''
 *   tierPrices      { starter: [..], care: [..], hourly: [..] }   default {} (no tier check)
 *   canary          secret token that must never appear           default ''
 *   okHosts         link hosts that may appear                    default [] (no links)
 *   agencyAmounts   amounts allowed only beside "agency"          default []
 *   okPercents      percentages that may be stated                default []
 *   okVoucher       true: the word "voucher" may be used (gift vouchers are sold); "voucher code" stays blocked
 *   maxChars        longest shown reply                           default 1200
 * Returns { ok: true, text } or { ok: false, reason }; a blocked reply carries no text.
 */
(function (root) {
  'use strict';

  /* CORE-BEGIN: identical text in worker/src/guards.js and assets/guards.js (tools/guard-fp-test.js checks this) */
  // Unicode property escapes; if the runtime lacks them the reply is simply not shown.
  var U = (function () {
    try {
      var inv = '[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u2800\\ufffc\\u3164\\u115f\\u1160\\uffa0]|\\p{Cf}|\\p{Co}|\\p{Cn}|\\p{Cs}';
      return {
        inv: new RegExp(inv, 'gu'), invOne: new RegExp(inv, 'u'),
        m: new RegExp('\\p{M}', 'gu'),
        nd: new RegExp('\\p{Nd}', 'gu'), ndOne: new RegExp('\\p{Nd}', 'u'),
        phone: new RegExp('(?:\\d[^\\p{L}\\d]{0,8}){10,}', 'u')
      };
    } catch (e) { return null; }
  })();

  function toNum(x) { return Number(String(x).replace(/,/g, '')); }

  function digitValue(ch) {
    // Unicode decimal digits come in contiguous runs of ten: count back to the zero.
    var cp = ch.codePointAt(0), k = 0;
    while (cp - k - 1 > 0 && U.ndOne.test(String.fromCodePoint(cp - k - 1))) k++;
    return k % 10;
  }

  // Cyrillic and Greek lookalikes (and the lira/fullwidth pound signs) folded to Latin / the pound sign.
  var FOLD_FROM = '\u0430\u0441\u0435\u043e\u0440\u0445\u0443\u0456\u0458\u0455\u0501\u0261\u0131\u0410\u0412\u0415\u041a\u041c\u041d\u041e\u0420\u0421\u0422\u0425\u0423\u0406\u0408\u0405\u0391\u0392\u0395\u0397\u0399\u039a\u039c\u039d\u039f\u03a1\u03a4\u03a7\u03a5\u0396\u03bf\u03b1\u03b5\u03b9\u03ba\u03bd\u03c1\u03c4\u03c5\u03c7\u20a4\uffe1\u03f2\u1d04\u0251\u1d00\u04cf\u03f9';
  var FOLD_TO = 'aceopxyijsdgiABEKMHOPCTXYIJSABEHIKMNOPTXYZoaeikvptux\u00a3\u00a3ccaalC';
  var FOLD_RE = new RegExp('[' + FOLD_FROM + ']', 'g');
  function foldChar(c) { return FOLD_TO.charAt(FOLD_FROM.indexOf(c)); }

  // Display / canonical text: NFKC, marks and invisibles gone, ASCII digits, folded lookalikes,
  // markdown symbols gone, one space per run (newlines kept). `sp`: invisibles become a space instead.
  function dropInv(s, sp) {
    // With sp, an invisible becomes a space unless it sits inside a number ("1,\u200d500").
    return s.replace(U.inv, sp ? function (c, i, str) { return /[\d,.]/.test(str.charAt(i - 1)) && /[\d,.]/.test(str.charAt(i + 1)) ? '' : ' '; } : '');
  }

  function normalise(text, sp) {
    // U+03f2 / U+03f9 (lunate sigma, looks like c / C) would turn into sigma under NFKC, so they fold first.
    var s = dropInv(String(text).replace(/\u03f2/g, 'c').replace(/\u03f9/g, 'C').normalize('NFKC'), sp);
    s = s.normalize('NFKD').replace(U.m, '').normalize('NFKC');
    return dropInv(s, sp)
      .replace(U.nd, function (c) { return c <= '\x7f' ? c : String(digitValue(c)); })
      .replace(/[\u3002\uff61\uff0e\u30fb\uff65\u06d4\u0589]/g, '.')
      .replace(FOLD_RE, foldChar)
      .replace(/[*~`_]/g, '')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ ?\n ?/g, '\n');
  }

  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", period: '.', comma: ',', commat: '@', sol: '/', colon: ':', semi: ';', lowbar: '_', hyphen: '-', dash: '-', nbsp: ' ', num: '#', excl: '!', lpar: '(', rpar: ')', lsqb: '[', rsqb: ']', lbrack: '[', rbrack: ']', plus: '+', equals: '=', quest: '?', percnt: '%', dollar: '$', pound: '\u00a3', ast: '*', bsol: '\\' };

  // HTML entities and percent escapes decoded; used for the CHECK copy only, never for the shown text.
  function decodeText(s) {
    function cp(n) { return n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff) ? String.fromCodePoint(n) : ''; }
    for (var i = 0; i < 3; i++) {
      var p = s;
      s = s.replace(/&#(\d{1,7});?/g, function (a, n) { return cp(parseInt(n, 10)); })
        .replace(/&#x([0-9a-f]{1,6});?/gi, function (a, n) { return cp(parseInt(n, 16)); })
        .replace(/&([a-z]{2,8});/gi, function (a, n) { var k = n.toLowerCase(); return ENT.hasOwnProperty(k) ? ENT[k] : a; })
        .replace(/%([0-9a-f]{2})/gi, function (a, h) { var n = parseInt(h, 16); return n >= 0x20 && n < 0x7f ? String.fromCharCode(n) : a; });
      if (s === p) break;
    }
    return s;
  }

  // Line-start headings and bullets.
  function stripBlocks(t) {
    return t.replace(/^[ \t]*#{1,6}[ \t]+/gm, '').replace(/^[ \t]*(?:[-\u2022]|\d+\.)[ \t]+/gm, '');
  }

  // One line for the scans; a line break becomes the pilcrow so it still ends a sentence.
  function flatten(t) { return t.replace(/[ \t]*\n[ \t]*/g, ' \u00b6 ').replace(/\s+/g, ' ').trim(); }

  // { out: the shown text (normalised), flats: every copy the scans must pass }.
  function views(text) {
    var raw = String(text), vs = [normalise(raw)], cands = [], flats = [], i, d, f;
    if (U.invOne.test(raw.normalize('NFKC'))) vs.push(normalise(raw, true));
    for (i = 0; i < vs.length; i++) {
      cands.push(vs[i]);
      d = decodeText(vs[i]);
      if (d !== vs[i]) cands.push(normalise(d));
    }
    for (i = 0; i < cands.length; i++) {
      f = flatten(stripBlocks(cands[i]));
      if (flats.indexOf(f) < 0) flats.push(f);
    }
    return { out: vs[0], flats: flats };
  }

  // ---------- money ----------
  var NUM = '(\\d+(?:,\\d{3})*(?:\\.\\d+)?|\\.\\d+)';
  var MULT = { k: 1e3, m: 1e6, million: 1e6, grand: 1e3, thousand: 1e3, hundred: 1e2 };
  var NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  var NW = Object.keys(NUMW).join('|') + '|hundred|thousand|million';
  var WORDS_UNIT = '\\b((?:(?:a|an|and|' + NW + ')[\\s-]+)*(?:' + NW + '))[\\s-]+(?:(?:british|uk)[\\s-]+)?(pounds?|quids?|sterling|gbp|grand|percent|per cent)\\b|\\b(a)\\s+(grand)\\b';
  var POUND_W = 'pounds?|quids?|GBPs?|sterling|grand';
  var OTHER_W = 'dollars?|euros?|USD|EUR|CHF|bucks|yen|yuan|lbs?|smackers|notes|rupees?|francs?|cents';
  var SYMS = '[\u00a3$\u20ac\u00a5\u20b9]';
  // A bare number followed by one of these is a count or a time, not a price.
  var UNITS = '(?:%|pc\\b|pct\\b|percent\\b|per cent\\b|days?\\b|weeks?\\b|months?\\b|years?\\b|hours?\\b|hrs?\\b|minutes?\\b|mins?\\b|seconds?\\b|steps?\\b|pages?\\b|screens?\\b|words?\\b|people\\b|clients?\\b|users?\\b|times\\b|ways?\\b|options?\\b|tiers?\\b|apps?\\b|items?\\b|things?\\b|miles?\\b|km\\b|am\\b|pm\\b|characters?\\b|chars?\\b|requests?\\b|messages?\\b|emails?\\b|orders?\\b|customers?\\b|visitors?\\b|downloads?\\b|devices?\\b|languages?\\b|platforms?\\b|lines?\\b|questions?\\b|sessions?\\b|calls?\\b|photos?\\b|images?\\b|px\\b|mb\\b|gb\\b|kb\\b|x\\b|s\\b|:|\\.\\d)';
  var JOINER = '(?:-|\u2013|\u2014|\\bup to\\b|\\bto\\b|\\bor\\b|\\band\\b|\\bplus\\b|\\+|&|\\/|,)';
  var GAP = '[\\s\u00b6]{0,6}'; // a space or a line break between a currency sign and its number

  function parseWords(str) {
    var total = 0, cur = 0, w = str.toLowerCase().split(/[\s-]+/), i;
    for (i = 0; i < w.length; i++) {
      if (w[i] === 'hundred') cur = (cur || 1) * 100;
      else if (w[i] === 'thousand') { total += (cur || 1) * 1000; cur = 0; }
      else if (w[i] === 'million') { total += (cur || 1) * 1e6; cur = 0; }
      else if (NUMW.hasOwnProperty(w[i])) cur += NUMW[w[i]];
    }
    return total + cur;
  }

  // A bare number beside a money amount counts only when it looks like a price (3+ digits, a comma, or k).
  function bareNum(str) {
    var t = str.trim();
    if (!/^\d{3}|k$|,/i.test(t)) return null;
    return toNum(t.replace(/k$/i, '')) * (/k$/i.test(t) ? 1000 : 1);
  }

  // Every money amount: [{n, at, end}]; n is NaN when the amount can never be valid.
  function moneyHits(s) {
    var out = [], m, re, i, n, h, a, p, b, w;
    function add(v, at, end) { out.push({ n: v, at: at, end: end }); }
    function prevOk(idx) { return !/[\w\u00a3$\u20ac\u00a5\u20b9.,]/.test(s.charAt(idx - 1)); }
    re = new RegExp('(' + SYMS + '|\\b(?:GBP|USD|EUR|CHF)\\s?)' + GAP + '(-)?' + NUM + '\\s?(k\\b|m\\b|million\\b|grand\\b|thousand\\b|hundred\\b)?', 'gi');
    while ((m = re.exec(s))) {
      n = toNum(m[3]) * (m[4] ? MULT[m[4].toLowerCase()] : 1);
      var before = s.slice(0, m.index);
      // Negative amounts: "-£50", "£-50", "minus £50".
      if (m[2] || /(?:^|[^\w])[-\u2212\u2013]$/.test(before) || /\bminus\s*$/i.test(before)) n = NaN;
      if (!/\u00a3|gbp/i.test(m[1])) n = NaN;
      add(n, m.index, m.index + m[0].length);
    }
    re = new RegExp(NUM + '\\s?(k\\b|m\\b|million\\b|thousand\\b|hundred\\b)?\\s?((?:(?:british|uk)\\s+)?(?:' + POUND_W + ')|' + OTHER_W + ')\\b', 'gi');
    while ((m = re.exec(s))) {
      w = m[3].replace(/^(?:british|uk)\s+/i, '');
      n = toNum(m[1]) * (m[2] ? MULT[m[2].toLowerCase()] : 1) * (/^grand$/i.test(w) ? 1000 : 1);
      if (!new RegExp('^(?:' + POUND_W + ')$', 'i').test(w)) n = NaN;
      add(n, m.index, m.index + m[0].length);
    }
    re = new RegExp('\\b(?:pounds?|quids?|sterling)' + GAP + NUM + '\\s?(k\\b|m\\b|million\\b|thousand\\b|hundred\\b)?', 'gi');
    while ((m = re.exec(s))) add(toNum(m[1]) * (m[2] ? MULT[m[2].toLowerCase()] : 1), m.index, m.index + m[0].length);
    re = new RegExp(NUM + '\\s?(?:[A-Z]{1,2})?(' + SYMS + ')', 'g');
    while ((m = re.exec(s))) add(m[2] === '\u00a3' ? toNum(m[1]) : NaN, m.index, m.index + m[0].length);
    re = new RegExp('\u00a3' + GAP + '((?:(?:and|' + NW + ')[\\s-]+)*(?:' + NW + '))\\b', 'gi');
    while ((m = re.exec(s))) add(parseWords(m[1]), m.index, m.index + m[0].length);
    // Pence: "50p", "99 pence" (never a listed price). "5 p.m." is a time.
    re = new RegExp(NUM + '\\s?(?:p\\b(?!\\.?\\s?m\\b)|pence\\b|pennies\\b)', 'gi');
    while ((m = re.exec(s))) add(toNum(m[1]) / 100, m.index, m.index + m[0].length);
    re = /\bhalf an? (?:grand|k)\b/gi;
    while ((m = re.exec(s))) add(500, m.index, m.index + m[0].length);
    re = new RegExp(WORDS_UNIT, 'gi');
    while ((m = re.exec(s))) {
      if (/percent|per cent/i.test(m[2] || m[4] || '')) continue;
      add(m[3] ? 1000 : parseWords(m[1]) * (/grand/i.test(m[2]) ? 1000 : 1), m.index, m.index + m[0].length);
    }
    // Pricing verbs: "just 999", "costs 999", "save 500", "knock 200 off", "the price is 1200", "pay 1200".
    re = new RegExp('\\b(cost|costs|costing|price|priced|prices|just|only|save|saves|saving|off|discount|charge|charges|charged|charging|pay|pays|paying|paid|budget|budgets|fee|fees|quote|quoted|quoting|worth)(?:\\s+(?:is|are|was|of|at|about|around|roughly|approx\\w*|comes? to|will be|would be|being))?[\\s:=]+' + NUM + '(\\s?k\\b)?(?!\\d)(?!\\s?' + UNITS + ')', 'gi');
    while ((m = re.exec(s))) {
      n = toNum(m[2]) * (m[3] ? 1000 : 1);
      if (/^(?:just|only)$/i.test(m[1]) && n < 10) continue;
      if (!/^(?:cost|costs|costing|price|priced|just|only|save|saves|saving|off|discount)$/i.test(m[1]) && n < 10) continue;
      add(n, m.index, m.index + m[0].length);
    }
    // Weaker verbs ("for 1200", "at 3500", "a total of 2000", "deposit of 750"): only a number that looks like a price.
    re = new RegExp('\\b(?:for|at|total(?:\\s+of)?|deposit(?:\\s+of)?|about|around|roughly|approx\\w*)[\\s:=]+' + NUM + '(\\s?k\\b)?(?!\\d)(?!\\s?' + UNITS + ')', 'gi');
    while ((m = re.exec(s))) {
      n = toNum(m[1]) * (m[2] ? 1000 : 1);
      if (n < 100 || (!m[2] && !/,/.test(m[1]) && n >= 1900 && n <= 2035)) continue;
      add(n, m.index, m.index + m[0].length);
    }
    // A tier or plan name straight before a bare number: "Starter 3500", "Care Plus: 299", "Hourly rate 79".
    re = new RegExp('\\b(?:starter|business|custom|care\\s+plus|care\\s+pro|hourly(?:\\s+rate)?)\\b[\\s:=]*' + NUM + '(\\s?k\\b)?(?!\\d)(?!\\s?' + UNITS + ')', 'gi');
    while ((m = re.exec(s))) {
      n = toNum(m[1]) * (m[2] ? 1000 : 1);
      if (!m[2] && (n < 40 || (!/,/.test(m[1]) && n >= 1900 && n <= 2035))) continue;
      add(n, m.index, m.index + m[0].length);
    }
    // "2k", "2 grand", "2-3k", "a couple of grand", "a few hundred": a figure in thousands with no pound sign.
    re = new RegExp(NUM + '\\s?(?:-|\u2013|\u2014|\\bto\\b)\\s?' + NUM + '\\s?(k\\b|thousand\\b|grand\\b)', 'gi');
    while ((m = re.exec(s))) {
      if (!prevOk(m.index)) continue;
      add(toNum(m[1]) * 1000, m.index, m.index + m[0].length);
      add(toNum(m[2]) * 1000, m.index, m.index + m[0].length);
    }
    re = new RegExp(NUM + '\\s?(k\\b|thousand\\b|grand\\b)(?!\\s?' + UNITS + ')', 'gi');
    while ((m = re.exec(s))) {
      if (!prevOk(m.index)) continue;
      add(toNum(m[1]) * 1000, m.index, m.index + m[0].length);
    }
    re = /\b(?:couple|few|several|handful)\s+(?:of\s+)?(?:hundred|thousand|grand|k)\b/gi;
    while ((m = re.exec(s))) add(NaN, m.index, m.index + m[0].length);
    // ... and a bare number right before "a month", "per year", "off".
    re = new RegExp(NUM + '(\\s?k\\b)?\\s?(?:(?:a|per)\\s(?:month|year|week)\\b|off\\b)', 'gi');
    while ((m = re.exec(s))) {
      if (!prevOk(m.index)) continue;
      add(toNum(m[1]) * (m[2] ? 1000 : 1), m.index, m.index + m[0].length);
    }
    // Both ends of a list or range: a bare number joined to an amount ("£1,000 to 2,000", "£1,500 or 2,000").
    for (i = 0; i < out.length && i < 60; i++) {
      h = out[i];
      a = new RegExp('^\\s?(' + JOINER + ')\\s?\u00a3?' + NUM + '(\\s?k\\b)?(?!\\s?:)(?!\\s?' + UNITS + ')', 'i').exec(s.slice(h.end));
      if (a && (b = bareNum(a[2] + (a[3] ? 'k' : ''))) != null && !(/^(?:,|and)$/i.test(a[1]) && b >= 2020 && b <= 2035 && !/[,k]/i.test(a[2] + (a[3] || '')))) add(b, h.end, h.end + a[0].length);
      p = new RegExp(NUM + '(\\s?k\\b)?\\s?(' + JOINER + ')\\s?$', 'i').exec(s.slice(Math.max(0, h.at - 30), h.at));
      if (p && (b = bareNum(p[1] + (p[2] ? 'k' : ''))) != null && !(/^(?:,|and)$/i.test(p[3]) && b >= 2020 && b <= 2035 && !/[,k]/i.test(p[1] + (p[2] || '')))) add(b, h.at, h.at);
    }
    return out;
  }

  // A percentage tied to a price cut or a saving is never allowed, whatever the number ("50% off",
  // "save 10%", "40 percent cheaper").
  var PCT_AFTER = /^\s?(?:off\b|discount|cheaper|less\b|reduc|saving|lower\b|cut\b)/i;
  var PCT_BEFORE = /(?:\bsav(?:e|es|ed|ing|ings)|\bdiscount(?:ed)?|\breduc(?:e|es|ed|tion)|\bknock(?:s|ed|ing)?|\bslash(?:es|ed|ing)?|\bcuts?|\blower(?:s|ed|ing)?)(?:\s+(?:of|by|up to|an?|extra|another|the price|prices?|it|that|this|the cost|cost))*\s*$/i;

  // okp: the percentages the caller may state (deposit, uplift).
  function percentBad(s, okp) {
    var m, re = new RegExp(NUM + '\\s?(?:%|pc\\b|pct\\b|percent\\b|per cent\\b)', 'gi');
    while ((m = re.exec(s))) {
      if (okp.indexOf(toNum(m[1])) < 0) return true;
      if (PCT_AFTER.test(s.slice(m.index + m[0].length)) || PCT_BEFORE.test(s.slice(Math.max(0, m.index - 40), m.index))) return true;
    }
    re = new RegExp(WORDS_UNIT, 'gi');
    while ((m = re.exec(s))) {
      if (!/percent|per cent/i.test(m[2] || '')) continue;
      if (okp.indexOf(parseWords(m[1])) < 0) return true;
      if (PCT_AFTER.test(s.slice(m.index + m[0].length)) || PCT_BEFORE.test(s.slice(Math.max(0, m.index - 40), m.index))) return true;
    }
    return false;
  }

  function sentenceOf(s, i) {
    var a = 0, b = s.length, m, re = /[.!?\u00b6]+(?=\s|$)/g, e;
    while ((m = re.exec(s))) {
      e = m.index + m[0].length;
      if (e <= i) a = e; else { b = e; break; }
    }
    return { text: s.slice(a, b), from: a };
  }

  // Tier and plan names. Each: [word pattern, key, strong]. A strong name counts when it is capitalised;
  // every name counts when it sits beside is / costs / at / from / a pound amount, or before app / tier /
  // package / plan. Longer names come first so "Care Plus" is not read as "Care".
  var NAMES = [
    ['care[\\s-]+plus', 'careplus', 1], ['care[\\s-]+pro', 'carepro', 1],
    ['hourly[\\s-]+rate|hourly|per[\\s-]+hour[\\s-]+rate', 'hourly', 1],
    ['care(?:[\\s-]+plans?)?', 'care', 0], ['(?:day[\\s-]+)?rate', 'hourly', 0],
    ['starter', 'starter', 1], ['business', 'business', 1], ['custom', 'custom', 1],
    ['cheapest|entry(?:[\\s-]level)?|basic', 'starter', 0],
    ['middle|mid(?:[\\s-]?(?:range|tier))?|medium', 'business', 0],
    ['bespoke|top(?:[\\s-]end)?|ai[\\s-]app', 'custom', 0]
  ];
  // Care plans and the hourly rate must match their own price exactly; the three tiers are only
  // compared when the amount belongs to some other tier or plan.
  var STRICT = ['care', 'careplus', 'carepro', 'hourly'];

  // Names in a sentence: [{ pos, end, key }].
  function tierNames(sent) {
    var out = [], i, j, re, m, after, before, named, pos, clash;
    for (i = 0; i < NAMES.length; i++) {
      re = new RegExp('\\b(?:' + NAMES[i][0] + ')\\b', 'gi');
      while ((m = re.exec(sent.text))) {
        after = sent.text.slice(m.index + m[0].length);
        before = sent.text.slice(0, m.index);
        named = (NAMES[i][2] && /^[A-Z]/.test(m[0])) || /^\s+(?:apps?|tiers?|packages?|plans?)\b/i.test(after) ||
          /^\s*(?:(?:is|are|costs?|starts?|at|from|will be|would be)\b|[:=]|\u00a3)/i.test(after) ||
          /\u00a3[\d,.]+k?\s*(?:for|on)\s+(?:the\s+)?$/i.test(before);
        if (!named) continue;
        pos = sent.from + m.index;
        clash = false;
        for (j = 0; j < out.length; j++) if (pos < out[j].end && pos + m[0].length > out[j].pos) clash = true;
        if (!clash) out.push({ pos: pos, end: pos + m[0].length, key: NAMES[i][1] });
      }
    }
    return out;
  }

  // Clause breaks inside a sentence: a comma or semicolon before a space (never the one in "1,500"),
  // a dash between spaces, or and / while / whereas / but / or / plus / then.
  var RE_CLAUSE = /[,;](?=\s)|\s[-\u2013\u2014]\s|\s(?:and|while|whereas|but|or|plus|then)\s/gi;

  // [from, to] of the clause that holds the amount, as positions in the whole text.
  function clauseOf(sent, h) {
    var a = sent.from, b = sent.from + sent.text.length, e = h.end, m, at;
    // A hit can end with the space after the number.
    while (e > h.at && /\s/.test(sent.text.charAt(e - 1 - sent.from))) e--;
    RE_CLAUSE.lastIndex = 0;
    while ((m = RE_CLAUSE.exec(sent.text))) {
      at = sent.from + m.index;
      if (at + m[0].length <= h.at) a = at + m[0].length;
      else if (at >= e) { b = at; break; }
    }
    return [a, b];
  }

  // The name a price belongs to: one in the same clause when there is one ("Starter is \u00a31,500, while
  // Business is \u00a33,500"), else any in the sentence. Then the closest, but "\u00a3750 on Starter" binds to the
  // name after it, and a care plan or the hourly rate counts only when no other price sits between it and the amount.
  function tierNear(sent, h, hits) {
    var names = tierNames(sent), best = null, i, j, d, nm, tail, blocked, lo, hi, cl = clauseOf(sent, h), same = [];
    for (i = 0; i < names.length; i++) if (names[i].pos >= cl[0] && names[i].end <= cl[1]) same.push(names[i]);
    if (same.length) names = same;
    for (i = 0; i < names.length; i++) {
      nm = names[i];
      if (nm.pos < h.at) {
        d = h.at - nm.end;
        if (d < 0) d = 0;
      } else {
        tail = sent.text.slice(h.end - sent.from, nm.pos - sent.from);
        d = /^\s*(?:on|for|with)\s+(?:the\s+)?$/i.test(tail) ? -1 : nm.pos - h.at;
      }
      if (STRICT.indexOf(nm.key) >= 0) {
        if (d > 60) continue;
        blocked = false;
        lo = nm.pos < h.at ? nm.end : h.end;
        hi = nm.pos < h.at ? h.at : nm.pos;
        for (j = 0; j < hits.length; j++) if (hits[j] !== h && hits[j].at >= lo && hits[j].end <= hi && hits[j].end > hits[j].at) blocked = true;
        if (blocked) continue;
      }
      if (!best || d < best.d) best = { d: d, key: nm.key };
    }
    return best && best.key;
  }

  // The one tier named in the closest earlier sentence that names any (null when that one names several).
  function carryTier(s, from) {
    var p = from, prev, keys, j, n, names;
    for (n = 0; n < 40 && p > 0; n++) {
      prev = sentenceOf(s, p - 1);
      keys = [];
      names = tierNames(prev);
      for (j = 0; j < names.length; j++) if (STRICT.indexOf(names[j].key) < 0 && keys.indexOf(names[j].key) < 0) keys.push(names[j].key);
      if (keys.length === 1) return keys[0];
      if (keys.length > 1) return null;
      if (prev.from >= p) break;
      p = prev.from;
    }
    return null;
  }

  var RE_MONTHLY = /^\s?(?:(?:a|per|each|every)\s?month\b|monthly\b|pcm\b|\/\s?(?:m|mo|month)\b)/i;
  var RE_HOURLY = /^\s?(?:(?:an?|per|each)\s?(?:hour|hr)\b|hourly\b|\/\s?(?:h|hr|hour)\b)/i;

  // o.tiers: { key: [prices that belong to it] } (a plain number is one price). Keys: starter, business,
  // custom, care, careplus, carepro, hourly. Missing or empty: no tier check at all.
  function tierSets(t) {
    var o = {}, k, v, i, list;
    for (k in (t || {})) {
      v = t[k];
      list = [];
      if (typeof v === 'number') list.push(v);
      else if (v && typeof v.length === 'number') for (i = 0; i < v.length; i++) if (typeof v[i] === 'number' && isFinite(v[i])) list.push(v[i]);
      if (list.length) o[k] = list;
    }
    return o;
  }

  function badMoney(s, o) {
    var sets = tierSets(o.tiers), hits = moneyHits(s), uni = [], common = null, k, i, j, h, sent, key, seen, tail, here;
    function specific(n) { return uni.indexOf(n) >= 0 && common.indexOf(n) < 0; }
    for (k in sets) {
      for (i = 0; i < sets[k].length; i++) if (uni.indexOf(sets[k][i]) < 0) uni.push(sets[k][i]);
      if (STRICT.indexOf(k) < 0) common = common === null ? sets[k].slice() : common.filter(function (n) { return sets[k].indexOf(n) >= 0; });
    }
    common = common || [];
    for (i = 0; i < hits.length; i++) {
      h = hits[i];
      if (!isFinite(h.n) || !o.isAllowed(h.n)) return true;
      sent = sentenceOf(s, h.at);
      if (o.agency.indexOf(h.n) >= 0) {
        if (!/agenc/i.test(sent.text)) return true;
        continue;
      }
      if (!uni.length) continue;
      key = tierNear(sent, h, hits);
      tail = s.slice(h.end, h.end + 24);
      here = s.slice(h.at, h.end);
      if (sets.hourly && (RE_HOURLY.test(tail) || /\u00a3?\s?\d\s?(?:an?|per)\s?(?:hour|hr)/i.test(here))) key = 'hourly';
      else if (RE_MONTHLY.test(tail) || /(?:a|per)\s(?:month)/i.test(here)) {
        if (STRICT.indexOf(key) < 0) key = null;
        else if (key === 'hourly') key = null;
      } else if (!key && specific(h.n)) {
        // No name here: carry the tier named just before, unless this sentence lists several tier prices.
        seen = [];
        for (j = 0; j < hits.length; j++) {
          if (hits[j].at >= sent.from && hits[j].at < sent.from + sent.text.length && specific(hits[j].n) && seen.indexOf(hits[j].n) < 0) seen.push(hits[j].n);
        }
        if (seen.length < 2) key = carryTier(s, sent.from);
      }
      if (!key || !sets[key]) continue;
      if (STRICT.indexOf(key) >= 0 ? sets[key].indexOf(h.n) < 0 : uni.indexOf(h.n) >= 0 && sets[key].indexOf(h.n) < 0) return true;
    }
    return false;
  }

  // ---------- credentials, promises ----------
  var RE_CRED = /\b(?:card[\s\-_]*(?:number|no|num)|(?:send|share|give|enter|type|provide|tell|paste|post|email|text|whatsapp|need|want)\b[^.]{0,20}\bcard[\s\-_]*details|cvv|cvc|security[\s\-_]*code|exp(?:iry|iration)?[\s\-_]*date|card[\s\-_]*expiry|sort[\s\-_]*code|account[\s\-_]*(?:number|no)|iban|pass[\s\-_]*(?:word|code|phrase)|bank[\s\-_]*details|send[\s\-_]+(?:me[\s\-_]+)?your[\s\-_]+card|pin[\s\-_]+number|your[\s\-_]+pin)s?\b/i;
  // Something the visitor is asked to hand over (a verb of asking or giving, then the secret).
  var ASK_V = '(?:send|share|give|enter|type|provide|tell|paste|post|email|text|whatsapp|submit|supply|reply[\\s-]+with|show|confirm|forward|upload|dm|what(?:[\'\u2019]?s| is))';
  var RE_CRED2 = new RegExp('\\b' + ASK_V + '\\b[^.]{0,25}\\b(?:card[\\s\\-_]*(?:info\\w*|digits)|(?:the\\s+|your\\s+)?(?:last\\s+)?(?:\\d+\\s+|four\\s+)?digits\\s+(?:on|of)\\s+(?:the\\s+|your\\s+)?(?:back|front)|(?:verification|security|confirmation|auth\\w*)[\\s\\-_]*code|one[\\s\\-_]*time[\\s\\-_]*(?:code|pass\\w*)|2fa[\\s\\-_]*code|two[\\s\\-_]*factor[\\s\\-_]*code|otp|api[\\s\\-_]*key|ni[\\s\\-_]*number|national[\\s\\-_]*insurance[\\s\\-_]*number|date[\\s\\-_]*of[\\s\\-_]*birth|dob)\\b', 'i');
  // Secret keys, whoever asks (underscores are already gone from the checked text).
  var RE_KEY = /\b(?:sk|rk|pk)[\s-]?(?:live|test)|\bwhsec/i;
  var SQUASHED_PROMISE = ['discount', 'promocode', 'voucher', 'coupon'];
  var SQUASHED_CRED = ['cardnumber', 'securitycode', 'sortcode', 'accountnumber', 'password', 'passphrase', 'cvv', 'cvc', 'bankdetails'];
  var RE_DISCOUNT = /\b(?:discount\w*|promo[\s-]?(?:tion(?:al)?)?[\s-]?codes?|vouchers?|coupons?|special[\s-](?:offers?|prices?|deals?)|half[\s-](?:price|off)|(?:a\s+)?(?:tenth|fifth|quarter|third)\s+off|money[\s-]off|knock\w*[^.]{0,20}\boff|waive\w*|(?:no|zero)[\s-]deposit|early[\s-]bird|launch[\s-](?:price|offer)|introductory[\s-](?:price|offer)|sale[\s-]price|reduced[\s-]price|price[\s-]match|cheaper for you)\b/i;
  var RE_PROMISE = new RegExp('\\b(?:' + [
    'costs?\\s+(?:you\\s+)?nothing',
    '(?:is|are|was|be|it[\'\u2019]s|that[\'\u2019]s|this[\'\u2019]s)\\s+on\\s+us',
    'no\\s+(?:extra\\s+|hidden\\s+|booking\\s+|admin\\s+|set-?up\\s+|call-?out\\s+)?fees?',
    '(?:talking|chatting|asking|enquir\\w+|quotes?|quoting|estimates?|advice|consultations?)\\s+(?:is|are|costs?)\\s+(?:free|nothing)',
    'free\\s+(?:quotes?|estimates?|trials?|demos?|audits?|reviews?|assessments?|consult\\w*|advice)',
    '(?:student|charity|charities|loyalty|non-?profit|referral|returning[\\s-]client|repeat[\\s-]client|nhs)[\\s-]*(?:rates?|pricing|prices?|discount\\w*|deals?|offers?)',
    'full\\s+refunds?', 'money[\\s-]?back', 'refund\\w*\\s+in\\s+full'
  ].join('|') + ')\\b', 'i');
  var RE_NEGOTIATE = /(?:^|[\s(])negotiat/i;

  // "guarantee" unless it is denied nearby ("cannot be guaranteed", "no guarantee").
  function guaranteeBad(s) {
    var re = /\bguarantee\w*/gi, m;
    while ((m = re.exec(s))) {
      if (!/(?:\b(?:no|not|never|cannot|without|nobody|nothing)\b|n['\u2019]t\b)[^.\u00b6]{0,30}$/i.test(s.slice(Math.max(0, m.index - 40), m.index))) return true;
    }
    return false;
  }

  var FREE_W = '(?:free|complimentary|no[\\s-]cost|no[\\s-]charge|gratis|without[\\s-]charge)';
  var CALL_W = '(?:chat|call|consultation|meeting|advice|session|conversation|intro\\w*|discovery|strategy)s?';
  var RE_FREE_FWD = new RegExp('\\b' + FREE_W + '\\b[^.]{0,20}\\b' + CALL_W + '\\b', 'i');
  var RE_FREE_REV = new RegExp('\\b' + CALL_W + '\\b[^.]{0,20}\\b(?:' + FREE_W + '|on the house)\\b', 'i');

  // The text with things that are not phone digits taken out (money, dates), and O / l / I / x between
  // digits read as 0 / 1 / a gap.
  function phoneCopy(s) {
    return s
      .replace(/(\d)[xX]+(?=\d)/g, '$1 ')
      .replace(/(\d)([OolI]+)(?=[^A-Za-z\d]{0,2}\d)/g, function (a, d, l) { return d + l.replace(/[Oo]/g, '0').replace(/[lI]/g, '1'); })
      .replace(/[\u00a3$\u20ac\u00a5\u20b9][\s\u00b6]{0,6}\d[\d,]*(?:\.\d+)?/g, ' Q ')
      .replace(/(^|[^\d,])[1-9]\d{0,2}(?:,\d{3})+(?!\d)/g, '$1 Q ')
      .replace(/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g, ' Q ');
  }

  function badCred(s, ph) {
    var sq = s.toLowerCase().replace(/[^a-z0-9]/g, ''), i;
    if (RE_CRED.test(s) || RE_CRED2.test(s) || RE_KEY.test(s)) return true;
    for (i = 0; i < SQUASHED_CRED.length; i++) if (sq.indexOf(SQUASHED_CRED[i]) >= 0) return true;
    return /\b\d{2}[\s-]\d{2}[\s-]\d{2}\b/.test(ph) || /(?:^|\D)\d{8}(?!\d)/.test(ph) || /\b\d{4}[\s-]\d{4}\b/.test(ph);
  }

  // ---------- addresses and phones ----------
  var RE_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?[\s\-./]*\d[A-Z]{2}\b/i;
  var RE_POSTCODE2 = /\b[A-Z]\s?[A-Z]?\s?\d\s?[A-Z\d]?[^A-Za-z\d]{0,3}\s?\d\s?[A-Z]\s?[A-Z]\b/i;
  var RE_GIR = /\bGIR\s?0\s?AA\b/i;
  function ci(w) { return w.replace(/[a-z]/gi, function (c) { return '[' + c.toLowerCase() + c.toUpperCase() + ']'; }); }
  function capw(w) { return w.charAt(0).toUpperCase() + ci(w.slice(1)); }
  function alt(list, f) { return list.split('|').map(f).join('|'); }
  // Street words that are rarely ordinary English, and ones that are ("End", "Way", "Park" ...): the second
  // group counts only when written with a capital, after capitalised words.
  var SUF_U = 'Road|Rd|Street|St|Lane|Ln|Avenue|Ave|Av|Drive|Dr|Crescent|Cres|Gardens|Gdns|Grove|Terrace|Terr|Tce|Mews|Parade|Wharf|Quay|Boulevard|Blvd|Bvd|Circle|Cir|Highway|Hwy|Pk|Cl|Ct|Pl|Sq|Wy|Broadway';
  var SUF_A = 'End|Way|Close|Place|Park|Green|Hill|Row|Hall|View|Rise|Walk|Yard|Lodge|Court|Square|Trail|Ridge|Chase|Fields|Meadows?|Heights|Vale|Dale|Gate|Bank|Bridge|Cottages|Villas|Buildings|House|Farm|Mill|Cross|Common|Approach|Path|Mount|Hollow|Orchard|Croft';
  var CAPS = '[A-Z][A-Za-z\'\u2019-]*\\s+';
  var NUMLEAD = '\\d{1,4}[A-Za-z]?,?\\s+';
  var NUMWORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|hundred';
  var RE_STREET_U = new RegExp('\\b' + NUMLEAD + '(?:[A-Za-z\'\u2019-]+\\s+){1,3}(?:' + SUF_U + ')\\b', 'i');
  var RE_STREET_A = new RegExp('\\b' + NUMLEAD + '(?:' + CAPS + '){1,3}(?:' + alt(SUF_A, capw) + ')\\b');
  var RE_STREET_W = new RegExp('\\b(?:' + alt(NUMWORDS, ci) + ')(?:[\\s-]+(?:' + alt('one|two|three|four|five|six|seven|eight|nine', ci) + '))?,?\\s+(?:' + CAPS + '){1,2}(?:' + alt(SUF_U + '|' + SUF_A, capw) + ')\\b');
  var RE_STREET_R = new RegExp('\\b[A-Z][A-Za-z\'\u2019-]+\\s+(?:' + alt(SUF_U + '|' + SUF_A, capw) + '),?\\s+(?:(?:[Nn]umber|[Nn]o\\.?|#)\\s*)?\\d{1,4}\\b(?!\\s?' + UNITS + ')');
  var RE_UNIT = /\b(?:flat|unit|house|apartment|suite|po\s?box|p\.o\.\s?box|box)\s+\d/i;
  var DWORDS = 'zero|oh|o|nought|one|two|three|four|five|six|seven|eight|nine|double|triple|hundred';
  // Each digit and each spoken digit is one token; 8 or more close together is a phone number.
  var RE_SPOKEN = new RegExp('(?:(?:\\d|(?:' + DWORDS + ')(?![a-z]))[^a-z\\d]{0,5}){8,}', 'i');

  // "or 12pm" reads like a spaced postcode ("OR1 2PM"); a clock time after a plain word is not one. A time that
  // follows a digit ("OR1 2PM") is kept.
  var RE_CLOCK = /(^|[^A-Za-z\d])(?:1[0-2]|[1-9])(?::[0-5]\d)?\s?[ap]\.?m\b/gi;
  function noClocks(s) {
    return s.replace(RE_CLOCK, function (m, lead, off) {
      return /\d[A-Za-z]?\s$/.test(s.slice(Math.max(0, off - 2), off + lead.length)) ? m : lead + 'TIME';
    });
  }
  function badAddress(s) {
    return RE_POSTCODE.test(s) || RE_POSTCODE2.test(noClocks(s)) || RE_GIR.test(s) || RE_STREET_U.test(s) || RE_STREET_A.test(s) ||
      RE_STREET_W.test(s) || RE_STREET_R.test(s) || RE_UNIT.test(s);
  }

  function badPhone(s, ph) {
    return U.phone.test(ph) || /\+\s?44/.test(s) || RE_SPOKEN.test(ph);
  }

  // ---------- links ----------
  // "(at)" and "dot" disguises become real @ and . before the link checks.
  function undisguise(s) {
    return s
      .replace(/\s+at\s+(?=[a-z0-9-]+(?:\s+dot\s+|\s*[([{<]\s*dot\s*[)\]}>]\s*)[a-z])/gi, '@')
      .replace(/\s*[([{<]\s*at\s*[)\]}>]\s*/gi, '@')
      .replace(/\s*[([{<]\s*dot\s*[)\]}>]\s*/gi, '.')
      .replace(/\s+dot\s+/gi, '.');
  }

  var TLD = 'com|net|org|co|uk|io|ai|app|dev|xyz|shop|me|ly|info|biz|site|online|store|tech|us|eu|de|fr|ru|cn|tk|gg';
  var TLD_END = '(?:' + TLD + ')(?![A-Za-z0-9])';
  var RE_EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
  // The caller's own site(s), optionally with a plain path; never a query, a second host, a colon or an @.
  // No hosts given: no link is allowed at all.
  function okHostRe(hosts) {
    var list = [], i, h;
    for (i = 0; i < (hosts || []).length; i++) {
      h = String(hosts[i]).toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9.-]/g, '');
      if (h) list.push(h.replace(/\./g, '\\.'));
    }
    if (!list.length) return null;
    return new RegExp('(^|[^\\w.@-])(?:https?:\\/\\/)?(?:www\\.)?(?:' + list.join('|') + ')(?![\\w-]|\\.[a-z0-9])(?:[\\/#][A-Za-z0-9\\-_#\\/]*)?(?=[.,;:!?)\\]"\']*(?:\\s|$))', 'gi');
  }

  // Spaced, doubled, bracketed or look-alike separators become a plain dot before a known top-level domain.
  function collapseDots(x) {
    return x
      .replace(/\s+slash\s+/gi, '/')
      .replace(new RegExp('\\.\\s*[\\[({<]\\s*(' + TLD + ')\\s*[\\])}>]', 'gi'), '.$1')
      .replace(new RegExp('\\.{2,}(?=' + TLD_END + ')', 'g'), '.')
      .replace(new RegExp('([A-Za-z0-9])\\s*[\u00b7\u2022\u2219\u2027]\\s*(?=' + TLD_END + ')', 'g'), '$1.')
      .replace(new RegExp('([A-Za-z0-9])[,;](?=' + TLD_END + ')', 'g'), '$1.')
      .replace(new RegExp('([A-Za-z0-9])[\\s\u00b6]*\\.[\\s\u00b6]*(?=' + TLD_END + ')', 'g'), '$1.');
  }

  // '' when fine, else 'email' or 'link'.
  function linkReason(s, contact, okHosts) {
    var d = undisguise(s), re = new RegExp(RE_EMAIL.source, 'gi'), m, nx, x, ok = okHostRe(okHosts);
    while ((m = re.exec(d))) {
      if (m[0].toLowerCase() !== contact) return 'email';
      nx = d.charAt(m.index + m[0].length);
      if (/[\/\\?#=&@%]/.test(nx) || (nx === ':' && /\S/.test(d.charAt(m.index + m[0].length + 1)))) return 'email';
    }
    x = d.replace(RE_EMAIL, ' ');
    if (ok) x = x.replace(ok, '$1 ');
    x = collapseDots(x);
    if (/@\s?\w/.test(x)) return 'email';
    if (/\b(?:https?|ftp|file|data|javascript):/i.test(x) || /\/\//.test(x) || /\bwww\./i.test(x)) return 'link';
    if (/\b\d{1,3}(?:\s*\.\s*\d{1,3}){3}\b/.test(x)) return 'link';
    if (/[a-z0-9]\.[a-z]{2,}\b/i.test(x)) return 'link';
    if (/\b[a-z0-9-]{2,}\s(?:com|net|org|io|xyz)\s?\//i.test(x)) return 'link';
    return '';
  }

  // '' when the text is fine, else the reason. `flat` comes from views(). o = { isAllowed(n), tiers,
  // agency: [amounts], okPercent: [n], contact: the one email allowed, okHosts: [hosts links may point to] }.
  function scanCore(flat, o) {
    // A business that really sells gift vouchers may say so: plain "voucher(s)" is let through, "voucher code" never is.
    if (o.voucher) {
      flat = flat.replace(/\b(?:gift[\s-]*)?vouchers?\b(?![\s-]*(?:codes?|price|offer|deal))(?![^.]{0,20}\b(?:free|complimentary|gratis)\b)/gi, function (m, off, all) {
        return /\b(?:free|complimentary|gratis|no[\s-]cost|no[\s-]charge)\b[^.]{0,20}$/i.test(all.slice(Math.max(0, off - 30), off)) ? m : ' gift ';
      });
    }
    var ph = phoneCopy(flat);
    if (badCred(flat, ph)) return 'credentials';
    if (badMoney(flat, o)) return 'amount';
    var sq = flat.toLowerCase().replace(/[^a-z0-9]/g, ''), i;
    for (i = 0; i < SQUASHED_PROMISE.length; i++) if (sq.indexOf(SQUASHED_PROMISE[i]) >= 0) return 'promise';
    if (RE_DISCOUNT.test(flat) || RE_PROMISE.test(flat) || RE_NEGOTIATE.test(flat) || guaranteeBad(flat) || percentBad(flat, o.okPercent) || RE_FREE_FWD.test(flat) || RE_FREE_REV.test(flat)) return 'promise';
    if (badAddress(flat)) return 'address';
    if (badPhone(flat, ph)) return 'phone';
    return linkReason(flat, o.contact, o.okHosts);
  }

  // Visitor text (not replies) that looks like payment, bank or login details. The widget and the demos
  // refuse such a line and never keep it; the server scrubs it before the model sees it.
  // '' when fine, else 'card' (a card-length number), 'cardcode' (CVV, expiry, "card ending 1234"), 'bank' or 'login'.
  var IN_CARD = /(^|[^+\d])[2-6](?:[ \-.]{0,2}\d){12,18}(?!\d)/;
  // Groups of four split by a slash, bar, colon or similar ("4242/4242/4242/4242"); dates never have a 4-digit first group.
  var IN_CARD_GROUPS = /(^|[^+\d])[2-6]\d{3}(?:\s?[\/\\|_:;*#]\s?\d{4}){2,3}(?:\s?[\/\\|_:;*#]\s?\d{1,3})?(?!\d)/;
  var DIGIT_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
  var IN_CARDCODE = [
    /\b(?:cvv2?|cvc2?|csc|security[\s\-_]*code)\b[^.\n\d]{0,20}\d{3,4}\b/i,
    /\b\d{3,4}\b[^.\n\d]{0,12}\b(?:cvv2?|cvc2?)\b/i,
    /\bexp(?:iry|iration|ires|iring)?(?:[\s\-_]*date)?\b[^.\n\d]{0,20}(?:0?[1-9]|1[0-2])\s?[\/\-]\s?(?:20\d{2}|\d{2})\b/i,
    /\bcard[\s\-_]*(?:number|no|num|ending(?:\s+in)?|ends(?:\s+in|\s+with)?|digits)\b[^.\n\d£$€]{0,12}\d{4}/i
  ];
  var IN_BANK = [
    /\bsort[\s\-_]*code\b[^.\n\d]{0,15}\d{2}[\s\-]?\d{2}[\s\-]?\d{2}\b/i,
    /\b(?:account|acc|acct|a\/c)[\s\-_]*(?:number|no|num|#)\b[^.\n\d]{0,15}\d{6,}/i,
    /\biban\b[^.\n]{0,10}[a-z]{2}\d{2}/i,
    /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/
  ];
  var IN_LOGIN = [
    /\b(?:pass[\s\-_]*(?:word|code|phrase)|passwd|pwd|pw|login[\s\-_]*(?:details|code)|one[\s\-_]*time[\s\-_]*(?:code|pass\w*)|otp|2fa[\s\-_]*code|verification[\s\-_]*code|security[\s\-_]*answer)s?\b\s*(?:is|was|=|:|-|it'?s)\s*["'“‘]?(?!(?:required|needed|safe|secure|wrong|incorrect|not|never|the|a|an|my|your|for|set|reset|changed|forgotten|expired|ok|okay|fine|empty|blank)\b)[^\s.,!?"'”’]{3,}/i,
    /\bpin(?:[\s\-_]*(?:number|code|no))?\b\s*(?:is|was|=|:|-|it'?s)?\s*\d{4,6}\b/i,
    // No "is": "pw hunter2xyz", "password Abc123!". The word after must hold a digit, so "password reset" stays fine.
    /\b(?:password|passwd|pwd|pw)\s+["'“‘]?(?=[^\s.,!?"'”’]*\d)[^\s.,!?"'”’]{4,}/i
  ];

  function anyOf(list, s) {
    for (var i = 0; i < list.length; i++) if (list[i].test(s)) return true;
    return false;
  }

  function sensitiveInput(text) {
    if (typeof text !== 'string' || !U) return '';
    var s = normalise(text, true);
    if (anyOf(IN_BANK, s)) return 'bank';
    // Digits typed as words count too ("four two four two 4242 ...").
    var w = s.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/gi, function (m) { return String(DIGIT_WORDS[m.toLowerCase()]); });
    if (IN_CARD.test(s) || IN_CARD.test(w) || IN_CARD_GROUPS.test(s)) return 'card';
    if (anyOf(IN_CARDCODE, s)) return 'cardcode';
    if (anyOf(IN_LOGIN, s)) return 'login';
    return '';
  }
  /* CORE-END */

  function alnum(s) { return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }

  function stripMarkdown(t) {
    return t
      .replace(/\*\*|__|`/g, '')
      .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
      .replace(/^[ \t]*[-*•][ \t]+/gm, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function trimToSentence(t, max) {
    if (t.length <= max) return t;
    var cut = t.slice(0, max);
    var idx = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('.\n'));
    if (idx >= 40) return cut.slice(0, idx + 1).trim();
    var end = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
    if (end >= 40) return cut.slice(0, end + 1).trim();
    return cut.replace(/\s+\S*$/, '').trim() + '…';
  }

  function list(x) { return Array.isArray(x) ? x : []; }

  function checkReply(text, opts) {
    var o = opts || {};
    if (typeof text !== 'string' || !U) return { ok: false, reason: 'empty' };
    var v = views(text);
    var shown = stripMarkdown(stripBlocks(v.out));
    if (!shown) return { ok: false, reason: 'empty' };
    var allowed = {}, i, a = list(o.allowedAmounts);
    for (i = 0; i < a.length; i++) allowed[Number(a[i])] = 1;
    function isAllowed(n) { return allowed[n] === 1; }
    var can = o.canary ? alnum(normalise(String(o.canary))) : '';
    var scan = {
      isAllowed: isAllowed,
      tiers: o.tierPrices || {},
      agency: list(o.agencyAmounts).map(Number),
      okPercent: list(o.okPercents).map(Number),
      contact: String(o.contactEmail || '').toLowerCase(),
      okHosts: list(o.okHosts),
      voucher: o.okVoucher === true
    };
    for (i = 0; i < v.flats.length; i++) {
      if (can && alnum(v.flats[i]).indexOf(can) >= 0) return { ok: false, reason: 'canary' };
    }
    for (i = 0; i < v.flats.length; i++) {
      var reason = scanCore(v.flats[i], scan);
      if (reason) return { ok: false, reason: reason };
    }
    var max = typeof o.maxChars === 'number' && o.maxChars > 0 ? o.maxChars : 1200;
    return { ok: true, text: trimToSentence(shown, max) };
  }

  root.CambyteGuards = { checkReply: checkReply, normalise: normalise, undisguise: undisguise, sensitiveInput: sensitiveInput };
})(typeof window !== 'undefined' ? window : this);
