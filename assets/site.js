(function () {
  var nav = document.getElementById('nav');
  var btn = nav && nav.querySelector('.menu-btn');

  function closeMenu() {
    nav.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  if (btn) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        closeMenu();
        btn.focus();
      }
    });
  }

  // Order configurator: choices write the price, the Stripe deposit link and the email.
  // Prices come from assets/pricing.js, generated from data/pricing.json.
  var slips = document.querySelectorAll('[data-slip]');
  var P = window.CAMBYTE_PRICING;
  if (!slips.length || !P) return;

  var PKG = { ai: { name: 'AI for my business' }, unsure: { name: 'Not sure yet' } };
  Object.keys(P.tiers).forEach(function (k) {
    var t = P.tiers[k];
    PKG[k] = { name: t.name, base: t.price || t.from, fixed: !!t.price, buy: !!t.buy };
  });
  var EXTRAS = ['android', 'aichat', 'payments'];
  var CARE = P.care;
  var WHO = { business: 'my business', me: 'just me', group: 'a charity or club' };
  var SUBJ = { android: 'Android', aichat: 'AI chat', payments: 'card payments' };
  var TALK = { 'Phone': 'phone', 'Video call': 'video', 'Coffee in Cambridge': 'coffee' };
  var TEST = 'https://buy.stripe.com/test_';
  var state = { pkg: 'unsure', extras: { android: false, aichat: false, payments: false }, care: 'none', who: '', talk: '', early: false, agree: false };
  var nonce = makeNonce();

  // Random suffix for the order code, so two orders with the same choices stay apart.
  function makeNonce() {
    var abc = 'abcdefghijkmnpqrstuvwxyz23456789', b = new Uint8Array(6), s = '', i;
    try { crypto.getRandomValues(b); } catch (e) { for (i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256); }
    for (i = 0; i < b.length; i++) s += abc.charAt(b[i] % abc.length);
    return s;
  }

  function isApp(p) { return p === 'starter' || p === 'business' || p === 'custom'; }
  function takesExtras(p) { return p === 'starter' || p === 'business'; }
  function money(n) { return '£' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function extraPrice(k, p) { var v = P.extras[k].price; return typeof v === 'object' ? v[p] : v; }

  function tidy() {
    if (!takesExtras(state.pkg)) {
      state.extras.android = false; state.extras.aichat = false; state.extras.payments = false;
    }
    if (!isApp(state.pkg)) state.care = 'none';
    if (state.who !== 'me') state.early = false;
  }

  // Order code for Stripe's client_reference_id: letters, digits, dash and underscore only, no personal data.
  function orderCode(extras) {
    var start = state.who === 'me' ? (state.early ? 'early' : 'wait') : 'na';
    return ['cb', state.pkg, extras.join('-') || 'none', state.care, state.who, start, TALK[state.talk] || 'any', nonce].join('_');
  }

  function compose() {
    var p = state.pkg, info = PKG[p], app = isApp(p);
    var extras = EXTRAS.filter(function (k) { return state.extras[k]; });
    var extraNames = extras.map(function (x) { return P.extras[x].name; });
    var care = CARE[state.care] || null;
    var pct = P.deposit_percent;
    var total = null, deposit = null, order = null, estimateText, label, fine;
    if (info.fixed) {
      total = extras.reduce(function (t, x) { return t + extraPrice(x, p); }, info.base);
      deposit = Math.round(total * pct / 100);
      label = 'Fixed price';
      estimateText = money(total);
      fine = 'Fixed price for the features listed. Anything beyond them is quoted in writing before it is added.';
      // While card payment is closed (stripe.open false in data/pricing.json) a fixed package takes the email path.
      var link = info.buy && P.stripe.open && P.stripe.links[[p].concat(extras).join('+')];
      if (link) {
        var missing = [];
        if (!state.who) missing.push('choose who it is for');
        if (!state.agree) missing.push('tick that you agree to the terms');
        order = {
          deposit: deposit,
          test: link.indexOf(TEST) === 0,
          missing: missing,
          href: missing.length ? null : link + '?client_reference_id=' + encodeURIComponent(orderCode(extras))
        };
      }
    } else if (app) {
      label = 'Starting price';
      estimateText = 'from ' + money(info.base) + (care ? ' + ' + money(care.monthly) + ' a month' : '');
      fine = 'Custom apps get a fixed written quote once you have told me what you need: ' + pct + '% deposit to start, ' + (100 - pct) + '% when Apple approves the app.';
    } else {
      label = 'Price';
      estimateText = p === 'ai' ? 'Fixed written quote' : 'Nothing to pay yet';
      fine = 'Email me what you need. You get a fixed written quote before any work starts.';
    }

    var subject;
    if (p === 'unsure') subject = 'Hello Cambyte';
    else subject = info.name + extras.map(function (x) { return ' + ' + SUBJ[x]; }).join('') + (info.fixed ? ', request' : ', quote request');

    var lines = ['Hi Roberto,', ''];
    if (p === 'unsure') lines.push("I'm not sure yet what I need.");
    else if (p === 'ai') lines.push("I'd like a fixed quote for: AI for my business");
    else if (info.fixed) lines.push("I'm interested in: " + info.name + ' (' + money(info.base) + ')');
    else lines.push("I'd like a fixed quote for: " + info.name + ' (from ' + money(info.base) + ')');
    if (extraNames.length) lines.push('Extras: ' + extraNames.join(', '));
    if (info.fixed) lines.push('Fixed price: ' + money(total) + ' (' + money(deposit) + ' deposit to start)');
    if (care) lines.push('Care after launch: ' + care.name + ' (' + money(care.monthly) + ' a month)');
    if (app && !info.fixed) lines.push('Starting estimate: ' + estimateText);
    if (state.who) lines.push('For: ' + WHO[state.who]);
    lines.push('If we need to talk: ' + (state.talk || 'any (phone, video or coffee)'));
    lines.push('', 'About me / my business: ', 'What I need: ');

    return {
      subject: subject,
      body: lines.join('\n'),
      estimateText: estimateText,
      order: order,
      paySoon: !!(info.fixed && info.buy && !P.stripe.open),
      summary: {
        pkg: info.name,
        extras: extraNames.length ? 'Extras: ' + extraNames.join(', ') : '',
        care: !care ? '' : info.fixed
          ? care.name + ': ' + money(care.monthly) + ' a month from the month after launch. Not charged today.'
          : 'Care: ' + care.name + ' (' + money(care.monthly) + ' a month)',
        today: info.fixed ? money(deposit) : '',
        later: info.fixed ? money(total - deposit) : '',
        label: label,
        fine: fine
      }
    };
  }

  function setText(slip, name, text) {
    slip.querySelectorAll('[data-out=' + name + ']').forEach(function (el) {
      el.textContent = text;
      if (el.hasAttribute('data-hide-empty')) el.hidden = !text;
    });
  }

  function render() {
    tidy();
    var m = compose(), order = m.order;
    var href = 'mailto:hello@cambyte.co.uk?subject=' + encodeURIComponent(m.subject) +
      '&body=' + encodeURIComponent(m.body);
    slips.forEach(function (slip) {
      slip.querySelectorAll('input[name=pkg]').forEach(function (i) { i.checked = i.value === state.pkg; });
      slip.querySelectorAll('input[name=extra]').forEach(function (i) { i.checked = !!state.extras[i.value]; });
      slip.querySelectorAll('input[name=care]').forEach(function (i) { i.checked = i.value === state.care; });
      slip.querySelectorAll('input[name=who]').forEach(function (i) { i.checked = i.value === state.who; });
      slip.querySelectorAll('input[name=talk]').forEach(function (i) { i.checked = i.value === state.talk; });
      slip.querySelectorAll('input[name=early]').forEach(function (i) { i.checked = state.early; });
      slip.querySelectorAll('input[name=agree]').forEach(function (i) { i.checked = state.agree; });

      var showExtras = takesExtras(state.pkg), showCare = isApp(state.pkg);
      slip.querySelectorAll('[data-extras]').forEach(function (f) { f.hidden = !showExtras; f.disabled = !showExtras; });
      slip.querySelectorAll('[data-extras-note]').forEach(function (n) { n.hidden = state.pkg !== 'custom'; });
      slip.querySelectorAll('[data-caresec]').forEach(function (f) { f.hidden = !showCare; f.disabled = !showCare; });
      slip.querySelectorAll('[data-split]').forEach(function (d) { d.hidden = !PKG[state.pkg].fixed; });
      slip.querySelectorAll('[data-order]').forEach(function (d) { d.hidden = !order; });
      slip.querySelectorAll('[data-ask]').forEach(function (d) { d.hidden = !!order; });
      slip.querySelectorAll('[data-consumer]').forEach(function (d) { d.hidden = !(order && state.who === 'me'); });
      // The test-card note is written here, not in the page, so search engines never show it.
      slip.querySelectorAll('[data-pay-test]').forEach(function (d) {
        d.hidden = !(order && order.test);
        d.textContent = d.hidden ? '' : "Test mode: no real money moves. Use Stripe's test card 4242 4242 4242 4242, any future date and any CVC.";
      });
      slip.querySelectorAll('[data-pay-soon]').forEach(function (d) { d.hidden = !m.paySoon; });

      if (showExtras) setText(slip, 'android-price', '+' + money(extraPrice('android', state.pkg)));
      setText(slip, 'pkg', m.summary.pkg);
      setText(slip, 'extras', m.summary.extras);
      setText(slip, 'care', m.summary.care);
      setText(slip, 'today', m.summary.today);
      setText(slip, 'later', m.summary.later);
      setText(slip, 'todaylabel', P.stripe.open ? 'Pay today' : 'Deposit to start');
      setText(slip, 'estlabel', m.summary.label);
      setText(slip, 'est', m.estimateText);
      setText(slip, 'fine', m.summary.fine);
      setText(slip, 'subject', m.subject);
      setText(slip, 'body', m.body);
      setText(slip, 'payhint', order && order.missing.length ? 'To pay online, ' + order.missing.join(' and ') + '.' : '');
      slip.querySelectorAll('[data-mail]').forEach(function (a) { a.href = href; });

      // The pay control only gets a link once everything it needs is chosen.
      slip.querySelectorAll('[data-pay]').forEach(function (a) {
        if (!order) return;
        a.textContent = 'Pay ' + money(order.deposit) + ' deposit with Stripe';
        if (order.href) {
          a.href = order.href;
          a.removeAttribute('aria-disabled'); a.removeAttribute('role'); a.removeAttribute('tabindex');
        } else {
          a.removeAttribute('href');
          a.setAttribute('aria-disabled', 'true'); a.setAttribute('role', 'link'); a.setAttribute('tabindex', '0');
        }
      });
    });
  }

  // A press on the pay control before it is ready moves focus to what is still missing.
  function showMissing(slip) {
    var el = !state.who ? slip.querySelector('input[name=who]') : slip.querySelector('input[name=agree]');
    if (el) el.focus();
  }

  slips.forEach(function (slip) {
    slip.addEventListener('change', function (e) {
      var i = e.target;
      if (i.name === 'extra') state.extras[i.value] = i.checked;
      else if (i.name === 'pkg') state.pkg = i.value;
      else if (i.name === 'care') state.care = i.value;
      else if (i.name === 'who') state.who = i.value;
      else if (i.name === 'talk') state.talk = i.value;
      else if (i.name === 'early') state.early = i.checked;
      else if (i.name === 'agree') state.agree = i.checked;
      render();
    });
    slip.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('[data-pay][aria-disabled=true]') : null;
      if (!a) return;
      e.preventDefault();
      showMissing(slip);
    });
    slip.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !e.target.matches('[data-pay][aria-disabled=true]')) return;
      e.preventDefault();
      showMissing(slip);
    });
  });

  // Buttons elsewhere on the page (shelf, price tiers, care plans) preset the configurator.
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-pick], [data-care]') : null;
    if (!a) return;
    var pick = a.getAttribute('data-pick'), care = a.getAttribute('data-care');
    if (pick && PKG[pick]) state.pkg = pick;
    if (care && CARE[care]) {
      state.care = care;
      if (!isApp(state.pkg)) state.pkg = 'business';
    }
    render();
    var input = document.querySelector('[data-slip] input[name=pkg]:checked');
    if (input) input.focus({ preventScroll: true });
  });

  render();
})();

