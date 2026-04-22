import { supabase } from "./supabase";

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
  created_at: string;
  updated_at: string;
}

export async function fetchBridgeDesigns(userId: string): Promise<BridgeDesign[]> {
  const { data } = await supabase
    .from("bridge_designs")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  return (data as BridgeDesign[]) ?? [];
}

export async function upsertBridgeDesign(
  userId: string,
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
  await supabase.from("bridge_designs").upsert(
    {
      user_id: userId,
      name: design.name,
      span_feet: design.spanFeet,
      load_lb: design.loadLb,
      designer_name: design.designerName,
      nodes: design.nodes,
      members: design.members,
      passed: design.passed,
      cost: design.cost,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,name" }
  );
}

export async function fetchBridgeDesignById(id: string): Promise<BridgeDesign | null> {
  const { data } = await supabase
    .from("bridge_designs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as BridgeDesign) ?? null;
}

export async function deleteBridgeDesign(id: string): Promise<void> {
  await supabase.from("bridge_designs").delete().eq("id", id);
}

export async function checkBridgeNameExists(userId: string, name: string): Promise<boolean> {
  const { data } = await supabase
    .from("bridge_designs")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle();
  return data != null;
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

export async function fetchCodeLabProgress(userId: string): Promise<ProgressRow[]> {
  const { data } = await supabase
    .from("user_progress")
    .select("level_idx, challenge_idx, completed, quiz_score, updated_at")
    .eq("user_id", userId)
    .eq("tool", "code-lab-python");
  return (data as ProgressRow[]) ?? [];
}

export async function fetchBlockLabProgress(userId: string): Promise<ProgressRow[]> {
  const { data } = await supabase
    .from("user_progress")
    .select("level_idx, challenge_idx, completed, quiz_score, updated_at")
    .eq("user_id", userId)
    .eq("tool", "block-lab");
  return (data as ProgressRow[]) ?? [];
}

export async function fetchToolScores(userId: string): Promise<ScoreRow[]> {
  const { data } = await supabase
    .from("user_progress")
    .select("tool, level_idx, challenge_idx, quiz_score, updated_at")
    .eq("user_id", userId)
    .like("tool", "meas-%");
  return (data as ScoreRow[]) ?? [];
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
  userId: string, challengeId: string, code: string, imageData: string,
): Promise<string | null> {
  const { error } = await supabase.from("turtle_submissions").upsert(
    { user_id: userId, challenge_id: challengeId, code, image_data: imageData, updated_at: new Date().toISOString() },
    { onConflict: "user_id,challenge_id" },
  );
  return error?.message ?? null;
}

export async function submitTurtleWork(
  userId: string, challengeId: string, code: string, imageData: string,
): Promise<string | null> {
  const { error } = await supabase.from("turtle_submissions").upsert(
    { user_id: userId, challenge_id: challengeId, code, image_data: imageData,
      submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { onConflict: "user_id,challenge_id" },
  );
  return error?.message ?? null;
}

export async function fetchTurtleSubmission(userId: string, challengeId: string): Promise<TurtleSubmission | null> {
  const { data } = await supabase
    .from("turtle_submissions")
    .select("*")
    .eq("user_id", userId)
    .eq("challenge_id", challengeId)
    .maybeSingle();
  return (data as TurtleSubmission) ?? null;
}

export async function fetchTurtleSubmissions(userId: string): Promise<TurtleSubmission[]> {
  const { data } = await supabase
    .from("turtle_submissions")
    .select("*")
    .eq("user_id", userId);
  return (data as TurtleSubmission[]) ?? [];
}

export async function fetchTurtleSubmissionsForStudents(studentIds: string[]): Promise<TurtleSubmission[]> {
  if (!studentIds.length) return [];
  const { data } = await supabase
    .from("turtle_submissions")
    .select("*")
    .in("user_id", studentIds)
    .not("submitted_at", "is", null);
  return (data as TurtleSubmission[]) ?? [];
}

export async function approveTurtleSubmission(id: string, approved: boolean | null): Promise<void> {
  await supabase.from("turtle_submissions")
    .update({ approved, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/** Save a measurement-lab high score. Only writes if it beats the existing record. */
export async function upsertToolHighScore(
  userId: string,
  tool: string,
  levelIdx: number,
  challengeIdx: number,
  newScore: number,
): Promise<void> {
  const { data } = await supabase
    .from("user_progress")
    .select("quiz_score")
    .eq("user_id", userId)
    .eq("tool", tool)
    .eq("level_idx", levelIdx)
    .eq("challenge_idx", challengeIdx)
    .maybeSingle();

  if ((data?.quiz_score ?? 0) >= newScore) return;

  await supabase.from("user_progress").upsert(
    {
      user_id: userId,
      tool,
      level_idx: levelIdx,
      challenge_idx: challengeIdx,
      completed: true,
      quiz_score: newScore,
      saved_code: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,tool,level_idx,challenge_idx" },
  );
}
