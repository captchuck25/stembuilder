import { describe, it, expect } from 'vitest'
import { mapGoogleToRoster, courseTitle, type GoogleCourseRoster } from '@/lib/roster/google'

const course = (id: string, name: string, section?: string): GoogleCourseRoster['course'] =>
  ({ id, name, section, ownerId: `owner-${id}` })

const student = (userId: string, given?: string, family?: string, email?: string, fullName?: string) => ({
  userId,
  profile: { name: { givenName: given, familyName: family, fullName }, emailAddress: email },
})

describe('mapGoogleToRoster', () => {
  it('maps courses + rosters into the shared OneRoster shape', () => {
    const data = mapGoogleToRoster([{
      course: course('c1', 'STEM', 'Period 1'),
      ownerEmail: 'Teacher@District.org',
      students: [student('u1', 'Ada', 'Lovelace', 'ADA@s.org')],
    }])
    expect(data.provider).toBe('google_classroom')
    expect(data.classes).toEqual([{ sourcedId: 'c1', title: 'STEM — Period 1', teacherEmail: 'teacher@district.org' }])
    expect(data.students).toEqual([{ sourcedId: 'u1', givenName: 'Ada', familyName: 'Lovelace', email: 'ada@s.org' }])
    expect(data.enrollments).toEqual([{ classSourcedId: 'c1', studentSourcedId: 'u1' }])
    expect(data.parseErrors).toEqual([])
  })

  it('uses Google ids as sourcedIds — stable across re-syncs', () => {
    const rosters = [{ course: course('c1', 'STEM'), ownerEmail: 't@d.org', students: [student('u1', 'A', 'B')] }]
    expect(mapGoogleToRoster(rosters).students[0].sourcedId)
      .toBe(mapGoogleToRoster(rosters).students[0].sourcedId)
  })

  it('dedupes a student enrolled in two courses', () => {
    const s = student('u1', 'Ada', 'Lovelace', 'ada@s.org')
    const data = mapGoogleToRoster([
      { course: course('c1', 'STEM'), ownerEmail: 't@d.org', students: [s] },
      { course: course('c2', 'Math'), ownerEmail: 't@d.org', students: [s] },
    ])
    expect(data.students).toHaveLength(1)
    expect(data.enrollments).toHaveLength(2)
  })

  it('errors the whole course when the owner email is unreadable, keeps others', () => {
    const data = mapGoogleToRoster([
      { course: course('c1', 'STEM'), ownerEmail: null, students: [student('u1', 'A', 'B')] },
      { course: course('c2', 'Math'), ownerEmail: 't@d.org', students: [student('u2', 'C', 'D')] },
    ])
    expect(data.classes.map(c => c.sourcedId)).toEqual(['c2'])
    expect(data.parseErrors).toHaveLength(1)
    expect(data.parseErrors[0].message).toContain('classroom.profile.emails')
  })

  it('splits fullName when given/family are missing; students without email get username accounts downstream', () => {
    const data = mapGoogleToRoster([{
      course: course('c1', 'STEM'),
      ownerEmail: 't@d.org',
      students: [student('u1', undefined, undefined, undefined, 'Grace Brewster Hopper')],
    }])
    expect(data.students[0].givenName).toBe('Grace')
    expect(data.students[0].familyName).toBe('Brewster Hopper')
    expect(data.students[0].email).toBeUndefined()
  })

  it('skips (and reports) a student with no name at all', () => {
    const data = mapGoogleToRoster([{
      course: course('c1', 'STEM'),
      ownerEmail: 't@d.org',
      students: [{ userId: 'u9', profile: {} }],
    }])
    expect(data.students).toHaveLength(0)
    expect(data.parseErrors).toHaveLength(1)
  })

  it('courseTitle folds in the section only when present', () => {
    expect(courseTitle(course('c', 'STEM'))).toBe('STEM')
    expect(courseTitle(course('c', 'STEM', 'P2'))).toBe('STEM — P2')
  })
})