// Live demo: three tap-through app flows drawn inside the phone. Nothing leaves the page.
(function () {
  var demo = document.querySelector('[data-demo]');
  if (!demo) return;
  var screen = demo.querySelector('[data-demo-screen]');
  var seg = demo.querySelector('.demo-seg');
  var titleEl = demo.querySelector('[data-demo-title]');
  var textEl = demo.querySelector('[data-demo-text]');
  var stepsEl = demo.querySelector('[data-demo-steps]');
  var live = demo.querySelector('[data-demo-live]');

  var FLOWS = {
    book: {
      app: 'Your Salon', mark: 'S', a: '#B4436C', t: '#F8E8EE',
      title: 'Bookings with a deposit',
      text: 'Customers pick a service and a free time, pay a small deposit and get a reminder the day before. Fewer no-shows, no phone tag.',
      steps: ['Service', 'Time', 'Deposit', 'Booked']
    },
    sell: {
      app: 'Your Bakery', mark: 'B', a: '#A8562A', t: '#F6EBE3',
      title: 'Order ahead and pay',
      text: 'Customers fill a basket, choose when to collect and pay before they arrive. The order is with you before they walk in.',
      steps: ['Basket', 'Collect', 'Paid']
    },
    pay: {
      app: 'Your Trades', mark: 'T', a: '#C2410C', t: '#FBEBE3',
      title: 'Invoices paid on the spot',
      text: "Send the invoice to the customer's phone. They check the lines, pay in one tap and the receipt goes out by itself.",
      steps: ['Sent', 'Pay', 'Receipt']
    }
  };
  var SERVICES = [
    { id: 'cut', name: 'Cut and finish', len: '45 min', p: 3800 },
    { id: 'colour', name: 'Colour and gloss', len: '1 hr 30 min', p: 7200 },
    { id: 'beard', name: 'Beard trim', len: '20 min', p: 1500 }
  ];
  var TIMES = [['9:30'], ['10:15'], ['11:00', 1], ['13:30'], ['15:00', 1], ['16:00']];
  var ITEMS = [
    { id: 'loaf', name: 'Sourdough loaf', p: 420 },
    { id: 'croissant', name: 'Almond croissant', p: 310 },
    { id: 'flat', name: 'Flat white', p: 340 },
    { id: 'scone', name: 'Cheese scone', p: 260 },
    { id: 'bun', name: 'Cinnamon bun', p: 320 }
  ];
  var STYLISTS = ['Any', 'Maya', 'Jo', 'Sam'];
  var PHOTOS = ['Before', 'During', 'After'];
  var SLOTS = ['8:15', '8:30', '8:45'];
  var INVOICE = [['Labour, 1.5 hours', 7500], ['Parts: mixer tap and hoses', 4250]];
  var DEPOSIT = 1000;

  var BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  var TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';

  var S = { run: 0 };
  function reset(flow) {
    S = { flow: flow, step: 0, svc: null, time: null, qty: { loaf: 1 }, slot: '8:30', busy: false, run: S.run + 1 };
  }

  // Money is kept in pence.
  function gbp(p) { return '£' + (p % 100 ? (p / 100).toFixed(2) : String(p / 100)); }
  function gbp2(p) { return '£' + (p / 100).toFixed(2); }
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function count() { var n = 0, k; for (k in S.qty) n += S.qty[k]; return n; }
  function total() { return ITEMS.reduce(function (t, it) { return t + (S.qty[it.id] || 0) * it.p; }, 0); }

  function head(h, sub) { return '<p class="app-h" tabindex="-1">' + h + '</p>' + (sub ? '<p class="app-sub">' + sub + '</p>' : ''); }
  function back(label, to) { return '<button type="button" class="app-back" data-act="go" data-to="' + to + '">' + BACK + label + '</button>'; }
  function line(a, b, cls) { return '<div class="app-line' + (cls ? ' ' + cls : '') + '"><span>' + a + '</span><span>' + b + '</span></div>'; }
  function card(inner) { return '<div class="app-card">' + inner + '</div>'; }
  function note(t) { return '<p class="app-note">' + t + '</p>'; }
  function sum(a, b) { return '<p class="app-sum"><span>' + a + '</span><b>' + b + '</b></p>'; }
  function btn(label, act, extra) { return '<button type="button" class="app-btn" data-act="' + act + '"' + (extra || '') + '>' + label + '</button>'; }
  function again(label) { return '<button type="button" class="app-btn ghost" data-act="restart">' + label + '</button>'; }
  function done(h, sub) { return '<span class="app-tick">' + TICK + '</span>' + head(h, sub); }
  function chip(value, on, taken, act) {
    return '<button type="button" class="app-chip" data-act="' + act + '" data-id="' + value + '" data-k="' + act + value + '" aria-pressed="' + on + '"' +
      (taken ? ' disabled>' + value + '<span class="vh">, taken</span>' : '>' + value) + '</button>';
  }
  function basket() {
    return ITEMS.filter(function (it) { return S.qty[it.id]; }).map(function (it) {
      return line(S.qty[it.id] + ' × ' + it.name, gbp2(S.qty[it.id] * it.p));
    }).join('');
  }

  // Each screen returns [body, dock].
  var SCREENS = {
    book: function () {
      var svc = S.svc;
      if (S.step === 0) return [
        head('Book a visit', 'Thursday 12 March') + '<p class="app-label">Service</p><div class="app-list">' +
        SERVICES.map(function (v) {
          return '<button type="button" class="app-row" data-act="svc" data-id="' + v.id + '"><span class="grow"><span class="t">' + v.name +
            '</span><span class="s">' + v.len + '</span></span><span class="v">' + gbp(v.p) + '</span><span class="app-chev" aria-hidden="true"></span></button>';
        }).join('') + '</div>' +
        '<p class="app-label">With</p><div class="app-who" aria-hidden="true">' +
        STYLISTS.map(function (n, i) { return '<span><i>' + (i ? n.charAt(0) : 'Any') + '</i>' + (i ? n : 'Anyone') + '</span>'; }).join('') + '</div>' +
        card(line('Next free', 'Thu 12 March, 9:30')) + note('A ' + gbp(DEPOSIT) + ' deposit holds your slot.'), ''];
      if (S.step === 1) return [
        back('Services', 0) + head('Pick a time', svc.name + ', Thu 12 March') + '<p class="app-label">Free times</p>' +
        '<div class="app-times" role="group" aria-label="Times on Thursday 12 March">' +
        TIMES.map(function (t) { return chip(t[0], S.time === t[0], t[1], 'time'); }).join('') + '</div>' +
        note('Crossed-out times are already taken.'), ''];
      if (S.step === 2) return [
        back('Times', 1) + head('Pay a deposit', 'Thu 12 March at ' + S.time) +
        card(line(svc.name, gbp(svc.p)) + line('Deposit today', gbp(DEPOSIT)) + line('Pay in the salon', gbp(svc.p - DEPOSIT), 'total')) +
        note('Free to move or cancel up to a day before.'),
        sum(svc.name, gbp(DEPOSIT) + ' now') + btn('Pay ' + gbp(DEPOSIT) + ' deposit', 'pay')];
      return [
        '<div class="app-done">' + done("You're booked", svc.name + ', Thu 12 March at ' + S.time) +
        card(line('Deposit paid', gbp(DEPOSIT)) + line('Left to pay in the salon', gbp(svc.p - DEPOSIT))) +
        note('A reminder arrives the day before.') + '</div>', again('Book another visit')];
    },
    sell: function () {
      var n = count(), tot = total();
      if (S.step === 0) return [
        head('Order ahead', 'Skip the queue, collect at the counter') + '<p class="app-label">This morning</p><div class="app-list">' +
        ITEMS.map(function (it) {
          var q = S.qty[it.id] || 0;
          return '<div class="app-row"><span class="grow"><span class="t">' + it.name + '</span><span class="s">' + gbp2(it.p) + '</span></span>' +
            '<span class="app-qty"><button type="button" data-act="qty" data-id="' + it.id + '" data-d="-1" data-k="m' + it.id + '" aria-label="One less ' + it.name + '"' + (q ? '' : ' disabled') + '>−</button>' +
            '<output aria-label="' + it.name + ' in basket">' + q + '</output>' +
            '<button type="button" data-act="qty" data-id="' + it.id + '" data-d="1" data-k="p' + it.id + '" aria-label="One more ' + it.name + '">+</button></span></div>';
        }).join('') + '</div>' + note('Fresh out of the oven at 07:40.'),
        sum(n ? n + (n === 1 ? ' item' : ' items') : 'Basket empty', gbp2(tot)) +
        '<button type="button" class="app-btn" data-act="go" data-to="1"' + (n ? '' : ' disabled') + '>Choose a collection time</button>'];
      if (S.step === 1) return [
        back('Basket', 0) + head('When will you collect?', 'Today, at the counter') +
        '<p class="app-label">Collection time</p><div class="app-times" role="group" aria-label="Collection times">' +
        SLOTS.map(function (t) { return chip(t, S.slot === t, false, 'slot'); }).join('') + '</div>' +
        card(basket() + line('Total', gbp2(tot), 'total')),
        sum('Collect at ' + S.slot, gbp2(tot)) + btn('Pay ' + gbp2(tot), 'pay')];
      return [
        '<div class="app-done">' + done('Order paid', 'Order 0417, ready to collect at ' + S.slot) +
        card(basket() + line('Paid', gbp2(tot), 'total')) +
        note("We'll send a message the moment it's ready.") + '</div>', again('Start a new order')];
    },
    pay: function () {
      var tot = INVOICE.reduce(function (t, l) { return t + l[1]; }, 0);
      if (S.step === 0) return [
        head('New invoice', 'From Your Trades, today 15:41') +
        '<p class="app-card app-msg">Thanks for having us today. Your invoice for the kitchen tap replacement is ready to check and pay.</p>' +
        card(line('Invoice 218', 'Due today') + line('Amount', gbp2(tot), 'total')) +
        '<p class="app-label">Job photos</p><div class="app-photos" aria-hidden="true">' +
        PHOTOS.map(function (n) { return '<span><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.2"/></svg>' + n + '</span>'; }).join('') + '</div>' + note('Three photos are attached to this job.'),
        btn('View invoice', 'go', ' data-to="1"')];
      if (S.step === 1) return [
        back('Message', 0) + head('Invoice 218', 'Kitchen tap replacement, 12 March') +
        card(INVOICE.map(function (l) { return line(l[0], gbp2(l[1])); }).join('') + line('Total', gbp2(tot), 'total')) +
        note('Questions? Reply to the message and it reaches the office.'),
        sum('Due today', gbp2(tot)) + btn('Pay ' + gbp2(tot), 'pay')];
      return [
        '<div class="app-done">' + done('Paid, thank you', 'Paid 12 Mar, 15:48') +
        card(line('Invoice 218', 'Kitchen tap') + line('Paid', gbp2(tot), 'total')) +
        note('Receipt sent to your email.') + '</div>', again('Start again')];
    }
  };

  function announce(msg) { live.textContent = msg; }
  function stepMsg() { var f = FLOWS[S.flow]; return 'Step ' + (S.step + 1) + ' of ' + f.steps.length + ': ' + f.steps[S.step]; }

  // keys: elements to try to keep focus on after a redraw; still: skip the entrance animation.
  function render(keys, still) {
    var f = FLOWS[S.flow], parts = SCREENS[S.flow]();
    screen.innerHTML = '<div class="app' + (still ? ' still' : '') + '" style="--a:' + f.a + ';--t:' + f.t + '" role="group" aria-label="Example app: ' + f.app + '">' +
      '<span class="app-time" aria-hidden="true">9:41</span><div class="app-bar"><span class="app-mark" aria-hidden="true">' + f.mark + '</span>' + f.app + '</div>' +
      '<div class="app-body">' + parts[0] + '</div>' + (parts[1] ? '<div class="app-dock">' + parts[1] + '</div>' : '') + '</div>';
    titleEl.textContent = f.title;
    textEl.textContent = f.text;
    stepsEl.innerHTML = f.steps.map(function (s, i) {
      return '<li' + (i < S.step ? ' class="done"' : '') + (i === S.step ? ' aria-current="step"' : '') + '>' + s + (i < S.step ? '<span class="vh"> (done)</span>' : '') + '</li>';
    }).join('');
    seg.querySelectorAll('[data-flow]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-flow') === S.flow)); });
    if (!keys) return;
    for (var i = 0; i < keys.length; i++) {
      var el = keys[i] ? screen.querySelector('[data-k="' + keys[i] + '"]') : screen.querySelector('.app-h');
      if (el && !el.disabled) { el.focus({ preventScroll: true }); return; }
    }
  }

  function go(step) {
    S.step = step;
    render([null]);
    announce(stepMsg());
  }

  function pay(b) {
    var run = S.run;
    S.busy = true;
    b.setAttribute('aria-busy', 'true');
    b.innerHTML = '<span class="app-spin" aria-hidden="true"></span>Paying…';
    announce('Paying');
    setTimeout(function () {
      if (run !== S.run) return;
      S.busy = false;
      go(S.step + 1);
    }, 900);
  }

  demo.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b || b.disabled) return;
    var flow = b.getAttribute('data-flow');
    if (flow) {
      if (flow === S.flow) return;
      reset(flow);
      render();
      announce(FLOWS[flow].title + '. ' + stepMsg());
      return;
    }
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
    if (!act || S.busy) return;
    if (act === 'svc') { S.svc = find(SERVICES, id); go(1); }
    else if (act === 'time') { S.time = id; go(2); }
    else if (act === 'go') go(+b.getAttribute('data-to'));
    else if (act === 'restart') { reset(S.flow); go(0); }
    else if (act === 'pay') pay(b);
    else if (act === 'slot') { S.slot = id; render([b.getAttribute('data-k')], true); announce('Collect at ' + id); }
    else if (act === 'qty') {
      S.qty[id] = Math.max(0, (S.qty[id] || 0) + +b.getAttribute('data-d'));
      render([b.getAttribute('data-k'), 'p' + id], true);
      var n = count();
      announce(find(ITEMS, id).name + ': ' + S.qty[id] + '. Basket ' + (n ? n + (n === 1 ? ' item, ' : ' items, ') + gbp2(total()) : 'empty'));
    }
  });

  reset('book');
  seg.hidden = false;
  stepsEl.hidden = false;
  render();
})();

