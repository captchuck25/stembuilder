import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// requireAdmin() is the single gate in front of every /api/admin route.
// These tests prove: (a) non-admins get 403/401, (b) role comes from the DB
// row, not the session cookie, (c) unverified-email admins are refused,
// (d) a district_admin with no district is refused.

const authMock = vi.fn()
vi.mock('@/auth', () => ({ auth: (...args: unknown[]) => authMock(...args) }))

let profileRow: Record<string, unknown> | null = null
vi.mock('@/lib/db.server', () => ({
  adminDb: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            maybeSingle: async () => ({ data: profileRow, error: null }),
          }),
        }),
      }),
    }),
  }),
}))

const tenantDbMock = vi.fn(async () => ({ mocked: 'tenant-client' }))
vi.mock('@/lib/tenant-db.server', () => ({
  tenantDb: (...args: unknown[]) => tenantDbMock(...args),
}))
vi.mock('@/lib/audit.server', () => ({ writeAudit: vi.fn() }))

import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'

function sessionFor(id: string | null) {
  return id ? { user: { id } } : null
}

beforeEach(() => {
  authMock.mockReset()
  tenantDbMock.mockClear()
  profileRow = null
})

describe('requireAdmin', () => {
  it('401s when not signed in', async () => {
    authMock.mockResolvedValue(null)
    const ctx = await requireAdmin()
    expect(isGuardError(ctx)).toBe(true)
    expect((ctx as NextResponse).status).toBe(401)
  })

  it.each(['student', 'teacher'])('403s a %s even with a live session', async role => {
    authMock.mockResolvedValue(sessionFor('u1'))
    profileRow = { id: 'u1', role, district_id: null, email_verified_at: '2026-01-01', google_id: null }
    const ctx = await requireAdmin()
    expect(isGuardError(ctx)).toBe(true)
    expect((ctx as NextResponse).status).toBe(403)
  })

  it('403s when the profile row is gone (role never comes from the cookie)', async () => {
    authMock.mockResolvedValue(sessionFor('u1'))
    profileRow = null // e.g. account soft-deleted after the session was issued
    const ctx = await requireAdmin()
    expect(isGuardError(ctx)).toBe(true)
    expect((ctx as NextResponse).status).toBe(403)
  })

  it('403s an admin with no verified email and no Google identity', async () => {
    authMock.mockResolvedValue(sessionFor('u1'))
    profileRow = { id: 'u1', role: 'admin', district_id: null, email_verified_at: null, google_id: null }
    const ctx = await requireAdmin()
    expect(isGuardError(ctx)).toBe(true)
    expect((ctx as NextResponse).status).toBe(403)
  })

  it('403s a district_admin with no district assigned', async () => {
    authMock.mockResolvedValue(sessionFor('u1'))
    profileRow = { id: 'u1', role: 'district_admin', district_id: null, email_verified_at: '2026-01-01', google_id: null }
    const ctx = await requireAdmin()
    expect(isGuardError(ctx)).toBe(true)
    expect((ctx as NextResponse).status).toBe(403)
  })

  it('403s a district_admin on platform-only surfaces', async () => {
    authMock.mockResolvedValue(sessionFor('u1'))
    profileRow = { id: 'u1', role: 'district_admin', district_id: 'd1', email_verified_at: '2026-01-01', google_id: null }
    const ctx = await requireAdmin({ platform: true })
    expect(isGuardError(ctx)).toBe(true)
    expect((ctx as NextResponse).status).toBe(403)
  })

  it('passes a district_admin with scope, minting a tenant client with THEIR district', async () => {
    authMock.mockResolvedValue(sessionFor('u1'))
    profileRow = { id: 'u1', role: 'district_admin', district_id: 'd1', email_verified_at: '2026-01-01', google_id: null }
    const ctx = await requireAdmin()
    expect(isGuardError(ctx)).toBe(false)
    if (!isGuardError(ctx)) {
      expect(ctx.role).toBe('district_admin')
      expect(ctx.districtId).toBe('d1')
    }
    expect(tenantDbMock).toHaveBeenCalledWith({ userId: 'u1', role: 'district_admin', districtId: 'd1' })
  })

  it('passes a platform admin (Google-verified email), with null district scope', async () => {
    authMock.mockResolvedValue(sessionFor('u2'))
    profileRow = { id: 'u2', role: 'admin', district_id: null, email_verified_at: null, google_id: 'g-123' }
    const ctx = await requireAdmin({ platform: true })
    expect(isGuardError(ctx)).toBe(false)
    expect(tenantDbMock).toHaveBeenCalledWith({ userId: 'u2', role: 'admin', districtId: null })
  })
})
