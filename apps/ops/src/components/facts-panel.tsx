import type { ReactNode } from 'react'
import { ACCREDITATION_LABELS, type BusinessFacts } from '@tradies/site-spec'

function SourceChip({ source }: { source: string }) {
  return (
    <span className="ml-1.5 rounded bg-zinc-100 px-1 py-px font-mono text-[10px] text-zinc-500">
      {source}
    </span>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-0.5 text-sm text-zinc-700">{children}</div>
    </div>
  )
}

/** The evidenced facts sheet a spec was generated from — every value carries its source. */
export function FactsPanel({ facts }: { facts: BusinessFacts }) {
  return (
    <div className="space-y-2.5">
      <Row label="Services">
        {facts.services.length > 0 ? (
          <ul className="space-y-0.5">
            {facts.services.map((service) => (
              <li key={service.value}>
                {service.value}
                <SourceChip source={service.source} />
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-zinc-400">none recorded — generic filler copy only</span>
        )}
      </Row>
      <Row label="Areas">
        <div className="flex flex-wrap gap-1">
          {facts.serviceAreas.map((area) => (
            <span key={area} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">
              {area}
            </span>
          ))}
        </div>
      </Row>
      <Row label="Accreditations">
        {facts.accreditations.length > 0 ? (
          <ul className="space-y-0.5">
            {facts.accreditations.map((accreditation) => (
              <li key={accreditation.id}>
                {ACCREDITATION_LABELS[accreditation.id]}
                <SourceChip source={accreditation.source} />
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-zinc-400">none — no badges will render</span>
        )}
      </Row>
      {facts.foundedYear ? (
        <Row label="Founded">
          {facts.foundedYear.value}
          <SourceChip source={facts.foundedYear.source} />
        </Row>
      ) : null}
      {facts.claims.length > 0 ? (
        <Row label="Claims">
          <ul className="space-y-0.5">
            {facts.claims.map((claim) => (
              <li key={claim.value}>
                {claim.value}
                <SourceChip source={claim.source} />
              </li>
            ))}
          </ul>
        </Row>
      ) : null}
    </div>
  )
}