// Shelf: cards turn in 3D as they pass the centre, Apple-style. Scroll, swipe, arrows or keyboard.
(function () {
  var rail = document.querySelector('.shelf-rail');
  if (!rail) return;
  var items = Array.prototype.slice.call(rail.querySelectorAll('.shelf li'));
  var nav = document.querySelector('.shelf-nav');
  var prev = nav && nav.querySelector('[data-shelf="-1"]');
  var next = nav && nav.querySelector('[data-shelf="1"]');
  var still = window.matchMedia('(prefers-reduced-motion: reduce)');
  var queued = false;

  function step() {
    if (items.length < 2) return rail.clientWidth;
    return items[1].offsetLeft - items[0].offsetLeft;
  }

  // Layout offsets, not getBoundingClientRect: the transforms would feed back into the maths.
  function update() {
    queued = false;
    var mid = rail.scrollLeft + rail.clientWidth / 2, w = step(), flat = still.matches;
    items.forEach(function (li) {
      var n = (li.offsetLeft + li.offsetWidth / 2 - mid) / w;
      var a = Math.min(Math.abs(n), 1);
      li.style.setProperty('--ry', flat ? '0deg' : (-Math.max(-1, Math.min(1, n)) * 34).toFixed(2) + 'deg');
      li.style.setProperty('--s', flat ? '1' : (1.06 - 0.18 * a).toFixed(3));
      li.style.setProperty('--o', (1 - 0.45 * Math.min(Math.abs(n) / 2, 1)).toFixed(3));
      li.style.zIndex = String(100 - Math.round(Math.abs(n) * 10));
    });
    if (prev) prev.disabled = rail.scrollLeft < 4;
    if (next) next.disabled = rail.scrollLeft > rail.scrollWidth - rail.clientWidth - 4;
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(update); } }

  function centre(li, smooth) {
    var left = li.offsetLeft + li.offsetWidth / 2 - rail.clientWidth / 2;
    rail.scrollTo({ left: left, behavior: smooth && !still.matches ? 'smooth' : 'auto' });
  }

  rail.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  if (still.addEventListener) still.addEventListener('change', queue);
  rail.addEventListener('focusin', function (e) {
    var li = e.target.closest('li');
    if (li) centre(li, true);
  });
  if (nav) {
    nav.hidden = false;
    nav.addEventListener('click', function (e) {
      var b = e.target.closest('[data-shelf]');
      if (!b) return;
      var dir = Number(b.getAttribute('data-shelf'));
      rail.scrollBy({ left: dir * step(), behavior: still.matches ? 'auto' : 'smooth' });
    });
  }

  centre(items[Math.floor(items.length / 2)], false);
  update();
})();
