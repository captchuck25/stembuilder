import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";

// Post-login hub — reads the user's role and sends them to the right place.
export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const profile = await getProfile(userId);

  // New user — hasn't picked a role yet
  if (!profile) redirect("/onboarding");

  // Route by role
  if (profile.role === "teacher") redirect("/teachers/dashboard");
  redirect("/student/dashboard");
}
