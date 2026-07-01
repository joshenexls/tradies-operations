/**
 * The only outreach channels this platform will ever represent. There is
 * intentionally NO SMS channel: unsolicited SMS to UK individual subscribers
 * is unlawful under PECR reg 22, and screening cannot reliably make a mobile
 * number safe — so this codebase refuses to model cold SMS at the type level.
 */
export const OUTREACH_CHANNELS = ['email_cold', 'email_solicited', 'postcard'] as const
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number]

/**
 * PECR's email rules turn on subscriber type: sole traders and ordinary
 * partnerships are "individual subscribers" even though they are businesses.
 * The ICO default for an undetermined entity is individual, so 'unknown'
 * must never pass a cold-email gate.
 */
export const ENTITY_TYPES = ['corporate', 'individual', 'unknown'] as const
export type EntityType = (typeof ENTITY_TYPES)[number]
