// Tower Builder — client helpers for the student's saved tower designs.
// Mirrors the bridge helpers in lib/achievements.ts (same route shapes, same
// soft-delete semantics) against /api/tower.

export interface TowerDesign {
  id: string;
  user_id: string;
  name: string;
  height_feet: number | null;
  footprint_feet: number | null;
  load_lb: number | null;
  designer_name: string | null;
  nodes: unknown[];
  members: unknown[];
  passed: boolean | null;
  cost: number | null;
  thumbnail: string | null;
  assignment_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchTowerDesigns(): Promise<TowerDesign[]> {
  const res = await fetch('/api/tower')
  if (!res.ok) return []
  return res.json()
}

export async function upsertTowerDesign(design: {
  name: string;
  heightFeet: number;
  footprintFeet: number;
  loadLb: number;
  designerName: string;
  nodes: unknown[];
  members: unknown[];
  passed: boolean | null;
  cost: number | null;
  thumbnail?: string | null;
}): Promise<void> {
  const res = await fetch('/api/tower', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(design),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `Save failed (${res.status})`)
  }
}

export async function fetchTowerDesignById(id: string): Promise<TowerDesign | null> {
  const res = await fetch(`/api/tower/${id}`)
  if (!res.ok) return null
  return res.json()
}

export async function deleteTowerDesign(id: string): Promise<void> {
  await fetch(`/api/tower/${id}`, { method: 'DELETE' })
}

export async function checkTowerNameExists(name: string): Promise<boolean> {
  const res = await fetch(`/api/tower/check?name=${encodeURIComponent(name)}`)
  if (!res.ok) return false
  const data = await res.json()
  return data.exists
}
