import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { stemSketchAssignmentsAllowed } from '@/lib/stem-sketch.server'
import { getChallenge } from '@/lib/stem-sketch/challenges'

// GET /api/stem-sketch-challenges/[id]
// Challenge payload for TEACHER PREVIEW — lets a teacher try a challenge in
// the tool before assigning it (launched as /tools/stem-sketch?challenge=<id>).
// Same challenge shape the assignment by-id route embeds; teacher + plan
// gated because refDocJson is the answer key.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await stemSketchAssignmentsAllowed(session.user.id)))
    return NextResponse.json({ error: 'STEM Sketch assignments require a Pro plan' }, { status: 403 })

  const { id } = await params
  const challenge = getChallenge(id)
  if (!challenge) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    challenge: {
      id: challenge.id,
      stage: challenge.stage,
      title: challenge.title,
      precision: challenge.precision,
      studentInstructions: challenge.studentInstructions,
      refDocJson: challenge.refDocJson,
      toleranceMm: challenge.toleranceMm,
    },
  })
}
