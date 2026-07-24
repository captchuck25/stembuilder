import { describe, it, expect } from 'vitest'
import { parseCsv, csvToRoster, CSV_TEMPLATE } from '@/lib/roster/csv'

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas-in-fields, and CRLF', () => {
    const rows = parseCsv('a,"b,c","say ""hi""",d\r\ne,f,g,h\n')
    expect(rows).toEqual([['a', 'b,c', 'say "hi"', 'd'], ['e', 'f', 'g', 'h']])
  })

  it('drops fully empty trailing rows', () => {
    expect(parseCsv('a,b\n , \n\n')).toEqual([['a', 'b']])
  })
})

describe('csvToRoster', () => {
  const HEADER = 'class_name,teacher_email,first_name,last_name,email,username,school\n'

  it('parses the shipped template without errors', () => {
    const data = csvToRoster(CSV_TEMPLATE)
    expect(data.parseErrors).toEqual([])
    expect(data.classes).toHaveLength(1)
    expect(data.students).toHaveLength(2)
    expect(data.enrollments).toHaveLength(2)
  })

  it('rejects a file missing required columns, naming the missing one', () => {
    const data = csvToRoster('first_name,last_name\nAda,Lovelace\n')
    expect(data.parseErrors[0].message).toContain('class_name')
    expect(data.classes).toHaveLength(0)
  })

  it('accepts header aliases and any column order', () => {
    const data = csvToRoster('Teacher Email,Last Name,First Name,Class\nt@d.org,Lovelace,Ada,P1\n')
    expect(data.parseErrors).toEqual([])
    expect(data.classes[0].title).toBe('P1')
    expect(data.students[0].givenName).toBe('Ada')
  })

  it('dedupes a student across two classes into one account + two enrollments', () => {
    const data = csvToRoster(HEADER +
      'P1,t@d.org,Ada,Lovelace,ada@s.org,,\n' +
      'P2,t@d.org,Ada,Lovelace,ada@s.org,,\n')
    expect(data.students).toHaveLength(1)
    expect(data.classes).toHaveLength(2)
    expect(data.enrollments).toHaveLength(2)
  })

  it('sourcedIds are stable across re-uploads (idempotency anchor)', () => {
    const csv = HEADER + 'P1,t@d.org,Ada,Lovelace,,ada.l,Springfield\n'
    const a = csvToRoster(csv)
    const b = csvToRoster(csv)
    expect(a.classes[0].sourcedId).toBe(b.classes[0].sourcedId)
    expect(a.students[0].sourcedId).toBe(b.students[0].sourcedId)
    // email/username anchor the student id; class id folds in school + name
    expect(a.students[0].sourcedId).toBe('ada.l')
    expect(a.classes[0].sourcedId).toBe('springfield|p1')
  })

  it('same class name in two schools = two distinct classes', () => {
    const data = csvToRoster(HEADER +
      'P1,t@d.org,Ada,Lovelace,,,North Middle\n' +
      'P1,t@d.org,Grace,Hopper,,,South Middle\n')
    expect(data.classes).toHaveLength(2)
  })

  it('flags a class listed under two different teachers', () => {
    const data = csvToRoster(HEADER +
      'P1,t1@d.org,Ada,Lovelace,,,\n' +
      'P1,t2@d.org,Grace,Hopper,,,\n')
    expect(data.parseErrors.some(e => e.message.includes('two different teacher'))).toBe(true)
  })

  it('reports row-level errors with 1-based row numbers, keeps good rows', () => {
    const data = csvToRoster(HEADER +
      'P1,not-an-email,Ada,Lovelace,,,\n' +      // row 2 bad teacher email
      'P1,t@d.org,Grace,Hopper,bad-email,,\n' +  // row 3 bad student email
      'P1,t@d.org,Alan,Turing,,UPPER!,\n' +      // row 4 bad username
      'P1,t@d.org,Joan,Clarke,,,\n')             // row 5 good
    expect(data.parseErrors.map(e => e.row)).toEqual([2, 3, 4])
    expect(data.students).toHaveLength(1)
    expect(data.students[0].givenName).toBe('Joan')
    expect(data.students[0].sourceRow).toBe(5)
  })

  it('students without email or username get a name-scoped sourcedId', () => {
    const data = csvToRoster(HEADER + 'P1,t@d.org,Joan,Clarke,,,\n')
    expect(data.students[0].sourcedId).toBe('|p1|joan.clarke')
    expect(data.students[0].email).toBeUndefined()
    expect(data.students[0].username).toBeUndefined()
  })
})
