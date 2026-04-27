import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/student/my-progress
// Returns completed challenge rows for the current student across all tools.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json([])

  const db = adminDb()
  const { data } = await db
    .from('user_progress')
    .select('tool, level_idx, challenge_idx, completed')
    .eq('user_id', session.user.id)
    .eq('completed', true)

  return NextResponse.json(data ?? [])
}
