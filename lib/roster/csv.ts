import type { RosterData, RosterClass, RosterStudent, RosterEnrollment, RosterRowError } from './types'

// CSV adapter: maps a district roster spreadsheet into the OneRoster shape.
//
// Expected header (case/spacing/underscore-insensitive, order-free):
//   class_name, teacher_email, first_name, last_name [, email] [, username] [, school]
//
// One row per (student, class). The same student in two classes = two rows;
// they are deduplicated by their stable sourcedId. Idempotency comes from
// SYNTHESIZED sourcedIds built from natural keys, so re-uploading the same
// (or an extended) sheet matches the rows already imported:
//   class:   csv "<school>|<class_name>"  (lowercased, trimmed)
//   student: email when present, else username, else "<class>|first.last"

export const CSV_TEMPLATE =
  'class_name,teacher_email,first_name,last_name,email,username,school\n' +
  'Period 1 - STEM,teacher@district.org,Ada,Lovelace,,ada.lovelace,Springfield Middle\n' +
  'Period 1 - STEM,teacher@district.org,Grace,Hopper,grace@student.district.org,,Springfield Middle\n'

// Teacher self-serve flavor: no teacher_email column — every class belongs to
// the uploading teacher (csvToRoster is called with their email as default).
export const CSV_TEMPLATE_TEACHER =
  'class_name,first_name,last_name,email,username\n' +
  'Period 1 - STEM,Ada,Lovelace,,ada.lovelace\n' +
  'Period 1 - STEM,Grace,Hopper,grace@student.district.org,\n'

// ─── Minimal RFC-4180-ish parser (quotes, escaped quotes, CRLF) ──────────────

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const pushField = () => { row.push(field); field = '' }
  const pushRow = () => { pushField(); rows.push(row); row = [] }

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      pushField()
    } else if (c === '\n') {
      pushRow()
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) pushRow()
  // Drop fully empty trailing rows.
  return rows.filter(r => r.some(cell => cell.trim() !== ''))
}

// ─── Header resolution ───────────────────────────────────────────────────────

const HEADER_ALIASES: Record<string, string[]> = {
  className: ['class_name', 'class', 'classname', 'course', 'section'],
  teacherEmail: ['teacher_email', 'teacheremail', 'teacher'],
  firstName: ['first_name', 'firstname', 'first', 'given_name', 'givenname'],
  lastName: ['last_name', 'lastname', 'last', 'family_name', 'familyname', 'surname'],
  email: ['email', 'student_email', 'studentemail'],
  username: ['username', 'user_name', 'student_username'],
  school: ['school', 'school_name', 'schoolname', 'building'],
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_-]+/g, '_').trim()
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[a-z0-9._-]{3,20}$/

// ─── CSV → RosterData ────────────────────────────────────────────────────────

export interface CsvOptions {
  /** Teacher self-serve: classes without a teacher_email cell belong to this
   *  email, and the teacher_email column itself becomes optional. */
  defaultTeacherEmail?: string
}

export function csvToRoster(text: string, opts: CsvOptions = {}): RosterData {
  const parseErrors: RosterRowError[] = []
  const rows = parseCsv(text)
  if (rows.length === 0) {
    return { provider: 'csv', classes: [], students: [], enrollments: [], parseErrors: [{ message: 'The file is empty.' }] }
  }

  const headerCells = rows[0].map(normalizeHeader)
  const col: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {}
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = headerCells.findIndex(h => aliases.includes(h))
    if (idx >= 0) col[key as keyof typeof HEADER_ALIASES] = idx
  }
  const required = opts.defaultTeacherEmail
    ? (['className', 'firstName', 'lastName'] as const)
    : (['className', 'teacherEmail', 'firstName', 'lastName'] as const)
  for (const key of required) {
    if (col[key] === undefined) {
      parseErrors.push({ row: 1, message: `Missing required column "${HEADER_ALIASES[key][0]}". Found: ${rows[0].join(', ')}` })
    }
  }
  if (parseErrors.length > 0) {
    return { provider: 'csv', classes: [], students: [], enrollments: [], parseErrors }
  }

  const classes = new Map<string, RosterClass>()
  const students = new Map<string, RosterStudent>()
  const enrollments: RosterEnrollment[] = []
  const seenEnrollment = new Set<string>()

  const cell = (r: string[], key: keyof typeof HEADER_ALIASES) => {
    const idx = col[key]
    return idx === undefined ? '' : (r[idx] ?? '').trim()
  }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 1
    const className = cell(r, 'className')
    const teacherEmail = (cell(r, 'teacherEmail') || opts.defaultTeacherEmail || '').toLowerCase()
    const firstName = cell(r, 'firstName')
    const lastName = cell(r, 'lastName')
    const email = cell(r, 'email').toLowerCase()
    const username = cell(r, 'username').toLowerCase()
    const school = cell(r, 'school')

    if (!className || !teacherEmail || !firstName || !lastName) {
      parseErrors.push({ row: rowNum, message: 'Missing class_name, teacher_email, first_name, or last_name.' })
      continue
    }
    if (!EMAIL_RE.test(teacherEmail)) {
      parseErrors.push({ row: rowNum, message: `"${teacherEmail}" is not a valid teacher email.` })
      continue
    }
    if (email && !EMAIL_RE.test(email)) {
      parseErrors.push({ row: rowNum, message: `"${email}" is not a valid student email.` })
      continue
    }
    if (username && !USERNAME_RE.test(username)) {
      parseErrors.push({ row: rowNum, message: `Username "${username}" must be 3–20 characters: lowercase letters, numbers, dot, dash, or underscore.` })
      continue
    }

    const classKey = `${school.toLowerCase()}|${className.toLowerCase()}`
    if (!classes.has(classKey)) {
      classes.set(classKey, {
        sourcedId: classKey,
        title: className,
        teacherEmail,
        schoolName: school || undefined,
      })
    } else if (classes.get(classKey)!.teacherEmail !== teacherEmail) {
      parseErrors.push({ row: rowNum, message: `Class "${className}" is listed with two different teacher emails.` })
      continue
    }

    const studentKey = email || username || `${classKey}|${firstName.toLowerCase()}.${lastName.toLowerCase()}`
    if (!students.has(studentKey)) {
      students.set(studentKey, {
        sourcedId: studentKey,
        givenName: firstName,
        familyName: lastName,
        email: email || undefined,
        username: username || undefined,
        sourceRow: rowNum,
      })
    }

    const enrollKey = `${classKey}→${studentKey}`
    if (!seenEnrollment.has(enrollKey)) {
      seenEnrollment.add(enrollKey)
      enrollments.push({ classSourcedId: classKey, studentSourcedId: studentKey })
    }
  }

  return {
    provider: 'csv',
    classes: [...classes.values()],
    students: [...students.values()],
    enrollments,
    parseErrors,
  }
}
