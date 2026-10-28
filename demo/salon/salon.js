/* Orla & Quill demo: booking, payments (test), AI receptionist, owner view.
   No network, no cookies, no analytics. All data is made up. */
(function () {
  'use strict';

  var D = window.SALON_DATA;
  var LINKS = window.STRIPE_TEST_LINKS || {};
  var PAGE = document.body.getAttribute('data-page');

  /* ---------- small helpers ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function hm(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function toMin(s) { var p = s.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function nice(min) {
    var h = Math.floor(min / 60), m = min % 60, s = h >= 12 ? 'pm' : 'am', h12 = h % 12 || 12;
    return h12 + (m ? ':' + pad(m) : '') + s;
  }
  var DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dayLong(iso) { var d = parseISO(iso); return DAYN[d.getDay()] + ' ' + d.getDate() + ' ' + MONN[d.getMonth()]; }
  function dayShort(iso) { var d = parseISO(iso); return DAYN[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MONN[d.getMonth()].slice(0, 3); }
  function durText(m) { var h = Math.floor(m / 60), r = m % 60; return (h ? h + (r ? ' hr ' + r : ' hr') : m + ' min'); }
  function money(n) { return '£' + n; }
  function svcById(id) { for (var i = 0; i < D.services.length; i++) if (D.services[i].id === id) return D.services[i]; return null; }
  function styById(id) { for (var i = 0; i < D.stylists.length; i++) if (D.stylists[i].id === id) return D.stylists[i]; return null; }
  function now() { return new Date(); }
  function todayISO() { return isoOf(now()); }
  function uid(p) { return p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === false || v == null) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  /* ---------- amounts (for the guard) ---------- */
  var AMOUNTS = (function () {
    var a = [];
    function add(n) { if (a.indexOf(n) < 0) a.push(n); }
    D.services.forEach(function (s) { add(s.price); add(s.deposit); });
    D.vouchers.forEach(add);
    return a.sort(function (x, y) { return x - y; });
  })();
  // Amounts the page itself shows (the running-costs panel), so the receptionist may repeat them.
  var PAGE_AMOUNTS = [0, 49, 149, 299];
  // Options for the shared guards (assets/guards.js). No tier prices, no links: the demo has neither.
  var SALON_GUARD_OPTS = { allowedAmounts: AMOUNTS.concat(PAGE_AMOUNTS), contactEmail: D.email, tierPrices: {}, okHosts: [], okVoucher: true };

  /* ---------- store: localStorage + BroadcastChannel, both optional ---------- */
  var KEY = 'salon-demo-v1';
  var S = { rev: 0, open: true, bookings: [], payments: [], log: [] };
  var listeners = [];
  var chan = null;
  try { if (typeof BroadcastChannel !== 'undefined') chan = new BroadcastChannel('salon-demo'); } catch (e) { chan = null; }

  function lsGet() { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } }
  function lsSet(v) { try { window.localStorage.setItem(KEY, v); } catch (e) { /* storage blocked: stay in memory */ } }

  function mergeInto(local, inc) {
    if (!inc || typeof inc !== 'object') return false;
    var changed = false;
    function union(key) {
      var have = {};
      local[key].forEach(function (x) { have[x.id] = true; });
      (inc[key] || []).forEach(function (x) { if (x && x.id && !have[x.id]) { local[key].push(x); have[x.id] = true; changed = true; } });
    }
    union('bookings'); union('payments'); union('log');
    /* removals: a booking carries removed:true once cancelled; union keeps the newer flag */
    (inc.bookings || []).forEach(function (b) {
      local.bookings.forEach(function (l) {
        if (l.id === b.id && ((b.v || 0) > (l.v || 0))) { for (var k in b) l[k] = b[k]; changed = true; }
      });
    });
    if ((inc.rev || 0) > local.rev) {
      if (typeof inc.open === 'boolean' && inc.open !== local.open) { local.open = inc.open; changed = true; }
      local.rev = inc.rev;
    }
    local.log.sort(function (a, b) { return a.ts - b.ts; });
    return changed;
  }
  function loadStore() {
    var raw = lsGet();
    if (raw) { try { mergeInto(S, JSON.parse(raw)); } catch (e) { /* ignore */ } }
  }
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) { /* keep going */ } }); }
  function persist() {
    lsSet(JSON.stringify(S));
    try { if (chan) chan.postMessage({ t: 'state', s: S }); } catch (e) { /* ignore */ }
    emit();
  }
  function onStore(f) { listeners.push(f); }
  if (chan) {
    chan.onmessage = function (ev) {
      var m = ev && ev.data; if (!m) return;
      if (m.t === 'state') { if (mergeInto(S, m.s)) { lsSet(JSON.stringify(S)); emit(); } }
      else if (m.t === 'hello') { try { chan.postMessage({ t: 'state', s: S }); } catch (e) { /* ignore */ } }
    };
  }
  window.addEventListener('storage', function (ev) {
    if (ev.key === KEY && ev.newValue) { try { if (mergeInto(S, JSON.parse(ev.newValue))) emit(); } catch (e) { /* ignore */ } }
  });
  loadStore();
  try { if (chan) chan.postMessage({ t: 'hello' }); } catch (e) { /* ignore */ }

  function setOpen(v) { S.open = !!v; S.rev++; persist(); }
  function addLog(type, text) { S.log.push({ id: uid('l'), ts: Date.now(), type: type, text: text }); persist(); }
  function addBooking(b) { b.v = 1; S.bookings.push(b); persist(); }
  function cancelBooking(id) {
    S.bookings.forEach(function (b) { if (b.id === id) { b.cancelled = true; b.v = (b.v || 1) + 1; } });
    persist();
  }
  function updateBooking(id, patch) {
    S.bookings.forEach(function (b) { if (b.id === id) { for (var k in patch) b[k] = patch[k]; b.v = (b.v || 1) + 1; } });
    persist();
  }
  function addPayment(p) { p.id = uid('p'); p.ts = Date.now(); p.date = todayISO(); S.payments.push(p); persist(); }

  /* ---------- seed bookings (invented, stable per day) ---------- */
  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var seedCache = null, seedFor = null;
  function seedBookings() {
    var t0 = todayISO();
    if (seedCache && seedFor === t0) return seedCache;
    var out = [];
    for (var i = 0; i < D.windowDays; i++) {
      var d = addDays(now(), i), iso = isoOf(d), h = D.hours[d.getDay()];
      if (!h) continue;
      D.stylists.forEach(function (st, si) {
        if (st.workDays.indexOf(d.getDay()) < 0) return;
        var rnd = mulberry(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() + si * 7919);
        var n = 1 + Math.floor(rnd() * 2), mine = [], pool = st.does.filter(function (id) { return svcById(id).mins <= 90; });
        for (var k = 0; k < n; k++) {
          for (var tries = 0; tries < 8; tries++) {
            var svc = svcById(pool[Math.floor(rnd() * pool.length)]);
            var open = toMin(h[0]), close = toMin(h[1]);
            var slots = Math.floor((close - open - svc.mins) / 30) + 1;
            if (slots < 1) continue;
            var start = open + 30 * Math.floor(rnd() * slots);
            var ok = mine.every(function (m) { var s2 = svcById(m.serviceId); return !(start < m.start + s2.mins + D.bufferMins && start + svc.mins + D.bufferMins > m.start); });
            if (ok) {
              mine.push({ id: 'seed-' + iso + '-' + st.id + '-' + start, seed: true, date: iso, start: start, serviceId: svc.id,
                stylistId: st.id, name: D.seedNames[Math.floor(rnd() * D.seedNames.length)] });
              break;
            }
          }
        }
        out = out.concat(mine);
      });
    }
    seedCache = out; seedFor = t0;
    return out;
  }
  function liveBookings() { return S.bookings.filter(function (b) { return !b.cancelled; }); }
  function allBookings() { return seedBookings().concat(liveBookings()); }

  /* ---------- availability: the one source of truth ---------- */
  function hoursOn(iso) { return D.hours[parseISO(iso).getDay()] || null; }
  function inWindow(iso) { var t = todayISO(); return iso >= t && iso <= isoOf(addDays(now(), D.windowDays - 1)); }
  function stylistWorks(st, svc, iso) { return st.workDays.indexOf(parseISO(iso).getDay()) >= 0 && st.does.indexOf(svc.id) >= 0; }
  function isFree(stId, iso, start, dur, ignoreId) {
    return allBookings().every(function (b) {
      if (b.stylistId !== stId || b.date !== iso || b.id === ignoreId) return true;
      var bd = svcById(b.serviceId).mins;
      return !(start < b.start + bd + D.bufferMins && start + dur + D.bufferMins > b.start);
    });
  }
  /* returns [{min, time, stylistId}] sorted by time; pref 'any' gives one entry per time */
  function freeSlots(serviceId, pref, iso, ignoreId) {
    var svc = svcById(serviceId), h = hoursOn(iso), out = [];
    if (!svc || !h || !inWindow(iso)) return out;
    var t = now();
    if (iso === isoOf(t) && !S.open) return out;
    var nowMin = t.getHours() * 60 + t.getMinutes();
    var cands = pref && pref !== 'any' ? [styById(pref)] : D.stylists;
    for (var m = toMin(h[0]); m + svc.mins <= toMin(h[1]); m += D.slotStepMins) {
      if (iso === isoOf(t) && m <= nowMin) continue;
      for (var i = 0; i < cands.length; i++) {
        var st = cands[i];
        if (st && stylistWorks(st, svc, iso) && isFree(st.id, iso, m, svc.mins, ignoreId)) {
          out.push({ min: m, time: hm(m), stylistId: st.id });
          break;
        }
      }
    }
    return out;
  }
  function windowDays() {
    var a = [];
    for (var i = 0; i < D.windowDays; i++) a.push(isoOf(addDays(now(), i)));
    return a;
  }
  function nextOpenISO() {
    var days = windowDays();
    for (var i = 0; i < days.length; i++) {
      if (!hoursOn(days[i])) continue;
      if (i === 0 && !S.open) continue;
      return days[i];
    }
    return null;
  }
  function earliestDayWithSlots(serviceId, pref, ignoreId) {
    var days = windowDays();
    for (var i = 0; i < days.length; i++) if (freeSlots(serviceId, pref, days[i], ignoreId).length) return days[i];
    return null;
  }
  function depositFor(serviceId) { return svcById(serviceId).deposit; }

  /* ---------- guard: the shared Cambyte guards (assets/guards.js) ---------- */
  var SAFE_FALLBACK = "I'd rather not guess at that one. A person can help: use the Talk to a person button, or email " + D.email + '.';
  // Every reply goes through window.CambyteGuards (assets/guards.js). If that file is missing or throws,
  // nothing is shown but the safe fallback: the demo fails closed rather than trusting its own text.
  function guardReply(text) {
    var out = SAFE_FALLBACK;
    try {
      var G = window.CambyteGuards;
      if (G && typeof G.checkReply === 'function') {
        var r = G.checkReply(text, SALON_GUARD_OPTS);
        if (typeof r === 'string') out = r;
        else if (r && r.ok === true && typeof r.text === 'string') out = r.text;
      }
    } catch (e) { out = SAFE_FALLBACK; }
    return String(out == null || out === '' ? SAFE_FALLBACK : out);
  }

  /* ---------- calendar file ---------- */
  function icsText(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function utcStamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }
  function buildICS(b) {
    var svc = svcById(b.serviceId), st = styById(b.stylistId), d = parseISO(b.date);
    var start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(b.start / 60), b.start % 60);
    var end = new Date(start.getTime() + svc.mins * 60000);
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cambyte//Orla and Quill demo//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + b.id + '@' + D.slug + '.example',
      'DTSTAMP:' + utcStamp(new Date()),
      'DTSTART:' + utcStamp(start),
      'DTEND:' + utcStamp(end),
      'SUMMARY:' + icsText(svc.name + ' at ' + D.name + ' (demo)'),
      'DESCRIPTION:' + icsText('Demo booking. ' + svc.name + ' with ' + st.name + ' at a made-up salon. Nothing was charged. Move or cancel free up to ' + D.cancelHours + ' hours before.'),
      'END:VEVENT', 'END:VCALENDAR'
    ];
    return lines.join('\r\n') + '\r\n';
  }

  /* ---------- checkout dialog (no card fields, ever) ---------- */
  var dlg = $('#pay-dialog');
  function openDialog() {
    if (!dlg) return;
    try { if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', ''); } catch (e) { dlg.setAttribute('open', ''); }
  }
  function closeDialog() {
    if (!dlg) return;
    try { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); } catch (e) { dlg.removeAttribute('open'); }
  }
  function openCheckout(spec) {
    if (!dlg) { spec.done(); return; }
    var link = LINKS[spec.linkKey];
    dlg.textContent = '';
    var lines = el('ul', { class: 'pay-lines' }, spec.lines.map(function (l) {
      return el('li', {}, [el('span', { text: l[0] }), el('strong', { text: money(l[1]) })]);
    }));
    var body;
    if (link) {
      window.open(link, '_blank', 'noopener');
      body = [
        el('h2', { id: 'pay-title', text: 'Stripe test checkout is open' }),
        el('p', { text: "Stripe's own secure checkout page opened in a new tab (test mode). Apple Pay and Google Pay appear there. Card details are typed only on Stripe's page, never on this site." }),
        lines,
        el('p', { class: 'fine', text: 'Come back here when you have finished in the test checkout.' })
      ];
    } else {
      body = [
        el('h2', { id: 'pay-title', text: 'Stripe test checkout goes here' }),
        el('p', { text: "On the real site, this button opens Stripe's own secure checkout page, in test mode. Apple Pay and Google Pay appear there. Card details are typed only on Stripe's page, never on this site." }),
        lines,
        el('p', { class: 'fine', text: 'Nothing is charged. This is a demo.' })
      ];
    }
    var actions = el('div', { class: 'pay-actions' }, [
      el('button', { type: 'button', class: 'btn btn-primary', id: 'pay-continue', text: 'Continue as if the test payment went through (demo)', onclick: function () { closeDialog(); spec.done(); } }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel', onclick: closeDialog })
    ]);
    body.forEach(function (n) { dlg.appendChild(n); });
    dlg.appendChild(actions);
    openDialog();
  }
  if (dlg) dlg.addEventListener('click', function (e) { if (e.target === dlg) closeDialog(); });

  /* ---------- booking flow ---------- */
  var bk = { step: 1, serviceId: null, pref: 'any', stylistId: null, date: null, min: null, name: '', email: '', err: '', moving: null, done: null, viaAI: false };
  var hooks = { booked: null, state: null };
  var bookingBox = $('#booking');
  var focusNext = false;

  function resetBooking() {
    bk.step = 1; bk.serviceId = null; bk.pref = 'any'; bk.stylistId = null; bk.date = null; bk.min = null;
    bk.err = ''; bk.moving = null; bk.done = null; bk.viaAI = false;
    renderBooking();
  }
  function go(step, focus) { if (typeof ctx !== 'undefined' && ctx) { ctx.stage = 'idle'; ctx.awaitingName = false; } bk.step = step; bk.err = ''; focusNext = focus !== false; renderBooking(); }
  function cleanName(s) { return String(s || '').replace(/[^A-Za-z\u00C0-\u024F' \-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24); }
  function validEmail(s) { return !s || /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.example$/i.test(s); }

  var STEP_NAMES = ['Service', 'Stylist', 'Day', 'Time', 'Details', 'Pay'];
  function stepsBar() {
    return el('ol', { class: 'steps', 'aria-label': 'Booking steps' }, STEP_NAMES.map(function (n, i) {
      var cur = bk.step === i + 1;
      return el('li', { class: (cur ? 'cur ' : '') + (bk.step > i + 1 ? 'done' : ''), 'aria-current': cur ? 'step' : false }, [el('span', { text: n })]);
    }));
  }
  function backBtn(to) { return el('button', { type: 'button', class: 'btn btn-link', text: 'Back', onclick: function () { go(to); } }); }
  function summaryList() {
    var svc = svcById(bk.serviceId), st = styById(bk.stylistId);
    var rows = [['Service', svc ? svc.name + ' (' + durText(svc.mins) + ')' : '']];
    if (st) rows.push(['Stylist', st.name]);
    if (bk.date) rows.push(['Day', dayLong(bk.date)]);
    if (bk.min != null) rows.push(['Time', nice(bk.min)]);
    if (svc) { rows.push(['Price', money(svc.price)]); rows.push(['Deposit now', money(svc.deposit)]); }
    return el('dl', { class: 'summary' }, rows.map(function (r) { return el('div', {}, [el('dt', { text: r[0] }), el('dd', { text: r[1] })]); }));
  }

  function renderBooking() {
    if (!bookingBox) return;
    var keepScroll = window.pageYOffset;
    bookingBox.textContent = '';
    var wrap = el('div', { class: 'bk-wrap' });
    if (bk.step < 7) wrap.appendChild(stepsBar());
    var h3 = null, body = null;
    if (bk.step === 1) {
      h3 = el('h3', { tabindex: '-1', text: 'Choose a service' });
      body = el('div', { class: 'opts' }, D.services.map(function (s) {
        return el('button', { type: 'button', class: 'opt', 'aria-pressed': bk.serviceId === s.id ? 'true' : 'false', 'data-service': s.id,
          onclick: function () {
            if (bk.serviceId !== s.id) { bk.serviceId = s.id; bk.date = null; bk.min = null; bk.stylistId = null; if (bk.pref !== 'any' && styById(bk.pref).does.indexOf(s.id) < 0) bk.pref = 'any'; }
            go(2);
          } }, [el('strong', { text: s.name }), el('span', { text: durText(s.mins) + ' · ' + money(s.price) })]);
      }));
    } else if (bk.step === 2) {
      var svc = svcById(bk.serviceId);
      h3 = el('h3', { tabindex: '-1', text: 'Choose a stylist' });
      var opts = [{ id: 'any', name: 'Anyone free', role: 'The first free stylist' }].concat(D.stylists.filter(function (s) { return s.does.indexOf(svc.id) >= 0; }));
      body = el('div', { class: 'opts' }, opts.map(function (s) {
        return el('button', { type: 'button', class: 'opt', 'aria-pressed': bk.pref === s.id ? 'true' : 'false', 'data-stylist': s.id,
          onclick: function () { bk.pref = s.id; bk.date = null; bk.min = null; bk.stylistId = null; go(3); } },
          [el('strong', { text: s.name }), el('span', { text: s.role })]);
      }));
      body = el('div', {}, [body, backBtn(1)]);
    } else if (bk.step === 3) {
      h3 = el('h3', { tabindex: '-1', text: 'Choose a day' });
      var days = windowDays();
      var first = earliestDayWithSlots(bk.serviceId, bk.pref, bk.moving);
      if (!bk.date || !freeSlots(bk.serviceId, bk.pref, bk.date, bk.moving).length) bk.date = first;
      var grid = el('div', { class: 'days', role: 'group', 'aria-label': 'Next 14 days' }, days.map(function (iso) {
        var n = freeSlots(bk.serviceId, bk.pref, iso, bk.moving).length, closed = !hoursOn(iso);
        var today = iso === todayISO();
        var note = closed ? 'Closed' : (today && !S.open ? 'Closed today' : (n ? n + ' free' : 'Full'));
        var d = parseISO(iso);
        return el('button', { type: 'button', class: 'day', 'data-date': iso, disabled: !n, 'aria-pressed': bk.date === iso ? 'true' : 'false',
          'aria-label': dayLong(iso) + ', ' + note,
          onclick: function () { bk.date = iso; bk.min = null; go(4); } },
          [el('span', { class: 'dw', text: DAYN[d.getDay()].slice(0, 3) }), el('span', { class: 'dn', text: String(d.getDate()) }), el('span', { class: 'dm', text: MONN[d.getMonth()].slice(0, 3) }), el('span', { class: 'dc', text: note })]);
      }));
      var kids = [grid];
      if (bk.date) kids.push(el('p', { class: 'fine', text: 'Earliest free day: ' + dayLong(bk.date) + '.' }));
      kids.push(el('div', { class: 'row' }, [backBtn(2), bk.date ? el('button', { type: 'button', class: 'btn btn-primary', id: 'to-times', text: 'See times for ' + dayShort(bk.date), onclick: function () { go(4); } }) : el('p', { text: 'No free days in the next two weeks.' })]));
      body = el('div', {}, kids);
    } else if (bk.step === 4) {
      h3 = el('h3', { tabindex: '-1', text: 'Choose a time on ' + (bk.date ? dayLong(bk.date) : '') });
      var slots = bk.date ? freeSlots(bk.serviceId, bk.pref, bk.date, bk.moving) : [];
      if (!slots.length) {
        body = el('div', {}, [el('p', { text: 'No free times left that day.' }), backBtn(3)]);
      } else {
        var groups = [['Morning', 0, 720], ['Afternoon', 720, 1020], ['Evening', 1020, 1440]];
        var gk = [];
        groups.forEach(function (g) {
          var sl = slots.filter(function (s) { return s.min >= g[1] && s.min < g[2]; });
          if (!sl.length) return;
          gk.push(el('div', { class: 'slot-group' }, [el('h4', { text: g[0] }), el('div', { class: 'slots' }, sl.map(function (s) {
            return el('button', { type: 'button', class: 'slot', 'data-min': String(s.min), 'data-time': s.time, 'data-stylist': s.stylistId,
              'aria-pressed': bk.min === s.min ? 'true' : 'false',
              onclick: function () { pickSlot(s); } },
              [el('strong', { text: nice(s.min) }), bk.pref === 'any' ? el('span', { text: styById(s.stylistId).name }) : null]);
          }))]));
        });
        gk.push(backBtn(3));
        body = el('div', {}, gk);
      }
    } else if (bk.step === 5) {
      h3 = el('h3', { tabindex: '-1', text: bk.moving ? 'Confirm the new time' : 'Your details' });
      body = el('div', {}, [summaryList(), detailsForm(bk.moving ? 'Confirm new time' : 'Review and pay deposit', function () {
        if (!checkDetails()) return;
        if (bk.moving) commit(); else go(6);
      }), backBtn(4)]);
    } else if (bk.step === 6) {
      h3 = el('h3', { tabindex: '-1', text: 'Pay your deposit' });
      var svc6 = svcById(bk.serviceId), dep = svc6.deposit;
      var needName = !bk.name;
      var kids6 = [summaryList()];
      if (needName) {
        kids6.push(el('p', { text: 'What first name shall we put it under?' }));
        kids6.push(detailsForm('Save name', function () { if (checkDetails()) renderBooking(); }));
      } else {
        kids6.push(el('p', { class: 'fine', text: 'Booking for ' + bk.name + (bk.email ? ' (' + bk.email + ')' : '') + '.' }));
      }
      kids6.push(el('p', { class: 'pay-note', text: 'The deposit comes off your bill on the day. Move or cancel free up to ' + D.cancelHours + ' hours before; inside that, the deposit is kept.' }));
      if (bk.err) kids6.push(el('p', { class: 'err', role: 'alert', text: bk.err }));
      kids6.push(el('div', { class: 'row' }, [
        backBtn(needName ? 4 : 5),
        el('button', { type: 'button', class: 'btn btn-primary btn-pay', id: 'pay-btn', text: 'Pay with Stripe (test mode)', 'data-amount': String(dep), onclick: payDeposit })
      ]));
      body = el('div', {}, kids6);
    } else {
      body = doneView();
      h3 = body.heading;
      body = body.node;
    }
    wrap.appendChild(h3); wrap.appendChild(body);
    bookingBox.appendChild(wrap);
    if (focusNext && h3) { try { h3.focus({ preventScroll: true }); } catch (e) { /* ignore */ } var top = bookingBox.getBoundingClientRect().top; if (top < 0 || top > window.innerHeight * 0.6) bookingBox.scrollIntoView({ block: 'start' }); }
    else window.scrollTo(0, keepScroll);
    focusNext = false;
    updateChrome();
    if (hooks.state) hooks.state();
  }

  function detailsForm(cta, onOk) {
    var nameIn = el('input', { id: 'f-name', name: 'first-name', type: 'text', autocomplete: 'given-name', required: true, maxlength: '24', value: bk.name, placeholder: 'First name', oninput: function () { bk.name = cleanName(nameIn.value); } });
    var mailIn = el('input', { id: 'f-email', name: 'demo-email', type: 'email', autocomplete: 'off', maxlength: '60', value: bk.email, placeholder: 'optional, like sam@mail.example', oninput: function () { bk.email = mailIn.value.trim(); }, 'aria-describedby': 'f-email-help' });
    var err = el('p', { class: 'err', id: 'f-err', role: 'alert' });
    var form = el('form', { class: 'details', novalidate: true, onsubmit: function (e) { e.preventDefault(); bk.name = cleanName(nameIn.value); bk.email = mailIn.value.trim(); if (!bk.name) { err.textContent = 'Please add a first name.'; nameIn.focus(); return; } if (!validEmail(bk.email)) { err.textContent = 'In this demo, use an address ending .example, such as sam@mail.example. Nothing is ever sent.'; mailIn.focus(); return; } err.textContent = ''; onOk(); } }, [
      el('label', { for: 'f-name' }, ['First name']), nameIn,
      el('label', { for: 'f-email' }, ['Email (optional)']), mailIn,
      el('p', { class: 'fine', id: 'f-email-help', text: 'Demo only: use an address ending .example. Nothing is ever sent.' }),
      err,
      el('button', { type: 'submit', class: 'btn btn-primary', id: 'details-go', text: cta })
    ]);
    return form;
  }
  function checkDetails() {
    if (!bk.name) return false;
    return validEmail(bk.email);
  }
  function pickSlot(s) {
    bk.min = s.min; bk.stylistId = s.stylistId;
    if (bk.moving) { go(5); return; }
    go(5);
  }
  function payDeposit() {
    if (!bk.name) { bk.err = 'Please add a first name first.'; renderBooking(); return; }
    var svc = svcById(bk.serviceId), dep = svc.deposit;
    openCheckout({ linkKey: 'deposit' + dep, lines: [[svc.name + ' deposit', dep]], done: commit });
  }
  function commit() {
    var svc = svcById(bk.serviceId);
    var slots = freeSlots(bk.serviceId, bk.stylistId, bk.date, bk.moving);
    var ok = slots.some(function (s) { return s.min === bk.min; });
    if (!ok) {
      bk.min = null; bk.err = '';
      var msg = 'Sorry, that time was just taken. Please choose another.';
      go(bk.date && freeSlots(bk.serviceId, bk.pref, bk.date, bk.moving).length ? 4 : 3);
      var note = el('p', { class: 'err', role: 'alert', text: msg });
      bookingBox.insertBefore(note, bookingBox.firstChild);
      if (hooks.refused) hooks.refused(msg);
      return;
    }
    var b;
    if (bk.moving) {
      updateBooking(bk.moving, { date: bk.date, start: bk.min, stylistId: bk.stylistId });
      b = S.bookings.filter(function (x) { return x.id === bk.moving; })[0];
      addLog('move', b.name + ' moved ' + svc.name + ' to ' + dayShort(b.date) + ' ' + nice(b.start) + '.');
      bk.moving = null;
    } else {
      b = { id: uid('b'), date: bk.date, start: bk.min, serviceId: bk.serviceId, stylistId: bk.stylistId, name: bk.name, email: bk.email || '', deposit: svc.deposit, via: bk.viaAI ? 'ai' : 'form', created: Date.now() };
      addBooking(b);
      addPayment({ kind: 'deposit', amount: svc.deposit, bookingId: b.id });
      addLog(bk.viaAI ? 'ai-booking' : 'booking', b.name + ' booked ' + svc.name + ' with ' + styById(b.stylistId).name + ', ' + dayShort(b.date) + ' ' + nice(b.start) + (bk.viaAI ? ' (made by the AI assistant)' : ' (online form)') + '.');
    }
    bk.done = b; bk.viaAI = false;
    go(7);
    if (hooks.booked) hooks.booked(b);
  }

  function doneView() {
    var b = bk.done, svc = svcById(b.serviceId), st = styById(b.stylistId);
    var h = el('h3', { tabindex: '-1', text: 'You are booked in, ' + b.name });
    var ics = buildICS(b);
    window.SalonApp && (window.SalonApp.lastICS = ics);
    var href = '#';
    try { href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' })); } catch (e) { href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics); }
    var d = parseISO(b.date);
    var startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(b.start / 60), b.start % 60);
    var hoursAway = (startDate.getTime() - Date.now()) / 3600000;
    var policy = hoursAway >= D.cancelHours
      ? 'You can move or cancel free of charge until ' + D.cancelHours + ' hours before. Inside ' + D.cancelHours + ' hours, your ' + money(b.deposit) + ' deposit is kept.'
      : 'This is inside ' + D.cancelHours + ' hours, so under our policy your ' + money(b.deposit) + ' deposit is kept if you move or cancel.';
    var result = el('p', { class: 'result', id: 'mc-result', role: 'status' });
    var node = el('div', { class: 'done' }, [
      el('dl', { class: 'summary', id: 'done-summary' }, [
        ['Service', svc.name], ['Stylist', st.name], ['When', dayLong(b.date) + ' at ' + nice(b.start)], ['Price', money(svc.price)], ['Deposit paid (demo)', money(b.deposit)]
      ].map(function (r) { return el('div', {}, [el('dt', { text: r[0] }), el('dd', { text: r[1] })]); })),
      el('p', { class: 'fine', text: 'Demo booking: nothing was charged and no email was sent.' }),
      el('div', { class: 'row' }, [
        el('a', { class: 'btn btn-primary', id: 'ics-link', href: href, download: 'orla-and-quill-booking.ics', text: 'Add to calendar' }),
        el('button', { type: 'button', class: 'btn btn-ghost', text: 'Book another', onclick: function () { resetBooking(); } })
      ]),
      el('div', { class: 'move-cancel' }, [
        el('h4', { text: 'Move or cancel' }),
        el('p', { id: 'policy-text', text: policy }),
        el('div', { class: 'row' }, [
          el('button', { type: 'button', class: 'btn btn-ghost', id: 'move-btn', text: 'Move it', onclick: function () {
            bk.moving = b.id; bk.serviceId = b.serviceId; bk.pref = b.stylistId; bk.date = null; bk.min = null; bk.name = b.name; go(3);
          } }),
          el('button', { type: 'button', class: 'btn btn-ghost', id: 'cancel-btn', text: 'Cancel it', onclick: function () {
            cancelBooking(b.id);
            addLog('cancel', b.name + ' cancelled ' + svc.name + ' on ' + dayShort(b.date) + ' ' + nice(b.start) + (hoursAway >= D.cancelHours ? ' (deposit returned, demo).' : ' (inside 24 hours, deposit kept).'));
            result.textContent = hoursAway >= D.cancelHours ? 'Cancelled. In the real policy your deposit would be returned. Demo only.' : 'Cancelled. Inside 24 hours, so the deposit is kept. Demo only.';
          } })
        ]),
        result
      ])
    ]);
    return { heading: h, node: node };
  }

  /* ---------- vouchers ---------- */
  var vb = {};
  D.vouchers.forEach(function (v) { vb[v] = 0; });
  var voucherBox = $('#voucher-basket');
  var voucherCodes = [];
  function voucherTotal() { return D.vouchers.reduce(function (t, v) { return t + v * vb[v]; }, 0); }
  function renderVouchers() {
    if (!voucherBox) return;
    voucherBox.textContent = '';
    var rows = D.vouchers.map(function (v) {
      return el('li', { class: 'v-row' }, [
        el('span', { class: 'v-name', id: 'v-n-' + v, text: money(v) + ' voucher' }),
        el('div', { class: 'qty', role: 'group', 'aria-labelledby': 'v-n-' + v }, [
          el('button', { type: 'button', class: 'qbtn', 'aria-label': 'Remove one ' + money(v) + ' voucher', disabled: vb[v] === 0, onclick: function () { vb[v] = Math.max(0, vb[v] - 1); renderVouchers(); } }, ['−']),
          el('output', { 'aria-live': 'polite', 'data-qty': String(v), text: String(vb[v]) }),
          el('button', { type: 'button', class: 'qbtn', 'aria-label': 'Add one ' + money(v) + ' voucher', disabled: vb[v] >= 5, onclick: function () { vb[v]++; renderVouchers(); } }, ['+'])
        ])
      ]);
    });
    var total = voucherTotal();
    var kids = [el('ul', { class: 'v-list' }, rows),
      el('p', { class: 'v-total' }, ['Basket total: ', el('strong', { id: 'v-total', text: money(total) })]),
      el('button', { type: 'button', class: 'btn btn-primary', id: 'voucher-pay', disabled: !total, text: 'Pay with Stripe (test mode)', onclick: payVouchers })];
    if (voucherCodes.length) {
      kids.push(el('div', { class: 'v-done', role: 'status' }, [el('p', { text: 'Demo vouchers created. They are not real and cannot be spent.' }), el('ul', {}, voucherCodes.map(function (c) { return el('li', { text: c }); }))]));
    }
    voucherBox.appendChild(el('div', {}, kids));
  }
  function payVouchers() {
    var total = voucherTotal(); if (!total) return;
    var lines = [], single = null, count = 0;
    D.vouchers.forEach(function (v) { if (vb[v]) { lines.push([vb[v] + ' × ' + money(v) + ' voucher', v * vb[v]]); count += vb[v]; single = v; } });
    var key = count === 1 ? 'voucher' + single : 'voucherBasket';
    openCheckout({ linkKey: key, lines: lines, done: function () {
      voucherCodes = [];
      D.vouchers.forEach(function (v) { for (var i = 0; i < vb[v]; i++) voucherCodes.push('OQ-DEMO-' + v + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()); });
      addPayment({ kind: 'voucher', amount: total });
      addLog('voucher', 'Gift vouchers sold (demo): ' + money(total) + '.');
      D.vouchers.forEach(function (v) { vb[v] = 0; });
      renderVouchers();
    } });
  }

  /* ---------- receptionist: deterministic local engine ---------- */
  var ctx = { part: null, min: null, stage: 'idle', offered: [], awaitingName: false, convLogged: false };
  var PARTS = { morning: [0, 720], afternoon: [720, 1020], evening: [1020, 1440], lunch: [720, 840] };
  var NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  var NUMRX = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve';
  var MONRX = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  var MONKEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function norm(s) {
    return ' ' + String(s).toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9:'£%\/.\-@ ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function num(x) { return NUMW[x] != null ? NUMW[x] : parseInt(x, 10); }

  var SVC_TERMS = [];
  D.services.forEach(function (s) {
    var seen = {};
    [s.name.toLowerCase().replace(/[’]/g, "'")].concat(s.terms).forEach(function (term) {
      term = term.toLowerCase();
      if (seen[term]) return; seen[term] = true;
      SVC_TERMS.push({ id: s.id, term: term, re: new RegExp("(^|[^a-z])" + esc(term) + "(?![a-z])") });
    });
  });
  function findService(t) {
    var best = null;
    SVC_TERMS.forEach(function (x) { if (x.re.test(t) && (!best || x.term.length > best.term.length)) best = x; });
    return best ? best.id : null;
  }
  function findStylist(t) {
    for (var i = 0; i < D.stylists.length; i++) if (new RegExp('(^|[^a-z])' + D.stylists[i].id + '(?![a-z])').test(t)) return D.stylists[i].id;
    if (/\b(anyone|anybody|any stylist|no preference|don't mind|dont mind|whoever|any of you)\b/.test(t)) return 'any';
    return null;
  }
  function parseDate(t) {
    var today = now(), m, res = { iso: null, rest: t, tonight: false };
    function done(d, rx) { res.iso = isoOf(d); res.rest = t.replace(rx, ' '); return res; }
    var rx = /\bday after tomorrow\b/;
    if (rx.test(t)) return done(addDays(today, 2), rx);
    rx = /\btomorrow\b/; if (rx.test(t)) return done(addDays(today, 1), rx);
    rx = /\b(today|tonight)\b/;
    if (rx.test(t)) { if (/\btonight\b/.test(t)) res.tonight = true; return done(today, rx); }
    function monthDate(day, mon) {
      var mi = MONKEYS.indexOf(mon.slice(0, 3)), y = today.getFullYear();
      var d = new Date(y, mi, +day);
      if (isoOf(d) < isoOf(today)) d = new Date(y + 1, mi, +day);
      return d;
    }
    var rx1 = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(' + MONRX + ')\\b');
    var rx2 = new RegExp('\\b(' + MONRX + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b');
    if ((m = rx1.exec(t))) return done(monthDate(m[1], m[2]), rx1);
    if ((m = rx2.exec(t))) return done(monthDate(m[2], m[1]), rx2);
    var rx3 = /\b(\d{1,2})\/(\d{1,2})\b/;
    if ((m = rx3.exec(t))) { var d3 = new Date(today.getFullYear(), +m[2] - 1, +m[1]); if (isoOf(d3) < isoOf(today)) d3 = new Date(today.getFullYear() + 1, +m[2] - 1, +m[1]); return done(d3, rx3); }
    var rx4 = /\b(?:(this|next|on|coming)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)\b/;
    if ((m = rx4.exec(t))) {
      var key = m[2].slice(0, 3), idx = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(key);
      var off = (idx - today.getDay() + 7) % 7;
      if (m[1] === 'next') off += 7;
      return done(addDays(today, off), rx4);
    }
    return res;
  }
  function parsePart(t) {
    if (/\bmorning\b/.test(t)) return 'morning';
    if (/\bafternoon\b/.test(t)) return 'afternoon';
    if (/\b(evening|tonight|after work)\b/.test(t)) return 'evening';
    if (/\b(lunch|lunchtime)\b/.test(t)) return 'lunch';
    return null;
  }
  function resolveHour(h, mer, minute, offered) {
    if (mer === 'pm' && h < 12) h += 12;
    else if (mer === 'am' && h === 12) h = 0;
    else if (!mer && h >= 1 && h <= 11) {
      var am = h * 60 + minute, pm = (h + 12) * 60 + minute;
      var hasAm = (offered || []).some(function (o) { return o.min === am; }), hasPm = (offered || []).some(function (o) { return o.min === pm; });
      if (hasPm && !hasAm) h += 12;
      else if (hasAm && !hasPm) { /* keep */ }
      else if (h <= 8) h += 12;
    }
    return h * 60 + minute;
  }
  function parseTime(t, offered, offeredStage) {
    var m;
    if ((m = /\b(\d{1,2})[:.](\d{2})\s*(am|pm)?(?![a-z0-9])/.exec(t)) && +m[1] < 24 && +m[2] < 60) return resolveHour(+m[1], m[3], +m[2], offered);
    if ((m = /\b(\d{1,2})\s*(am|pm)(?![a-z])/.exec(t)) && +m[1] >= 1 && +m[1] <= 12) return resolveHour(+m[1], m[2], 0, offered);
    if ((m = new RegExp('\\b(' + NUMRX + ')\\s*(am|pm)(?![a-z])').exec(t))) return resolveHour(num(m[1]), m[2], 0, offered);
    if ((m = new RegExp('\\bhalf\\s+(?:past\\s+)?(\\d{1,2}|' + NUMRX + ')(?![\\d:])\\b').exec(t)) && num(m[1]) >= 1 && num(m[1]) <= 12) return resolveHour(num(m[1]), null, 30, offered);
    if ((m = new RegExp('\\bquarter\\s+(past|to)\\s+(\\d{1,2}|' + NUMRX + ')\\b').exec(t)) && num(m[2]) >= 1 && num(m[2]) <= 12) {
      var h = num(m[2]); return m[1] === 'past' ? resolveHour(h, null, 15, offered) : resolveHour(h - 1 || 12, null, 45, offered);
    }
    if ((m = new RegExp('\\b(\\d{1,2}|' + NUMRX + ")\\s*(?:o'?clock|oclock)\\b").exec(t)) && num(m[1]) >= 1 && num(m[1]) <= 12) return resolveHour(num(m[1]), null, 0, offered);
    if (/\b(noon|midday)\b/.test(t)) return 720;
    if ((m = /\b(?:at|the|for|around|about|by)\s+(\d{1,2})(?![\d:.%]|\s*(?:st|nd|rd|th|people|persons|of|%|percent|pounds|quid))\b/.exec(t)) && +m[1] >= 1 && +m[1] <= 12) return resolveHour(+m[1], null, 0, offered);
    if (offeredStage && (m = /^\s*(?:the\s+|at\s+)?(\d{1,2})\s*(?:please|ok|okay|thanks|thank you)?\s*$/.exec(t)) && +m[1] >= 1 && +m[1] <= 12) return resolveHour(+m[1], null, 0, offered);
    return null;
  }
  function slotLabel(s) { return nice(s.min) + ' with ' + styById(s.stylistId).name; }
  function pick2(slots) {
    if (slots.length <= 2) return slots.slice();
    var first = slots[0], second = slots[1];
    for (var i = 1; i < slots.length; i++) if (slots[i].min >= first.min + 90) { second = slots[i]; break; }
    return [first, second];
  }
  function hoursText() {
    var groups = [], order = [2, 3, 4, 5, 6];
    order.forEach(function (d) {
      var h = D.hours[d], s = nice(toMin(h[0])) + ' to ' + nice(toMin(h[1]));
      var g = groups.filter(function (x) { return x.s === s; })[0];
      if (g) g.days.push(DAYN[d]); else groups.push({ s: s, days: [DAYN[d]] });
    });
    var parts = groups.map(function (g) {
      var d = g.days.length > 1 ? g.days.slice(0, -1).join(', ') + ' and ' + g.days[g.days.length - 1] : g.days[0];
      return d + ' ' + g.s;
    });
    var closed = [0, 1].filter(function (d) { return !D.hours[d]; }).map(function (d) { return DAYN[d]; });
    return 'We are open ' + parts.join('; ') + (D.hours[4] ? ' (Thursday is our late night)' : '') + '. Closed ' + closed.reverse().join(' and ') + '.';
  }
  function policyText() {
    return 'You can move or cancel free of charge up to ' + D.cancelHours + ' hours before your appointment. Inside ' + D.cancelHours + ' hours, your deposit is kept. That is this made-up salon\'s own policy.';
  }
  function depositText() {
    return 'The deposit is ' + money(10) + ' for services under ' + money(50) + ' and ' + money(20) + ' for services of ' + money(50) + ' or more. It comes off your bill on the day.';
  }
  function priceList() { return D.services.map(function (s) { return s.name + ' ' + money(s.price); }).join(', '); }
  var SCOPE = 'I can only help with Orla & Quill: booking, prices, opening hours, vouchers and our policy.';
  var NOT_SURE = "I'm not sure about that one, and I would rather not guess. I can help with services, prices, opening hours, our policy, vouchers and booking. Or tap Talk to a person.";

  function greetText() {
    if (!S.open) {
      var n = nextOpenISO();
      return "We're closed right now — I can still book you in for " + (n ? dayLong(n) : 'the next open day') + ". I'm the Orla & Quill AI assistant. What would you like?";
    }
    return "Hello, I'm the Orla & Quill AI assistant. I can book you in, quote prices and answer questions about hours and our policy. What would you like?";
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }
  var NAME_STOP = ['yes', 'no', 'ok', 'okay', 'please', 'thanks', 'thank', 'sure', 'hi', 'hello', 'hey', 'stop', 'cancel', 'back', 'what', 'how', 'why', 'when', 'who', 'where', 'pay', 'paid', 'done', 'help'];

  function syncStep() {
    if (!bk.serviceId) bk.step = 1;
    else if (!bk.date) bk.step = 3;
    else bk.step = 4;
    bk.done = null; bk.err = '';
    renderBooking();
  }
  function offer(slots, intro) {
    ctx.offered = slots; ctx.stage = 'offered'; bk.min = null; bk.stylistId = null;
    syncStep();
    var svc = svcById(bk.serviceId);
    var txt = slots.map(slotLabel).join(' or ');
    return intro + 'For ' + svc.name + ' on ' + dayLong(bk.date) + (ctx.part && ctx.part !== 'lunch' ? ' (' + ctx.part + ')' : '') + ', I have ' + txt + '.' + (slots.length > 1 ? ' Which would you like?' : ' Shall I take that?');
  }
  function offerFrom(startIso, intro) {
    var days = windowDays(), i = days.indexOf(startIso);
    if (i < 0) i = 0;
    var rng = ctx.part && PARTS[ctx.part], fb = null;
    for (; i < days.length; i++) {
      var all = freeSlots(bk.serviceId, bk.pref, days[i]);
      if (!all.length) continue;
      var part = rng ? all.filter(function (s) { return s.min >= rng[0] && s.min < rng[1]; }) : all;
      if (rng && !part.length) { if (!fb) fb = { iso: days[i], all: all }; continue; }
      bk.date = days[i];
      return offer(pick2(part), intro);
    }
    if (fb) { bk.date = fb.iso; return offer(pick2(fb.all), intro + 'Nothing free then in the next two weeks, so here is the nearest other time. '); }
    ctx.stage = 'idle';
    return intro + "I can't see any free times in the next two weeks for that. Tap Talk to a person and someone can help.";
  }
  function readback(slot) {
    var svc = svcById(bk.serviceId);
    bk.min = slot.min; bk.stylistId = slot.stylistId; ctx.offered = [slot]; ctx.stage = 'confirm';
    bk.done = null; bk.step = 4; renderBooking();
    return svc.name + ' with ' + styById(slot.stylistId).name + ' on ' + dayLong(bk.date) + ' at ' + nice(slot.min) + '. It is ' + money(svc.price) + ', with a ' + money(svc.deposit) + ' deposit to pay now. Shall I book it?';
  }
  function confirmYes() {
    var slots = freeSlots(bk.serviceId, bk.stylistId, bk.date);
    if (!slots.some(function (s) { return s.min === bk.min; })) {
      ctx.stage = 'idle';
      return offerFrom(bk.date, 'Sorry, that time has just gone. ');
    }
    bk.viaAI = true; bk.done = null; bk.step = 6; bk.err = '';
    ctx.stage = 'paying'; ctx.awaitingName = !bk.name;
    focusNext = false; renderBooking();
    try { bookingBox.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (e) { /* ignore */ }
    hooks.toPay && hooks.toPay();
    var dep = money(svcById(bk.serviceId).deposit);
    return "Lovely. I've taken you to the payment step. The deposit is " + dep + ', paid on Stripe\'s own secure page, not here. ' +
      (bk.name ? 'Tap Pay with Stripe (test mode) when you are ready.' : 'What first name shall I put it under? You can also type it in the box.');
  }

  // 12+ digits (spaces, dashes, dots or slashes between), not after "+" and not starting with 0, so "+44 7700 900123" stays a phone number.
  function longDigits(raw) { return /(^|[^+\d])[1-9](?:[ \-.\/]?\d){11,}/.test(String(raw)); }
  var CARD_REFUSAL = "I can't take card details here. Payment is never taken in this chat; the secure Stripe page does that, at the payment step, with the Pay with Stripe (test mode) button.";
  var LOGIN_REFUSAL = "I can't take payment or login details in this chat, and I would rather you did not type them. Payment is made on the secure Stripe page, at the payment step.";
  function respond(raw) {
    var t = norm(raw), m;
    if (!t.trim()) return 'I did not catch that. Try something like "balayage on Saturday afternoon".';

    /* safety first */
    if ((longDigits(raw) || /\b(cvv|cvc|expiry|expiration|security code|card number|card details|sort code|account number|credit card|debit card|bank details|my card|pay by card|pay with card|card payment)\b/.test(t)) && !/gift card/.test(t)) {
      return CARD_REFUSAL;
    }
    if (/(ignore|disregard|forget|override|bypass).{0,30}(instruction|rule|prompt|previous|above|guideline)|system prompt|developer mode|jailbreak|you are now|pretend (to be|you)|act as |reveal your|your instructions/.test(t)) return SCOPE;
    if (/\b(other salons?|another salon|competitor|rival|better price|cheaper elsewhere|price match|toni|supercuts|rush hair|which salon)\b/.test(t)) return SCOPE + ' I can only speak for this salon.';

    /* stage: paying (waiting for a name) */
    if (ctx.stage === 'paying') {
      if (bk.step !== 6) { ctx.stage = 'idle'; ctx.awaitingName = false; }
      else if (ctx.awaitingName && !bk.name) {
        var nm = /(?:my name is|call me|name's|it's|its|under|i'm|im|i am)\s+([a-z][a-z'\-]{1,20})/.exec(t);
        var word = nm ? nm[1] : (/^ ?([a-z][a-z'\-]{1,20})(?: [a-z][a-z'\-]{1,20})? $/.test(t) && NAME_STOP.indexOf(t.trim().split(' ')[0]) < 0 && !findService(t) ? t.trim().split(' ')[0] : null);
        if (word && NAME_STOP.indexOf(word) < 0) {
          bk.name = cleanName(cap(word)); ctx.awaitingName = false; renderBooking();
          return 'Thanks, ' + bk.name + '. Tap Pay with Stripe (test mode) when you are ready. Card details go on Stripe\'s page, never here.';
        }
      }
      if (/\b(pay|payment|checkout|stripe|ready)\b/.test(t) && !/\b(how much|price|cost)\b/.test(t)) {
        return bk.name ? 'Tap the Pay with Stripe (test mode) button on the booking. It is test mode, so nothing is charged.' : 'I just need a first name for the booking. What should I put?';
      }
    }

    /* identity and people */
    var wantPerson = /\b(talk|speak|chat|get|put me|connect|transfer|pass me|hand me)\b.{0,25}\b(person|human|someone|somebody|manager|owner|staff|team|stylist|receptionist)\b|\b(want|need|prefer) (a |to |an )?(real |actual )?(person|human)\b|\bcomplain|\bcomplaint|\bcall me\b|\bring me\b|\bphone me\b|\bcall back\b/.test(t);
    if (wantPerson) return 'Tap Talk to a person and it opens an email to ' + D.email + ' with a short summary of this chat, so you do not have to repeat yourself.';
    if (/\b(are you|is this|am i (?:talking|speaking|chatting)|you a|you an)\b.{0,30}\b(person|human|real|robot|bot|ai|machine|computer|alive)\b|\breal person\b|\bwho am i (talking|speaking)/.test(t) ||
        /\b(are you|is this|is it|you)\b.{0,20}\b(chat ?gpt|gpt|claude|gemini|copilot|chatbot|llm|language model|artificial|a\.i\.?)\b/.test(t)) {
      return "I'm an AI assistant for this demo salon, and I can't say which product is behind me. I can book you in, quote prices and answer questions about the salon. If you'd rather talk to a person, tap Talk to a person.";
    }
    /* consultation: answer only from the service blurbs in salon-data.js (no offer of anything free) */
    if (/\bconsult/.test(t) && !/\b(book|booking|appointment)\b/.test(t)) {
      var cs = D.services.filter(function (sv) { return /consultation/i.test(sv.blurb); })[0];
      if (cs) return 'A consultation is part of ' + cs.name + ', which is ' + money(cs.price) + ' and takes about ' + durText(cs.mins) + '. I have no separate consultation listed, so for anything beyond that tap Talk to a person.';
    }

    var d = parseDate(t);
    var p = { svc: findService(t), sty: findStylist(t), date: d.iso, part: parsePart(t) || (d.tonight ? 'evening' : null), min: null };
    p.min = parseTime(d.rest, ctx.stage === 'offered' ? ctx.offered : (ctx.stage === 'confirm' ? ctx.offered : []), ctx.stage === 'offered');
    var isYes = /\b(yes|yeah|yep|yup|yes please|please do|go ahead|book it|sounds good|that's right|thats right|perfect|sure|ok|okay|confirm|do it|great|lovely|that works|that one)\b/.test(t) && t.trim().split(' ').length <= 8;
    var isNo = /^ ?(no|nope|nah|not really|no thanks|no thank you|wrong|that's wrong|not that one|change it|change that)\b/.test(t);
    var hasBookingFields = p.svc || p.sty || p.date || p.min != null || p.part;

    /* stage handlers */
    if (ctx.stage === 'confirm') {
      if (isYes && !hasBookingFields) return confirmYes();
      if (isNo && !hasBookingFields) { ctx.stage = 'idle'; ctx.offered = []; bk.min = null; bk.stylistId = null; renderBooking(); return 'No problem. What would you like to change: the service, the day or the time?'; }
    }
    if (ctx.stage === 'offered') {
      var chosen = null, o = ctx.offered;
      if (p.min != null) chosen = o.filter(function (s) { return s.min === p.min; })[0] || null;
      if (!chosen && !p.date && !p.svc) {
        if (/\b(first|1st|earlier|earliest|top|former)\b/.test(t)) chosen = o[0];
        else if (/\b(second|2nd|later|latest|last|latter|other)\b/.test(t)) chosen = o[1] || o[0];
        else if (/\b(either|any|whichever|doesn't matter|dont mind|don't mind)\b/.test(t) && !p.sty) chosen = o[0];
        else if (isYes && o.length === 1) chosen = o[0];
      }
      if (chosen) return readback(chosen);
      if (isNo && !hasBookingFields) { return 'No problem. Tell me another day or time and I will look again.'; }
    }

    /* information intents */
    var wantsBook = /\b(book|booking|appointment|appt|slot|slots|available|availability|free|come in|see you|reserve|squeeze|fit me)\b/.test(t) && !/\b(cancel|policy|move|reschedul)\b/.test(t);
    var priceQ = /\b(price|prices|cost|costs|how much|charge|charges|pricing|rates|price list|menu|quote)\b|£/.test(t);
    if (/\b(discount|coupon|promo|promotion|cheaper|% off|percent off|half price|knock off|reduce the price|special offer|deals?|loyalty|student|freebie|for free|free of charge|mates rates)\b/.test(t)) {
      return "I can't change a price. I can only quote the list" + (D.vouchers.length ? ', and a gift voucher makes a nice present.' : '.');
    }
    if (/\b(gift ?(card|voucher)|vouchers?)\b/.test(t)) return 'Gift vouchers come in ' + D.vouchers.map(money).join(', ').replace(/, ([^,]*)$/, ' and $1') + '. Add them in the Gift vouchers section of the page and pay with Stripe in test mode. This is a demo, so no voucher is real.';
    if (/\b(deposit)\b/.test(t)) return depositText() + ' ' + policyText();
    if (/\b(cancel|cancellation|reschedul|refund|policy|move my|change my (booking|appointment)|no show|no-show|late fee)\b/.test(t)) return policyText();
    if (/\b(apple pay|google pay|how (do|can) i pay|how to pay|payment|pay online|can i pay|stripe)\b/.test(t) && !priceQ) {
      return "You pay the deposit on Stripe's own secure page, in test mode here. Apple Pay and Google Pay appear there too. Card details are typed only on Stripe's page, never on this site. Nothing is charged in this demo.";
    }
    if (/\b(where are you|address|location|directions|find you|postcode|parking|how do i get)\b/.test(t)) return 'Orla & Quill is a made-up salon for a demo, so there is no street address. You can email ' + D.email + '.';
    if (/\b(phone number|telephone|your number|ring you|call you|whatsapp|mobile number)\b/.test(t)) return 'There is no phone number for this made-up salon. You can email ' + D.email + ', or tap Talk to a person.';
    if (/\b(send|give|share|text|email) (me )?(a |the )?(link|url|website|web address|email|e-mail)\b|\bsend me\b|\bemail me\b|\bwhat'?s? (your |the )?(website|url|link)\b|\bwebsite address\b/.test(t)) {
      return "I can't send links or emails from here. The Pay with Stripe (test mode) button on the payment step takes you to Stripe's page, and Talk to a person opens an email to " + D.email + '.';
    }
    if ((/\b(open|opening|hours|close|closing|closed|late night|open late|opening times)\b/.test(t)) && !wantsBook) {
      if (p.date && !/\b(hours|times)\b/.test(t)) {
        var h = hoursOn(p.date);
        if (!inWindow(p.date)) return hoursText();
        return h ? 'Yes, on ' + dayLong(p.date) + ' we are open ' + nice(toMin(h[0])) + ' to ' + nice(toMin(h[1])) + '.' : 'No, we are closed on ' + DAYN[parseISO(p.date).getDay()] + 's.';
      }
      return (S.open ? '' : "We're closed right now. ") + hoursText();
    }
    if (priceQ && !(wantsBook && !/\b(price|cost|how much|prices|quote)\b/.test(t))) {
      if (p.svc) { var sv = svcById(p.svc); return sv.name + ' is ' + money(sv.price) + ' and takes about ' + durText(sv.mins) + '. The deposit is ' + money(sv.deposit) + '.'; }
      if (/\b(hair transplant|extensions?|keratin|perm|wax|nails?|massage|facial)\b/.test(t)) return "I don't have a price for that, and I would rather not guess. Here is what I can quote: " + priceList() + '.';
      return 'Our prices: ' + priceList() + '. ' + depositText();
    }
    if (/\b(what (services|treatments)|services|treatments|what do you (do|offer)|what can i get|what can you do)\b/.test(t) && !p.svc) {
      return 'We do ' + D.services.map(function (s) { return s.name.toLowerCase().replace(/^men's/, "men's"); }).join(', ') + '. Ask me for a price or a time for any of them.';
    }
    if (/\b(who works|stylists|the team|who are|who is)\b/.test(t) && !p.sty) {
      return D.stylists.map(function (s) { return s.name + ' (' + s.role.toLowerCase() + ')'; }).join(', ') + '. I can book any of them, or the first one free.';
    }
    if (/^ ?(hi|hello|hey|hiya|good (morning|afternoon|evening)|howdy)\b/.test(t) && !hasBookingFields && t.trim().split(' ').length <= 4) return greetText();
    if (/\b(thank you|thanks|cheers|ta)\b/.test(t) && !hasBookingFields) return "You're welcome. Anything else I can help with?";
    if ((/\b(bye|goodbye|that's all|that is all|see you later)\b/.test(t) && !hasBookingFields) || stopPhrase(raw)) return 'Goodbye, and thanks for visiting Orla & Quill.';

    /* booking turn */
    if (hasBookingFields || wantsBook || ctx.stage === 'offered' || ctx.stage === 'confirm') {
      if (!hasBookingFields && !(ctx.stage === 'offered' || ctx.stage === 'confirm') && !bk.serviceId) {
        return 'Which service would you like, and for which day? For example "balayage on Saturday afternoon".';
      }
      return bookingTurn(p, t);
    }
    return NOT_SURE;
  }

  function bookingTurn(p) {
    var prefix = '';
    if (bk.step === 7) { bk.done = null; bk.step = 1; }
    if (p.svc && bk.serviceId !== p.svc) { bk.serviceId = p.svc; ctx.offered = []; bk.min = null; bk.stylistId = null; ctx.min = null; ctx.stage = 'idle'; }
    if (p.sty) {
      var sv0 = bk.serviceId && svcById(bk.serviceId);
      if (p.sty !== 'any' && sv0 && styById(p.sty).does.indexOf(sv0.id) < 0) {
        prefix = styById(p.sty).name + " doesn't do " + sv0.name.toLowerCase() + ', so I will look at who does. ';
        bk.pref = 'any';
      } else bk.pref = p.sty;
      bk.min = null; bk.stylistId = null;
    }
    if (p.date) { bk.date = p.date; bk.min = null; bk.stylistId = null; ctx.min = null; }
    if (p.part) { ctx.part = p.part; }
    else if (p.date) ctx.part = null;
    if (p.min != null) ctx.min = p.min;
    bk.viaAI = true;
    if (!bk.serviceId) { syncStep(); return prefix + 'Which service would you like? For example haircut, colour, balayage, highlights, blow-dry or a men\'s cut.'; }
    if (!bk.date) { syncStep(); return prefix + 'Which day would you like? I can book up to ' + dayLong(windowDays()[D.windowDays - 1]) + '.'; }
    var today = todayISO();
    if (!inWindow(bk.date)) {
      var bad = bk.date; bk.date = null; syncStep();
      return prefix + (bad < today ? "That day has already gone. " : 'I can only book the next ' + D.windowDays + ' days, up to ' + dayLong(windowDays()[D.windowDays - 1]) + '. ') + 'Which day would suit?';
    }
    if (!hoursOn(bk.date)) return offerFrom(isoOf(addDays(parseISO(bk.date), 1)), prefix + "We're closed on " + DAYN[parseISO(bk.date).getDay()] + 's. ');
    if (bk.date === today && !S.open) return offerFrom(isoOf(addDays(parseISO(today), 1)), prefix + "We're closed right now. ");
    var all = freeSlots(bk.serviceId, bk.pref, bk.date);
    if (!all.length) return offerFrom(isoOf(addDays(parseISO(bk.date), 1)), prefix + 'There is nothing free on ' + dayLong(bk.date) + '. ');
    var rng = ctx.part && PARTS[ctx.part];
    var slots = rng ? all.filter(function (s) { return s.min >= rng[0] && s.min < rng[1]; }) : all;
    if (ctx.min != null) {
      var exact = all.filter(function (s) { return s.min === ctx.min; })[0];
      if (exact) return prefix + readback(exact);
      var near = all.slice().sort(function (a, b) { return Math.abs(a.min - ctx.min) - Math.abs(b.min - ctx.min) || a.min - b.min; }).slice(0, 2).sort(function (a, b) { return a.min - b.min; });
      ctx.min = null;
      return offer(near, prefix + 'That time is not free. ');
    }
    if (rng && !slots.length) return offer(pick2(all), prefix + 'Nothing is free in the ' + ctx.part + ' that day. ');
    return offer(pick2(slots), prefix);
  }

  function stopPhrase(text) {
    var t = norm(text).trim();
    return t.split(' ').length <= 6 && /^(please )?(stop|goodbye|bye|bye bye|that's all|that is all|stop listening|end conversation|that's it|thats all|no that's all)( thanks| thank you| please)?$/.test(t);
  }

  /* ---------- assistant panel ---------- */
  var panel = $('#assistant');
  var msgsBox = $('#as-msgs'), chips = $('#as-chips'), asForm = $('#as-form'), asInput = $('#as-input');
  var personLink = $('#as-person'), startBtn = $('#as-start'), stopBtn = $('#as-stop'), ring = $('#as-ring');
  var vState = $('#as-vstate'), caption = $('#as-caption'), micDot = $('#mic-dot');
  var voiceLive = $('#as-voice-live'), voiceBox = $('#as-voice'), voiceNote = $('#as-voice-note');
  var transcript = [];
  var greeted = false;

  function addMsg(who, text) {
    if (!msgsBox) return;
    var p = el('p', { class: 'msg ' + who }, [el('span', { class: 'who', text: who === 'me' ? 'You' : 'Orla & Quill (AI)' }), el('span', { class: 'txt', text: text })]);
    msgsBox.appendChild(p);
    // the panel body scrolls, not the message list itself
    var scroller = msgsBox.closest('.as-body') || msgsBox;
    scroller.scrollTop = scroller.scrollHeight;
  }
  function updatePerson() {
    if (!personLink) return;
    var lines = transcript.filter(function (l) { return !l.hidden; }).slice(-8).map(function (l) {
      // fallback: a long digit run (13+ digits, spaces, dashes, dots or slashes allowed) is never copied into the email
      return (l.who === 'me' ? 'Visitor: ' : 'Assistant: ') + l.text.replace(/(^|[^+\d])[1-9](?:[ \-.\/]?\d){12,}/g, '$1[number removed]').slice(0, 140);
    });
    var body = 'Hello, I was using the Orla & Quill demo assistant and would like to talk to a person.\n\n' +
      (lines.length ? 'Short summary of our chat:\n' + lines.join('\n') + '\n\n' : '') + 'Thank you.';
    personLink.setAttribute('href', 'mailto:' + D.email + '?subject=' + encodeURIComponent('Question from the Orla & Quill demo') + '&body=' + encodeURIComponent(body.slice(0, 1400)));
  }
  function botSay(text) {
    var g = guardReply(text);
    transcript.push({ who: 'bot', text: g });
    addMsg('bot', g);
    updatePerson();
    if (g === SAFE_FALLBACK || g === NOT_SURE) personLink && personLink.classList.add('attn');
    return g;
  }
  var MASK = '[message hidden: it looked like payment or login details]';
  // Shared guard check on visitor text. Fails closed: if the guards are missing or throw, nothing the visitor typed is kept.
  function sensitiveKind(text) {
    try {
      var G = window.CambyteGuards;
      if (!G || typeof G.sensitiveInput !== 'function') return 'unavailable';
      return String(G.sensitiveInput(text) || '');
    } catch (e) { return 'unavailable'; }
  }
  function userSay(text) {
    text = String(text || '').trim().slice(0, 300);
    if (!text) return null;
    if (!ctx.convLogged) { ctx.convLogged = true; addLog('conversation', 'A visitor started a conversation with the AI assistant.'); }
    if (chips) chips.hidden = true;
    var kind = sensitiveKind(text);
    if (kind) {
      // flagged: the raw text is never stored (transcript, mailto, localStorage, channel) and the bubble is masked
      transcript.push({ who: 'me', text: MASK, hidden: true });
      addMsg('me', MASK);
      return botSay(kind === 'unavailable' ? SAFE_FALLBACK : (kind === 'login' || kind === 'bank' ? LOGIN_REFUSAL : CARD_REFUSAL));
    }
    transcript.push({ who: 'me', text: text });
    addMsg('me', text);
    var reply;
    try { reply = respond(text); } catch (e) { reply = NOT_SURE; }
    if (reply === CARD_REFUSAL && longDigits(text)) { // the digit-run check fired: hide that line too (a plain "can I pay by card?" stays)
      var last = transcript[transcript.length - 1]; last.text = MASK; last.hidden = true;
      var bubbles = msgsBox ? msgsBox.querySelectorAll('.msg.me .txt') : [];
      if (bubbles.length) bubbles[bubbles.length - 1].textContent = MASK;
    }
    return botSay(reply);
  }
  function ensureGreeting() {
    if (greeted) return;
    greeted = true;
    botSay(greetText());
  }
  function narrow() { return window.matchMedia && window.matchMedia('(max-width: 720px)').matches; }
  function openAssistant() {
    if (!panel) return;
    panel.hidden = false;
    panel.classList.remove('min');
    var fab = $('#assistant-fab'); if (fab) { fab.setAttribute('aria-expanded', 'true'); fab.hidden = true; }
    ensureGreeting();
    var mn = $('#as-min'); if (mn) mn.setAttribute('aria-expanded', 'true');
    if (!narrow() && asInput) { try { asInput.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  function closeAssistant() {
    if (!panel) return;
    Voice.end();
    panel.hidden = true;
    var fab = $('#assistant-fab'); if (fab) { fab.setAttribute('aria-expanded', 'false'); fab.hidden = false; try { fab.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  function minimise(on) {
    if (!panel) return;
    var v = on == null ? !panel.classList.contains('min') : on;
    panel.classList.toggle('min', v);
    var mn = $('#as-min'); if (mn) { mn.setAttribute('aria-expanded', v ? 'false' : 'true'); mn.setAttribute('aria-label', v ? 'Expand assistant' : 'Minimise assistant'); }
  }
  hooks.toPay = function () { if (narrow()) minimise(true); };
  hooks.booked = function (b) {
    if (b.via !== 'ai' || !panel) return;
    var svc = svcById(b.serviceId);
    var t = botSay("You're booked in, " + b.name + '. ' + svc.name + ' with ' + styById(b.stylistId).name + ' on ' + dayLong(b.date) + ' at ' + nice(b.start) + '. You can add it to your calendar below. Nothing was charged in this demo.');
    if (Voice.on) Voice.speakThenListen(t);
    ctx.stage = 'idle';
  };
  hooks.refused = function (msg) {
    if (!panel || panel.hidden) return;
    var t = botSay(msg);
    if (Voice.on) Voice.speakThenListen(t);
  };

  /* ---------- voice (conversation mode) ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var hasTTS = !!(window.speechSynthesis && window.SpeechSynthesisUtterance);

  var BADVOICE = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|princess|agnes/i;
  function pickVoice() {
    var vs = [];
    try { vs = window.speechSynthesis.getVoices() || []; } catch (e) { vs = []; }
    var best = null, bs = -1;
    vs.forEach(function (v) {
      var lang = String(v.lang || '').replace('_', '-').toLowerCase(), nm = String(v.name || '');
      var s = -1;
      if (/premium|enhanced|natural/i.test(nm) && lang === 'en-gb') s = 100;
      else if (lang === 'en-gb') s = 80;
      else if (/premium|enhanced|natural/i.test(nm) && lang.indexOf('en') === 0) s = 60;
      else if (lang.indexOf('en') === 0) s = 40;
      if (s >= 0 && BADVOICE.test(nm)) s -= 30;
      if (s >= 0 && v.localService) s += 1;
      if (s > bs) { bs = s; best = v; }
    });
    return best;
  }

  var ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  var TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function words(n) {
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
    if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + words(n % 100) : '');
    return String(n);
  }
  function speakable(text) {
    var s = String(text);
    s = s.replace(new RegExp(esc(D.email), 'gi'), 'the salon email address shown on screen');
    s = s.replace(/£(\d+)(?:\.(\d{2}))?/g, function (m, a, b) { return words(+a) + (+a === 1 ? ' pound' : ' pounds') + (b && +b ? ' ' + words(+b) : ''); });
    s = s.replace(/\b(\d{1,2}):(\d{2})\s*(am|pm)\b/g, function (m, h, mi, ap) { return words(+h) + ' ' + (mi === '30' ? 'thirty' : words(+mi)) + ' ' + ap.charAt(0) + ' m'; });
    s = s.replace(/\b(\d{1,2})\s*(am|pm)\b/g, function (m, h, ap) { return words(+h) + ' ' + ap.charAt(0) + ' m'; });
    s = s.replace(/\b(\d+) hr (\d+)\b/g, function (m, h, mi) { return h + (+h === 1 ? ' hour ' : ' hours ') + mi + (+mi === 1 ? ' minute' : ' minutes'); });
    s = s.replace(/\b(\d+) hr\b/g, function (m, h) { return h + (+h === 1 ? ' hour' : ' hours'); });
    s = s.replace(/\b(\d+) mins?\b/g, function (m, n) { return n + (+n === 1 ? ' minute' : ' minutes'); });
    s = s.replace(/\bhr\b/g, 'hour').replace(/&/g, 'and').replace(/\(([^)]*)\)/g, ', $1,');
    s = s.replace(/,(\s*,)+/g, ',').replace(/,\s*([.;!?:])/g, '$1').replace(/\s+,/g, ',').replace(/[ \t]{2,}/g, ' ').trim();
    if (s.length > 240) {
      var cut = s.slice(0, 240), k = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(', '), cut.lastIndexOf('; '));
      s = (k > 80 ? cut.slice(0, k) : cut.replace(/\s+\S*$/, '')) + '. The rest is on screen.';
    }
    return s;
  }

  var Voice = {
    on: false, state: 'off', rec: null, micOn: false, paused: false, buf: '', silenceT: null, idleT: null, speakDone: null,
    silenceMs: 1200, idleMs: 45000, restarts: 0, token: 0
  };
  window.__voice = Voice;

  function setVState(s) {
    Voice.state = s;
    var label = { listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking', paused: 'Paused' }[s] || '';
    if (voiceBox) voiceBox.setAttribute('data-voice', s);
    if (vState) vState.textContent = label;
    if (voiceLive) voiceLive.hidden = s === 'off';
    if (micDot) micDot.hidden = !Voice.micOn;
    if (startBtn) startBtn.hidden = s !== 'off';
    if (ring) ring.setAttribute('aria-label', s === 'speaking' ? 'Tap to interrupt' : s === 'paused' ? 'Paused. Tap to carry on listening' : 'Tap to pause listening');
    if (panel) panel.classList.toggle('voice-on', s !== 'off');
  }
  function setCaption(t) { if (caption) caption.textContent = t || ''; }
  function stopRec() {
    var r = Voice.rec; Voice.rec = null; Voice.micOn = false;
    if (r) { r.onresult = r.onend = r.onerror = null; try { r.abort ? r.abort() : r.stop(); } catch (e) { try { r.stop(); } catch (e2) { /* ignore */ } } }
    if (micDot) micDot.hidden = true;
  }
  function clearTimers() { clearTimeout(Voice.silenceT); clearTimeout(Voice.idleT); Voice.silenceT = Voice.idleT = null; }
  function armIdle() {
    clearTimeout(Voice.idleT);
    Voice.idleT = setTimeout(function () {
      if (!Voice.on || Voice.state !== 'listening') return;
      Voice.end("I've stopped listening because it went quiet. Tap Start conversation to carry on.");
    }, Voice.idleMs);
  }
  function listen() {
    if (!Voice.on || Voice.paused || !SR) return;
    stopRec();
    var r;
    try { r = new SR(); } catch (e) { Voice.end("Voice isn't available in this browser. You can type instead."); return; }
    try { r.lang = 'en-GB'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1; } catch (e) { /* ignore */ }
    Voice.buf = '';
    r.onresult = function (ev) {
      if (!Voice.on || Voice.rec !== r) return;
      var txt = '', res = (ev && ev.results) || [];
      for (var i = 0; i < res.length; i++) { if (res[i] && res[i][0]) txt += res[i][0].transcript + ' '; }
      txt = txt.trim(); if (!txt) return;
      Voice.buf = txt; Voice.restarts = 0;
      setCaption(sensitiveKind(txt) ? '' : txt); armIdle();
      clearTimeout(Voice.silenceT);
      Voice.silenceT = setTimeout(function () { submitVoice(Voice.buf); }, Voice.silenceMs);
    };
    r.onerror = function (ev) {
      var code = ev && ev.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') Voice.end('The microphone is blocked, so I cannot listen. You can type instead.');
    };
    r.onend = function () {
      if (Voice.rec !== r) return;
      Voice.rec = null; Voice.micOn = false; if (micDot) micDot.hidden = true;
      if (Voice.on && Voice.state === 'listening' && !Voice.paused && !Voice.silenceT && Voice.restarts < 40) {
        Voice.restarts++;
        setTimeout(function () { if (Voice.on && Voice.state === 'listening' && !Voice.rec) listen(); }, 250);
      }
    };
    Voice.rec = r;
    try { r.start(); Voice.micOn = true; setVState('listening'); armIdle(); }
    catch (e) { Voice.rec = null; Voice.micOn = false; setVState('listening'); armIdle(); }
    if (micDot) micDot.hidden = !Voice.micOn;
  }
  function submitVoice(text) {
    clearTimers(); stopRec();
    if (!Voice.on) return;
    text = String(text || '').trim();
    setCaption('');
    if (!text) { listen(); return; }
    setVState('thinking');
    var stop = stopPhrase(text);
    var reply = userSay(text);
    if (stop) { Voice.speakThenEnd(reply); return; }
    setTimeout(function () { if (Voice.on) Voice.speakThenListen(reply); }, 150);
  }
  Voice.speak = function (text, cb) {
    var done = false;
    function fin() { if (done) return; done = true; clearTimeout(safety); Voice.speakDone = null; if (cb) cb(); }
    var safety = setTimeout(fin, Math.min(60000, 4000 + String(text).length * 90));
    Voice.speakDone = fin;
    if (!hasTTS) { setTimeout(fin, 50); return; }
    try {
      var u = new window.SpeechSynthesisUtterance(speakable(text));
      var v = pickVoice(); if (v) u.voice = v;
      u.lang = (v && v.lang) || 'en-GB'; u.rate = 1; u.pitch = 1;
      u.onend = fin; u.onerror = fin;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { setTimeout(fin, 50); }
  };
  Voice.speakThenListen = function (text) {
    if (!Voice.on) return;
    stopRec(); clearTimers();
    setVState('speaking');
    Voice.speak(text, function () { if (Voice.on && !Voice.paused) { setVState('listening'); listen(); } });
  };
  Voice.speakThenEnd = function (text) {
    stopRec(); clearTimers(); setVState('speaking');
    Voice.speak(text, function () { Voice.end(); });
  };
  Voice.start = function () {
    if (Voice.on) return;
    if (!SR) { showVoiceNote(); return; }
    Voice.on = true; Voice.paused = false; Voice.restarts = 0;
    if (!ctx.convLogged) { ctx.convLogged = true; addLog('conversation', 'A visitor started a voice conversation with the AI assistant.'); }
    minimise(false);
    var hi = guardReply(S.open ? "Hi, I'm the Orla & Quill AI assistant. What can I do for you?" : greetText());
    addMsg('bot', hi); transcript.push({ who: 'bot', text: hi });
    Voice.speakThenListen(hi);
  };
  Voice.end = function (note) {
    var was = Voice.on;
    Voice.on = false; Voice.paused = false;
    clearTimers(); stopRec();
    var fin = Voice.speakDone; Voice.speakDone = null;
    try { if (hasTTS) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    if (fin) { try { fin(); } catch (e) { /* ignore */ } }
    setCaption(''); setVState('off');
    if (was && note) { botSay(note); }
    if (startBtn && !panel.hidden) startBtn.hidden = false;
  };
  // Online-speech disclosure, same facts as NOTES.voice in assets/assistant.js; shown before the visitor starts talking
  function showVoiceInfo() {
    var info = $('#as-voice-info');
    if (!info) return;
    info.textContent = 'Voice: in some browsers (for example Chrome) your speech is turned into text, and the spoken reply may be made, by the browser maker\u2019s online service. Cambyte never records or keeps audio.';
    info.hidden = false;
    if (startBtn) startBtn.setAttribute('aria-describedby', 'as-voice-info');
  }
  function showVoiceNote() {
    if (!voiceNote) return;
    voiceNote.hidden = false;
    voiceNote.textContent = 'Voice conversation needs Chrome, Edge or Safari. This browser can only do text, so please type your message.';
  }
  document.addEventListener('visibilitychange', function () {
    if ((document.hidden || document.visibilityState === 'hidden') && Voice.on) Voice.end();
  });

  /* ---------- owner view + shared chrome ---------- */
  function sumPayments(kind) {
    var t = todayISO();
    return S.payments.filter(function (p) { return p.date === t && p.kind === kind; }).reduce(function (a, p) { return a + p.amount; }, 0);
  }
  function todaysBookings() {
    var t = todayISO();
    return allBookings().filter(function (b) { return b.date === t; }).sort(function (a, b) { return a.start - b.start; });
  }
  function bookingLine(b) {
    var svc = svcById(b.serviceId), st = styById(b.stylistId);
    var li = el('li', { class: 'o-item' + (b.seed ? '' : ' new') }, [
      el('span', { class: 'o-time', text: nice(b.start) }),
      el('span', { class: 'o-what' }, [el('strong', { text: b.name }), ' · ' + svc.name + ' · ' + st.name]),
      b.seed ? null : el('span', { class: 'badge', text: b.via === 'ai' ? 'New · AI' : 'New' })
    ]);
    return li;
  }
  function renderOwner() {
    var tb = todaysBookings();
    var set = function (id, v) { var n = document.getElementById(id); if (n) n.textContent = v; };
    set('o-count', String(tb.length));
    set('o-deposits', money(sumPayments('deposit')));
    set('o-vouchers', money(sumPayments('voucher')));
    var tl = $('#o-today-list');
    if (tl) { tl.textContent = ''; if (!tb.length) tl.appendChild(el('li', { class: 'o-item', text: S.open ? 'No bookings today.' : 'Closed today.' })); tb.forEach(function (b) { tl.appendChild(bookingLine(b)); }); }
    var up = $('#o-upcoming');
    if (up) {
      up.textContent = '';
      var days = windowDays().slice(1, 8);
      days.forEach(function (iso) {
        var list = allBookings().filter(function (b) { return b.date === iso; }).sort(function (a, b) { return a.start - b.start; });
        if (!list.length) return;
        up.appendChild(el('h3', { text: dayLong(iso) + ' · ' + list.length + (list.length === 1 ? ' booking' : ' bookings') }));
        up.appendChild(el('ul', { class: 'o-list' }, list.map(bookingLine)));
      });
    }
    var convos = S.log.filter(function (l) { return l.type === 'conversation'; }).length;
    var aib = S.log.filter(function (l) { return l.type === 'ai-booking'; }).length;
    var hand = S.log.filter(function (l) { return l.type === 'handoff'; }).length;
    set('o-ai-convos', String(convos)); set('o-ai-bookings', String(aib)); set('o-ai-hand', String(hand));
    var lg = $('#o-log');
    if (lg) {
      lg.textContent = '';
      S.log.slice(-20).reverse().forEach(function (l) {
        var d = new Date(l.ts);
        lg.appendChild(el('li', { class: 'lg-' + l.type }, [el('time', { text: pad(d.getHours()) + ':' + pad(d.getMinutes()) }), ' ' + l.text]));
      });
      var em = $('#o-log-empty'); if (em) em.hidden = S.log.length > 0;
    }
  }
  function updateChrome() {
    $$('[data-switch]').forEach(function (b) {
      b.setAttribute('aria-checked', S.open ? 'true' : 'false');
      var lab = $('[data-switch-label]', b); if (lab) lab.textContent = S.open ? 'Open' : 'Closed';
    });
    var cn = $('#closed-note');
    if (cn) {
      cn.hidden = S.open;
      if (!S.open) { var n = nextOpenISO(); cn.textContent = "We're closed right now. Bookings start from " + (n ? dayLong(n) : 'the next open day') + '.'; }
    }
    var tb = todaysBookings();
    $$('[data-mini]').forEach(function (n) {
      var k = n.getAttribute('data-mini');
      n.textContent = k === 'today' ? String(tb.length) : k === 'deposits' ? money(sumPayments('deposit')) : String(S.log.filter(function (l) { return l.type === 'ai-booking'; }).length);
    });
    $$('[data-owner-name]').forEach(function (n) { n.textContent = D.ownerName; });
    if (PAGE === 'owner') renderOwner();
  }

  /* ---------- wiring ---------- */
  function wire() {
    $$('[data-switch]').forEach(function (b) { b.addEventListener('click', function () { setOpen(!S.open); }); });
    onStore(function () {
      updateChrome();
      var sel = document.activeElement;
      var typing = sel && /^(INPUT|TEXTAREA)$/.test(sel.tagName);
      if (PAGE === 'home' && bk.step >= 2 && bk.step <= 4 && !typing && !(dlg && dlg.open)) { var y = window.pageYOffset; renderBooking(); window.scrollTo(0, y); }
      if (PAGE === 'home' && panel && !panel.hidden && !transcript.some(function (l) { return l.who === 'me'; })) {
        var first = msgsBox && msgsBox.firstChild;
        if (first && greeted) { var g = guardReply(greetText()); $('.txt', first).textContent = g; transcript[0] = { who: 'bot', text: g }; }
      }
    });
    if (PAGE !== 'home') { updateChrome(); return; }

    $$('[data-open-assistant]').forEach(function (b) { b.addEventListener('click', openAssistant); });
    $('#as-close').addEventListener('click', closeAssistant);
    $('#as-min').addEventListener('click', function () { minimise(); });
    // Escape closes the open panel from anywhere on the page (focus returns to the launcher), unless
    // something else already handled the key or the payment dialog is open (it has its own Escape).
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || e.defaultPrevented || panel.hidden || (dlg && dlg.open)) return;
      closeAssistant();
    });
    asForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var txt = asInput.value; asInput.value = '';
      if (stopPhrase(txt) && Voice.on) { userSay(txt); Voice.end(); return; }
      userSay(txt);
    });
    $$('.chip', chips).forEach(function (c) { c.addEventListener('click', function () { userSay(c.textContent); }); });
    startBtn.addEventListener('click', function () { Voice.start(); });
    stopBtn.addEventListener('click', function () { Voice.end(); });
    ring.addEventListener('click', function () {
      if (!Voice.on) return;
      if (Voice.state === 'speaking') {
        try { if (hasTTS) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
        var f = Voice.speakDone; if (f) f();
      } else if (Voice.state === 'paused') { Voice.paused = false; setVState('listening'); listen(); }
      else if (Voice.state === 'listening') { clearTimers(); stopRec(); Voice.paused = true; setVState('paused'); setCaption(''); }
    });
    personLink.addEventListener('click', function () { addLog('handoff', 'A visitor asked to talk to a person (email opened to the salon).'); });
    if (!SR) { startBtn.setAttribute('aria-describedby', 'as-voice-note'); showVoiceNote(); }
    else showVoiceInfo();
    setVState('off');
    updatePerson();
    renderBooking();
    renderVouchers();
    updateChrome();
  }

  window.SalonApp = {
    data: D, store: S, bk: bk, ctx: ctx, voice: Voice,
    freeSlots: freeSlots, windowDays: windowDays, respond: respond, guardReply: guardReply, speakable: speakable,
    isFree: isFree, hoursOn: hoursOn, buildICS: buildICS, setOpen: setOpen, nextOpenISO: nextOpenISO,
    amounts: AMOUNTS, guardOpts: SALON_GUARD_OPTS, lastICS: null, dayLong: dayLong, nice: nice,
    tryBook: function (o) { /* direct rule check used by tests: returns true only if the slot is free right now */
      var ok = freeSlots(o.serviceId, o.stylistId, o.date).some(function (s) { return s.min === o.min; });
      if (!ok) return false;
      var svc = svcById(o.serviceId);
      addBooking({ id: uid('b'), date: o.date, start: o.min, serviceId: o.serviceId, stylistId: o.stylistId, name: o.name || 'Test', email: '', deposit: svc.deposit, via: 'form', created: Date.now() });
      return true;
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
