import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { adminDb } from "@/lib/db.server";
import { roleAtLeast } from "@/lib/roles";
import { getTeacherPlanUsage, trialEndDate } from "@/lib/plan.server";
import { writeAudit } from "@/lib/audit.server";

// POST /api/teacher/plan/trial — start the ONE-TIME free Pro trial.
//
// Server-side rules (no client input is read — the plan can never be set
// from the client):
//   - caller must be a teacher (role from DB, not the request)
//   - not institutional (district/school teachers already have full access)
//   - currently on 'free' and has never started a trial before
//
// Ends at PRO_TRIAL_ENDS_AT (env) or the coming June 30. Recorded with
// pro_trial_started_at + an audit entry (who, when).
//
// TODO(stripe): when billing lands, "Upgrade to Teacher Pro" becomes a
// Stripe Checkout session ($60/year + $10/25-student overage blocks).
// The caps, trial, meter, and prompts here work independently of billing.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminDb();
  const { data: profile } = await db
    .from("profiles")
    .select("role, plan, pro_trial_started_at, district_id")
    .eq("id", session.user.id)
    .is("deleted_at", null)
    .single();

  if (!roleAtLeast(profile?.role, "teacher")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile!.district_id !== null) {
    return NextResponse.json(
      { error: "Your school or district plan already includes full access." },
      { status: 409 },
    );
  }
  if (profile!.pro_trial_started_at !== null) {
    return NextResponse.json(
      { error: "You've already used your free Pro trial. Upgrade to Teacher Pro to continue." },
      { status: 409 },
    );
  }
  if (profile!.plan !== "free") {
    return NextResponse.json({ error: "Your plan already includes Pro access." }, { status: 409 });
  }

  const now = new Date();
  const endsAt = trialEndDate(now);
  const { error } = await db
    .from("profiles")
    .update({
      plan: "pro_trial",
      pro_trial_started_at: now.toISOString(),
      pro_trial_ends_at: endsAt.toISOString(),
    })
    .eq("id", session.user.id)
    .eq("plan", "free")
    .is("pro_trial_started_at", null); // idempotency guard against double-click races

  if (error) {
    return NextResponse.json({ error: "Could not start the trial. Please try again." }, { status: 500 });
  }

  await writeAudit({
    actorId: session.user.id,
    actorRole: profile!.role ?? "teacher",
    action: "plan.trial_start",
    targetType: "profile",
    targetId: session.user.id,
    metadata: { ends_at: endsAt.toISOString() },
  });

  const usage = await getTeacherPlanUsage(session.user.id);
  return NextResponse.json(usage);
}
