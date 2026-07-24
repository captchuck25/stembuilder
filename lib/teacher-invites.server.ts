import type { SupabaseClient } from '@supabase/supabase-js'
import { writeAudit } from './audit.server'

// Claim any pending district teacher invite for a freshly created teacher
// account. Called from BOTH teacher-creation paths (credentials signup and
// Google onboarding) right after the profile row exists. Attaches the account
// to the inviting district (+ school when the invite named one) and audits.
//
// Non-fatal by design: a failure here must never break signup — the admin can
// always re-add the teacher from the district console.
export async function claimTeacherInvites(
  db: SupabaseClient,
  userId: string,
  email: string,
): Promise<void> {
  try {
    const { data: invite } = await db
      .from('teacher_invites')
      .select('id, district_id, school_id, invited_by')
      .eq('email', email.toLowerCase())
      .is('claimed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!invite) return

    const { error } = await db.from('profiles').update({
      district_id: invite.district_id,
      school_id: invite.school_id ?? null,
    }).eq('id', userId)
    if (error) {
      console.error('[teacher-invite] could not attach', userId, error.message)
      return
    }

    await db.from('teacher_invites')
      .update({ claimed_at: new Date().toISOString(), claimed_by: userId })
      .eq('id', invite.id)

    await writeAudit({
      actorId: invite.invited_by,
      actorRole: 'admin',
      action: 'teacher.invite_claimed',
      targetType: 'profile',
      targetId: userId,
      districtId: invite.district_id,
    })
  } catch (e) {
    console.error('[teacher-invite] claim failed', (e as Error).message)
  }
}
