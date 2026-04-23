import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const profile = await getProfile(session.user.id);

  // New user — hasn't picked a role yet
  if (!profile) redirect("/onboarding");

  // Route by role
  if (profile.role === "teacher") redirect("/teachers/dashboard");
  redirect("/student/dashboard");
}
