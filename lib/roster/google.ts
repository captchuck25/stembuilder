import type { RosterData, RosterRowError } from './types'

// Google Classroom adapter. OAuth + REST live in the API routes; this module
// is the pure mapping layer (unit-testable): Classroom courses + rosters →
// the same OneRoster-shaped RosterData the CSV adapter produces. The importer
// core is shared — Google is "just another adapter".
//
// sourcedIds are Google's own stable ids (course id, student user id), so
// re-syncs match existing rows (add new students, never duplicate, never
// clobber). Setup + env vars: docs/google-classroom-setup.md.

export const GOOGLE_CLASSROOM_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
  // Without this, Classroom omits student/teacher email addresses — and email
  // is how rostered accounts later attach Google sign-in.
  'https://www.googleapis.com/auth/classroom.profile.emails',
].join(' ')

export interface GoogleCourse {
  id: string
  name: string
  section?: string
  ownerId: string
  courseState?: string
}

export interface GoogleStudent {
  userId: string
  profile?: {
    name?: { givenName?: string; familyName?: string; fullName?: string }
    emailAddress?: string
  }
}

export interface GoogleCourseRoster {
  course: GoogleCourse
  ownerEmail: string | null
  students: GoogleStudent[]
}

export function courseTitle(c: GoogleCourse): string {
  return c.section ? `${c.name} — ${c.section}` : c.name
}

export function mapGoogleToRoster(rosters: GoogleCourseRoster[]): RosterData {
  const parseErrors: RosterRowError[] = []
  const classes = []
  const students = new Map<string, RosterData['students'][number]>()
  const enrollments = []

  for (const r of rosters) {
    if (!r.ownerEmail) {
      parseErrors.push({ message: `Course "${courseTitle(r.course)}": could not read the owning teacher's email from Google (check the classroom.profile.emails scope).` })
      continue
    }
    const classSourcedId = r.course.id
    classes.push({
      sourcedId: classSourcedId,
      title: courseTitle(r.course),
      teacherEmail: r.ownerEmail.toLowerCase(),
    })

    for (const s of r.students) {
      const given = s.profile?.name?.givenName?.trim()
      const family = s.profile?.name?.familyName?.trim()
      const full = s.profile?.name?.fullName?.trim()
      if (!given && !family && !full) {
        parseErrors.push({ message: `Course "${courseTitle(r.course)}": a student (${s.userId}) has no name in their Google profile.` })
        continue
      }
      if (!students.has(s.userId)) {
        students.set(s.userId, {
          sourcedId: s.userId,
          givenName: given || (full ? full.split(' ')[0] : 'Student'),
          familyName: family || (full ? full.split(' ').slice(1).join(' ') || '—' : s.userId.slice(0, 6)),
          email: s.profile?.emailAddress?.toLowerCase() || undefined,
        })
      }
      enrollments.push({ classSourcedId, studentSourcedId: s.userId })
    }
  }

  return { provider: 'google_classroom', classes, students: [...students.values()], enrollments, parseErrors }
}

// ─── REST helpers (server-side only) ─────────────────────────────────────────

const CLASSROOM = 'https://classroom.googleapis.com/v1'

async function gget<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) throw new GoogleAuthError('Google session expired — reconnect Google Classroom.')
  if (!res.ok) throw new Error(`Google Classroom API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json() as Promise<T>
}

export class GoogleAuthError extends Error {}

export async function listCourses(token: string): Promise<GoogleCourse[]> {
  const courses: GoogleCourse[] = []
  let pageToken = ''
  do {
    const page = await gget<{ courses?: GoogleCourse[]; nextPageToken?: string }>(
      token, `${CLASSROOM}/courses?teacherId=me&courseStates=ACTIVE&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`)
    courses.push(...(page.courses ?? []))
    pageToken = page.nextPageToken ?? ''
  } while (pageToken)
  return courses
}

export async function listStudents(token: string, courseId: string): Promise<GoogleStudent[]> {
  const students: GoogleStudent[] = []
  let pageToken = ''
  do {
    const page = await gget<{ students?: GoogleStudent[]; nextPageToken?: string }>(
      token, `${CLASSROOM}/courses/${encodeURIComponent(courseId)}/students?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`)
    students.push(...(page.students ?? []))
    pageToken = page.nextPageToken ?? ''
  } while (pageToken)
  return students
}

export async function getUserEmail(token: string, userId: string): Promise<string | null> {
  try {
    const profile = await gget<{ emailAddress?: string }>(token, `${CLASSROOM}/userProfiles/${encodeURIComponent(userId)}`)
    return profile.emailAddress ?? null
  } catch (e) {
    if (e instanceof GoogleAuthError) throw e
    return null
  }
}

/** Name of the httpOnly cookie holding the one-hour Classroom access token. */
export const GC_COOKIE = 'gc_access_token'

export function googleClassroomClientId(): string | undefined {
  return process.env.GOOGLE_CLASSROOM_CLIENT_ID || process.env.AUTH_GOOGLE_ID
}
export function googleClassroomClientSecret(): string | undefined {
  return process.env.GOOGLE_CLASSROOM_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET
}
