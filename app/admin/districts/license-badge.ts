// Shared badge styling for a district's license/trial state (both consoles).

export interface LicenseSummary {
  type: "trial" | "paid";
  seats: number | null;
  seatsUsed: number;
  startsAt?: string;
  endsAt: string | null;
  effectiveStatus: "active" | "expiring" | "expired";
  daysLeft: number | null;
}

export function licenseBadge(license: LicenseSummary | null) {
  if (!license) return { label: "No license", bg: "#f3f4f6", color: "#6b7280" };
  const kind = license.type === "trial" ? "Trial" : "Paid";
  switch (license.effectiveStatus) {
    case "expired": return { label: `${kind} · expired`, bg: "#fee2e2", color: "#b91c1c" };
    case "expiring": return { label: `${kind} · ${license.daysLeft}d left`, bg: "#fef3c7", color: "#b45309" };
    default: return { label: `${kind} · active`, bg: "#dcfce7", color: "#16a34a" };
  }
}
