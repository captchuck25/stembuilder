import { supabase, type Profile } from './supabase'

/** Fetch a user's profile from Supabase by their Clerk user ID. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data ?? null
}

/** Create or update a user's profile in Supabase. */
export async function upsertProfile(profile: Omit<Profile, 'created_at'>): Promise<void> {
  await supabase.from('profiles').upsert(profile)
}

/** Generate a random 6-character class join code. */
export function generateJoinCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}
