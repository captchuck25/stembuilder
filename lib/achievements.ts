export interface StemSketchDesign {
  id: string;
  name: string;
  units: string;
  thumbnail: string | null;
  updated_at: string;
  created_at: string;
}

export async function fetchStemSketchDesigns(): Promise<StemSketchDesign[]> {
  const res = await fetch('/api/stem-sketch/designs')
  if (!res.ok) return []
  return res.json()
}

export async function deleteStemSketchDesign(id: string): Promise<void> {
  await fetch(`/api/stem-sketch/designs/${id}`, { method: 'DELETE' })
}

export interface BridgeDesign {
  id: string;
  user_id: string;
  name: string;
  span_feet: number | null;
  load_lb: number | null;
  designer_name: string | null;
  nodes: unknown[];
  members: unknown[];
  passed: boolean | null;
  cost: number | null;
  assignment_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchBridgeDesigns(_userId: string): Promise<BridgeDesign[]> {
  const res = await fetch('/api/bridge')
  if (!res.ok) return []
  return res.json()
}

export async function upsertBridgeDesign(
  _userId: string,
  design: {
    name: string;
    spanFeet: number;
    loadLb: number;
    designerName: string;
    nodes: unknown[];
    members: unknown[];
    passed: boolean | null;
    cost: number | null;
  }
): Promise<void> {
  const res = await fetch('/api/bridge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(design),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `Save failed (${res.status})`)
  }
}

export async function fetchBridgeDesignById(id: string): Promise<BridgeDesign | null> {
  const res = await fetch(`/api/bridge/${id}`)
  if (!res.ok) return null
  return res.json()
}

export async function deleteBridgeDesign(id: string): Promise<void> {
  await fetch(`/api/bridge/${id}`, { method: 'DELETE' })
}

export async function checkBridgeNameExists(_userId: string, name: string): Promise<boolean> {
  const res = await fetch(`/api/bridge/check?name=${encodeURIComponent(name)}`)
  if (!res.ok) return false
  const data = await res.json()
  return data.exists
}

export interface ProgressRow {
  level_idx: number;
  challenge_idx: number | null;
  completed: boolean;
  quiz_score: number | null;
  updated_at: string;
}

export interface ScoreRow {
  tool: string;
  level_idx: number;
  challenge_idx: number;
  quiz_score: number | null;
  updated_at: string;
}

export async function fetchCodeLabProgress(_userId: string): Promise<ProgressRow[]> {
  const res = await fetch('/api/progress?tool=code-lab-python')
  if (!res.ok) return []
  return res.json()
}

export async function fetchBlockLabProgress(_userId: string): Promise<ProgressRow[]> {
  const res = await fetch('/api/progress?tool=block-lab')
  if (!res.ok) return []
  return res.json()
}

export async function fetchToolScores(_userId: string): Promise<ScoreRow[]> {
  const res = await fetch('/api/progress?tool=meas')
  if (!res.ok) return []
  const data: ScoreRow[] = await res.json()
  return data.filter((r) => r.tool?.startsWith('meas-'))
}

export async function upsertToolHighScore(
  _userId: string,
  tool: string,
  levelIdx: number,
  challengeIdx: number,
  newScore: number,
): Promise<void> {
  await fetch('/api/progress/highscore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, levelIdx, challengeIdx, score: newScore }),
  })
}

// ─── Turtle submissions ───────────────────────────────────────────────────────

export interface TurtleSubmission {
  id: string;
  user_id: string;
  challenge_id: string;
  image_data: string;
  code: string | null;
  approved: boolean | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function saveTurtleWork(
  _userId: string, challengeId: string, code: string, imageData: string,
): Promise<string | null> {
  const res = await fetch('/api/turtle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, code, imageData, submit: false }),
  })
  if (!res.ok) { const d = await res.json(); return d.error ?? 'Error' }
  return null
}

export async function submitTurtleWork(
  _userId: string, challengeId: string, code: string, imageData: string,
): Promise<string | null> {
  const res = await fetch('/api/turtle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, code, imageData, submit: true }),
  })
  if (!res.ok) { const d = await res.json(); return d.error ?? 'Error' }
  return null
}

export async function fetchTurtleSubmission(_userId: string, challengeId: string): Promise<TurtleSubmission | null> {
  const res = await fetch(`/api/turtle/${encodeURIComponent(challengeId)}`)
  if (!res.ok) return null
  return res.json()
}

export async function fetchTurtleSubmissions(_userId: string): Promise<TurtleSubmission[]> {
  const res = await fetch('/api/turtle')
  if (!res.ok) return []
  return res.json()
}

export async function fetchTurtleSubmissionsForStudents(studentIds: string[]): Promise<TurtleSubmission[]> {
  if (!studentIds.length) return []
  const res = await fetch(`/api/turtle/review?studentIds=${studentIds.join(',')}`)
  if (!res.ok) return []
  return res.json()
}

export async function approveTurtleSubmission(id: string, approved: boolean | null): Promise<void> {
  await fetch('/api/turtle/review', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, approved }),
  })
}
