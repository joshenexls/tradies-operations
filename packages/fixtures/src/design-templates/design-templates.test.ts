import { slotManifestSchema } from '@tradies/site-spec'
import { describe, expect, it } from 'vitest'
import { allDesignTemplateFixtures, getDesignTemplateFixture } from './index'

describe('design template fixtures', () => {
  it('ships exactly three fixtures with unique keys', () => {
    expect(allDesignTemplateFixtures).toHaveLength(3)
    const keys = allDesignTemplateFixtures.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(['craftsman-dark', 'coastal-light', 'bold-mono'])
  })

  it('getDesignTemplateFixture resolves by key and throws on unknown keys', () => {
    expect(getDesignTemplateFixture('coastal-light').name).toBe('Coastal Light')
    expect(() => getDesignTemplateFixture('nope')).toThrow(/Unknown design template/)
  })

  for (const fixture of allDesignTemplateFixtures) {
    describe(fixture.key, () => {
      it('is a realistic lander: has an h1 and a form, and stays 80-200 lines', () => {
        expect(fixture.html).toMatch(/<h1[\s>]/)
        expect(fixture.html).toMatch(/<form[\s>]/)
        const lines = fixture.html.split('\n').length
        expect(lines).toBeGreaterThanOrEqual(80)
        expect(lines).toBeLessThanOrEqual(200)
      })

      it('has unique annotation ids', () => {
        const ids: string[] = []
        for (const op of fixture.annotations) {
          if ('id' in op) ids.push(op.id)
          if (op.op === 'repeat') {
            for (const slot of op.itemSlots) ids.push(slot.id)
            for (const img of op.itemImages ?? []) ids.push(img.id)
          }
        }
        expect(ids.length).toBeGreaterThan(0)
        expect(new Set(ids).size).toBe(ids.length)
      })

      it('annotations line up with the expected slot/repeat ids', () => {
        const slotIds = fixture.annotations.filter((op) => op.op === 'slot').map((op) => op.id)
        const repeatIds = fixture.annotations.filter((op) => op.op === 'repeat').map((op) => op.id)
        expect(slotIds).toEqual(fixture.expectedSlotIds)
        expect(repeatIds).toEqual(fixture.expectedRepeatIds)
      })

      it('declares the promised strip ops', () => {
        const stripReasons = fixture.annotations
          .filter((op) => op.op === 'strip')
          .map((op) => op.reason)
        expect(stripReasons).toEqual(fixture.expectedStrippedReasons)
      })

      it('annotates exactly one contact form', () => {
        expect(fixture.annotations.filter((op) => op.op === 'form')).toHaveLength(1)
      })

      it('expectedManifest parses through slotManifestSchema and mirrors the annotations', () => {
        const parsed = slotManifestSchema.parse(fixture.expectedManifest)
        expect(parsed.slots.map((s) => s.id)).toEqual(fixture.expectedSlotIds)
        expect(parsed.repeats.map((r) => r.id)).toEqual(fixture.expectedRepeatIds)
        expect(parsed.strippedRegions.map((r) => r.reason)).toEqual(fixture.expectedStrippedReasons)
        expect(parsed.form.present).toBe(true)
      })
    })
  }

  it('craftsman-dark keeps its dummy testimonials and sanitizer food in the html', () => {
    const fixture = getDesignTemplateFixture('craftsman-dark')
    expect(fixture.html).toContain('id="testimonials"')
    expect(fixture.html).toContain('https://analytics.example/t.js')
    expect(fixture.html).toContain("fetch('https://beacon.example')")
  })

  it('bold-mono leaves the carousel JS in place while stripping #reviews', () => {
    const fixture = getDesignTemplateFixture('bold-mono')
    expect(fixture.html).toContain('#reviews .carousel-track')
    const strip = fixture.annotations.find((op) => op.op === 'strip')
    expect(strip).toMatchObject({ selector: '#reviews', reason: 'reviews' })
  })

  it('coastal-light keeps the Google Fonts link (sanitizer food)', () => {
    const fixture = getDesignTemplateFixture('coastal-light')
    expect(fixture.html).toContain('fonts.googleapis.com')
  })
})
