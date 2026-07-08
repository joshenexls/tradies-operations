import { boldMono } from './bold-mono'
import { coastalLight } from './coastal-light'
import { craftsmanDark } from './craftsman-dark'
import type { DesignTemplateFixture } from './types'

export * from './types'
export { craftsmanDark, coastalLight, boldMono }

export const allDesignTemplateFixtures: DesignTemplateFixture[] = [
  craftsmanDark,
  coastalLight,
  boldMono,
]

export function getDesignTemplateFixture(key: string): DesignTemplateFixture {
  const fixture = allDesignTemplateFixtures.find((f) => f.key === key)
  if (!fixture) throw new Error(`Unknown design template fixture: ${key}`)
  return fixture
}
