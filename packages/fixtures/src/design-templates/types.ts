import type { SlotKind, SlotManifest } from '@tradies/site-spec'

/**
 * Structural mirror of the annotation-op union owned by @tradies/html-templates
 * (annotationOpSchema). Deliberately NOT imported from there — fixtures must
 * stay dependency-free of the ingest engine. These are the plain objects a
 * template-annotation LLM run would emit; schema validation of real candidates
 * happens in the ops-app action using html-templates.
 */
export type AnnotationItemSlot = { selector: string; id: string; kind: SlotKind }

export type AnnotationOp =
  | { op: 'slot'; selector: string; id: string; kind: SlotKind }
  | {
      op: 'repeat'
      selector: string
      id: string
      itemSelector: string
      minItems: number
      maxItems: number
      itemSlots: AnnotationItemSlot[]
      itemImages?: { selector: string; id: string }[]
    }
  | { op: 'image'; selector: string; id: string }
  | { op: 'strip'; selector: string; id: string; reason: 'testimonials' | 'reviews' | 'other' }
  | { op: 'form'; selector: string }
  | { op: 'phone-link'; selector: string }

/**
 * One hand-written HTML design system: the generic lander an operator would
 * upload, the annotation ops a good ingest run would emit for it, and the
 * slot manifest those ops derive to. `expectedManifest` is hand-written (and
 * schema-parsed in tests) so downstream packages can exercise the content-doc
 * pipeline without running the annotation engine.
 */
export type DesignTemplateFixture = {
  key: string
  name: string
  /** The generic lander HTML (self-contained, realistic UK placeholder copy). */
  html: string
  /** Optional small components/style reference file. */
  componentsHtml?: string
  /** The "LLM would emit this" op list — plain objects, see AnnotationOp. */
  annotations: AnnotationOp[]
  /** The SlotManifest the annotations derive to, hand-written for tests. */
  expectedManifest: SlotManifest
  expectedSlotIds: string[]
  expectedRepeatIds: string[]
  expectedStrippedReasons: string[]
}
