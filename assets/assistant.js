/* Cambyte on-page assistant, phase 1: answers come from this page only. No storage; the only downloads are its own voice clips. */
(function () {
  var LABEL = 'Rob’s AI assistant';
  var MODE = 'local';
  // AI mode talks to a small server-side proxy. Empty PROD_ENDPOINT = AI stays off on the live site until deploy.
  var PROD_ENDPOINT = '';
  var LOCAL_HOST = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  var ENDPOINT = LOCAL_HOST ? 'http://127.0.0.1:8788/chat' : PROD_ENDPOINT;
  // One short, true line per mode (checked against the code: no storage here, and the server logs no message text).
  var NOTES = {
    local: 'Answers come from this page. What you type is not stored or sent anywhere.',
    ai: 'Test: answers are written by an AI model. Your messages go through Cambyte’s server to an AI provider to write the reply; Cambyte doesn’t keep them. Please don’t type personal or payment details.',
    voice: 'Voice: most spoken replies are short clips made in advance with an AI voice and loaded from this website, like a picture; other replies use your browser’s voice. In some browsers (for example Chrome), turning your speech into text, and that browser voice, may be done by the browser maker’s online service. Cambyte never records or keeps audio.'
  };
  var TAGLINE = 'AI assistant — not a person';
  var NOVOICE = 'Voice conversation isn’t available in this browser, so please type.';
  var SPOKEN_FALLBACK = 'The answer is on screen.';
  var MAX_LEN = 300;
  var MAX_VISITOR_MSGS = 12;
  var hist = [];
  var visitorCount = 0;
  var modelCount = 0;
  var capNoted = false;
  var busy = false;
  var bestVoice = null;
  var sendBtn, personLink, startBtn, stopBtn, ringBtn, voiceBox, voiceState, micDot, captionEl, voiceNote;

  var P = window.CAMBYTE_PRICING || null;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var root, launcher, panel, log, chipsEl, input, micBtn, voiceBtn, form;
  var flow = null;
  var voiceOn = false;
  var recog = null;
  var listening = false;
  var greeted = false;
  var Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
  var synth = window.speechSynthesis;
  // Voice clips live next to this script, in voice/. Read now: currentScript is only set while the script first runs.
  var VOICE_BASE = document.currentScript && document.currentScript.src ? document.currentScript.src.replace(/[^\/]*$/, '') + 'voice/' : '';

  /* ---------- helpers ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function face() {
    var s = svgEl('svg', { viewBox: '0 0 32 32', 'class': 'cba-face', 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(svgEl('circle', { cx: 16, cy: 16, r: 15, 'class': 'cba-face-bg' }));
    s.appendChild(svgEl('ellipse', { cx: 11, cy: 12.5, rx: 2.1, ry: 2.8, 'class': 'cba-face-eye' }));
    s.appendChild(svgEl('ellipse', { cx: 21, cy: 12.5, rx: 2.1, ry: 2.8, 'class': 'cba-face-eye' }));
    s.appendChild(svgEl('path', { d: 'M9.5 20c1.6 3 4 4.4 6.5 4.4s4.9-1.4 6.5-4.4', 'class': 'cba-face-smile' }));
    return s;
  }

  function icon(paths) {
    var s = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
    for (var i = 0; i < paths.length; i++) s.appendChild(svgEl('path', { d: paths[i] }));
    return s;
  }

  function money(n) {
    return '£' + Number(n).toLocaleString('en-GB');
  }

  function norm(s) {
    return ' ' + String(s).toLowerCase().replace(/[‘’']/g, '').replace(/[^a-z0-9£%]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  }

  // One-edit distance, counting a swap of two neighbouring letters as one edit.
  function near(a, b) {
    if (a === b) return true;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0;
    while (i < la && i < lb && a.charAt(i) === b.charAt(i)) i++;
    if (la === lb) {
      if (a.slice(i + 1) === b.slice(i + 1)) return true;
      return a.charAt(i) === b.charAt(i + 1) && a.charAt(i + 1) === b.charAt(i) && a.slice(i + 2) === b.slice(i + 2);
    }
    return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 734px)').matches;
  }

  /* ---------- reading the page ---------- */

  function mailAddr() {
    var a = document.querySelector('a[href^="mailto:"]');
    var m = a ? a.getAttribute('href').replace(/^mailto:/i, '').split('?')[0] : '';
    return /^[^\s@]+@[^\s@]+$/.test(m) ? m : '';
  }

  function ownerName() {
    var h = document.getElementById('about-h');
    var m = h && /I['’]m\s+([A-Z][a-z]+)/.exec(h.textContent);
    return m ? m[1] : 'Roberto';
  }

  function faqList() {
    var out = [];
    var items = document.querySelectorAll('#questions details');
    for (var i = 0; i < items.length; i++) {
      var s = items[i].querySelector('summary');
      var p = items[i].querySelector('p');
      if (s && p) out.push({ q: s.textContent.trim(), a: p.textContent.replace(/\s+/g, ' ').trim() });
    }
    return out;
  }

  function faqBy(re) {
    var l = faqList();
    for (var i = 0; i < l.length; i++) if (re.test(l[i].q)) return l[i];
    return null;
  }

  function shorten(a) {
    var s = a.match(/[^.!?]+[.!?]+(\s|$)/g) || [a];
    var out = s.slice(0, 3).join('').trim();
    if (out.length > 430) out = s.slice(0, 2).join('').trim();
    return { text: out, cut: out.length < a.trim().length };
  }

  function faqReply(item) {
    var s = shorten(item.a);
    return { text: s.text, links: s.cut ? [['Read the full answer', '#questions']] : [] };
  }

  var STOP = ' a an the is are do does did i you your my me we can could would to of for in on at it and or with what how why when who which this that be have has there any about get if so not no yes ';
  function content(toks) {
    var out = [];
    for (var i = 0; i < toks.length; i++) {
      var w = toks[i].replace(/s$/, '');
      if (w.length > 1 && STOP.indexOf(' ' + toks[i] + ' ') < 0 && STOP.indexOf(' ' + w + ' ') < 0) out.push(w);
    }
    return out;
  }

  function faqMatch(t) {
    var u = content(t.trim().split(' '));
    if (!u.length) return null;
    var best = null, top = 0, l = faqList();
    for (var i = 0; i < l.length; i++) {
      var q = content(norm(l[i].q).trim().split(' '));
      var n = 0;
      for (var j = 0; j < u.length; j++) {
        for (var k = 0; k < q.length; k++) {
          if (u[j] === q[k] || (u[j].length > 4 && near(u[j], q[k]))) { n++; break; }
        }
      }
      if (n > top) { top = n; best = l[i]; }
    }
    return top >= 2 || (top === 1 && u.length <= 2) ? best : null;
  }

  function tierInfo(key) {
    var names = { starter: 'Starter', business: 'Business', custom: 'Custom' };
    var cards = document.querySelectorAll('#prices .tier');
    for (var i = 0; i < cards.length; i++) {
      var h = cards[i].querySelector('h3');
      if (h && h.textContent.indexOf(names[key]) === 0) {
        var f = cards[i].querySelector('.for'), tm = cards[i].querySelector('.time');
        return { forText: f ? f.textContent.trim() : '', time: tm ? tm.textContent.trim() : '' };
      }
    }
    return { forText: '', time: '' };
  }

  function sentence(s) {
    s = (s || '').trim();
    return s && !/[.!?]$/.test(s) ? s + '.' : s;
  }

  function safeHref(h) {
    if (h === 'terms/' || h === 'privacy/' || h === 'demo/salon/') return h;
    if (/^#[a-z0-9-]+$/.test(h)) return document.getElementById(h.slice(1)) ? h : '';
    var m = mailAddr();
    return m && h === 'mailto:' + m ? h : '';
  }

  /* ---------- pricing ---------- */

  function tier(k) { return P && P.tiers && P.tiers[k]; }
  function extra(k) { return P && P.extras && P.extras[k]; }
  function androidPrice(k) {
    var e = extra('android');
    return e && e.price && e.price[k] != null ? e.price[k] : null;
  }
  function deposit() { return P && P.deposit_percent != null ? P.deposit_percent : null; }

  function total(pkg, ex) {
    var t = tier(pkg);
    if (!t || t.price == null) return null;
    var sum = t.price;
    if (ex.android) sum += androidPrice(pkg) || 0;
    if (ex.aichat && extra('aichat')) sum += extra('aichat').price;
    if (ex.payments && extra('payments')) sum += extra('payments').price;
    return sum;
  }

  var SEE_PRICES = { text: 'The prices are in the prices section of this page.', links: [['See prices', '#prices']] };

  /* ---------- section helpers ---------- */

  function scrollTo(node) {
    if (!node) return;
    try {
      node.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    } catch (e) { node.scrollIntoView(); }
  }

  function goSection(id) {
    var node = document.getElementById(id);
    if (!node) return false;
    if (isMobile()) closePanel(true);
    scrollTo(node);
    return true;
  }

  /* ---------- driving the real order form ---------- */

  function slipEl() { return document.querySelector('[data-slip]'); }

  function pick(slip, sel, wantChecked) {
    var inp = slip.querySelector(sel);
    if (!inp || inp.disabled) return;
    if (wantChecked !== undefined && inp.checked === wantChecked) return;
    if (wantChecked === undefined && inp.checked) return;
    var c = slip.querySelector(sel + ' + .choice-in');
    (c || inp).click();
  }

  function setPkg(slip, key) {
    pick(slip, 'input[name=pkg][value="' + key + '"]');
  }

  function outText(slip, name) {
    var n = slip.querySelector('[data-out=' + name + ']');
    return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function finishOrder() {
    var slip = slipEl();
    var f = flow;
    flow = null;
    var mail = mailAddr();
    if (!slip || !f) {
      return { text: 'I can’t find the order form on this page' + (mail ? ', so please email ' + mail + '.' : '.'), links: mail ? [[mail, 'mailto:' + mail]] : [] };
    }
    var app = f.pkg === 'starter' || f.pkg === 'business';
    setPkg(slip, f.pkg);
    if (app) {
      var keys = ['android', 'aichat', 'payments'];
      for (var i = 0; i < keys.length; i++) pick(slip, 'input[name=extra][value=' + keys[i] + ']', !!f.extras[keys[i]]);
      pick(slip, 'input[name=care][value=' + f.care + ']');
    }
    var target = document.getElementById('reply');
    if (isMobile()) closePanel(true);
    scrollTo(target);
    if (app) {
      var est = outText(slip, 'est'), today = outText(slip, 'today');
      return {
        text: P && P.stripe && P.stripe.open
          ? 'Your order form is set up' + (est ? ': total ' + est + (today ? ', ' + today + ' deposit today' : '') : '') +
            '. Choose who it’s for and tick that you agree to the terms, then the Pay button takes you to Stripe’s secure checkout. I never see card details.'
          : 'Your order form is set up' + (est ? ': total ' + est + (today ? ', ' + today + ' deposit to start' : '') : '') +
            '. Card payment online opens soon, so for now press Email my request and Roberto replies with how to pay the deposit.',
        links: [['Go to the order form', '#reply'], ['Terms', 'terms/']]
      };
    }
    return {
      text: 'That one starts with an email, so there is nothing to pay yet. I have picked it on the form below; add your details there' +
        (mail ? ' or email ' + mail + '.' : '.'),
      links: [['Go to the order form', '#reply']].concat(mail ? [[mail, 'mailto:' + mail]] : [])
    };
  }

  function setTalk(t) {
    var slip = slipEl();
    if (!slip) return false;
    var inp = slip.querySelector('input[name=talk][value="' + t + '"]');
    if (!inp || inp.disabled) return false;
    pick(slip, 'input[name=talk][value="' + t + '"]');
    return true;
  }

  /* ---------- the buying flow ---------- */

  function pkgChips() {
    return ['Starter', 'Business', 'Custom & AI', 'AI for my business', 'Not sure', 'Never mind'];
  }

  function extraDefs() {
    var defs = [['android', 'Android'], ['aichat', 'AI chat'], ['payments', 'Card payments']];
    var out = [];
    for (var i = 0; i < defs.length; i++) {
      var k = defs[i][0], p = null;
      if (k === 'android') p = androidPrice(flow.pkg);
      else if (extra(k)) p = extra(k).price;
      out.push({ key: k, label: defs[i][1] + (p != null ? ' +' + money(p) : '') });
    }
    return out;
  }

  function extraChips() {
    var out = [], d = extraDefs();
    for (var i = 0; i < d.length; i++) {
      out.push({ label: d[i].label, toggle: d[i].key, pressed: !!flow.extras[d[i].key] });
    }
    out.push({ label: 'Done', main: true });
    return out;
  }

  function careChips() {
    var out = ['None'], c = P && P.care ? P.care : {};
    var order = ['care', 'plus', 'pro'];
    for (var i = 0; i < order.length; i++) {
      var o = c[order[i]];
      if (o) out.push(o.name + ' ' + money(o.monthly) + '/mo');
    }
    return out;
  }

  function summary() {
    var f = flow, t = tier(f.pkg);
    var parts = [t ? t.name : f.pkg];
    var d = extraDefs();
    for (var i = 0; i < d.length; i++) if (f.extras[d[i].key]) parts.push(d[i].label.replace(/ \+.*$/, ''));
    var line = parts.join(' + ');
    var sum = total(f.pkg, f.extras), dp = deposit();
    var care = f.care !== 'none' && P && P.care && P.care[f.care] ? P.care[f.care] : null;
    // The care plan comes after the app's prices, so its name never sits next to them (the spoken check reads that as a care price).
    var s = 'So that is ' + line;
    if (sum != null) s += ': ' + money(sum) + ' in total' + (dp != null ? ', and ' + money(Math.round(sum * dp / 100)) + ' deposit today' : '');
    s += care ? '. ' + care.name + ' is ' + money(care.monthly) + ' a month from the month after launch.' : ', with no care plan.';
    return s;
  }

  function askPkg() {
    flow.step = 'pkg';
    return { text: 'Great, which package would you like?', chips: pkgChips() };
  }

  function askExtras() {
    flow.step = 'extras';
    return { text: 'Any extras? Tap to switch them on or off, then press Done.', chips: extraChips() };
  }

  function askCare() {
    flow.step = 'care';
    var mail = P && P.hourly != null ? ' Without a plan, changes after launch are ' + money(P.hourly) + ' an hour.' : '';
    return { text: 'Would you like a care plan after launch?' + mail, chips: careChips() };
  }

  function askReady() {
    flow.step = 'ready';
    return { text: summary(), chips: [{ label: 'Set up my order', main: true }, 'Change something', 'Never mind'] };
  }

  function startFlow() {
    flow = { step: 'pkg', pkg: null, extras: { android: false, aichat: false, payments: false }, care: 'none' };
    return askPkg();
  }

  function parsePkg(t) {
    if (/ ai /.test(t) && / (business|company|firm|work|my) /.test(t) || / ai for /.test(t)) return 'ai';
    if (/ (custom|bespoke) /.test(t)) return 'custom';
    if (/ star?ter | starte | startr /.test(t) || near(t.trim(), 'starter')) return 'starter';
    if (/ business /.test(t) || / busines /.test(t)) return 'business';
    if (/ (ai|artificial intelligence) /.test(t)) return 'ai';
    if (/ (not sure|unsure|dont know|no idea|undecided|advice|help me) /.test(t)) return 'unsure';
    return null;
  }

  function parseExtra(t) {
    if (/ andr[a-z]* /.test(t) || / android /.test(t)) return 'android';
    if (/ (ai chat|chatbot|chat assistant|aichat|ai assistant) /.test(t)) return 'aichat';
    if (/ (card|cards|payments?|stripe) /.test(t)) return 'payments';
    return null;
  }

  function flowStep(t, raw) {
    var f = flow;
    if (/ (never mind|cancel|stop|start again|forget it|exit) /.test(t)) {
      flow = null;
      return { text: 'No problem, nothing has been changed. Ask me anything else.', chips: mainChips() };
    }
    if (/ (change something|go back|back) /.test(t)) return askPkg();
    if (f.step === 'pkg') {
      var k = parsePkg(t);
      if (!k) return null;
      f.pkg = k;
      if (k === 'starter' || k === 'business') return askExtras();
      return finishOrder();
    }
    if (f.step === 'extras') {
      var e = parseExtra(t);
      if (e) {
        f.extras[e] = !f.extras[e];
        return { text: (e === 'android' ? 'Android' : e === 'aichat' ? 'AI chat' : 'Card payments') + (f.extras[e] ? ' is on.' : ' is off.') + ' Press Done when you are ready.', chips: extraChips() };
      }
      if (/ (done|next|continue|none|no|nope|skip|thats all|that s all|no extras|nothing) /.test(t)) return askCare();
      return null;
    }
    if (f.step === 'care') {
      var c = null;
      if (/ plus /.test(t)) c = 'plus';
      else if (/ pro /.test(t)) c = 'pro';
      else if (/ (none|no|nope|skip|without|neither) /.test(t)) c = 'none';
      else if (/ care /.test(t)) c = 'care';
      if (!c) return null;
      f.care = c;
      return askReady();
    }
    if (f.step === 'ready') {
      if (/ (set up|setup|yes|yep|go|ok|okay|sure|do it|open the form|confirm) /.test(t)) return finishOrder();
      return null;
    }
    return null;
  }

  /* ---------- answering ---------- */

  function mainChips() {
    return ['Buy an app', 'Prices', 'Websites', 'AI agents', 'Care plans', 'How does paying work?', 'AI for my business', 'Email Roberto'];
  }

  var REFUSAL = 'Sorry, I can only help with Cambyte’s apps, prices and ordering.';

  /* ---------- websites and the six AI agents: no prices, always "ask for a quote" ---------- */

  // Wording follows the page sections (#websites, #agents). Each key is matched against the normalised message.
  var AGENTS = [
    { re: / front desk | receptionist | front desk agent /, name: 'Front-desk agent',
      text: 'The front-desk agent answers customer chats on your website, and phone calls later, at any hour. It books appointments and emails you a summary of every conversation. You take over whenever the customer asks, and you handle anything unusual, any complaint and any refund.', demo: true },
    { re: / booking agent | bookings agent | appointment agent | booking assistant /, name: 'Booking agent',
      text: 'The booking agent makes, moves and cancels bookings against your business calendar, and sends reminders before each appointment. You set the opening hours and the rules, and you deal with any clash it cannot resolve.', demo: true },
    { re: / lead qualifier | lead qualification | qualify leads | qualifying leads | qualifier /, name: 'Lead qualifier',
      text: 'The lead qualifier asks visitors the right questions on your website or on WhatsApp (business use only), then emails you a ranked list of the enquiries worth calling first. You decide who to contact and make every quote. The ranking is a guide, not a prediction.' },
    { re: / quote chaser | chase quotes | chasing quotes | chase my quotes | quote follow up | quote follow ups /, name: 'Quote chaser',
      text: 'The quote chaser sends polite follow-ups when a quote has gone unanswered. You approve every message before it goes out, and you take over once the customer replies.' },
    { re: / nudger | unpaid invoices | chase payments | chase invoices | review requests | payment reminders /, name: 'Payment and review nudger',
      text: 'The payment and review nudger drafts reminders for unpaid invoices and requests for reviews after a job. You approve each one, and customers pay through your own accounts.' },
    { re: / knowledge assistant | knowledge agent | staff questions | company documents /, name: 'Private knowledge assistant',
      text: 'The private knowledge assistant answers staff questions from the firm’s own documents, running on a computer in your own office. It can work with the internet switched off, and it says so when it does not know.', priv: true }
  ];
  var AGENT_CHIPS = ['Front-desk agent', 'Booking agent', 'Lead qualifier', 'Quote chaser', 'Payment and review nudger', 'Private knowledge assistant'];

  function quoteLine(mail) {
    return 'Priced per project, so ask for a quote' + (mail ? ' at ' + mail : '') + '.';
  }

  function agentFor(t) {
    for (var i = 0; i < AGENTS.length; i++) if (AGENTS[i].re.test(t)) return AGENTS[i];
    return null;
  }

  function agentReply(a, mail, mailLink) {
    var links = [['AI agents', '#agents']];
    if (a.priv) links.push(['Private AI', '#private']);
    if (a.demo) links.push(['See a demo salon website', 'demo/salon/']);
    return tag('action', { text: a.text + ' ' + quoteLine(mail), links: links.concat(mailLink), chips: ['AI agents', 'Websites', 'Email Roberto'] });
  }

  function agentsOverview(mail, mailLink) {
    return tag('action', {
      text: 'Cambyte builds six small AI agents. Each does one job with you in charge, and each tells people it is an AI: a front-desk agent, a booking agent, a lead qualifier, a quote chaser, a payment and review nudger and a private knowledge assistant. Tap one to hear more. ' + quoteLine(mail),
      links: [['AI agents', '#agents'], ['See a demo salon website', 'demo/salon/']].concat(mailLink), chips: AGENT_CHIPS.concat(['Email Roberto'])
    });
  }

  function websitesReply(mail, mailLink) {
    return tag('action', {
      text: 'Yes, Cambyte builds small-business websites too. They can take bookings straight into your calendar, take card payments and mobile wallets through your own Stripe account (the money never passes through Cambyte), and include an optional AI receptionist that always says it is an AI. ' + quoteLine(mail),
      links: [['Websites', '#websites'], ['See a demo salon website', 'demo/salon/']].concat(mailLink), chips: ['AI agents', 'Care plans', 'Email Roberto']
    });
  }

  function refused(t) {
    return /ignore (all |any |your |the |previous |prior )*(instructions|rules|prompt)|(system|hidden|initial) (prompt|message|instructions)|your (instructions|rules|prompt)|api ?key|pass ?word|passcode|credentials|\btoken\b|\bsecret|\badmin\b|\broot\b|\bhack|jailbreak|exploit|inject|bypass|override|pretend|roleplay|role play|you are now| act as |developer mode|\bdan\b/.test(t) ||
      /(write|generate|debug|fix|give me|create|show me).{0,30}(code|script|function|program|python|javascript|sql|html|css|regex)/.test(t) ||
      /\b(python|javascript|sql|bash|php)\b/.test(t) ||
      /(other|your|his|their|past|previous) (customers?|clients?)|(customer|client) (list|names?|details|data)|who else|personal (details|info|data) of|someone else/.test(t);
  }

  // kind: 'action' (changes the page or the order flow), 'social', 'answer' (a question, may go to the model), 'fallback'.
  function tag(kind, r) {
    var o = {};
    for (var k in r) o[k] = r[k];
    o.kind = kind;
    return o;
  }

  function respond(raw) {
    var inFlow = !!flow;
    var r = respondRaw(raw);
    var out = tag(inFlow ? 'action' : (r.kind || 'answer'), r);
    return out;
  }

  function respondRaw(raw) {
    var t = norm(raw);
    var mail = mailAddr();
    var mailLink = mail ? [[mail, 'mailto:' + mail]] : [];
    var toks = t.trim().split(' ');
    function has(words) {
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (w.indexOf(' ') >= 0) { if (t.indexOf(' ' + w + ' ') >= 0) return true; continue; }
        for (var j = 0; j < toks.length; j++) {
          if (toks[j] === w || (w.length >= 5 && toks[j].length >= 4 && near(toks[j], w))) return true;
        }
      }
      return false;
    }

    if (refused(t)) return tag('action', { text: REFUSAL, chips: mainChips() });

    if (flow) {
      var fr = flowStep(t, raw);
      if (fr) return fr;
      if (!has(['price', 'prices', 'cost', 'android', 'care', 'deposit', 'pay', 'refund', 'apple', 'how', 'what', 'why', 'when', 'do', 'does', 'can'])) {
        return { text: 'Please pick one of the options below, or say “never mind”.', chips: flowChips() };
      }
    }

    // Greetings and manners
    if (toks.length <= 4 && has(['hi', 'hello', 'hey', 'hiya', 'howdy', 'morning', 'afternoon', 'evening', 'yo', 'greetings'])) {
      return tag('social', { text: 'Hello, what would you like to know about Cambyte’s apps, prices, websites or AI agents? I can also set up your order form.', chips: mainChips() });
    }
    if (has(['thanks', 'thank', 'cheers', 'ta', 'thx'])) return tag('social', { text: 'You’re welcome. Anything else I can help with?', chips: mainChips() });
    if (has(['bye', 'goodbye', 'cya'])) return tag('social', { text: 'Goodbye, and thanks for stopping by.' });
    if (/ (who|what) (are|r) you | are (you|u) (a |an |the )?(real |actual |human |live )?(bot|ai|robot|human|real|person|people|claude|chatgpt|gpt|gemini|llama|openai|anthropic|model|llm) | is this (a |an |the )?(real |actual |live )?(bot|ai|robot|human|person|chatbot|automated) | am i (talking|speaking|chatting|typing|writing) (to|with) (a |an |the )?(real |actual |live )?(person|human|bot|robot|ai|someone|somebody|man|woman) | your name /.test(t)) {
      return tag('social', { text: 'I’m Rob’s AI assistant. I can answer questions about Cambyte’s services and prices. “Talk to a person” below reaches Cambyte' + (mail ? ', or email ' + mail : '') + '.', links: mailLink, chips: mainChips() });
    }

    // Paying in the chat: never. Ahead of the price intents so a card question gets no price.
    if (/ (can|could|may|should|shall|will|do|would) (i|we) (just )?(give|send|tell|pay|enter|type|put|share|use|take)[a-z ]{0,20} (my|our|a|the) (credit |debit |bank )?(card|bank|account)/.test(t) ||
        / (pay|paying|payment|payments) (by|with|using|through|via|in) (a |my |the )?(credit |debit |bank )?(card|cards|transfer|chat|here)/.test(t) ||
        / (take|taking|accept|use|want you to take|here is|heres) (my|our|the) (credit |debit |bank )?(card|cards|bank|account number|sort code)/.test(t) ||
        / (my|our) (credit |debit |bank )?(card|bank|account) (number|details|info|information)/.test(t)) {
      return tag('action', { text: 'Payment is never taken in this chat, and please don’t type payment or login details here. When you order, the deposit is paid on Stripe’s own secure page.', links: [['Terms', 'terms/'], ['Questions', '#questions']], chips: ['Buy an app', 'Care plans'] });
    }

    // Go to a section
    if (has(['go to', 'take me', 'show me', 'scroll', 'jump', 'navigate', 'where is', 'where are', 'bring me', 'open'])) {
      var map = [
        ['agents', /agent/], ['websites', /website|demo|salon/],
        ['private', /private/], ['reply', /(order )?form|order|checkout|reply/], ['care', /care|maintenance/], ['prices', /price|pricing|package|tier/],
        ['ai', / ai /], ['proof', /proof|example|portfolio| work |draw and learn/], ['how', /how it works|process|steps/],
        ['questions', /question|faq/], ['about', /about|roberto/], ['contact', /contact/]
      ];
      for (var i = 0; i < map.length; i++) {
        if (map[i][1].test(t) && document.getElementById(map[i][0])) {
          goSection(map[i][0]);
          return tag('action', { text: 'Here you go.', links: [['Back to this section', '#' + map[i][0]]] });
        }
      }
    }

    // Websites and AI agents
    var agent = agentFor(t);
    if (agent) return agentReply(agent, mail, mailLink);
    if (has(['agent', 'agents'])) return agentsOverview(mail, mailLink);
    if (has(['website', 'websites', 'webpage', 'webpages', 'demo', 'salon']) || / web (site|sites|design|designer|developer) /.test(t)) return websitesReply(mail, mailLink);

    // Buying
    if (/ (set up|setup) my order | open (the |my )?(order )?form |buy an app|i want an app|i need an app|want to (buy|order|book)|like to (buy|order|book)|place an order|order an app|buy a/.test(t) || (has(['buy', 'order', 'purchase', 'book']) && !has(['call', 'chat', 'talk', 'phone', 'meeting']))) {
      return tag('action', startFlow());
    }

    // Extras
    if (has(['android', 'google play', 'samsung', 'pixel'])) {
      var a = extra('android');
      if (!a || !a.price) return SEE_PRICES;
      return {
        text: 'Yes, an Android version is ' + a.percent + '% on top of the iPhone price: ' + money(androidPrice('starter')) + ' on Starter and ' + money(androidPrice('business')) + ' on Business. It is built natively in Kotlin.',
        links: [['See add-ons', '#prices']], chips: ['Buy an app', 'Prices']
      };
    }
    if (has(['chatbot', 'chat bot', 'aichat', 'ai chat', 'chat assistant', 'ai assistant']) && !has(['business', 'company'])) {
      var c = extra('aichat');
      if (!c) return SEE_PRICES;
      return { text: 'An AI chat assistant inside your app is ' + money(c.price) + ' as an add-on on Starter or Business.', links: [['See add-ons', '#prices']], chips: ['Buy an app', 'AI for my business'] };
    }
    if (!has(['deposit', 'refund', 'upfront']) && (has(['stripe', 'card', 'cards', 'payments', 'checkout']) || / (take|taking|accept|accepting) (payment|money)/.test(t)) && !has(['how to pay'])) {
      var py = extra('payments');
      if (!py) return SEE_PRICES;
      return { text: 'Taking card payments in your app (Stripe) is ' + money(py.price) + ' as an add-on to Starter or Business.', links: [['See add-ons', '#prices']], chips: ['Buy an app', 'Prices'] };
    }

    // Paying and deposit
    if (has(['deposit', 'refund', 'upfront', 'pay', 'paying', 'paid', 'invoice', 'installments', 'instalments'])) {
      var dp = deposit();
      if (dp == null || !tier('starter')) return { text: 'How paying works is explained in the questions section.', links: [['Questions', '#questions']] };
      return {
        text: 'For Starter and Business you pay a ' + dp + '% deposit to begin (' + money(Math.round(tier('starter').price * dp / 100)) + ' or ' + money(Math.round(tier('business').price * dp / 100)) +
          ') on Stripe’s secure checkout. The rest is invoiced when Apple approves your app. If the work turns out bigger than the package, you hear in writing first, and if you would rather not go ahead you get the whole deposit back.',
        links: [['Terms', 'terms/'], ['Questions', '#questions']], chips: ['Buy an app', 'Care plans']
      };
    }

    // AI and privacy
    if (has(['private', 'privately', 'offline', 'premises', 'confidential', 'sovereign']) || / (without sending|not send|local ai|my data) /.test(t)) {
      var pv = faqBy(/without sending|private/i);
      var r = pv ? faqReply(pv) : { text: 'Private AI can run on a computer in your building, so your data stays with you. It starts with an email about how your business works.', links: [] };
      r.links = [['Private AI', '#private']].concat(r.links.slice(0, 1));
      r.chips = ['Email Roberto', 'AI for my business'];
      return r;
    }
    if (has(['ai', 'artificial', 'chatgpt', 'automation', 'automate', 'llm', 'gpt']) ) {
      var ac = faqBy(/ai work cost/i);
      var r2 = ac ? faqReply(ac) : { text: 'AI work has no price list, because every business is different. Email how your business runs and you get a fixed written quote.', links: [] };
      r2.links = [['AI for business', '#ai']].concat(r2.links);
      r2.chips = ['Email Roberto', 'Private AI', 'Buy an app'];
      return r2;
    }

    // Tiers
    if (has(['starter', 'cheapest', 'simplest', 'basic']) || / small app | simple app /.test(t)) return tierReply('starter');
    if (/ business (app|package|tier|plan) /.test(t) || has(['business']) && !has(['my', 'company', 'firm'])) return tierReply('business');
    if (has(['custom', 'bespoke', 'complex', 'integration', 'integrations']) || /\bfrom £/.test(t)) return tierReply('custom');

    // Care
    if (has(['care', 'maintenance', 'monthly', 'ongoing', 'support', 'hourly', 'updates']) || / after launch | look after /.test(t)) {
      var cr = P && P.care;
      if (!cr || !cr.care) return { text: 'Care plans are described in the care section.', links: [['Care plans', '#care']] };
      return {
        text: 'After launch there is Care at ' + money(cr.care.monthly) + ' a month, Care Plus at ' + money(cr.plus.monthly) + ' and Care Pro at ' + money(cr.pro.monthly) +
          '. Or pay by the hour' + (P.hourly != null ? ' at ' + money(P.hourly) : '') + ' with no plan. The build price is the same either way.',
        links: [['Care plans', '#care']], chips: ['Buy an app', 'Prices']
      };
    }

    // Ownership, timing
    if (has(['own', 'owns', 'ownership', 'copyright', 'rights', 'source', 'code', 'hand over', 'handover'])) {
      var ow = faqBy(/owns/i);
      if (ow) return faqReply(ow);
    }
    // Fixing an existing app
    if (has(['broken', 'rejected', 'rejection', 'rescue', 'abandoned', 'crashing', 'crashes']) || / (fix|repair|take over|finish) (my|our|an|the|a) (app|existing) /.test(t)) {
      return {
        text: 'Yes, apps that are broken, rejected by Apple or abandoned by their developer can be fixed, at a fixed fee after a free look. Pick “Not sure yet” on the order form or email ' + ownerName() + '.',
        links: [['Order form', '#reply']].concat(mailLink), chips: ['Email Roberto', 'Prices']
      };
    }
    if (has(['review', 'apple', 'timeline', 'weeks', 'launch', 'deliver', 'delivery', 'turnaround']) || / how long | how soon | when will /.test(t)) {
      var ti = tierInfo('starter'), tb = tierInfo('business');
      var times = ti.time && tb.time ? 'Starter: ' + ti.time.toLowerCase() + '. Business: ' + tb.time.toLowerCase() + '. ' : '';
      return {
        text: times + 'Apple’s review then usually takes one to three days. The final launch date is Apple’s call, so it is never promised.',
        links: [['Questions', '#questions']], chips: ['Buy an app', 'Prices']
      };
    }

    // Calls and contact: email first, a call only when needed
    if (has(['phone', 'video', 'coffee']) && has(['call', 'talk', 'chat', 'meet', 'speak', 'prefer', 'rather', 'like'])) {
      var pref = has(['video']) ? 'Video call' : has(['coffee']) ? 'Coffee in Cambridge' : 'Phone';
      // The order form is never changed from a chat message: the visitor picks "If we need to talk" themselves.
      return tag('action', { text: 'Noted, you would rather ' + (pref === 'Phone' ? 'talk by phone' : pref === 'Video call' ? 'have a video call' : 'meet for coffee in Cambridge') + '. ' + ownerName() + ' replies by email first and arranges a call if one is needed' + (mail ? '; email ' + mail + '. ' : '. ') + 'You can choose “' + pref + '” under “If we need to talk” on the order form.', links: [['Order form', '#reply']].concat(mailLink), chips: ['Buy an app'] });
    }
    if (has(['talk', 'speak', 'call', 'chat', 'meet', 'consultation', 'consult', 'free', 'minute', 'minutes', 'roberto', 'human', 'person']) || / 30 /.test(t)) {
      return {
        text: 'Ask me first: I can answer questions about apps, prices and ordering. For anything else, email ' + ownerName() + (mail ? ' at ' + mail : '') + '. He replies, usually the same day, and if a call is needed he arranges one by phone or video.',
        links: [['Order form', '#reply']].concat(mailLink), chips: ['Buy an app', 'Prices']
      };
    }
    if (has(['contact', 'email', 'reach', 'address', 'linkedin']) || / get in touch /.test(t)) {
      return { text: 'You can email ' + ownerName() + (mail ? ' at ' + mail : '') + ', or use the order form.', links: mailLink.concat([['Contact', '#contact']]) };
    }
    if (has(['privacy', 'cookies', 'gdpr']) && has(['policy', 'cookies', 'gdpr', 'data'])) {
      return { text: 'The privacy policy explains how your details are handled.', links: [['Privacy', 'privacy/']] };
    }
    if (has(['terms', 'conditions', 'cancel', 'cancellation'])) {
      return { text: 'The terms cover refunds and the 14-day cancellation period.', links: [['Terms', 'terms/']] };
    }

    // Prices overview
    if (has(['price', 'prices', 'pricing', 'cost', 'costs', 'much', 'quote', 'cheap', 'expensive', 'afford', 'package', 'packages', 'rates', 'budget']) || t.indexOf('£') >= 0) {
      if (!tier('starter') || !tier('business')) return SEE_PRICES;
      var cu = tier('custom');
      return {
        text: 'Starter is ' + money(tier('starter').price) + ' and Business is ' + money(tier('business').price) + ', both fixed prices' +
          (cu && cu.from != null ? '. Custom & AI starts from ' + money(cu.from) + ', quoted in writing after you email what you need' : '') + '. Android, AI chat and card payments are optional extras.',
        links: [['See prices', '#prices']], chips: ['Starter', 'Business', 'Custom & AI', 'Buy an app']
      };
    }

    // Anything the FAQ covers
    var fm = faqMatch(t);
    if (fm) return faqReply(fm);

    return tag('fallback', {
      text: 'I can help with prices, extras, care plans, paying and ordering. Pick one below' + (mail ? ', or email ' + mail : '') + '.',
      links: mailLink, chips: mainChips()
    });
  }

  function flowChips() {
    if (!flow) return mainChips();
    if (flow.step === 'pkg') return pkgChips();
    if (flow.step === 'extras') return extraChips();
    if (flow.step === 'care') return careChips();
    return [{ label: 'Set up my order', main: true }, 'Change something', 'Never mind'];
  }

  function tierReply(key) {
    var t = tier(key);
    if (!t) return SEE_PRICES;
    var info = tierInfo(key), dp = deposit();
    if (key === 'custom') {
      return {
        text: t.name + ' starts from ' + (t.from != null ? money(t.from) : 'a quoted price') + ' and is quoted in writing after you email what you need. ' + sentence(info.forText),
        links: [['See prices', '#prices'], ['Order form', '#reply']], chips: ['Email Roberto', 'Buy an app']
      };
    }
    return {
      text: t.name + ' is ' + money(t.price) + ', fixed. ' + sentence(info.forText) + ' ' + sentence(info.time) + (dp != null ? ' A ' + dp + '% deposit starts it.' : ''),
      links: [['See prices', '#prices']], chips: ['Buy an app', 'Android', 'Care plans']
    };
  }

  /* ---------- AI mode: reply guards (same rules as the server; the server is authoritative) ---------- */

  function aiOn() {
    if (!ENDPOINT) return false;
    if (MODE === 'llm') return true;
    try { return new URLSearchParams(location.search).get('assistant') === 'ai'; } catch (e) { return false; }
  }

  function allowedAmounts() {
    var a = { 79: 1, 10000: 1, 25000: 1 };
    function add(n) { if (typeof n === 'number' && isFinite(n)) a[n] = 1; }
    if (!P) return a;
    var k, e, q;
    add(P.hourly);
    for (k in (P.tiers || {})) { add(P.tiers[k].price); add(P.tiers[k].from); }
    for (k in (P.extras || {})) {
      e = P.extras[k].price;
      if (e && typeof e === 'object') { for (q in e) add(e[q]); } else add(e);
    }
    for (k in (P.quote_only || {})) { add(P.quote_only[k].price); add(P.quote_only[k].from); }
    for (k in (P.care || {})) add(P.care[k].monthly);
    var dp = P.deposit_percent;
    var pk = ['starter', 'business'];
    for (var i = 0; i < pk.length; i++) {
      if (!tier(pk[i]) || tier(pk[i]).price == null) continue;
      for (var m = 0; m < 8; m++) {
        var t = total(pk[i], { android: !!(m & 1), aichat: !!(m & 2), payments: !!(m & 4) });
        add(t);
        if (t != null && dp != null) { add(t * dp / 100); add(t - t * dp / 100); }
      }
    }
    return a;
  }

  /* GUARDS-BEGIN: thin wrapper; the rules live in assets/guards.js (window.CambyteGuards), cases in worker/test/guard-cases.json */
  var CONTACT = 'hello@cambyte.co.uk';
  var AGENCY_AMOUNTS = [10000, 25000];
  var OK_PERCENTS = [40, 50];

  function numList(set) {
    var out = [], i;
    for (i = 0; i < set.length; i++) if (typeof set[i] === 'number' && isFinite(set[i]) && out.indexOf(set[i]) < 0) out.push(set[i]);
    return out.sort(function (x, y) { return x - y; });
  }

  // Prices that belong to each tier or plan (same derivation as TIER_PRICES in worker/src/prompt.js,
  // which tools/widget-guard-test.js compares against).
  function tierSets() {
    var out = {}, dp = deposit(), k, t, s, m, tot, ex = ['android', 'aichat', 'payments'], flat = [], q, names = { care: 'care', plus: 'careplus', pro: 'carepro' };
    if (!P) return out;
    for (k in (P.extras || {})) if (k !== 'android' && P.extras[k] && typeof P.extras[k].price === 'number') flat.push(P.extras[k].price);
    for (k in (P.quote_only || {})) { q = P.quote_only[k]; flat.push(q.price != null ? q.price : q.from); }
    for (k in (P.tiers || {})) {
      t = P.tiers[k];
      s = flat.slice();
      if (t.buy && t.price != null) {
        if (androidPrice(k) != null) s.push(androidPrice(k));
        for (m = 0; m < 8; m++) {
          tot = total(k, { android: !!(m & 1), aichat: !!(m & 2), payments: !!(m & 4) });
          if (tot == null) continue;
          s.push(tot);
          if (dp != null) { s.push(tot * dp / 100); s.push(tot - tot * dp / 100); }
        }
      } else s.push(t.from != null ? t.from : t.price);
      out[k] = numList(s);
    }
    for (k in (P.care || {})) if (typeof P.care[k].monthly === 'number') out[names[k] || k] = [P.care[k].monthly];
    if (typeof P.hourly === 'number') out.hourly = [P.hourly];
    return out;
  }

  // Returns clean plain text, or null when the reply must not be shown (also null when the guards are missing).
  function checkReply(text) {
    var G = window.CambyteGuards, r;
    if (typeof text !== 'string' || !G || typeof G.checkReply !== 'function') return null;
    try {
      r = G.checkReply(text, {
        allowedAmounts: Object.keys(allowedAmounts()).map(Number),
        contactEmail: CONTACT,
        tierPrices: tierSets(),
        okHosts: ['cambyte.co.uk'],
        agencyAmounts: AGENCY_AMOUNTS,
        okPercents: OK_PERCENTS,
        maxChars: 1200
      });
    } catch (e) { return null; }
    if (!r || !r.ok || typeof r.text !== 'string') return null;
    var s = r.text.replace(/\s*\n\s*/g, ' ').trim();
    return s || null;
  }
  /* GUARDS-END */

  /* ---------- UI ---------- */

  function trim() {
    while (log.children.length > 80) log.removeChild(log.firstChild);
  }

  function addUser(text) {
    var m = el('div', 'cba-msg cba-msg-user');
    m.appendChild(el('div', 'cba-bubble', text));
    log.appendChild(m);
    trim();
    log.scrollTop = log.scrollHeight;
  }

  function addBot(r, quiet) {
    var m = el('div', 'cba-msg cba-msg-bot');
    m.appendChild(el('div', 'cba-bubble', r.text));
    var ls = r.links || [];
    if (ls.length) {
      var row = el('div', 'cba-links');
      for (var i = 0; i < ls.length; i++) {
        var h = safeHref(ls[i][1]);
        if (!h) continue;
        var a = el('a', 'cba-link', ls[i][0]);
        a.setAttribute('href', h);
        row.appendChild(a);
      }
      if (row.children.length) m.appendChild(row);
    }
    log.appendChild(m);
    trim();
    setChips(r.chips || []);
    log.scrollTop = log.scrollHeight;
    if (quiet) return;
    if (V.on) V.reply(r.text); else speak(r.text);
  }

  function setChips(list) {
    chipsEl.textContent = '';
    for (var i = 0; i < list.length; i++) chipsEl.appendChild(makeChip(list[i]));
    chipsEl.hidden = !list.length;
  }

  function makeChip(c) {
    var d = typeof c === 'string' ? { label: c } : c;
    var b = el('button', 'cba-chip' + (d.main ? ' cba-chip-main' : ''), d.label);
    b.type = 'button';
    if (d.toggle) {
      b.setAttribute('aria-pressed', d.pressed ? 'true' : 'false');
      b.addEventListener('click', function () {
        if (!flow) return;
        flow.extras[d.toggle] = !flow.extras[d.toggle];
        setChips(extraChips());
        var nb = chipsEl.querySelector('[aria-pressed]');
        var all = chipsEl.querySelectorAll('[aria-pressed]');
        for (var j = 0; j < all.length; j++) if (all[j].textContent === d.label) nb = all[j];
        if (nb) nb.focus();
      });
    } else {
      b.addEventListener('click', function () { if (busy) return; submit(d.label); if (!isMobile()) input.focus(); });
    }
    return b;
  }

  // Live: the worker tries two providers at up to 8 s each, so wait 20 s before the local answer.
  function modelTimeout() {
    var o = LOCAL_HOST && Number(window.__CBA_TIMEOUT);
    return o > 0 ? o : (LOCAL_HOST ? 45000 : 20000);
  }

  function setBusy(on) {
    busy = on;
    if (sendBtn) sendBtn.disabled = on;
    if (panel) panel.setAttribute('aria-busy', on ? 'true' : 'false');
    // While a reply is pending the mic and chips do nothing, so recognised text is never dropped silently.
    if (micBtn) { if (on) micBtn.setAttribute('aria-disabled', 'true'); else micBtn.removeAttribute('aria-disabled'); }
    if (chipsEl) {
      var cs = chipsEl.querySelectorAll('.cba-chip');
      for (var i = 0; i < cs.length; i++) { if (on) cs[i].setAttribute('aria-disabled', 'true'); else cs[i].removeAttribute('aria-disabled'); }
    }
  }

  function typingBubble() {
    var m = el('div', 'cba-msg cba-msg-bot cba-typing-msg');
    var b = el('div', 'cba-bubble cba-typing');
    b.setAttribute('role', 'status');
    b.setAttribute('aria-label', 'Thinking');
    for (var i = 0; i < 3; i++) b.appendChild(el('span', 'cba-dot'));
    m.appendChild(b);
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    return m;
  }

  /* ---------- payment and login details are never kept, sent or put in the mailto ---------- */

  // 13+ digits (spaces, dashes, dots or slashes between), not after "+" and not starting with 0, so phone numbers stay.
  var LONG_DIGITS = /(^|[^+\d])([1-9](?:[\s\-.\/]{0,2}\d){12,})/g;
  function longDigits(s) { LONG_DIGITS.lastIndex = 0; var hit = LONG_DIGITS.test(String(s)); LONG_DIGITS.lastIndex = 0; return hit; }
  var MASKED_BUBBLE = '[removed: looked like payment or login details]';
  var SENSITIVE_REPLY = 'Please don’t share payment or login details here. I haven’t kept that message. If you order, you pay the deposit on Stripe’s own secure page.';

  // '' when the text is fine, else 'bank' | 'card' | 'cardcode' | 'login' (the shared guard), or 'card' for a 13+ digit run
  // (checked as well as the guard, so a form the guard misses still never gets through).
  function sensitiveWhy(text) {
    var G = window.CambyteGuards, why = '';
    try {
      if (G && typeof G.sensitiveInput === 'function') why = G.sensitiveInput(String(text)) || '';
    } catch (e) { why = 'card'; }
    if (!why && longDigits(text)) why = 'card';
    return why;
  }

  function maskDigits(s) { LONG_DIGITS.lastIndex = 0; return String(s).replace(LONG_DIGITS, '$1[number removed]'); }

  function remember(role, text) {
    hist.push({ role: role, content: String(text).slice(0, role === 'user' ? 500 : 1200) });
    if (hist.length > 40) hist.splice(0, hist.length - 40);
    updatePerson();
  }

  /* ---------- "Talk to a person": a plain mailto link carrying a summary of this chat ---------- */

  function personHref() {
    var subject = 'Message from the website assistant';
    var head = 'Hello,\r\n\r\nI was using the assistant on your website and would like to talk to a person.\r\n\r\nShort summary of what we discussed:\r\n';
    var tail = '\r\n\r\nMy name:\r\nHow to reach me:\r\n';
    var base = 'mailto:' + CONTACT + '?subject=' + encodeURIComponent(subject) + '&body=';
    function href(lines) { return base + encodeURIComponent(head + lines.join('\r\n') + tail); }
    var picked = [], i, len, cand, line;
    for (i = hist.length - 1; i >= 0 && picked.length < 12; i--) {
      var said = String(hist[i].content).replace(/\s+/g, ' ').trim();
      if (sensitiveWhy(said)) continue;
      said = maskDigits(said);
      cand = null;
      for (len = 160; len >= 20; len -= 20) {
        line = (hist[i].role === 'user' ? 'Visitor: ' : 'Assistant: ') + (said.length > len ? said.slice(0, len - 1) + '…' : said);
        if (href([line].concat(picked)).length <= 1800) { cand = line; break; }
      }
      if (!cand) break;
      picked.unshift(cand);
    }
    if (!picked.length) picked = ['(Nothing yet.)'];
    return href(picked);
  }

  function updatePerson() {
    if (personLink) personLink.setAttribute('href', personHref());
  }

  // What the server gets: the visitor's messages, plus only the one assistant reply right before the last
  // visitor message (cut to 300 chars). The last item is always the visitor's; at most 11 items.
  function modelHistory() {
    var n = hist.length;
    if (!n || hist[n - 1].role !== 'user') return [];
    var out = [];
    for (var i = 0; i < n - 1; i++) if (hist[i].role === 'user') out.push({ role: 'user', content: hist[i].content });
    if (n > 1 && hist[n - 2].role === 'assistant') out.push({ role: 'assistant', content: hist[n - 2].content.slice(0, 300) });
    out.push({ role: 'user', content: hist[n - 1].content });
    out = out.slice(-11);
    while (out.length > 1 && out[0].role !== 'user') out.shift();
    return out;
  }

  function askModel() {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var ms = modelTimeout(), timer;
    var timedOut = new Promise(function (_, rej) {
      timer = setTimeout(function () { if (ctrl) ctrl.abort(); rej(new Error('timeout')); }, ms);
    });
    var req = fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: modelHistory() }),
      credentials: 'omit',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (res.status !== 200) throw new Error('status');
      return res.json();
    }).then(function (j) {
      if (!j || j.fallback || typeof j.reply !== 'string') throw new Error('fallback');
      var clean = checkReply(j.reply);
      if (!clean) throw new Error('blocked');
      return clean;
    });
    return Promise.race([req, timedOut]).then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
  }

  function finish(r) {
    remember('assistant', r.text);
    addBot(r);
  }

  function submit(text) {
    if (busy) return false;
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
    if (!text) return false;
    if (sensitiveWhy(text)) {
      // Not shown, not remembered (so never in the mailto), never sent to the model: a fixed local refusal.
      addUser(MASKED_BUBBLE);
      addBot({ text: checkReply(SENSITIVE_REPLY) || 'Please don’t share payment or login details here.', chips: mainChips() });
      return true;
    }
    addUser(text);
    visitorCount++;
    remember('user', text);
    var r;
    try { r = respond(text); } catch (e) { r = { text: 'Sorry, something went wrong on my side. Please try again.', chips: mainChips(), kind: 'action' }; }
    var viaModel = aiOn() && (r.kind === 'answer' || r.kind === 'fallback');
    if (!viaModel) { finish(r); return true; }
    if (modelCount >= MAX_VISITOR_MSGS) {
      // Past the cap: still answer locally; add the email hint once.
      if (!capNoted) {
        capNoted = true;
        var mail = mailAddr();
        r = { text: r.text + ' For anything more, email ' + (mail || 'us') + '. Happy to help there.', links: (r.links || []).concat(mail ? [[mail, 'mailto:' + mail]] : []), chips: r.chips };
      }
      finish(r);
      return true;
    }
    modelCount++;
    setBusy(true);
    var tb = typingBubble();
    Promise.resolve().then(askModel).then(function (clean) {
      return { text: clean, links: r.links, chips: r.chips };
    }, function () {
      return r;
    }).then(function (out) {
      if (tb.parentNode) tb.parentNode.removeChild(tb);
      setBusy(false);
      finish(out);
      if (input && !isMobile()) input.focus();
    }).catch(function () {
      // Never stay stuck: clear busy and show the local answer.
      setBusy(false);
      if (tb.parentNode) tb.parentNode.removeChild(tb);
      try { finish(r); } catch (e) { /* ignore */ }
    });
    return true;
  }

  function voiceScore(v) {
    var lang = String(v.lang || '').replace('_', '-'), name = String(v.name || '');
    var gb = lang.toLowerCase() === 'en-gb';
    if (gb && /natural|neural|online|enhanced|premium|siri/i.test(name)) return 100;
    if (name === 'Google UK English Female') return 90;
    if (name === 'Google UK English Male') return 89;
    if (gb) return /serena|daniel|kate|martha|arthur/i.test(name) ? 80 : 70;
    if (/^en(-|$)/i.test(lang)) return 50;
    return 0;
  }

  function pickVoice() {
    if (!synth || !synth.getVoices) return null;
    var vs = synth.getVoices() || [], best = null, top = 0;
    for (var i = 0; i < vs.length; i++) {
      var sc = voiceScore(vs[i]);
      if (sc > top) { top = sc; best = vs[i]; }
    }
    bestVoice = best;
    return best;
  }

  /* ---------- speaking: only text the guards approved, turned into something that sounds right ---------- */

  var ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  var TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function words(n) {
    n = Math.floor(n);
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
    if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + words(n % 100) : '');
    if (n < 1e6) return words(n / 1000) + ' thousand' + (n % 1000 ? (n % 1000 < 100 ? ' and ' : ' ') + words(n % 1000) : '');
    if (n < 1e9) return words(n / 1e6) + ' million' + (n % 1e6 ? ' ' + words(n % 1e6) : '');
    return String(n);
  }

  // "£1,500" -> "one thousand five hundred pounds"; "£1.50" -> "one pound fifty"; links and emails are not read out.
  function speakable(text) {
    var s = String(text);
    s = s.replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, 'the email address on screen');
    s = s.replace(/\b(?:https?:\/\/|www\.)\S+/gi, 'the link on screen');
    s = s.replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:co\.uk|com|org|net|uk|app|io|dev)(?:\/\S*)?/gi, 'the link on screen');
    // "£1.5k" -> "1.5 thousand pounds", "£2k" -> "2 thousand pounds", "£1.2m" -> "1.2 million pounds"
    s = s.replace(/£\s*(\d+(?:\.\d+)?)\s*(k|m)\b/gi, function (m, num, suf) {
      return num + (suf.toLowerCase() === 'k' ? ' thousand' : ' million') + ' pounds';
    });
    s = s.replace(/(\+\s*)?£\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g, function (m, plus, whole, pence) {
      var n = Number(whole.replace(/,/g, '')), p = pence ? Number(pence.length === 1 ? pence + '0' : pence) : 0;
      var out = n === 0 && p ? words(p) + ' pence' : words(n) + (n === 1 ? ' pound' : ' pounds') + (p ? ' ' + words(p) : '');
      return (plus ? 'plus ' : '') + out;
    });
    s = s.replace(/\s*\/\s*(?:mo|month)\b/gi, ' a month').replace(/\s*\/\s*(?:hr|hour)\b/gi, ' an hour');
    s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, '$1 percent');
    s = s.replace(/&/g, ' and ').replace(/\s[—–]\s/g, ', ').replace(/\(([^)]*)\)/g, ', $1,').replace(/\s+/g, ' ').replace(/ ,/g, ',');
    // "(business use only), then" leaves ",," and "(x)." leaves ",."
    s = s.replace(/,(?:\s*,)+/g, ',').replace(/,\s*([.!?:;])/g, '$1').trim();
    // Long replies: the first one or two sentences; the full text stays on screen.
    // A reply of one or two sentences may run to 300 characters, so the biggest order summary is read out whole.
    var parts = s.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [s];
    var max = parts.length <= 2 ? 300 : 260;
    if (parts.length > 2 || s.length > max) {
      var first = parts.slice(0, 2).join('').trim();
      if (first.length > max) {
        var cut = first.slice(0, 220), k = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('; '));
        first = (k > 80 ? cut.slice(0, k) : cut.replace(/\s+\S*$/, '')).replace(/[,;:\s]+$/, '') + '.';
      }
      s = first + ' The rest is on screen.';
    }
    return s;
  }

  // Everything spoken goes through the guards first; a blocked or unchecked reply is never read out.
  function spokenText(text) {
    var g = checkReply(text);
    if (!g) return SPOKEN_FALLBACK;
    var said = speakable(g);
    // The spoken form is what the visitor hears, so it passes the guards too; otherwise a safe fixed line.
    return checkReply(said) ? said : SPOKEN_FALLBACK;
  }

  /* ---------- natural voice: replies made in advance with an AI voice, played from this site ---------- */

  // voice/manifest.json lists the clips by key. A line without a clip, or any failure, uses the browser's voice as before.
  // Nothing is fetched until the visitor turns voice on; clips are never probed, only looked up in the list.
  var clips = { state: 'idle', keys: null, waits: [] };
  var player = null, clipId = 0, speakId = 0;

  // FNV-1a over the exact spoken text, plus its length. tools/voice/render.mjs names the files the same way.
  function clipKey(said) {
    var h = 0x811c9dc5;
    for (var i = 0; i < said.length; i++) {
      h ^= said.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8) + '-' + said.length;
  }

  function clipsDone(state, keys) {
    clips.state = state;
    clips.keys = keys || null;
    var w = clips.waits;
    clips.waits = [];
    for (var i = 0; i < w.length; i++) w[i]();
  }

  function loadClips() {
    if (clips.state !== 'idle') return;
    var ok = false;
    try { ok = !!(VOICE_BASE && window.fetch && typeof window.Audio === 'function' && new window.Audio().canPlayType('audio/mpeg')); } catch (e) { ok = false; }
    if (!ok) { clipsDone('off'); return; }
    clips.state = 'loading';
    window.fetch(VOICE_BASE + 'manifest.json', { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('no clips');
      return r.json();
    }).then(function (m) {
      var keys = {}, list = m && m.clips && m.clips.length ? m.clips : [];
      for (var i = 0; i < list.length; i++) if (typeof list[i] === 'string') keys[list[i]] = true;
      clipsDone('ready', keys);
    }).then(null, function () { clipsDone('off'); });
  }

  // Runs cb once the clip list has loaded or failed; never waits longer than 1.5 seconds.
  function whenClips(cb) {
    if (clips.state !== 'loading') { cb(); return; }
    var once = false, t = setTimeout(go, 1500);
    function go() {
      if (once) return;
      once = true;
      clearTimeout(t);
      cb();
    }
    clips.waits.push(go);
  }

  // Called from a tap. iPhone Safari only plays sound a tap started, so a short silent clip now unlocks later replies.
  function unlockAudio() {
    loadClips();
    if (player || clips.state === 'off') return;
    try {
      player = new window.Audio();
      player.preload = 'auto';
      player.src = VOICE_BASE + 'silence.mp3';
      var p = player.play();
      if (p && p.then) p.then(null, function () { /* a later reply falls back to the browser voice */ });
    } catch (e) { player = null; }
  }

  // Plays the clip for this exact text. False means there is none; otherwise done or fail runs once, unless stopped first.
  function playClip(said, done, fail) {
    if (clips.state !== 'ready' || !player || !clips.keys[clipKey(said)]) return false;
    var my = ++clipId;
    function end(ok) {
      if (my !== clipId) return;
      clipId++;
      player.onended = player.onerror = null;
      if (ok) done(); else fail();
    }
    player.onended = function () { end(true); };
    player.onerror = function () { end(false); };
    try {
      player.src = VOICE_BASE + clipKey(said) + '.mp3';
      var p = player.play();
      if (p && p.then) p.then(null, function () { end(false); });
    } catch (e) {
      clipId++;
      player.onended = player.onerror = null;
      return false;
    }
    return true;
  }

  function stopClip() {
    clipId++;
    if (!player) return;
    player.onended = player.onerror = null;
    try { player.pause(); } catch (e) { /* ignore */ }
  }

  function cancelSpeech() {
    speakId++;
    stopClip();
    if (synth) { try { synth.cancel(); } catch (e) { /* ignore */ } }
  }

  function synthSpeak(said) {
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
      synth.cancel();
      var u = new SpeechSynthesisUtterance(said);
      u.lang = 'en-GB';
      u.rate = 1;
      u.pitch = 1;
      var v = bestVoice || pickVoice();
      if (v) u.voice = v;
      synth.speak(u);
    } catch (e) { /* speech is optional */ }
  }

  function speak(text) {
    if (V.on || !voiceOn || !panel || panel.hidden) return;
    cancelSpeech();
    var said = spokenText(text), my = speakId;
    whenClips(function () {
      if (my !== speakId || V.on || !voiceOn || panel.hidden) return;
      if (!playClip(said, function () {}, function () { if (my === speakId) synthSpeak(said); })) synthSpeak(said);
    });
  }

  function setVoice(on) {
    voiceOn = on;
    if (voiceBtn) {
      voiceBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      voiceBtn.setAttribute('aria-label', on ? 'Turn replies read aloud off' : 'Read replies aloud');
      voiceBtn.title = on ? 'Voice on' : 'Voice off';
    }
    if (!on) cancelSpeech();
  }

  /* ---------- hands-free conversation: listen, send after a pause, speak the reply, listen again ---------- */

  // Nothing starts without a tap on "Start conversation". Half-duplex: the microphone is off while the reply is spoken.
  var V = {
    on: false, state: 'off', rec: null, micOn: false, paused: false, buf: '',
    silenceT: null, idleT: null, speakDone: null, sayId: 0, restarts: 0,
    silenceMs: 1000, idleMs: 45000
  };
  var STATE_LABEL = { listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking', paused: 'Paused' };

  function stopPhrase(text) {
    var t = norm(text).trim();
    return t.split(' ').length <= 6 && /^(please )?(stop|goodbye|bye|bye bye|thats all|that is all|stop listening|end conversation|end the conversation|thats it|that is it|no thats all|no that is all)( thanks| thank you| please)?$/.test(t);
  }

  function setVState(st) {
    V.state = st;
    if (!voiceBox) return;
    voiceBox.setAttribute('data-state', st);
    voiceBox.hidden = st === 'off';
    voiceState.textContent = STATE_LABEL[st] || '';
    micDot.hidden = !V.micOn;
    if (startBtn) startBtn.hidden = st !== 'off' || !Recog;
    if (micBtn) micBtn.hidden = !Recog || st !== 'off';
    ringBtn.setAttribute('aria-label', st === 'speaking' ? 'Speaking. Tap to interrupt' : st === 'paused' ? 'Paused. Tap to carry on listening' : st === 'thinking' ? 'Thinking' : 'Listening. Tap to pause');
    panel.classList.toggle('cba-voice-on', st !== 'off');
  }

  function setCaption(t) { if (captionEl) captionEl.textContent = t || ''; }

  function stopRec() {
    var r = V.rec;
    V.rec = null;
    V.micOn = false;
    if (r) {
      r.onresult = r.onend = r.onerror = null;
      try { if (r.abort) r.abort(); else r.stop(); } catch (e) { try { r.stop(); } catch (e2) { /* ignore */ } }
    }
    if (micDot) micDot.hidden = true;
  }

  function clearTimers() {
    clearTimeout(V.silenceT);
    clearTimeout(V.idleT);
    V.silenceT = V.idleT = null;
  }

  function armIdle() {
    clearTimeout(V.idleT);
    V.idleT = setTimeout(function () {
      if (V.on && V.state === 'listening') V.end('I’ll stop listening now — tap to carry on.');
    }, V.idleMs);
  }

  function vListen() {
    if (!V.on || V.paused || !Recog) return;
    stopRec();
    var r;
    try { r = new Recog(); } catch (e) { V.end('Voice isn’t available here, so please type instead.'); return; }
    try { r.lang = 'en-GB'; } catch (e) { /* ignore */ }
    try { r.continuous = true; } catch (e) { /* some browsers (iPhone Safari) ignore this; each answer restarts the microphone */ }
    try { r.interimResults = true; r.maxAlternatives = 1; } catch (e) { /* ignore */ }
    V.buf = '';
    r.onresult = function (ev) {
      if (!V.on || V.rec !== r) return;
      var txt = '', res = (ev && ev.results) || [];
      for (var i = 0; i < res.length; i++) if (res[i] && res[i][0]) txt += res[i][0].transcript + ' ';
      txt = txt.replace(/\s+/g, ' ').trim();
      if (!txt) return;
      V.buf = txt;
      V.restarts = 0;
      setCaption(txt);
      armIdle();
      clearTimeout(V.silenceT);
      V.silenceT = setTimeout(function () { submitVoice(V.buf); }, V.silenceMs);
    };
    r.onerror = function (ev) {
      var code = ev && ev.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') V.end('The microphone is blocked, so I can’t listen. You can type instead.');
      else if (code === 'audio-capture') V.end('I can’t find a microphone, so I can’t listen. You can type instead.');
      else if (code === 'network') V.end('The speech service can’t be reached right now. You can type instead.');
    };
    r.onend = function () {
      if (V.rec !== r) return;
      V.rec = null;
      V.micOn = false;
      micDot.hidden = true;
      if (!V.on || V.state !== 'listening' || V.paused) return;
      // The browser stopped listening on its own. If it heard something, that was the end of the question.
      if (V.buf) { submitVoice(V.buf); return; }
      if (V.restarts < 40) {
        V.restarts++;
        setTimeout(function () { if (V.on && V.state === 'listening' && !V.rec && !V.paused) vListen(); }, 250);
      } else V.end('I couldn’t keep the microphone running. You can type instead.');
    };
    V.rec = r;
    try {
      r.start();
      V.micOn = true;
    } catch (e) { V.rec = null; V.end('Voice isn’t available here, so please type instead.'); return; }
    setVState('listening');
    armIdle();
  }

  function submitVoice(text) {
    clearTimers();
    stopRec();
    if (!V.on) return;
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
    setCaption('');
    if (!text) { vListen(); return; }
    setVState('thinking');
    if (stopPhrase(text)) { addUser(text); V.farewell(); return; }
    if (!submit(text)) { input.value = text; vListen(); }
  }

  // Speak guarded text, then call cb. The callback runs once, and not at all if something newer was spoken since.
  V.say = function (text, cb) {
    var done = false, my = ++V.sayId, safety;
    function fin() {
      if (done) return;
      done = true;
      clearTimeout(safety);
      if (V.speakDone === fin) V.speakDone = null;
      if (my === V.sayId && cb) cb();
    }
    // If the end is never reported, carry on anyway; a clip still playing is stopped so the microphone never hears it.
    function late() { if (my === V.sayId) stopClip(); fin(); }
    // Stop whatever is still being read, clip or browser voice, so two lines never overlap.
    stopClip();
    if (synth) { try { synth.cancel(); } catch (e) { /* ignore */ } }
    safety = setTimeout(late, Math.min(60000, 4000 + String(text).length * 90));
    V.speakDone = fin;
    function browserVoice() {
      if (done || my !== V.sayId) return;
      if (!synth || typeof SpeechSynthesisUtterance === 'undefined') { setTimeout(fin, 50); return; }
      try {
        var u = new SpeechSynthesisUtterance(text);
        var v = bestVoice || pickVoice();
        if (v) u.voice = v;
        u.lang = (v && v.lang) || 'en-GB';
        u.rate = 1;
        u.pitch = 1;
        u.onend = fin;
        u.onerror = fin;
        synth.cancel();
        synth.speak(u);
      } catch (e) { setTimeout(fin, 50); }
    }
    whenClips(function () {
      if (done || my !== V.sayId) return;
      if (playClip(text, fin, browserVoice)) {
        // A natural voice is a little slower than the browser's: allow for that.
        clearTimeout(safety);
        safety = setTimeout(late, Math.min(90000, 8000 + String(text).length * 130));
      } else browserVoice();
    });
  };

  // A reply is on screen: say it (after the guards), then listen again.
  V.reply = function (text) {
    stopRec();
    clearTimers();
    setCaption('');
    setVState('speaking');
    V.say(spokenText(text), function () {
      if (!V.on) return;
      if (V.paused) setVState('paused'); else vListen();
    });
  };

  V.farewell = function () {
    stopRec();
    clearTimers();
    setCaption('');
    addBot({ text: 'Okay, I’ve stopped listening. Tap Start conversation whenever you want to carry on.', chips: mainChips() }, true);
    setVState('speaking');
    V.say('Okay, goodbye.', function () { V.end(); });
  };

  V.start = function () {
    if (V.on || !Recog || !voiceBox) return;
    if (listening) stopListening();
    V.on = true;
    V.paused = false;
    V.restarts = 0;
    setVState('speaking');
    addBot({ text: 'Hi, I’m Rob’s AI assistant. I’m listening, so just say what you would like to know.', chips: mainChips() });
  };

  V.end = function (note) {
    var was = V.on, fin = V.speakDone;
    V.on = false;
    V.paused = false;
    V.sayId++;
    V.speakDone = null;
    clearTimers();
    stopRec();
    cancelSpeech();
    if (fin) { try { fin(); } catch (e) { /* ignore */ } }
    setCaption('');
    if (voiceBox) setVState('off');
    if (was && note) addBot({ text: note, chips: mainChips() }, true);
  };

  function ringTap() {
    if (!V.on) return;
    if (V.state === 'speaking') {
      var f = V.speakDone;
      cancelSpeech();
      if (f) f();
    } else if (V.state === 'paused') {
      V.paused = false;
      vListen();
    } else if (V.state === 'listening') {
      clearTimers();
      stopRec();
      V.paused = true;
      setVState('paused');
      setCaption('');
    }
  }

  function stopListening() {
    if (recog && listening) { try { recog.abort(); } catch (e) { /* ignore */ } }
    listening = false;
    if (micBtn) {
      micBtn.setAttribute('aria-pressed', 'false');
      micBtn.setAttribute('aria-label', 'Speak your question');
    }
  }

  function listen() {
    if (!Recog || V.on) return;
    if (listening) { stopListening(); return; }
    if (busy) return;
    try {
      recog = new Recog();
      recog.lang = 'en-GB';
      recog.continuous = false;
      recog.interimResults = false;
      recog.maxAlternatives = 1;
      recog.onresult = function (e) {
        var said = e.results && e.results[0] && e.results[0][0] ? e.results[0][0].transcript : '';
        input.value = said.slice(0, MAX_LEN);
        setVoice(true);
        // A reply is still pending: keep the words in the box for the visitor to send, never lose them.
        if (busy) return;
        submit(input.value);
        input.value = '';
      };
      recog.onerror = function () {
        stopListening();
        addBot({ text: 'Microphone isn’t available here, so please type instead.' });
      };
      recog.onend = function () { stopListening(); };
      recog.start();
      listening = true;
      micBtn.setAttribute('aria-pressed', 'true');
      micBtn.setAttribute('aria-label', 'Listening, press to stop');
    } catch (e) {
      stopListening();
      addBot({ text: 'Microphone isn’t available here, so please type instead.' });
    }
  }

  function openPanel() {
    panel.hidden = false;
    root.classList.add('cba-open');
    launcher.setAttribute('aria-expanded', 'true');
    if (!greeted) {
      greeted = true;
      addBot({ text: 'Hello, I’m Rob’s AI assistant. I answer from the information on this page: apps, prices, websites and AI agents. I can also set up your order form. What would you like to do?', chips: mainChips() });
    }
    input.focus();
  }

  function closePanel(skipFocus) {
    if (panel.hidden) return;
    panel.hidden = true;
    root.classList.remove('cba-open');
    launcher.setAttribute('aria-expanded', 'false');
    V.end();
    stopListening();
    cancelSpeech();
    if (skipFocus !== true) launcher.focus();
  }

  function build() {
    root = el('div', 'cba-root');

    launcher = el('button', 'cba-launcher');
    launcher.type = 'button';
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-controls', 'cba-panel');
    launcher.appendChild(el('span', 'cba-launch-label', LABEL));
    var lf = el('span', 'cba-launch-face');
    lf.appendChild(face());
    launcher.appendChild(lf);

    panel = el('section', 'cba-panel');
    panel.id = 'cba-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', LABEL);
    panel.hidden = true;

    var head = el('div', 'cba-head');
    head.appendChild(face());
    var title = el('div', 'cba-title', LABEL);
    title.appendChild(el('small', null, TAGLINE));
    head.appendChild(title);

    voiceBtn = el('button', 'cba-icon-btn');
    voiceBtn.type = 'button';
    voiceBtn.appendChild(icon(['M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z', 'M15.5 9a4 4 0 0 1 0 6', 'M18 6.5a7.5 7.5 0 0 1 0 11']));
    voiceBtn.addEventListener('click', function () { if (!voiceOn) unlockAudio(); setVoice(!voiceOn); });
    if (!synth) voiceBtn.hidden = true;
    head.appendChild(voiceBtn);

    var closeBtn = el('button', 'cba-icon-btn');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close assistant');
    closeBtn.appendChild(icon(['M6 6l12 12', 'M18 6L6 18']));
    closeBtn.addEventListener('click', function () { closePanel(); });
    head.appendChild(closeBtn);

    log = el('div', 'cba-log');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    log.setAttribute('aria-label', 'Conversation');
    log.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a.cba-link') : null;
      var h = a && a.getAttribute('href');
      if (!h || h.charAt(0) !== '#') return;
      var node = document.getElementById(h.slice(1));
      if (!node) return;
      e.preventDefault();
      goSection(h.slice(1));
    });

    chipsEl = el('div', 'cba-chips');
    chipsEl.setAttribute('aria-label', 'Quick replies');
    chipsEl.hidden = true;

    form = el('form', 'cba-form');
    form.setAttribute('autocomplete', 'off');
    input = el('input', 'cba-input');
    input.type = 'text';
    input.maxLength = MAX_LEN;
    input.placeholder = 'Ask about apps, websites or AI';
    input.setAttribute('aria-label', 'Your message');
    input.setAttribute('enterkeyhint', 'send');
    micBtn = el('button', 'cba-icon-btn');
    micBtn.type = 'button';
    micBtn.setAttribute('aria-pressed', 'false');
    micBtn.setAttribute('aria-label', 'Speak your question');
    micBtn.appendChild(icon(['M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3z', 'M6.5 11.5a5.5 5.5 0 0 0 11 0', 'M12 17v3.5']));
    micBtn.addEventListener('click', function () { unlockAudio(); listen(); });
    if (!Recog) micBtn.hidden = true;
    var send = el('button', 'cba-icon-btn cba-send');
    sendBtn = send;
    send.type = 'submit';
    send.setAttribute('aria-label', 'Send');
    send.appendChild(icon(['M5 12h14', 'M13 6l6 6-6 6']));
    form.appendChild(input);
    form.appendChild(micBtn);
    form.appendChild(send);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      var v = input.value;
      input.value = '';
      if (V.on && stopPhrase(v)) { addUser(String(v).trim().slice(0, MAX_LEN)); V.farewell(); return; }
      submit(v);
    });

    // Hands-free conversation: ring (tap to interrupt, pause or resume), state, mic dot, live caption, big Stop.
    voiceBox = el('div', 'cba-vbox');
    voiceBox.hidden = true;
    voiceBox.setAttribute('data-state', 'off');
    ringBtn = el('button', 'cba-ring');
    ringBtn.type = 'button';
    ringBtn.setAttribute('aria-label', 'Listening. Tap to pause');
    ringBtn.appendChild(icon(['M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3z', 'M6.5 11.5a5.5 5.5 0 0 0 11 0', 'M12 17v3.5']));
    ringBtn.addEventListener('click', ringTap);
    var vmeta = el('div', 'cba-vmeta');
    voiceState = el('span', 'cba-vstate');
    voiceState.setAttribute('role', 'status');
    micDot = el('span', 'cba-micdot');
    micDot.hidden = true;
    micDot.appendChild(el('span', 'cba-reddot'));
    micDot.appendChild(document.createTextNode('Mic on'));
    vmeta.appendChild(voiceState);
    vmeta.appendChild(micDot);
    captionEl = el('p', 'cba-caption');
    captionEl.setAttribute('aria-live', 'off');
    stopBtn = el('button', 'cba-stop', 'Stop');
    stopBtn.type = 'button';
    stopBtn.setAttribute('aria-label', 'Stop the conversation');
    stopBtn.addEventListener('click', function () { V.end(); });
    voiceBox.appendChild(ringBtn);
    voiceBox.appendChild(vmeta);
    voiceBox.appendChild(captionEl);
    voiceBox.appendChild(stopBtn);

    // Start conversation (only where the browser can listen) and a plain way to reach a person.
    var actions = el('div', 'cba-actions');
    if (Recog) {
      startBtn = el('button', 'cba-start', 'Start conversation');
      startBtn.type = 'button';
      startBtn.addEventListener('click', function () { unlockAudio(); V.start(); });
      actions.appendChild(startBtn);
    } else {
      voiceNote = el('p', 'cba-vnote', NOVOICE);
      actions.appendChild(voiceNote);
    }
    personLink = el('a', 'cba-person', 'Talk to a person');
    actions.appendChild(personLink);
    updatePerson();

    var note = el('p', 'cba-note');
    note.appendChild(el('span', 'cba-note-line', aiOn() ? NOTES.ai : (NOTES[MODE] || NOTES.local)));
    if (Recog) note.appendChild(el('span', 'cba-note-line', NOTES.voice));

    panel.appendChild(head);
    panel.appendChild(log);
    panel.appendChild(chipsEl);
    panel.appendChild(voiceBox);
    panel.appendChild(actions);
    panel.appendChild(form);
    panel.appendChild(note);
    root.appendChild(launcher);
    root.appendChild(panel);
    document.body.appendChild(root);

    launcher.addEventListener('click', function () {
      if (panel.hidden) openPanel(); else closePanel();
    });
    // Page links marked data-ask-assistant open the panel; without this script they fall back to #contact.
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('[data-ask-assistant]') : null;
      if (!a) return;
      e.preventDefault();
      openPanel();
    });
    function tabHidden() {
      if (!document.hidden && document.visibilityState !== 'hidden') return;
      if (V.on) V.end('I stopped listening because the tab was hidden. Tap Start conversation to carry on.');
      stopListening();
      cancelSpeech();
    }
    document.addEventListener('visibilitychange', tabHidden);
    window.addEventListener('pagehide', function () { V.end(); stopListening(); });
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && !panel.hidden) {
        e.preventDefault();
        closePanel();
      }
    });
    setVoice(false);
    if (synth) {
      try {
        pickVoice();
        if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice);
        else if ('onvoiceschanged' in synth) synth.onvoiceschanged = pickVoice;
      } catch (e) { /* speech is optional */ }
    }
  }

  function init() {
    if (!document.body || document.querySelector('.cba-root')) return;
    try { build(); } catch (e) { if (root && root.parentNode) root.parentNode.removeChild(root); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
