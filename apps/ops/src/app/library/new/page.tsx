import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { presetFormOptions } from '../form-options'
import { PresetForm } from '../preset-form'

export const dynamic = 'force-dynamic'

export default function NewPresetPage() {
  const options = presetFormOptions()
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-lg font-semibold tracking-tight">New design system</h1>
      <Card>
        <CardHeader title="System settings" />
        <CardBody>
          <PresetForm
            initial={{
              id: null,
              styleKey: '',
              name: '',
              trade: '',
              templateId: options.templateIds[0] ?? 'modern',
              description: '',
              paletteId: options.palettes[0]?.id ?? 'navy-brass',
              fontPairId: options.fontPairs[0]?.id ?? 'archivo-inter',
              radius: 'soft',
              tone: 'professional',
              imageryPool: '',
              preferredSections: [],
              variantWeights: {},
              status: 'draft',
            }}
            options={options}
          />
        </CardBody>
      </Card>
      <p className="text-sm text-zinc-400">
        Save the system to see a live sample render against a fixture business.
      </p>
    </div>
  )
}
