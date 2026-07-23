import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/db.server";
import { roleAtLeast } from "@/lib/roles";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const db = adminDb();
  const { data: profile } = await db.from("profiles").select("role").eq("id", session.user.id).single();

  // New user — hasn't picked a role yet
  if (!profile) redirect("/onboarding");

  // Route by rank: teacher and above (district_admin, admin) get the teacher
  // dashboard — "My Classes" must keep working for admins who also teach.
  // The admin console has its own header menu entry.
  if (roleAtLeast(profile.role, "teacher")) redirect("/teachers/dashboard");
  redirect("/student/dashboard");
}
