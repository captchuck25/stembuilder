import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/bridge-assignments/[id]
// Returns the assignment config so the bridge page can lock span/load/maxCost
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = adminDb()

  const { data, error } = await db
    .from('bridge_assignments')
    .select('id, title, span_feet, load_lb, max_cost, class_id')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify student is enrolled in this class
  const { data: enrollment } = await db
    .from('enrollments')
    .select('id')
    .eq('class_id', data.class_id)
    .eq('student_id', session.user.id)
    .single()

  if (!enrollment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json(data)
}
