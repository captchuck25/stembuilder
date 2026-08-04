import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { adminDb } from "@/lib/db.server";
import { roleAtLeast } from "@/lib/roles";
import { getTeacherPlanUsage } from "@/lib/plan.server";
import { isBillingConfigured, stripe } from "@/lib/billing.server";

// GET  /api/teacher/account — profile + classroom details + plan/membership
// PATCH /api/teacher/account — update the classroom lead-gen fields only
// (district, state, gradeLevels, contentArea). Name/email/plan are never
// writable here; plan state comes exclusively from the billing webhook.

async function requireTeacher() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const db = adminDb();
  const { data: profile } = await db
    .from("profiles")
    .select("id, name, email, role, district, state, grade_levels, content_area, stripe_subscription_id, district_id")
    .eq("id", session.user.id)
    .is("deleted_at", null)
    .single();
  if (!roleAtLeast(profile?.role, "teacher")) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { profile: profile!, db };
}

export async function GET() {
  const { error, profile } = await requireTeacher();
  if (error) return error;

  const usage = await getTeacherPlanUsage(profile.id);

  // Renewal date for paid subscriptions, straight from Stripe.
  let renewsAt: string | null = null;
  if (usage?.plan === "pro" && profile.stripe_subscription_id && isBillingConfigured()) {
    try {
      const sub = await stripe().subscriptions.retrieve(profile.stripe_subscription_id);
      const periodEnd =
        sub.items.data[0]?.current_period_end ??
        (sub as unknown as { current_period_end?: number }).current_period_end;
      if (periodEnd) renewsAt = new Date(periodEnd * 1000).toISOString();
    } catch {
      renewsAt = null; // display-only nicety — never fail the page for it
    }
  }

  return NextResponse.json({
    name: profile.name,
    email: profile.email,
    district: profile.district,
    state: profile.state,
    gradeLevels: profile.grade_levels,
    contentArea: profile.content_area,
    institutional: profile.district_id !== null,
    usage,
    renewsAt,
  });
}

export async function PATCH(req: NextRequest) {
  const { error, profile, db } = await requireTeacher();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const lead = (v: unknown, max: number): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

  const updates: Record<string, string | null> = {};
  if ("district" in body) updates.district = lead(body.district, 120);
  if ("state" in body) updates.state = lead(body.state, 40);
  if ("gradeLevels" in body) updates.grade_levels = lead(body.gradeLevels, 120);
  if ("contentArea" in body) updates.content_area = lead(body.contentArea, 120);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error: updateError } = await db!.from("profiles").update(updates).eq("id", profile.id);
  if (updateError) {
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
