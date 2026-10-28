/* Orla & Quill: made-up demo salon. All demo data lives here.
   Nothing in this file is real: names, prices and bookings are invented. */
(function () {
  'use strict';

  var SLUG = 'orla-quill';

  var DATA = {
    name: 'Orla & Quill',
    slug: SLUG,
    email: 'hello@' + SLUG + '.example',
    ownerName: 'Sam',
    bufferMins: 10,
    slotStepMins: 30,
    windowDays: 14,
    cancelHours: 24,

    /* Opening hours by JS weekday (0 = Sunday). null = closed. */
    hours: {
      0: null,
      1: null,
      2: ['09:30', '17:30'],
      3: ['09:30', '17:30'],
      4: ['11:00', '20:00'],
      5: ['09:30', '17:30'],
      6: ['09:00', '17:00']
    },

    /* price and deposit in whole pounds */
    services: [
      { id: 'cut', name: 'Haircut and finish', mins: 60, price: 45, deposit: 10,
        blurb: 'Consultation, wash, cut and a blow-dry finish.',
        terms: ['haircut', 'hair cut', 'cut', 'trim', 'restyle', 'fringe', 'cut and finish', 'cut and blow dry', 'cut and blow-dry', 'womens cut', "women's cut", 'ladies cut'] },
      { id: 'blow', name: 'Blow-dry', mins: 45, price: 28, deposit: 10,
        blurb: 'Wash and blow-dry, with styling.',
        terms: ['blow-dry', 'blow dry', 'blowdry', 'blow-dry only', 'blowout', 'blow out', 'wash and dry', 'style', 'styling', 'finish only'] },
      { id: 'mens', name: "Men's cut", mins: 30, price: 25, deposit: 10,
        blurb: 'Clipper or scissor cut, neck cleaned up.',
        terms: ["men's cut", 'mens cut', "men's haircut", 'mens haircut', "gents", "gent's cut", 'short back and sides', 'clipper cut', 'skin fade', 'fade', 'boys cut', "boy's cut", 'kids cut'] },
      { id: 'beard', name: 'Beard trim', mins: 30, price: 15, deposit: 10,
        blurb: 'Shape, trim and tidy.',
        terms: ['beard', 'beard trim', 'shave', 'moustache', 'stubble'] },
      { id: 'root', name: 'Root colour', mins: 90, price: 55, deposit: 20,
        blurb: 'Regrowth covered with a single all-over shade.',
        terms: ['root colour', 'root color', 'roots', 'root tint', 'regrowth', 'colour', 'color', 'tint', 'dye', 'colouring', 'coloring', 'grey cover', 'grey coverage'] },
      { id: 'highlights', name: 'Half-head highlights', mins: 120, price: 85, deposit: 20,
        blurb: 'Foils placed around the crown and parting, toned to finish.',
        terms: ['highlights', 'highlight', 'half head', 'half-head', 'half head highlights', 'foils', 'foilayage', 'lowlights', 'streaks'] },
      { id: 'balayage', name: 'Balayage', mins: 150, price: 140, deposit: 20,
        blurb: 'Hand-painted, soft-blended colour with a gloss to finish.',
        terms: ['balayage', 'balyage', 'balayge', 'hand painted', 'hand-painted', 'ombre', 'sombre', 'baby lights', 'babylights'] },
      { id: 'gloss', name: 'Gloss and treatment', mins: 45, price: 30, deposit: 10,
        blurb: 'Shine-boosting gloss or a deep conditioning treatment.',
        terms: ['gloss', 'toner', 'toning', 'treatment', 'conditioning', 'deep conditioning', 'olaplex', 'shine'] },
      { id: 'occasion', name: 'Occasion hair', mins: 60, price: 60, deposit: 20,
        blurb: 'Up-do or styled hair for a wedding, party or photos.',
        terms: ['occasion', 'occasion hair', 'updo', 'up-do', 'up do', 'wedding', 'wedding hair', 'prom', 'party hair', 'bridal'] }
    ],

    /* workDays: JS weekdays. does: service ids. */
    stylists: [
      { id: 'mara', name: 'Mara', role: 'Colour and cutting', workDays: [2, 3, 4, 6],
        does: ['cut', 'blow', 'root', 'highlights', 'balayage', 'gloss', 'occasion'],
        bio: 'Mara looks after most of the colour book: balayage, highlights and glosses.' },
      { id: 'jonah', name: 'Jonah', role: 'Short cuts and beards', workDays: [3, 4, 5, 6],
        does: ['cut', 'blow', 'mens', 'beard', 'root', 'gloss', 'occasion'],
        bio: "Jonah does the men's cuts, beards and clean, low-fuss cuts for everyone." },
      { id: 'priya', name: 'Priya', role: 'Cutting, colour and occasion', workDays: [2, 4, 5, 6],
        does: ['cut', 'blow', 'root', 'highlights', 'balayage', 'gloss', 'occasion'],
        bio: 'Priya cuts, colours and does most of the occasion and up-do work.' }
    ],

    vouchers: [25, 50, 100],

    /* first names used for the invented seed bookings */
    seedNames: ['Ellie', 'Noor', 'Tom', 'Grace', 'Ben', 'Chloe', 'Ravi', 'Hannah', 'Luca', 'Megan', 'Josh', 'Freya', 'Aled', 'Isla', 'Kofi', 'Zoe']
  };

  /* Stripe test-mode Payment Links. All null in this wave: the page then shows an
     in-page explainer instead. Later, paste fixed https://buy.stripe.com/... strings here.
     Links are fixed strings only: the page never builds a Stripe URL from parameters. */
  var STRIPE_TEST_LINKS = {
    deposit10: null,
    deposit20: null,
    voucher25: null,
    voucher50: null,
    voucher100: null
  };

  window.SALON_DATA = DATA;
  window.STRIPE_TEST_LINKS = STRIPE_TEST_LINKS;
})();
