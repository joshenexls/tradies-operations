import { describe, expect, it } from 'vitest'
import { LIA_TEMPLATE, buildArt14Notice } from './notices'

describe('buildArt14Notice', () => {
  const notice = buildArt14Notice({
    controllerName: 'Enex Software Ltd',
    contactEmail: 'privacy@enexsl.com',
    sources: ['Companies House', 'Google Business Profile', "the business's own website"],
  })

  it('covers the Article 14 essentials', () => {
    expect(notice).toContain('Enex Software Ltd')
    expect(notice).toContain('privacy@enexsl.com')
    expect(notice.toLowerCase()).toContain('legitimate interests')
    expect(notice).toContain('Article 6(1)(f)')
    expect(notice.toLowerCase()).toContain('how long we keep it')
    expect(notice.toLowerCase()).toContain('object')
    expect(notice.toLowerCase()).toContain('erasure')
    expect(notice).toContain('ico.org.uk')
  })

  it('lists every data source', () => {
    expect(notice).toContain('- Companies House')
    expect(notice).toContain('- Google Business Profile')
    expect(notice).toContain("- the business's own website")
  })
})

describe('LIA_TEMPLATE', () => {
  it('contains the three-part test', () => {
    expect(LIA_TEMPLATE).toContain('Purpose test')
    expect(LIA_TEMPLATE).toContain('Necessity test')
    expect(LIA_TEMPLATE).toContain('Balancing test')
    expect(LIA_TEMPLATE.toLowerCase()).toContain('outcome')
  })
})
