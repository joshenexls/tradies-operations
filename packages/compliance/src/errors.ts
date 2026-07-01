export type ComplianceErrorCode =
  | 'not_corporate'
  | 'entity_unknown'
  | 'entity_check_stale'
  | 'suppressed'
  | 'tps_screening_stale'
  | 'tps_not_screened'

/**
 * Thrown by every compliance gate. Callers must let these propagate (or log
 * and drop the send) — never catch-and-send. The code is stable API for
 * routing: e.g. 'entity_unknown' → queue a Companies House re-check,
 * 'suppressed' → hard stop forever.
 */
export class ComplianceError extends Error {
  readonly code: ComplianceErrorCode

  constructor(code: ComplianceErrorCode, message: string) {
    super(message)
    this.name = 'ComplianceError'
    this.code = code
  }
}
