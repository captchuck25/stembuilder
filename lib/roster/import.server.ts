import bcrypt from 'bcryptjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateTempPassword } from '@/lib/reset.server'
import { generateJoinCode, buildDefaultLocks } from '@/lib/class-defaults.server'
import { roleAtLeast } from '@/lib/roles'
import type {
  RosterData, RosterClass, RosterStudent,
  RosterResult, RosterCredential, RosterImportSummary,
} from './types'

// The provider-agnostic roster importer. Takes an OneRoster-shaped payload
// (from ANY adapter — CSV today, Google Classroom next) and applies it to one
// district, idempotently:
//
//   match precedence  class:   (roster_provider, roster_external_id)
//                     student: roster link → email → username
//   re-runs           matched rows are linked, never duplicated or clobbered
//   atomicity         profile + first enrollment via the create_student_account
//                     RPC (migration 0009); org/roster columns set right after,
//                     and a re-run heals any partial state via the email/
//                     username match fallbacks
//   account_origin    every created student is 'rostered' (school consent —
//                     no age gate, matching the COPPA model from 0009)
//
// Runs on the SERVICE ROLE (RPC + multi-table writes) — the caller MUST have
// verified the actor's district scope first and MUST audit the run.
//
// dryRun: full validation pass with zero writes; every result says what a
// real run would do.

export interface ApplyRosterArgs {
  db: SupabaseClient            // service-role client
  districtId: string
  /** Fallback school for rows without a school column (optional). */
  defaultSchoolId?: string | null
  data: RosterData
  dryRun: boolean
}

const BATCH = 500

