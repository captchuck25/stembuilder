import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ enrolled: false })

  const db = adminDb()
  const { count } = await db
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', session.user.id)

  return NextResponse.json({ enrolled: (count ?? 0) > 0 })
}
