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