export async function applyRoster(args: ApplyRosterArgs): Promise<RosterImportSummary> {
  const { db, districtId, data, dryRun } = args
  const results: RosterResult[] = []
  const credentials: RosterCredential[] = []
  const counts = {
    classesCreated: 0, classesLinked: 0,
    studentsCreated: 0, studentsLinked: 0,
    enrollmentsCreated: 0, enrollmentsExisting: 0,
    errors: 0,
  }
  const fail = (kind: RosterResult['kind'], key: string, label: string, message: string, row?: number) => {
    counts.errors++
    results.push({ kind, key, label, action: 'error', message, row })
  }

  // ─── 1. Resolve teachers (must already exist in this district) ─────────────
  const teacherEmails = [...new Set(data.classes.map(c => c.teacherEmail))]
  const teacherByEmail = new Map<string, { id: string }>()
  if (teacherEmails.length > 0) {
    const { data: teachers } = await db.from('profiles')
      .select('id, email, role')
      .in('email', teacherEmails)
      .eq('district_id', districtId)
      .is('deleted_at', null)
    for (const t of teachers ?? []) {
      if (t.email && roleAtLeast(t.role, 'teacher')) teacherByEmail.set(t.email.toLowerCase(), { id: t.id })
    }
  }

  // ─── 2. Resolve/create schools by name ─────────────────────────────────────
  const { data: schoolRows } = await db.from('schools')
    .select('id, name').eq('district_id', districtId).is('deleted_at', null)
  const schoolByName = new Map((schoolRows ?? []).map(s => [s.name.toLowerCase(), s.id as string]))

  const wantedSchools = [...new Set(data.classes.map(c => c.schoolName?.trim()).filter(Boolean))] as string[]
  for (const name of wantedSchools) {
    if (schoolByName.has(name.toLowerCase())) continue
    if (dryRun) {
      schoolByName.set(name.toLowerCase(), `dry-run-school:${name.toLowerCase()}`)
      results.push({ kind: 'class', key: `school:${name}`, label: name, action: 'create', message: 'New school will be created' })
      continue
    }
    const { data: created, error } = await db.from('schools')
      .insert({ district_id: districtId, name }).select('id').single()
    if (error) { fail('class', `school:${name}`, name, `Could not create school: ${error.message}`); continue }
    schoolByName.set(name.toLowerCase(), created.id)
    results.push({ kind: 'class', key: `school:${name}`, label: name, action: 'create', message: 'School created' })
  }
  const schoolIdFor = (c: RosterClass): string | null =>
    (c.schoolName && schoolByName.get(c.schoolName.toLowerCase())) || args.defaultSchoolId || null

  // ─── 3. Classes: link by roster id, else create ────────────────────────────
  const classIdBySourcedId = new Map<string, string>()
  const classTitleBySourcedId = new Map<string, string>()
  const classSourcedIds = data.classes.map(c => c.sourcedId)
  if (classSourcedIds.length > 0) {
    const { data: existing } = await db.from('classes')
      .select('id, roster_external_id')
      .eq('roster_provider', data.provider)
      .eq('district_id', districtId)
      .in('roster_external_id', classSourcedIds)
      .is('deleted_at', null)
    for (const c of existing ?? []) classIdBySourcedId.set(c.roster_external_id, c.id)
  }

  for (const c of data.classes) {
    classTitleBySourcedId.set(c.sourcedId, c.title)
    const teacher = teacherByEmail.get(c.teacherEmail)
    if (!teacher) {
      fail('class', c.sourcedId, c.title,
        `No teacher account with email ${c.teacherEmail} in this district — add the teacher first (Teachers tab), then re-upload.`)
      classIdBySourcedId.delete(c.sourcedId) // block enrollments into an unowned class
      continue
    }
    if (classIdBySourcedId.has(c.sourcedId)) {
      counts.classesLinked++
      results.push({ kind: 'class', key: c.sourcedId, label: c.title, action: 'link', message: 'Already imported — matched existing class' })
      continue
    }
    if (dryRun) {
      counts.classesCreated++
      classIdBySourcedId.set(c.sourcedId, `dry-run-class:${c.sourcedId}`)
      results.push({ kind: 'class', key: c.sourcedId, label: c.title, action: 'create' })
      continue
    }
    const { data: created, error } = await db.from('classes').insert({
      teacher_id: teacher.id,
      name: c.title,
      join_code: generateJoinCode(),
      district_id: districtId,
      school_id: schoolIdFor(c),
      roster_provider: data.provider,
      roster_external_id: c.sourcedId,
    }).select('id').single()
    if (error) { fail('class', c.sourcedId, c.title, `Could not create class: ${error.message}`); continue }
    classIdBySourcedId.set(c.sourcedId, created.id)
    counts.classesCreated++
    results.push({ kind: 'class', key: c.sourcedId, label: c.title, action: 'create' })
    // Same default locks as teacher-created classes; non-fatal on failure.
    const locks = buildDefaultLocks(created.id)
    const { error: lockError } = await db.from('lesson_locks').insert(locks)
    if (lockError) console.error('[roster] failed to seed locks for class', created.id, lockError.message)
  }

  // ─── 4. Students: link by roster id → email → username, else create ────────
  // First enrollment per student (used for the atomic create RPC).
  const firstClassForStudent = new Map<string, string>()
  for (const e of data.enrollments) {
    if (!firstClassForStudent.has(e.studentSourcedId)) firstClassForStudent.set(e.studentSourcedId, e.classSourcedId)
  }

  const studentIdBySourcedId = new Map<string, string>()
  const bySourced = new Map<string, { id: string }>()
  const byEmail = new Map<string, { id: string; district_id: string | null; role: string }>()
  const byUsername = new Map<string, { id: string; district_id: string | null; role: string }>()

  const sourcedIds = data.students.map(s => s.sourcedId)
  for (let i = 0; i < sourcedIds.length; i += BATCH) {
    const { data: rows } = await db.from('profiles')
      .select('id, roster_external_id')
      .eq('roster_provider', data.provider)
      .in('roster_external_id', sourcedIds.slice(i, i + BATCH))
      .is('deleted_at', null)
    for (const r of rows ?? []) bySourced.set(r.roster_external_id, { id: r.id })
  }
  const emails = data.students.map(s => s.email).filter(Boolean) as string[]
  for (let i = 0; i < emails.length; i += BATCH) {
    const { data: rows } = await db.from('profiles')
      .select('id, email, district_id, role')
      .in('email', emails.slice(i, i + BATCH))
      .is('deleted_at', null)
    for (const r of rows ?? []) if (r.email) byEmail.set(r.email.toLowerCase(), r)
  }
  const usernames = data.students.map(s => s.username).filter(Boolean) as string[]
  for (let i = 0; i < usernames.length; i += BATCH) {
    const { data: rows } = await db.from('profiles')
      .select('id, username, district_id, role')
      .in('username', usernames.slice(i, i + BATCH))
      .is('deleted_at', null)
    for (const r of rows ?? []) if (r.username) byUsername.set(r.username, r)
  }

  for (const s of data.students) {
    const label = `${s.givenName} ${s.familyName}`
    const linked = bySourced.get(s.sourcedId)
      ?? (s.email ? byEmail.get(s.email) : undefined)
      ?? (s.username ? byUsername.get(s.username) : undefined)

    if (linked) {
      // Never adopt an account that belongs to another district, and never
      // convert a teacher/admin account into a rostered student.
      const full = linked as { id: string; district_id?: string | null; role?: string }
      if (full.district_id && full.district_id !== districtId) {
        fail('student', s.sourcedId, label, 'An account with this email/username belongs to another district.', s.sourceRow)
        continue
      }
      if (full.role && full.role !== 'student') {
        fail('student', s.sourcedId, label, `An existing ${full.role} account matches this email/username.`, s.sourceRow)
        continue
      }
      studentIdBySourcedId.set(s.sourcedId, linked.id)
      counts.studentsLinked++
      results.push({ kind: 'student', key: s.sourcedId, label, action: 'link', message: 'Matched existing account', row: s.sourceRow })
      if (!dryRun) {
        // Heal partial imports + adopt solo accounts into the district.
        await db.from('profiles').update({
          district_id: districtId,
          roster_provider: data.provider,
          roster_external_id: s.sourcedId,
        }).eq('id', linked.id)
      }
      continue
    }

    const firstClassSourcedId = firstClassForStudent.get(s.sourcedId)
    const firstClassId = firstClassSourcedId ? classIdBySourcedId.get(firstClassSourcedId) : undefined
    if (!firstClassId) {
      fail('student', s.sourcedId, label, 'No valid class for this student (its class row failed above).', s.sourceRow)
      continue
    }

    if (dryRun) {
      counts.studentsCreated++
      studentIdBySourcedId.set(s.sourcedId, `dry-run-student:${s.sourcedId}`)
      results.push({ kind: 'student', key: s.sourcedId, label, action: 'create', row: s.sourceRow })
      continue
    }

    const tempPassword = generateTempPassword()
    const hash = await bcrypt.hash(tempPassword, 12)
    let username = s.email ? null : (s.username ?? generateUsername(s))
    let createdId: string | null = null
    for (let attempt = 0; attempt < 3 && !createdId; attempt++) {
      const { data: id, error } = await db.rpc('create_student_account', {
        p_name: label,
        p_email: s.email ?? null,
        p_username: username,
        p_password_hash: hash,
        p_google_id: null,
        p_join_code: null,
        p_class_id: firstClassId,
        p_origin: 'rostered',
      })
      if (!error) { createdId = id as string; break }
      if (error.message.includes('identifier_taken') && !s.email && !s.username) {
        username = generateUsername(s) // collision on a generated name — reroll
        continue
      }
      fail('student', s.sourcedId, label,
        error.message.includes('identifier_taken')
          ? `The ${s.email ? 'email' : 'username'} "${s.email ?? s.username}" is already taken.`
          : `Could not create account: ${error.message}`,
        s.sourceRow)
      break
    }
    if (!createdId) continue

    // Org + roster linkage (a failed update here is healed on re-run via the
    // email/username match above).
    const firstClass = data.classes.find(c => c.sourcedId === firstClassSourcedId)
    await db.from('profiles').update({
      district_id: districtId,
      school_id: firstClass ? schoolIdFor(firstClass) : args.defaultSchoolId ?? null,
      roster_provider: data.provider,
      roster_external_id: s.sourcedId,
    }).eq('id', createdId)

    studentIdBySourcedId.set(s.sourcedId, createdId)
    counts.studentsCreated++
    results.push({ kind: 'student', key: s.sourcedId, label, action: 'create', row: s.sourceRow })
    credentials.push({
      name: label,
      identifier: s.email ?? username!,
      tempPassword,
      classTitle: firstClassSourcedId ? (classTitleBySourcedId.get(firstClassSourcedId) ?? '') : '',
    })
  }

  // ─── 5. Enrollments: upsert; resurrect tombstoned ──────────────────────────
  for (const e of data.enrollments) {
    const classId = classIdBySourcedId.get(e.classSourcedId)
    const studentId = studentIdBySourcedId.get(e.studentSourcedId)
    const label = `${data.students.find(s => s.sourcedId === e.studentSourcedId)?.givenName ?? '?'} → ${classTitleBySourcedId.get(e.classSourcedId) ?? e.classSourcedId}`
    if (!classId || !studentId) continue // the failing row already reported
    // The create RPC already enrolled the student in their FIRST class.
    if (dryRun || (firstClassForStudent.get(e.studentSourcedId) === e.classSourcedId
        && results.some(r => r.kind === 'student' && r.key === e.studentSourcedId && r.action === 'create'))) {
      if (dryRun) { counts.enrollmentsCreated++; continue }
      counts.enrollmentsCreated++
      continue
    }
    const { data: existing } = await db.from('enrollments')
      .select('id, deleted_at').eq('class_id', classId).eq('student_id', studentId).maybeSingle()
    if (existing && !existing.deleted_at) { counts.enrollmentsExisting++; continue }
    const { error } = existing
      ? await db.from('enrollments').update({ deleted_at: null }).eq('id', existing.id)
      : await db.from('enrollments').insert({ class_id: classId, student_id: studentId })
    if (error) { fail('enrollment', `${e.classSourcedId}→${e.studentSourcedId}`, label, error.message); continue }
    counts.enrollmentsCreated++
  }

  return { dryRun, counts, results, credentials }
}

// deterministic-ish readable username: first initial + family name + 2 digits
function generateUsername(s: RosterStudent): string {
  const base = `${s.givenName[0] ?? ''}${s.familyName}`.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'student'
  return `${base}${10 + Math.floor(Math.random() * 90)}`
}
