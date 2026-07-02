import { TRADES } from '@tradies/site-spec'
import { UploadForm } from './upload-form'

export const dynamic = 'force-dynamic'

export default function UploadTemplatePage() {
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Upload design system</h1>
        <p className="text-sm text-zinc-500">
          Paste or upload a self-contained HTML lander. Ingest sanitizes it, locates the fillable
          slots, strips any dummy testimonials, and stores it as a draft for review.
        </p>
      </div>
      <UploadForm trades={[...TRADES]} />
    </div>
  )
}
