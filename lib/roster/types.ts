// Provider-agnostic roster shape, modeled on OneRoster (orgs → classes →
// users → enrollments, each carrying a stable sourcedId). Every roster source
// — CSV upload, Google Classroom, and later Clever/ClassLink Secure Sync
// (both OneRoster-based) — is an ADAPTER that maps its data into this shape.
// The importer (import.server.ts) only ever sees this shape, so adding a
// provider never touches the core.
//
// ACCESS vs ROSTERING: this pipeline is rostering only (how we learn class
// lists). How a student signs in (username/password, Google, Clever SSO) is
// a separate concern — a rostered account can attach any sign-in method later
// by matching email.

export type RosterProviderId = 'csv' | 'google_classroom' | 'clever' | 'classlink'

/** A class to create/update, keyed by a stable per-provider sourcedId. */
export interface RosterClass {
  sourcedId: string
  title: string
  /** Email of the owning teacher — must already exist in the district. */
  teacherEmail: string
  /** Optional school name; resolved/created within the district. */
  schoolName?: string
}

/** A student to create/link, keyed by a stable per-provider sourcedId. */
export interface RosterStudent {
  sourcedId: string
  givenName: string
  familyName: string
  /** Optional — students without email get a generated username account. */
  email?: string
  /** Optional preferred username (CSV column); generated when absent. */
  username?: string
  /** Source row number (1-based, incl. header) for row-level error reports. */
  sourceRow?: number
}

export interface RosterEnrollment {
  classSourcedId: string
  studentSourcedId: string
}

/** The complete normalized payload one adapter run produces. */
export interface RosterData {
  provider: RosterProviderId
  classes: RosterClass[]
  students: RosterStudent[]
  enrollments: RosterEnrollment[]
  /** Rows the adapter could not normalize at all (bad shape, missing fields). */
  parseErrors: RosterRowError[]
}

export interface RosterRowError {
  row?: number
  message: string
}

/** Row-level outcome of an import (or what WOULD happen, in a dry run). */
export interface RosterResult {
  kind: 'class' | 'student' | 'enrollment'
  key: string                      // sourcedId (or title/name for display)
  label: string                    // human-readable: class title / student name
  action: 'create' | 'link' | 'update' | 'skip' | 'error'
  message?: string
  row?: number
}

/** Sign-in credentials for a newly created student (returned once). */
export interface RosterCredential {
  name: string
  identifier: string               // username or email they sign in with
  tempPassword: string
  classTitle: string
}

export interface RosterImportSummary {
  dryRun: boolean
  counts: {
    classesCreated: number
    classesLinked: number
    studentsCreated: number
    studentsLinked: number
    enrollmentsCreated: number
    enrollmentsExisting: number
    errors: number
  }
  results: RosterResult[]
  /** Only populated on a real (non-dry) run, only for newly created accounts. */
  credentials: RosterCredential[]
}
