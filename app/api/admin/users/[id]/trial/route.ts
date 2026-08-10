import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/db.server'
import { roleAtLeast } from '@/lib/roles'
import { trialEndDate } from '@/lib/plan.server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'

// Platform-admin controls for a teacher's Pro trial.
//
// POST   /api/admin/users/[id]/trial — grant (or re-grant) a free Pro trial.
//        Unlike the teacher self-serve route (one-time, free-plan-only), an
//        admin grant works even if a previous trial was used or has expired —
//        that's the point: comping teachers and testing Pro features. It still
//        refuses institutional teachers (district access already covers them)
//        and paid Pro accounts (never downgrade a paying customer to a trial).
// DELETE /api/admin/users/[id]/trial — end an active trial now (back to free).
//
// Both respond with the fields the admin teacher list renders, so the client
// can merge the row in place.

interface TargetRow {
  role: string | null
  plan: string | null
  pro_trial_started_at: string | null
  district_id: string | null
}

async function loadTarget(id: string) {
  const { data } = await adminDb()
    .from('profiles')
    .select('role, plan, pro_trial_started_at, district_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle<TargetRow>()
  return data
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin({ platform: true })
  if (isGuardError(ctx)) return ctx

  const { id } = await params
  const target = await loadTarget(id)
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!roleAtLeast(target.role, 'teacher')) {
    return NextResponse.json({ error: 'Only teacher accounts have plans' }, { status: 400 })
  }
  if (target.district_id !== null) {
    return NextResponse.json(
      { error: 'This teacher already has full access through their school or district.' },
      { status: 409 },
    )
  }
  if (target.plan === 'pro') {
    return NextResponse.json({ error: 'This teacher already has paid Pro access.' }, { status: 409 })
  }

  const now = new Date()
  const endsAt = trialEndDate(now)
  const { error } = await adminDb()
    .from('profiles')
    .update({
      plan: 'pro_trial',
      // Keep the original start when re-granting an expired trial.
      pro_trial_started_at: target.pro_trial_started_at ?? now.toISOString(),
      pro_trial_ends_at: endsAt.toISOString(),
    })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await ctx.audit({
    action: 'plan.trial_grant',
    targetType: 'profile',
    targetId: id,
    metadata: { ends_at: endsAt.toISOString(), regrant: target.pro_trial_started_at !== null },
  })

  return NextResponse.json({
    plan: 'pro_trial',
    effectivePlan: 'pro_trial',
    trialEndsAt: endsAt.toISOString(),
    institutional: false,
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin({ platform: true })
  if (isGuardError(ctx)) return ctx

  const { id } = await params
  const target = await loadTarget(id)
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (target.plan !== 'pro_trial') {
    return NextResponse.json({ error: 'This teacher has no trial to end.' }, { status: 409 })
  }

  const nowIso = new Date().toISOString()
  const { error } = await adminDb()
    .from('profiles')
    .update({ plan: 'free', pro_trial_ends_at: nowIso })
    .eq('id', id)
    .eq('plan', 'pro_trial')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await ctx.audit({
    action: 'plan.trial_end',
    targetType: 'profile',
    targetId: id,
    metadata: { ended_at: nowIso },
  })

  return NextResponse.json({
    plan: 'free',
    effectivePlan: 'free',
    trialEndsAt: nowIso,
    institutional: false,
  })
}
