import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Types matching our database tables ──────────────────────────────────────

export interface Profile {
  id: string
  email: string
  name: string
  role: 'teacher' | 'student'
  password_hash?: string
  google_id?: string
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
