// License/trial presentation + gating helpers.
//
// `status` is stored on the row but the TIME-derived value is what the
// consoles show and gate on: 'expiring' inside the final 14 days, 'expired'
// past ends_at. seats NULL = unlimited (typical for trials).
//
// End-of-trial behavior hook: when effectiveStatus === 'expired', Phase 1
// only FLAGS it in both consoles. Convert / downgrade / data-return flows
// plug in here later by branching on that same value.

export interface LicenseRow {
  type: 'trial' | 'paid'
  seats: number | null
  starts_at: string
  ends_at: string | null
  status: string
}

export interface LicenseSummary {
  type: 'trial' | 'paid'
  seats: number | null
  seatsUsed: number
  startsAt: string
  endsAt: string | null
  /** Time-derived: 'active' | 'expiring' (≤14 days left) | 'expired' */
  effectiveStatus: 'active' | 'expiring' | 'expired'
  daysLeft: number | null
}

export function effectiveStatus(endsAt: string | null): LicenseSummary['effectiveStatus'] {
  if (!endsAt) return 'active'
  const remaining = new Date(endsAt).getTime() - Date.now()
  if (remaining < 0) return 'expired'
  if (remaining < 14 * 24 * 60 * 60 * 1000) return 'expiring'
  return 'active'
}

export function licenseSummary(row: LicenseRow | null, seatsUsed: number): LicenseSummary | null {
  if (!row) return null
  return {
    type: row.type,
    seats: row.seats,
    seatsUsed,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    effectiveStatus: effectiveStatus(row.ends_at),
    daysLeft: row.ends_at
      ? Math.max(0, Math.ceil((new Date(row.ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : null,
  }
}
