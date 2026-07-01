import { z } from 'zod'

export const TRADES = ['plumber', 'electrician', 'roofer', 'builder', 'heating', 'other'] as const

export const tradeSchema = z.enum(TRADES)
export type Trade = z.infer<typeof tradeSchema>

export const TRADE_LABELS: Record<Trade, string> = {
  plumber: 'Plumbing',
  electrician: 'Electrical',
  roofer: 'Roofing',
  builder: 'Building',
  heating: 'Heating & Gas',
  other: 'Trade services',
}

/** schema.org LocalBusiness subtype per trade. */
export const TRADE_SCHEMA_ORG_TYPE: Record<Trade, string> = {
  plumber: 'Plumber',
  electrician: 'Electrician',
  roofer: 'RoofingContractor',
  builder: 'GeneralContractor',
  heating: 'HVACBusiness',
  other: 'HomeAndConstructionBusiness',
}
