import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Types matching our database tables ──────────────────────────────────────

export interface Profile {
  id: string
  email: string | null       // null for username-only student accounts
  name: string
  username?: string | null   // set for students who joined with a class code (no email)
  role: 'teacher' | 'student' | 'admin'
  password_hash?: string
  google_id?: string
  // Consent basis for student accounts (compliance evidence, migration 0009):
  // rostered/class_code = school consent; independent = 13+ age-gated.
  account_origin?: 'rostered' | 'class_code' | 'independent' | null
  age_verified_13_plus?: boolean | null   // independent path only
  age_verified_at?: string | null         // when the 13+ check passed (never the DOB)
  email_verified_at?: string | null       // teachers must verify before creating classes
  // Teacher lead-gen details collected at onboarding (all optional).
  district?: string | null
  state?: string | null
  grade_levels?: string | null
  content_area?: string | null
  created_at: string
}

export interface Class {
  id: string
  teacher_id: string
  name: string
  join_code: string
  created_at: string
}

export interface Enrollment {
  id: string
  class_id: string
  student_id: string
  enrolled_at: string
}

export interface Assignment {
  id: string
  class_id: string
  tool: string
  level_id: number
  created_at: string
}

export interface LessonLock {
  id: string
  class_id: string
  tool: string
  level_idx: number
  challenge_idx: number
  created_at: string
}

export interface UserProgress {
  id: string
  user_id: string
  tool: string
  level_idx: number
  challenge_idx: number | null  // null = level-level record (quiz score etc.)
  completed: boolean
  saved_code: string | null
  quiz_score: number | null
  updated_at: string
}
