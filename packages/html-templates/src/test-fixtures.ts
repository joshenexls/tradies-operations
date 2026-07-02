import type { AnnotationOpInput } from './annotate'

/**
 * Shared realistic mini-lander for the test suite: hero h1 + sub + phone link,
 * three service cards, a dummy testimonials block (must be stripped), a FAQ,
 * a contact form with a keyless maps embed, an inline JS accordion and an
 * inline style block. Self-contained, like a real uploaded design system.
 */
export const MINI_LANDER = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Apex Plumbing — Emergency Plumbers</title>
<meta name="description" content="Fast local plumbing repairs and boiler servicing.">
<style>
  body { margin: 0; font-family: 'Inter', Arial, sans-serif; color: #1f2937; background: #ffffff; }
  h1, h2 { font-family: 'Fraunces', Georgia, serif; color: #0f172a; }
  .hero { background: #0ea5e9; color: #ffffff; padding: 4rem 2rem; }
  .card { border: 1px solid #e2e8f0; padding: 1rem; }
  .btn { background: #f97316; color: #ffffff; }
</style>
</head>
<body class="page" data-theme="light">
<header class="hero">
  <h1 id="headline">Emergency Plumbers in Leeds</h1>
  <p class="sub">Round-the-clock callouts across the city, fixed right the first time.</p>
  <a class="phone" href="tel:01130000000">0113 000 0000</a>
  <a class="btn" href="#contact">Request a callout</a>
  <img class="hero-img" src="" alt="Plumber at work">
</header>
<section class="services">
  <h2>Our services</h2>
  <div class="grid">
    <div class="card"><h3>Boiler repairs</h3><p>Diagnosis and repair for all major boiler brands.</p><img src="" alt=""></div>
    <div class="card"><h3>Leak detection</h3><p>Non-invasive tracing to find leaks fast.</p><img src="" alt=""></div>
    <div class="card"><h3>Bathroom fitting</h3><p>Full installs from design to finish.</p><img src="" alt=""></div>
  </div>
</section>
<section class="testimonials">
  <h2>What our customers say</h2>
  <blockquote>★★★★★ "Amazing work from start to finish, highly recommended" — Dave</blockquote>
</section>
<section class="faq">
  <h2>FAQs</h2>
  <details><summary>Do you charge a callout fee?</summary><p>We quote before any work begins.</p></details>
  <details><summary>Which areas do you cover?</summary><p>Leeds and the surrounding villages.</p></details>
</section>
<section class="contact" id="contact">
  <h2>Get in touch</h2>
  <form class="lead" action="https://formspree.io/f/abc" method="POST">
    <input type="text" placeholder="Your name">
    <input type="tel" placeholder="Phone">
    <textarea placeholder="How can we help?"></textarea>
    <button type="submit">Send</button>
  </form>
  <iframe class="map" src="https://www.google.com/maps?q=Leeds&output=embed" loading="lazy"></iframe>
</section>
<script>
  document.querySelectorAll('.faq details').forEach(function (el) {
    el.addEventListener('toggle', function () { el.classList.toggle('open') })
  })
</script>
</body>
</html>`

/** One op of every kind, targeting the mini-lander. */
export const MINI_LANDER_OPS: AnnotationOpInput[] = [
  { op: 'slot', selector: 'title', id: 'seo-title', kind: 'seo-title' },
  {
    op: 'slot',
    selector: 'meta[name="description"]',
    id: 'seo-description',
    kind: 'seo-description',
  },
  { op: 'slot', selector: '#headline', id: 'hero-headline', kind: 'headline' },
  { op: 'slot', selector: '.hero .sub', id: 'hero-sub', kind: 'subheadline' },
  { op: 'slot', selector: '.hero .btn', id: 'hero-cta', kind: 'cta-label' },
  { op: 'slot', selector: 'a.phone', id: 'phone', kind: 'phone' },
  { op: 'slot', selector: '.services h2', id: 'services-heading', kind: 'headline' },
  { op: 'slot', selector: '.contact h2', id: 'contact-heading', kind: 'headline' },
  { op: 'phone-link', selector: 'a.phone' },
  { op: 'image', selector: '.hero-img', id: 'hero-image' },
  {
    op: 'repeat',
    selector: '.services .grid',
    id: 'services',
    itemSelector: '.card',
    minItems: 3,
    maxItems: 6,
    itemSlots: [
      { selector: 'h3', id: 'title', kind: 'short-label' },
      { selector: 'p', id: 'description', kind: 'paragraph' },
    ],
    itemImages: [{ selector: 'img', id: 'photo' }],
  },
  { op: 'strip', selector: '.testimonials', id: 'testimonials', reason: 'testimonials' },
  { op: 'form', selector: 'form.lead' },
]
