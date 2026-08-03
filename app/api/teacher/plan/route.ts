import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { adminDb } from "@/lib/db.server";
import { roleAtLeast } from "@/lib/roles";
import { getTeacherPlanUsage } from "@/lib/plan.server";

// GET /api/teacher/plan — the signed-in teacher's plan + usage for the
// dashboard meter. Everything is derived server-side from the session and
// database; no client input is read.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminDb()
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .is("deleted_at", null)
    .single();
  if (!roleAtLeast(profile?.role, "teacher")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const usage = await getTeacherPlanUsage(session.user.id);
  if (!usage) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(usage);
}
