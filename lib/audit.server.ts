import { adminDb } from './db.server'

// Admin audit log writer. Records who did what to which target — identifiers
// and actions only, no unnecessary PII (never put names/emails in metadata
// when an id will do). Writes go through the service role because the tenant
// client deliberately has no insert grant on admin_audit_log.
//
// Reads are tenant-scoped via RLS: district admins see only their district's
// entries, platform admins see everything.

export interface AuditEntry {
  actorId: string
  actorRole: string
  action: string          // dotted verb, e.g. 'district.create', 'admin.grant', 'user.delete'
  targetType?: string     // 'district' | 'school' | 'profile' | 'class' | 'license' | 'invite'
  targetId?: string
  districtId?: string | null
  metadata?: Record<string, unknown>
}

// Audit failures must never fail the action they describe — log and move on.
export async function writeAudit(entry: AuditEntry): Promise<void> {
  const { error } = await adminDb().from('admin_audit_log').insert({
    actor_id: entry.actorId,
    actor_role: entry.actorRole,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    district_id: entry.districtId ?? null,
    metadata: entry.metadata ?? {},
  })
  if (error) console.error('[audit] failed to record', entry.action, error.message)
}
