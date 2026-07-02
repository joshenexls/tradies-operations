import type { DesignTemplateFixture } from './types'

/**
 * Stark monochrome one-pager. Exercises: a minimal slot set (no gallery, no
 * images at all), a dummy reviews carousel that MUST be stripped (reason
 * 'reviews') while its inline JS — which references the carousel — is left in
 * place, deliberately modelling the broken-JS risk after strip; a phone link;
 * a 4-item FAQ repeat; and a contact form.
 */
export const boldMono: DesignTemplateFixture = {
  key: 'bold-mono',
  name: 'Bold Mono',
  html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Straightforward Trade Services</title>
  <style>
    body { margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; background: #ffffff; color: #111111; }
    header { padding: 1rem 2rem; border-bottom: 4px solid #111; display: flex; justify-content: space-between; }
    .wordmark { font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; }
    section { padding: 3rem 2rem; max-width: 56rem; margin: 0 auto; }
    h1 { font-size: 3rem; font-weight: 900; text-transform: uppercase; line-height: 1.05; margin: 0 0 1rem; }
    .cta { display: inline-block; background: #111; color: #fff; padding: 0.9rem 2rem; text-decoration: none; font-weight: 700; }
    .carousel-track { display: flex; overflow: hidden; gap: 1rem; }
    .review-slide { min-width: 100%; border: 2px solid #111; padding: 1.5rem; }
    .faq-list dt { font-weight: 700; border-top: 2px solid #111; padding: 1rem 0 0.25rem; }
    .faq-list dd { margin: 0 0 1rem; }
    form input, form textarea { width: 100%; border: 2px solid #111; padding: 0.6rem; margin-top: 0.5rem; }
    footer { border-top: 4px solid #111; padding: 1.5rem 2rem; }
  </style>
</head>
<body>
  <header>
    <span class="wordmark">Blunt &amp; Sons</span>
    <a href="tel:+441614960000" class="tel-link">0161 496 0000</a>
  </header>

  <section id="hero">
    <h1 class="headline">Work Done Properly. No Fuss.</h1>
    <p class="tagline">One local firm for the jobs your home actually needs — quoted up front, finished on time, tidied up after.</p>
    <a class="cta" href="#contact">Get a Price</a>
  </section>

  <section id="reviews">
    <h2>What People Say</h2>
    <div class="carousel-track">
      <div class="review-slide">
        <p>"Rated five stars by everyone we know. Best trades firm in the county, hands down."</p>
        <p>— A Happy Customer</p>
      </div>
      <div class="review-slide">
        <p>"Fantastic from start to finish, 5/5. Would not use anyone else."</p>
        <p>— Another Customer</p>
      </div>
    </div>
    <button type="button" class="carousel-next">Next review</button>
  </section>

  <section id="faq">
    <h2>Questions, Answered</h2>
    <dl class="faq-list">
      <div class="faq-item">
        <dt class="faq-q">How do quotes work?</dt>
        <dd class="faq-a">You tell us the job, we look at it, you get one clear price in writing. That price is the price.</dd>
      </div>
      <div class="faq-item">
        <dt class="faq-q">When can you start?</dt>
        <dd class="faq-a">We will give you an honest start date when we quote, and we stick to it.</dd>
      </div>
      <div class="faq-item">
        <dt class="faq-q">Do you clean up?</dt>
        <dd class="faq-a">Yes. The job is not finished until the mess is gone.</dd>
      </div>
      <div class="faq-item">
        <dt class="faq-q">Which jobs do you take?</dt>
        <dd class="faq-a">If it is on this page, we do it. If it is not, ask anyway — we will point you the right way.</dd>
      </div>
    </dl>
  </section>

  <section id="contact">
    <h2>Get a Price</h2>
    <form id="quote-form" method="post" action="/enquiry">
      <label for="qf-name">Name</label>
      <input id="qf-name" name="name" type="text" required>
      <label for="qf-phone">Phone</label>
      <input id="qf-phone" name="phone" type="tel" required>
      <label for="qf-job">The job</label>
      <textarea id="qf-job" name="job" rows="3"></textarea>
      <button class="cta" type="submit">Send</button>
    </form>
  </section>

  <footer>
    <p>Blunt &amp; Sons — straightforward trade services.</p>
  </footer>

  <script>
    // NOTE: references the #reviews carousel; if that section is stripped this
    // script is orphaned — deliberate fixture food for the JS sanitizer.
    var track = document.querySelector('#reviews .carousel-track')
    var next = document.querySelector('#reviews .carousel-next')
    var offset = 0
    next.addEventListener('click', function () {
      offset = (offset + 1) % track.children.length
      track.style.transform = 'translateX(-' + offset * 100 + '%)'
    })
  </script>
</body>
</html>
`,
  annotations: [
    { op: 'slot', selector: 'header .wordmark', id: 'brand-name', kind: 'business-name' },
    { op: 'slot', selector: 'footer p', id: 'footer-line', kind: 'paragraph' },
    { op: 'slot', selector: '#hero .headline', id: 'hero-headline', kind: 'headline' },
    { op: 'slot', selector: '#hero .tagline', id: 'hero-tagline', kind: 'subheadline' },
    { op: 'slot', selector: '#hero .cta', id: 'hero-cta', kind: 'cta-label' },
    { op: 'strip', selector: '#reviews', id: 'reviews', reason: 'reviews' },
    {
      op: 'repeat',
      selector: '#faq .faq-list',
      id: 'faq',
      itemSelector: '.faq-item',
      minItems: 2,
      maxItems: 6,
      itemSlots: [
        { selector: '.faq-q', id: 'faq-question', kind: 'short-label' },
        { selector: '.faq-a', id: 'faq-answer', kind: 'paragraph' },
      ],
      itemImages: [],
    },
    { op: 'form', selector: '#quote-form' },
    { op: 'phone-link', selector: 'header .tel-link' },
  ],
  expectedManifest: {
    manifestVersion: 1,
    slots: [
      { id: 'brand-name', kind: 'business-name', maxLength: 100, minLength: 1, required: true },
      { id: 'footer-line', kind: 'paragraph', maxLength: 100, minLength: 1, required: true },
      { id: 'hero-headline', kind: 'headline', maxLength: 60, minLength: 1, required: true },
      { id: 'hero-tagline', kind: 'subheadline', maxLength: 180, minLength: 1, required: true },
      { id: 'hero-cta', kind: 'cta-label', maxLength: 24, minLength: 1, required: true },
    ],
    repeats: [
      {
        id: 'faq',
        minItems: 2,
        maxItems: 6,
        itemSlots: [
          { id: 'faq-question', kind: 'short-label', maxLength: 90, minLength: 1, required: true },
          { id: 'faq-answer', kind: 'paragraph', maxLength: 300, minLength: 1, required: true },
        ],
        itemImages: [],
      },
    ],
    images: [],
    form: { present: true },
    strippedRegions: [{ id: 'reviews', reason: 'reviews' }],
  },
  expectedSlotIds: ['brand-name', 'footer-line', 'hero-headline', 'hero-tagline', 'hero-cta'],
  expectedRepeatIds: ['faq'],
  expectedStrippedReasons: ['reviews'],
}
