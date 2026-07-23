import { describe, it, expect } from 'vitest'
import { roleRank, roleAtLeast, isAdmin, isAnyAdmin, roleLabel } from '@/lib/roles'

describe('role ladder', () => {
  it('ranks the hierarchy student < teacher < district_admin < admin', () => {
    expect(roleRank('student')).toBeLessThan(roleRank('teacher'))
    expect(roleRank('teacher')).toBeLessThan(roleRank('district_admin'))
    expect(roleRank('district_admin')).toBeLessThan(roleRank('admin'))
  })

  it('unknown/missing roles rank below everything', () => {
    expect(roleRank(null)).toBeLessThan(roleRank('student'))
    expect(roleRank(undefined)).toBeLessThan(roleRank('student'))
    expect(roleRank('super_admin')).toBeLessThan(roleRank('student')) // not a real stored value
  })

  it('isAdmin admits only the platform tier', () => {
    expect(isAdmin('admin')).toBe(true)
    expect(isAdmin('district_admin')).toBe(false)
    expect(isAdmin('teacher')).toBe(false)
    expect(isAdmin('student')).toBe(false)
    expect(isAdmin(null)).toBe(false)
  })

  it('isAnyAdmin admits both admin tiers and nothing below', () => {
    expect(isAnyAdmin('admin')).toBe(true)
    expect(isAnyAdmin('district_admin')).toBe(true)
    expect(isAnyAdmin('teacher')).toBe(false)
    expect(isAnyAdmin('student')).toBe(false)
    expect(isAnyAdmin(null)).toBe(false)
  })

  it('roleAtLeast never passes for an unknown minimum', () => {
    expect(roleAtLeast('admin', 'nonexistent' as never)).toBe(false)
  })

  it('labels admin as Super Admin in the UI', () => {
    expect(roleLabel('admin')).toBe('Super Admin')
    expect(roleLabel('district_admin')).toBe('District Admin')
  })
})
