/* @jsxRuntime automatic @jsxImportSource react */
import type { ReactElement, ReactNode } from 'react'
import type { Section } from '@tradies/site-spec'

type ServicesSection = Extract<Section, { kind: 'services' }>
export type IconName = NonNullable<ServicesSection['items'][number]['icon']>

// Hand-drawn 24px stroke glyphs — no icon-font or runtime dependency.
const GLYPHS: Record<IconName, ReactNode> = {
  wrench: (
    <path d="M20.7 6.4a5.4 5.4 0 0 1-7.3 6.5l-6.6 6.6a2.1 2.1 0 0 1-3-3l6.6-6.6a5.4 5.4 0 0 1 6.5-7.3L13.6 6l.4 4 4 .4 2.7-4Z" />
  ),
  droplet: (
    <path d="M12 21.5a6.5 6.5 0 0 0 6.5-6.5c0-2-1-3.8-2.8-5.4C13.9 8 12.6 5.9 12 3.5c-.6 2.4-1.9 4.5-3.7 6.1C6.5 11.2 5.5 13 5.5 15A6.5 6.5 0 0 0 12 21.5Z" />
  ),
  flame: (
    <path d="M12 21.5a6.5 6.5 0 0 0 6.5-6.5c0-2-1-3.8-2.8-5.4-1.8-1.6-3.1-3.7-3.7-6.1-.5 2.1-1.5 3.5-3 5-.7.7-1.2-.6-1.4-1.8C6.3 8.2 5.5 10.4 5.5 13A6.5 6.5 0 0 0 12 21.5Z" />
  ),
  bolt: <path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12l1-8Z" />,
  plug: (
    <>
      <path d="M9 7.5V2.5M15 7.5V2.5" />
      <path d="M6 7.5h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6v-3Z" />
      <path d="M12 16.5v5" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9.5 18.5h5M10.5 21.5h3" />
      <path d="M12 2.5a6 6 0 0 0-3.5 10.9c.9.7 1.5 1.6 1.7 2.6h3.6c.2-1 .8-1.9 1.7-2.6A6 6 0 0 0 12 2.5Z" />
    </>
  ),
  house: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V21h13V9.5" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  hammer: (
    <>
      <path d="M13.5 4.5 19.5 10.5 16.5 13.5 10.5 7.5Z" />
      <path d="m10.5 7.5-7 7 3 3 7-7" />
      <path d="M16.5 4.5 19.5 7.5" />
    </>
  ),
  shield: <path d="M12 21.5s7.5-3.6 7.5-9.5V5L12 2.5 4.5 5v7c0 5.9 7.5 9.5 7.5 9.5Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  thermometer: (
    <>
      <path d="M10 13.8V5a2 2 0 1 1 4 0v8.8a4.5 4.5 0 1 1-4 0Z" />
      <path d="M12 18v-6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
}

type IconProps = { className?: string }

function Svg({ children, className }: { children: ReactNode; className?: string }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? 'h-5 w-5'}
    >
      {children}
    </svg>
  )
}

export function Icon({ name, className }: IconProps & { name: IconName }): ReactElement {
  return <Svg className={className}>{GLYPHS[name]}</Svg>
}

export function PhoneIcon({ className }: IconProps): ReactElement {
  return (
    <Svg className={className}>
      <path d="M21 16.5v3a1.9 1.9 0 0 1-2.1 1.9 18.9 18.9 0 0 1-8.2-2.9 18.6 18.6 0 0 1-5.7-5.7A18.9 18.9 0 0 1 2.1 4.6 1.9 1.9 0 0 1 4 2.5h3a1.9 1.9 0 0 1 1.9 1.6c.1.9.3 1.8.7 2.7a1.9 1.9 0 0 1-.4 2L7.9 10a15.2 15.2 0 0 0 5.7 5.7l1.2-1.2a1.9 1.9 0 0 1 2-.4c.9.3 1.8.6 2.7.7a1.9 1.9 0 0 1 1.6 1.9Z" />
    </Svg>
  )
}

export function CheckIcon({ className }: IconProps): ReactElement {
  return (
    <Svg className={className}>
      <path d="M20 6.5 9 17.5l-5-5" />
    </Svg>
  )
}

export function PlusIcon({ className }: IconProps): ReactElement {
  return (
    <Svg className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}
