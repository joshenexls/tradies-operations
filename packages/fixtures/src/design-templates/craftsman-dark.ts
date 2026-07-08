import type { DesignTemplateFixture } from './types'

/**
 * Dark, heavy-serif craftsman lander. Exercises: seo-title slot, hero slots,
 * a service-card repeat with item images, about paragraphs, a gallery, a dummy
 * testimonials block (MUST be stripped — fabricated quotes, DMCC), an
 * inline-JS FAQ accordion, a contact form + tel link, and sanitizer food
 * (external analytics script + inline beacon fetch).
 */
export const craftsmanDark: DesignTemplateFixture = {
  key: 'craftsman-dark',
  name: 'Craftsman Dark',
  html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your Trusted Local Craftsman | Quality Trade Services</title>
  <style>
    :root { --ink: #14110f; --panel: #201c18; --brass: #c89b3c; --paper: #f3ede4; }
    body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background: #14110f; color: #f3ede4; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; border-bottom: 1px solid #3a332c; }
    .logo { font-size: 1.25rem; letter-spacing: 0.08em; text-transform: uppercase; }
    nav a { color: #cbbfae; margin-left: 1.25rem; text-decoration: none; }
    .btn { display: inline-block; background: #c89b3c; color: #14110f; padding: 0.75rem 1.5rem; text-decoration: none; font-weight: bold; }
    section { padding: 3rem 2rem; max-width: 64rem; margin: 0 auto; }
    .service-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
    .service-card { background: #201c18; padding: 1.25rem; }
    .service-card img { width: 100%; height: 10rem; object-fit: cover; }
    .gallery-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
    .quote-card { background: #201c18; padding: 1.5rem; margin-bottom: 1rem; }
    .faq-item .faq-a { display: none; padding: 0.5rem 0 1rem; }
    .faq-item.open .faq-a { display: block; }
    .faq-q { background: none; border: 0; color: #f3ede4; font: inherit; cursor: pointer; padding: 1rem 0; width: 100%; text-align: left; border-top: 1px solid #3a332c; }
    form label { display: block; margin: 0.75rem 0 0.25rem; }
    form input, form textarea { width: 100%; padding: 0.6rem; background: #201c18; border: 1px solid #3a332c; color: #f3ede4; }
  </style>
  <script src="https://analytics.example/t.js" async></script>
</head>
<body>
  <header>
    <div class="logo">The Workshop</div>
    <nav>
      <a href="#services">Services</a>
      <a href="#about">About</a>
      <a href="#gallery">Work</a>
      <a href="#contact">Contact</a>
    </nav>
  </header>

  <section id="hero">
    <h1 class="hero-title">Honest Craftsmanship for Your Home</h1>
    <p class="hero-sub">From small repairs to full installations, we bring careful, tidy workmanship to every job we take on.</p>
    <a class="btn hero-cta" href="#contact">Request a Quote</a>
  </section>

  <section id="services">
    <h2>What We Do</h2>
    <div class="service-grid">
      <article class="service-card">
        <img class="service-img" src="/img/service-1.jpg" alt="Workbench with hand tools">
        <h3 class="service-title">General Repairs</h3>
        <p class="service-desc">Everyday fixes done properly, with the right materials and a clean finish you will not need to think about again.</p>
      </article>
      <article class="service-card">
        <img class="service-img" src="/img/service-2.jpg" alt="Fitted kitchen interior">
        <h3 class="service-title">Installations</h3>
        <p class="service-desc">New fittings planned and installed with care, from first measure to final tidy-up, all agreed in writing first.</p>
      </article>
      <article class="service-card">
        <img class="service-img" src="/img/service-3.jpg" alt="Freshly finished room">
        <h3 class="service-title">Maintenance</h3>
        <p class="service-desc">Regular upkeep that keeps small problems small, scheduled around you and priced clearly before we start.</p>
      </article>
    </div>
  </section>

  <section id="about">
    <h2>About Us</h2>
    <p>We are a small local firm that takes pride in doing the job right the first time. Every project starts with a proper conversation, a clear written quote and a start date we stick to.</p>
    <p>You will always know who is coming to your home and what they are there to do. We keep our word, keep the site tidy and keep you informed from start to finish.</p>
  </section>

  <section id="gallery">
    <h2>Recent Work</h2>
    <div class="gallery-strip">
      <img src="/img/gallery-1.jpg" alt="Completed project photo one">
      <img src="/img/gallery-2.jpg" alt="Completed project photo two">
      <img src="/img/gallery-3.jpg" alt="Completed project photo three">
    </div>
  </section>

  <section id="testimonials">
    <h2>What Our Customers Say</h2>
    <div class="quote-card">
      <p>"Absolutely first class from start to finish. The team turned up on time and the finish is superb."</p>
      <p>— Margaret H., five stars</p>
    </div>
    <div class="quote-card">
      <p>"Brilliant service and a spotless tidy-up afterwards. Would recommend to anyone."</p>
      <p>— Dave P., five stars</p>
    </div>
  </section>

  <section id="faq">
    <h2>Frequently Asked Questions</h2>
    <div class="faq-list">
      <div class="faq-item">
        <button class="faq-q" type="button">Do you provide written quotes?</button>
        <div class="faq-a">Yes, every job gets a written quote before any work begins, so there are no surprises.</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button">How far in advance should I book?</button>
        <div class="faq-a">Get in touch and we will give you an honest lead time. Small jobs can often be fitted in sooner.</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button">Do you tidy up after the work?</button>
        <div class="faq-a">Always. We treat your home with respect and leave every work area clean before we go.</div>
      </div>
    </div>
  </section>

  <section id="contact">
    <h2>Get In Touch</h2>
    <p>Call us on <a class="phone-link" href="tel:+441134960000">0113 496 0000</a> or send a few details below.</p>
    <form id="contact-form" method="post" action="/enquiry">
      <label for="cf-name">Name</label>
      <input id="cf-name" name="name" type="text" required>
      <label for="cf-phone">Phone</label>
      <input id="cf-phone" name="phone" type="tel">
      <label for="cf-message">What needs doing?</label>
      <textarea id="cf-message" name="message" rows="4"></textarea>
      <button class="btn" type="submit">Send Enquiry</button>
    </form>
  </section>

  <footer>
    <section>
      <p>The Workshop — quality trade services for your home.</p>
    </section>
  </footer>

  <script>
    document.querySelectorAll('#faq .faq-q').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.parentElement.classList.toggle('open')
      })
    })
  </script>
  <script>fetch('https://beacon.example')</script>
</body>
</html>
`,
  componentsHtml: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Craftsman Dark — Components</title></head>
<body>
  <!-- Buttons -->
  <a class="btn" href="#">Primary action</a>
  <!-- Service card -->
  <article class="service-card">
    <img class="service-img" src="/img/service-1.jpg" alt="Sample service image">
    <h3 class="service-title">Card title</h3>
    <p class="service-desc">Card body copy sits here, two lines at most.</p>
  </article>
  <!-- Quote card: decorative only, never populated with real review text -->
  <div class="quote-card"><p>Pull-quote styling reference.</p></div>
</body>
</html>
`,
  annotations: [
    { op: 'slot', selector: 'title', id: 'seo-title', kind: 'seo-title' },
    { op: 'slot', selector: 'header .logo', id: 'brand-name', kind: 'business-name' },
    { op: 'slot', selector: 'footer p', id: 'footer-line', kind: 'paragraph' },
    { op: 'slot', selector: '#hero .hero-title', id: 'hero-headline', kind: 'headline' },
    { op: 'slot', selector: '#hero .hero-sub', id: 'hero-sub', kind: 'subheadline' },
    { op: 'slot', selector: '#hero .hero-cta', id: 'hero-cta', kind: 'cta-label' },
    {
      op: 'repeat',
      selector: '#services .service-grid',
      id: 'services',
      itemSelector: '.service-card',
      minItems: 3,
      maxItems: 6,
      itemSlots: [
        { selector: '.service-title', id: 'service-title', kind: 'short-label' },
        { selector: '.service-desc', id: 'service-desc', kind: 'paragraph' },
      ],
      itemImages: [{ selector: '.service-img', id: 'service-img' }],
    },
    { op: 'slot', selector: '#about p:nth-of-type(1)', id: 'about-intro', kind: 'paragraph' },
    { op: 'slot', selector: '#about p:nth-of-type(2)', id: 'about-detail', kind: 'paragraph' },
    { op: 'image', selector: '#gallery .gallery-strip img:nth-of-type(1)', id: 'gallery-1' },
    { op: 'image', selector: '#gallery .gallery-strip img:nth-of-type(2)', id: 'gallery-2' },
    { op: 'image', selector: '#gallery .gallery-strip img:nth-of-type(3)', id: 'gallery-3' },
    { op: 'strip', selector: '#testimonials', id: 'testimonials', reason: 'testimonials' },
    {
      op: 'repeat',
      selector: '#faq .faq-list',
      id: 'faq',
      itemSelector: '.faq-item',
      minItems: 2,
      maxItems: 5,
      itemSlots: [
        { selector: '.faq-q', id: 'faq-question', kind: 'short-label' },
        { selector: '.faq-a', id: 'faq-answer', kind: 'paragraph' },
      ],
      itemImages: [],
    },
    { op: 'form', selector: '#contact-form' },
    { op: 'phone-link', selector: '#contact .phone-link' },
  ],
  expectedManifest: {
    manifestVersion: 1,
    slots: [
      { id: 'seo-title', kind: 'seo-title', maxLength: 70, minLength: 1, required: true },
      { id: 'brand-name', kind: 'business-name', maxLength: 100, minLength: 1, required: true },
      { id: 'footer-line', kind: 'paragraph', maxLength: 100, minLength: 1, required: true },
      { id: 'hero-headline', kind: 'headline', maxLength: 80, minLength: 1, required: true },
      { id: 'hero-sub', kind: 'subheadline', maxLength: 180, minLength: 1, required: true },
      { id: 'hero-cta', kind: 'cta-label', maxLength: 32, minLength: 1, required: true },
      { id: 'about-intro', kind: 'paragraph', maxLength: 420, minLength: 1, required: true },
      { id: 'about-detail', kind: 'paragraph', maxLength: 320, minLength: 1, required: true },
    ],
    repeats: [
      {
        id: 'services',
        minItems: 3,
        maxItems: 6,
        itemSlots: [
          { id: 'service-title', kind: 'short-label', maxLength: 48, minLength: 1, required: true },
          { id: 'service-desc', kind: 'paragraph', maxLength: 240, minLength: 1, required: true },
        ],
        itemImages: [{ id: 'service-img' }],
      },
      {
        id: 'faq',
        minItems: 2,
        maxItems: 5,
        itemSlots: [
          { id: 'faq-question', kind: 'short-label', maxLength: 90, minLength: 1, required: true },
          { id: 'faq-answer', kind: 'paragraph', maxLength: 300, minLength: 1, required: true },
        ],
        itemImages: [],
      },
    ],
    images: [{ id: 'gallery-1' }, { id: 'gallery-2' }, { id: 'gallery-3' }],
    form: { present: true },
    strippedRegions: [{ id: 'testimonials', reason: 'testimonials' }],
  },
  expectedSlotIds: [
    'seo-title',
    'brand-name',
    'footer-line',
    'hero-headline',
    'hero-sub',
    'hero-cta',
    'about-intro',
    'about-detail',
  ],
  expectedRepeatIds: ['services', 'faq'],
  expectedStrippedReasons: ['testimonials'],
}
