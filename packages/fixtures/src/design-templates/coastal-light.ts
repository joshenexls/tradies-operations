import type { DesignTemplateFixture } from './types'

/**
 * Airy, light split-hero lander. Exercises: a business-name slot in the
 * header, an seo-description meta slot, a split hero with a standalone image,
 * a services list repeat (no item images), an area-chips repeat of kind
 * 'area', a Google Fonts <link> (sanitizer food) and a contact banner form.
 * No dummy social proof — strippedRegions is empty here.
 */
export const coastalLight: DesignTemplateFixture = {
  key: 'coastal-light',
  name: 'Coastal Light',
  html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Friendly local trade services with clear prices and tidy work. Get in touch today for a free quote.">
  <title>Fresh Local Trade Services</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; font-family: 'Nunito', system-ui, sans-serif; background: #fbfdfe; color: #17323d; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; }
    .brand-name { font-weight: 700; font-size: 1.2rem; color: #0d7a8a; }
    nav a { color: #17323d; margin-left: 1rem; text-decoration: none; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: center; }
    .cta { display: inline-block; background: #0d7a8a; color: #fff; padding: 0.75rem 1.5rem; border-radius: 999px; text-decoration: none; }
    section { padding: 3rem 2rem; max-width: 62rem; margin: 0 auto; }
    .service-list { list-style: none; margin: 0; padding: 0; }
    .service-item { border-bottom: 1px solid #d7e6ea; padding: 1.25rem 0; }
    .area-chips { list-style: none; display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0; padding: 0; }
    .area-chip { background: #e3f1f4; border-radius: 999px; padding: 0.4rem 1rem; }
    .contact-banner { background: #0d7a8a; color: #fff; border-radius: 1rem; }
    .contact-banner form { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .contact-banner input { flex: 1 1 12rem; padding: 0.6rem; border-radius: 0.5rem; border: 0; }
  </style>
</head>
<body>
  <header>
    <span class="brand-name">Seaboard Trade Co.</span>
    <nav>
      <a href="#services">Services</a>
      <a href="#areas">Areas</a>
      <a href="#contact">Contact</a>
    </nav>
  </header>

  <section id="hero" class="split">
    <div>
      <h1 class="hero-headline">Bright, Honest Help for Your Home</h1>
      <p class="hero-lede">Clear prices, friendly faces and work you can rely on, from a local team that turns up when it says it will.</p>
      <a class="cta hero-cta" href="#contact">Get a Free Quote</a>
    </div>
    <img class="hero-image" src="/img/hero.jpg" alt="Sunlit coastal home exterior">
  </section>

  <section id="services">
    <h2>Services</h2>
    <ul class="service-list">
      <li class="service-item">
        <h3 class="service-name">Repairs and Call-outs</h3>
        <p class="service-blurb">Quick, tidy fixes for the everyday problems that will not wait, with an honest price agreed before we start.</p>
      </li>
      <li class="service-item">
        <h3 class="service-name">Planned Installations</h3>
        <p class="service-blurb">Bigger jobs planned around your routine, with a clear written quote and a finish we are proud to leave behind.</p>
      </li>
      <li class="service-item">
        <h3 class="service-name">Home Maintenance</h3>
        <p class="service-blurb">Seasonal checks and upkeep that keep your home in good order and catch small issues before they grow.</p>
      </li>
    </ul>
  </section>

  <section id="areas">
    <h2>Where We Work</h2>
    <ul class="area-chips">
      <li class="area-chip"><span class="area-name">Seaton</span></li>
      <li class="area-chip"><span class="area-name">Harbourside</span></li>
      <li class="area-chip"><span class="area-name">Westcliff</span></li>
      <li class="area-chip"><span class="area-name">Bayview</span></li>
    </ul>
  </section>

  <section id="contact" class="contact-banner">
    <h2>Tell Us What Needs Doing</h2>
    <p>Leave a few details and we will come back to you with a clear, friendly quote.</p>
    <form method="post" action="/enquiry">
      <label for="cb-name" hidden>Name</label>
      <input id="cb-name" name="name" type="text" placeholder="Your name" required>
      <label for="cb-phone" hidden>Phone</label>
      <input id="cb-phone" name="phone" type="tel" placeholder="Phone number">
      <button class="cta" type="submit">Send</button>
    </form>
    <iframe class="map" src="https://maps.google.com/maps?q=placeholder&output=embed" title="Map"></iframe>
    <a class="reviews-cta" href="https://example.com">See our reviews on Google</a>
  </section>

  <footer>
    <section>
      <p>Seaboard Trade Co. — local trade services, done with a smile.</p>
    </section>
  </footer>
</body>
</html>
`,
  annotations: [
    { op: 'slot', selector: 'header .brand-name', id: 'business-name', kind: 'business-name' },
    {
      op: 'slot',
      selector: 'meta[name="description"]',
      id: 'seo-description',
      kind: 'seo-description',
    },
    { op: 'slot', selector: '#hero .hero-headline', id: 'hero-headline', kind: 'headline' },
    { op: 'slot', selector: '#hero .hero-lede', id: 'hero-lede', kind: 'subheadline' },
    { op: 'slot', selector: '#hero .hero-cta', id: 'hero-cta', kind: 'cta-label' },
    { op: 'image', selector: '#hero .hero-image', id: 'hero-image' },
    {
      op: 'repeat',
      selector: '#services .service-list',
      id: 'services',
      itemSelector: '.service-item',
      minItems: 3,
      maxItems: 6,
      itemSlots: [
        { selector: '.service-name', id: 'service-name', kind: 'short-label' },
        { selector: '.service-blurb', id: 'service-blurb', kind: 'paragraph' },
      ],
      itemImages: [],
    },
    {
      op: 'repeat',
      selector: '#areas .area-chips',
      id: 'areas',
      itemSelector: '.area-chip',
      minItems: 2,
      maxItems: 8,
      itemSlots: [{ selector: '.area-name', id: 'area-name', kind: 'area' }],
      itemImages: [],
    },
    { op: 'slot', selector: '#contact h2', id: 'contact-heading', kind: 'short-label' },
    { op: 'slot', selector: 'footer p', id: 'footer-line', kind: 'paragraph' },
    { op: 'form', selector: '#contact form' },
    // location surfaces filled in code at render (map query + real reviews link):
    { op: 'map', selector: '.map' },
    { op: 'reviews-link', selector: '.reviews-cta' },
  ],
  expectedManifest: {
    manifestVersion: 1,
    slots: [
      { id: 'business-name', kind: 'business-name', maxLength: 100, minLength: 1, required: true },
      {
        id: 'seo-description',
        kind: 'seo-description',
        maxLength: 160,
        minLength: 1,
        required: true,
      },
      { id: 'hero-headline', kind: 'headline', maxLength: 80, minLength: 1, required: true },
      { id: 'hero-lede', kind: 'subheadline', maxLength: 180, minLength: 1, required: true },
      { id: 'hero-cta', kind: 'cta-label', maxLength: 32, minLength: 1, required: true },
      { id: 'contact-heading', kind: 'short-label', maxLength: 40, minLength: 1, required: true },
      { id: 'footer-line', kind: 'paragraph', maxLength: 100, minLength: 1, required: true },
    ],
    repeats: [
      {
        id: 'services',
        minItems: 3,
        maxItems: 6,
        itemSlots: [
          { id: 'service-name', kind: 'short-label', maxLength: 48, minLength: 1, required: true },
          { id: 'service-blurb', kind: 'paragraph', maxLength: 240, minLength: 1, required: true },
        ],
        itemImages: [],
      },
      {
        id: 'areas',
        minItems: 2,
        maxItems: 8,
        itemSlots: [{ id: 'area-name', kind: 'area', maxLength: 32, minLength: 1, required: true }],
        itemImages: [],
      },
    ],
    images: [{ id: 'hero-image' }],
    form: { present: true },
    strippedRegions: [],
  },
  expectedSlotIds: [
    'business-name',
    'seo-description',
    'hero-headline',
    'hero-lede',
    'hero-cta',
    'contact-heading',
    'footer-line',
  ],
  expectedRepeatIds: ['services', 'areas'],
  expectedStrippedReasons: [],
}
