import { type Profile } from './supabase'

export async function getProfile(userId: string): Promise<Profile | null> {
  const res = await fetch('/api/profile')
  if (!res.ok) return null
  return res.json()
}

export async function upsertProfile(profile: Omit<Profile, 'created_at'>): Promise<void> {
  await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
}

export function generateJoinCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}
