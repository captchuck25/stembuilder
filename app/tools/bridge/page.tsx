"use client";
import { useSession } from "next-auth/react";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import BridgeScene from "./components/BridgeScene";
import SiteHeader from "@/app/components/SiteHeader";
import { upsertBridgeDesign, checkBridgeNameExists, fetchBridgeDesignById } from "@/lib/achievements";
import styles from "./bridge-layout.module.css";

type MemberType =
  | "box_1"
  | "box_2"
  | "box_3"
  | "box_4"
  | "box_5"
  | "box_6"
  | "box_7"
  | "box_8"
  | "box_9"
  | "box_10"
  | "box_11"
  | "box_12"
  | "box_13"
  | "box_14"
  | "box_15"
  | "box_16"
  | "box_17"
  | "box_18"
  | "box_19"
  | "box_20"
  | "box_21"
  | "box_22"
  | "box_23"
  | "box_24"
  | "box_25"
  | "box_26"
  | "box_27"
  | "box_28"
  | "box_29"
  | "box_30"
  | "box_31"
  | "box_32"
  | "box_33"
  | "box_34"
  | "box_35";

type MemberProps = {
  label: string;
  strokeW: number;
  maxTension: number;
  maxCompression: number;
  costPerFt: number;
};
type Tool = "select" | "joint" | "member" | "erase";
type MaterialGrade = "mild" | "high";

type Node = { id: string; x: number; y: number };
type Member = { id: string; a: string; b: string; type: MemberType; grade?: MaterialGrade };

const COST_SCALE = 10;
const BOX_COST_BASE = 1.0 * COST_SCALE;
const BOX_COST_OUTER_RATE = 1.8 * COST_SCALE;
const BOX_COST_WALL_RATE = 0.15 * COST_SCALE;
function boxCostPerFt(outerIn: number, wallIn: number): number {
  return (
    BOX_COST_BASE +
    BOX_COST_OUTER_RATE * outerIn * outerIn +
    BOX_COST_WALL_RATE * wallIn
  );
}

const MEMBER_LIBRARY: Record<MemberType, MemberProps> = {
  box_1: {
    label: 'Steel Box Tube 1"×1"×3/16"',
    strokeW: 2.4,
    maxTension: 5279,
    maxCompression: 5279,
    costPerFt: boxCostPerFt(1, 0.1875),
  },
  box_2: {
    label: 'Steel Box Tube 1.25"×1.25"×3/16"',
    strokeW: 2.6,
    maxTension: 6885,
    maxCompression: 6885,
    costPerFt: boxCostPerFt(1.25, 0.1875),
  },
  box_3: {
    label: 'Steel Box Tube 1.5"×1.5"×3/16"',
    strokeW: 2.8,
    maxTension: 8530,
    maxCompression: 8530,
    costPerFt: boxCostPerFt(1.5, 0.1875),
  },
  box_4: {
    label: 'Steel Box Tube 1.75"×1.75"×3/16"',
    strokeW: 3.0,
    maxTension: 10136,
    maxCompression: 10136,
    costPerFt: boxCostPerFt(1.75, 0.1875),
  },
  box_5: {
    label: 'Steel Box Tube 2"×2"×3/16"',
    strokeW: 3.3,
    maxTension: 11781,
    maxCompression: 11781,
    costPerFt: boxCostPerFt(2, 0.1875),
  },
  box_6: {
    label: 'Steel Box Tube 2.25"×2.25"×3/16"',
    strokeW: 3.5,
    maxTension: 13388,
    maxCompression: 13388,
    costPerFt: boxCostPerFt(2.25, 0.1875),
  },
  box_7: {
    label: 'Steel Box Tube 2.5"×2.5"×3/16"',
    strokeW: 3.7,
    maxTension: 15032,
    maxCompression: 15032,
    costPerFt: boxCostPerFt(2.5, 0.1875),
  },
  box_8: {
    label: 'Steel Box Tube 2.75"×2.75"×3/16"',
    strokeW: 3.9,
    maxTension: 16639,
    maxCompression: 16639,
    costPerFt: boxCostPerFt(2.75, 0.1875),
  },
  box_9: {
    label: 'Steel Box Tube 3"×3"×3/16"',
    strokeW: 4.1,
    maxTension: 18284,
    maxCompression: 18284,
    costPerFt: boxCostPerFt(3, 0.1875),
  },
  box_10: {
    label: 'Steel Box Tube 3.25"×3.25"×3/16"',
    strokeW: 4.3,
    maxTension: 19890,
    maxCompression: 19890,
    costPerFt: boxCostPerFt(3.25, 0.1875),
  },
  box_11: {
    label: 'Steel Box Tube 3.5"×3.5"×3/16"',
    strokeW: 4.5,
    maxTension: 21535,
    maxCompression: 21535,
    costPerFt: boxCostPerFt(3.5, 0.1875),
  },
  box_12: {
    label: 'Steel Box Tube 3.75"×3.75"×3/16"',
    strokeW: 4.8,
    maxTension: 23141,
    maxCompression: 23141,
    costPerFt: boxCostPerFt(3.75, 0.1875),
  },
  box_13: {
    label: 'Steel Box Tube 4"×4"×1/4"',
    strokeW: 5.0,
    maxTension: 34700,
    maxCompression: 34700,
    costPerFt: boxCostPerFt(4, 0.25),
  },
  box_14: {
    label: 'Steel Box Tube 4.5"×4.5"×1/4"',
    strokeW: 5.4,
    maxTension: 39199,
    maxCompression: 39199,
    costPerFt: boxCostPerFt(4.5, 0.25),
  },
  box_15: {
    label: 'Steel Box Tube 5"×5"×1/4"',
    strokeW: 5.8,
    maxTension: 43751,
    maxCompression: 43751,
    costPerFt: boxCostPerFt(5, 0.25),
  },
  box_16: {
    label: 'Steel Box Tube 5.5"×5.5"×1/4"',
    strokeW: 6.3,
    maxTension: 48302,
    maxCompression: 48302,
    costPerFt: boxCostPerFt(5.5, 0.25),
  },
  box_17: {
    label: 'Steel Box Tube 6"×6"×1/4"',
    strokeW: 6.7,
    maxTension: 52853,
    maxCompression: 52853,
    costPerFt: boxCostPerFt(6, 0.25),
  },
  box_18: {
    label: 'Steel Box Tube 6.5"×6.5"×1/4"',
    strokeW: 7.1,
    maxTension: 57406,
    maxCompression: 57406,
    costPerFt: boxCostPerFt(6.5, 0.25),
  },
  box_19: {
    label: 'Steel Box Tube 7"×7"×1/4"',
    strokeW: 7.5,
    maxTension: 132766,
    maxCompression: 132766,
    costPerFt: boxCostPerFt(7, 0.25),
  },
  box_20: {
    label: 'Steel Box Tube 7.5"×7.5"×1/4"',
    strokeW: 8.0,
    maxTension: 142520,
    maxCompression: 142520,
    costPerFt: boxCostPerFt(7.5, 0.25),
  },
  box_21: {
    label: 'Steel Box Tube 8"×8"×1/4"',
    strokeW: 8.4,
    maxTension: 152273,
    maxCompression: 152273,
    costPerFt: boxCostPerFt(8, 0.25),
  },
  box_22: {
    label: 'Steel Box Tube 8.5"×8.5"×1/4"',
    strokeW: 8.8,
    maxTension: 162027,
    maxCompression: 162027,
    costPerFt: boxCostPerFt(8.5, 0.25),
  },
  box_23: {
    label: 'Steel Box Tube 9"×9"×1/4"',
    strokeW: 9.2,
    maxTension: 171781,
    maxCompression: 171781,
    costPerFt: boxCostPerFt(9, 0.25),
  },
  box_25: {
    label: 'Steel Box Tube 9.5"×9.5"×1/4"',
    strokeW: 9.5,
    maxTension: 181534,
    maxCompression: 181534,
    costPerFt: boxCostPerFt(9.5, 0.25),
  },
  box_24: {
    label: 'Steel Box Tube 10"×10"×3/8"',
    strokeW: 9.8,
    maxTension: 229546,
    maxCompression: 229546,
    costPerFt: boxCostPerFt(10, 0.375),
  },
  box_26: {
    label: 'Steel Box Tube 10.5"×10.5"×3/8"',
    strokeW: 10.2,
    maxTension: 241250,
    maxCompression: 241250,
    costPerFt: boxCostPerFt(10.5, 0.375),
  },
  box_27: {
    label: 'Steel Box Tube 11"×11"×3/8"',
    strokeW: 10.6,
    maxTension: 252955,
    maxCompression: 252955,
    costPerFt: boxCostPerFt(11, 0.375),
  },
  box_28: {
    label: 'Steel Box Tube 11.5"×11.5"×3/8"',
    strokeW: 11.0,
    maxTension: 264659,
    maxCompression: 264659,
    costPerFt: boxCostPerFt(11.5, 0.375),
  },
  box_29: {
    label: 'Steel Box Tube 12"×12"×3/8"',
    strokeW: 11.5,
    maxTension: 276364,
    maxCompression: 276364,
    costPerFt: boxCostPerFt(12, 0.375),
  },
  box_30: {
    label: 'Steel Box Tube 13"×13"×3/8"',
    strokeW: 12.3,
    maxTension: 333081,
    maxCompression: 333081,
    costPerFt: boxCostPerFt(13, 0.375),
  },
  box_31: {
    label: 'Steel Box Tube 14"×14"×3/8"',
    strokeW: 13.1,
    maxTension: 359091,
    maxCompression: 359091,
    costPerFt: boxCostPerFt(14, 0.375),
  },
  box_32: {
    label: 'Steel Box Tube 15"×15"×3/8"',
    strokeW: 14.0,
    maxTension: 385101,
    maxCompression: 385101,
    costPerFt: boxCostPerFt(15, 0.375),
  },
  box_33: {
    label: 'Steel Box Tube 12.5"×12.5"×3/8"',
    strokeW: 11.9,
    maxTension: 288068,
    maxCompression: 288068,
    costPerFt: boxCostPerFt(12.5, 0.375),
  },
  box_34: {
    label: 'Steel Box Tube 13.5"×13.5"×3/8"',
    strokeW: 12.7,
    maxTension: 346086,
    maxCompression: 346086,
    costPerFt: boxCostPerFt(13.5, 0.375),
  },
  box_35: {
    label: 'Steel Box Tube 14.5"×14.5"×3/8"',
    strokeW: 13.5,
    maxTension: 372096,
    maxCompression: 372096,
    costPerFt: boxCostPerFt(14.5, 0.375),
  },
};

type VehicleType =
  | "People Walking"
  | "Horse & Carriage"
  | "Small Car"
  | "Pickup Truck"
  | "Box Truck"
  | "Semi"
  | "Tank";
type ExportPaperSize = "letter" | "legal";
type ExportFormat = "pdf" | "png" | "jpeg";
const LB_PER_TON = 2000;
const LOAD_TON_OPTIONS = [8, 15, 30] as const;

const UNITS_PER_FOOT = 20; // 20 SVG units = 1 ft
const CANVAS_CENTER_X = 500;
const INITIAL_SPAN_FEET = 40;
const COST_PER_JOINT = 5 * COST_SCALE;
const DEFAULT_SNAP_TO_GRID = true;
const DEFAULT_SNAP_STEP_FEET = 5 as const;
type LoadLevel = "low" | "med" | "high";
const MAX_MEMBER_FT = 12;
const SUPPORT_X: Record<number, { left: number; right: number }> = {
  20: { left: 200, right: 950 },
  40: { left: 200, right: 950 },
  60: { left: 200, right: 950 },
  80: { left: 200, right: 950 },
  100: { left: 200, right: 950 },
};
const VSPACE: Record<number, { above: number; below: number }> = {
  20: { above: 8, below: 5 },
  40: { above: 12, below: 8 },
  60: { above: 16, below: 10 },
  80: { above: 20, below: 12 },
  100: { above: 25, below: 15 },
};
const ROADWAY_Y = 307;
const SUPPORT_A_ID = "support-a";
const SUPPORT_B_ID = "support-b";

function BridgeToolPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const router = useRouter();
  const searchParams = useSearchParams();
  // Name of the cloud design currently open — saves go back to this record
  const [activeCloudName, setActiveCloudName] = useState<string | null>(null);
  // isDirtyRef drives the pushState intercept (sync); isDirty drives the dialog re-render
  const isDirtyRef = useRef(false);
  const [isDirty, setIsDirtyState] = useState(false);
  function setIsDirty(val: boolean) { isDirtyRef.current = val; setIsDirtyState(val); }
  // While true, state changes from loading a design don't mark the work as dirty
  const suppressDirtyRef = useRef(true);
  const [leaveUrl, setLeaveUrl] = useState<string | null>(null);
  const hasLoadedRef = useRef<boolean>(false);
  const historyRef = useRef<
    Array<{
      nodes: Node[];
      members: Member[];
      spanFeet: 20 | 40 | 60 | 80 | 100;
      loadLb: number;
      snapStepFeet: 0.5 | 1 | 2.5 | 5;
      snapToGrid: boolean;
      showGrid: boolean;
    }>
  >([]);
  const redoRef = useRef<
    Array<{
      nodes: Node[];
      members: Member[];
      spanFeet: 20 | 40 | 60 | 80 | 100;
      loadLb: number;
      snapStepFeet: 0.5 | 1 | 2.5 | 5;
      snapToGrid: boolean;
      showGrid: boolean;
    }>
  >([]);
  const [_historyVersion, setHistoryVersion] = useState<number>(0);
  const dragUndoArmedRef = useRef<boolean>(false);
  const [tool, setTool] = useState<Tool>("select");
  const [snapToGrid, setSnapToGrid] = useState<boolean>(DEFAULT_SNAP_TO_GRID);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [snapStepFeet, setSnapStepFeet] = useState<0.5 | 1 | 2.5 | 5>(
    DEFAULT_SNAP_STEP_FEET
  );
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const [inspectionHasRun, setInspectionHasRun] = useState<boolean>(false);
  const [costExpanded, setCostExpanded] = useState<boolean>(false);
  const [optionsExpanded, setOptionsExpanded] = useState<boolean>(false);
  const [materialExpanded, setMaterialExpanded] = useState<boolean>(true);
  const [spanFeet, setSpanFeet] = useState<20 | 40 | 60 | 80 | 100>(
    INITIAL_SPAN_FEET
  );
  const [loadLb, setLoadLb] = useState<number>(LOAD_TON_OPTIONS[0] * LB_PER_TON);
  type StressTestResult = {
    memberForces: Record<string, number>;
    memberUtilizationById?: Record<string, number>;
    memberCapById?: Record<string, number>;
    nodeDisplacements?: Record<string, { dx: number; dy: number }>;
    maxTension: number;
    maxCompression: number;
    failedMemberIds: string[];
    maxUtilization: number;
    worstMembers: {
      id: string;
      force: number;
      utilization: number;
      cap: number;
      type: MemberType;
    }[];
  };
  const [stressTestResult, setStressTestResult] = useState<StressTestResult | null>(
    null
  );
  const [stressTestFrames, setStressTestFrames] = useState<StressTestResult[] | null>(
    null
  );
  const stressTestFramesRef = useRef<StressTestResult[] | null>(null);
  const [liveStressTestResult, setLiveStressTestResult] =
    useState<StressTestResult | null>(null);
  const [stressTestError, setStressTestError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testProgress, setTestProgress] = useState<number>(0);
  const testRafRef = useRef<number | null>(null);
  const testStopProgressRef = useRef<number>(1);
  const [showExportDialog, setShowExportDialog] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [exportPrintIntent, setExportPrintIntent] = useState<"yes" | "no" | null>(null);
  const [exportPaperSize, setExportPaperSize] = useState<ExportPaperSize>("letter");
  const [exportPrintLengthIn, setExportPrintLengthIn] = useState<string>("");
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [showSaveDialog, setShowSaveDialog] = useState<boolean>(false);
  // "name-required" = bridge has no name yet, "confirm-replace" = name already exists in cloud
  const [saveDialogMode, setSaveDialogMode] = useState<"name-required" | "confirm-replace">("name-required");
  const [savePendingName, setSavePendingName] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Assignment mode
  interface AssignmentConfig { id: string; title: string; span_feet: 20 | 40 | 60 | 80 | 100; load_lb: number; max_cost: number; }
  const [assignmentConfig, setAssignmentConfig] = useState<AssignmentConfig | null>(null);
  const [assignmentSubmitted, setAssignmentSubmitted] = useState(false);
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);

  // Real, clickable, connectable supports ON the grid
  const { left: initialLeft, right: initialRight } = SUPPORT_X[INITIAL_SPAN_FEET];
  const [nodes, setNodes] = useState<Node[]>([
    {
      id: SUPPORT_A_ID,
      x: initialLeft,
      y: ROADWAY_Y,
    },
    {
      id: SUPPORT_B_ID,
      x: initialRight,
      y: ROADWAY_Y,
    },
  ]);
  const [members, setMembers] = useState<Member[]>([]);
  const [bridgeName, setBridgeName] = useState<string>("");
  const [designerName, setDesignerName] = useState<string>("");
  const [activeMemberType, setActiveMemberType] = useState<MemberType>("box_3");
  const [selectedSizeMixed, setSelectedSizeMixed] = useState<boolean>(false);
  const [selectedGradeMixed, setSelectedGradeMixed] = useState<boolean>(false);
  const [materialGrade, setMaterialGrade] = useState<MaterialGrade>("mild");

  const [pendingNodeId, setPendingNodeId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<{
    start: { x: number; y: number };
    current: { x: number; y: number };
  } | null>(null);
  const memberDragStartRef = useRef<string | null>(null);
  const [memberPreview, setMemberPreview] = useState<{
    x: number;
    y: number;
    targetNodeId: string | null;
  } | null>(null);

  // Drag
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState<boolean>(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [svgRect, setSvgRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  }>({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  });

  function resetAnalysisState(cancelRunningTest = false) {
    if (cancelRunningTest && testRafRef.current) {
      cancelAnimationFrame(testRafRef.current);
      testRafRef.current = null;
    }
    setInspectionHasRun(false);
    setStressTestResult(null);
    setStressTestError(null);
    setStressTestFrames(null);
    stressTestFramesRef.current = null;
    setLiveStressTestResult(null);
    setIsTesting(false);
    setTestProgress(0);
    testStopProgressRef.current = 1;
  }

  const updateSvgRect = React.useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setSvgRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarsePointer(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    suppressDirtyRef.current = false;
  }, []);

  // Load a specific cloud design when opened via ?id= (from My Work / My Classes)
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) return;
    fetchBridgeDesignById(id).then(async design => {
      if (!design) return;
      suppressDirtyRef.current = true;
      applyImportedBridgeState({
        nodes: design.nodes as Node[],
        members: design.members as Member[],
        spanFeet: design.span_feet as (20 | 40 | 60 | 80 | 100) ?? undefined,
        loadLb: design.load_lb ?? undefined,
        bridgeName: design.name,
        designerName: design.designer_name ?? undefined,
      });
      setActiveCloudName(design.name);
      setIsDirty(false);
      // If this design was created for an assignment, restore assignment mode
      if (design.assignment_id) {
        const res = await fetch(`/api/bridge-assignments/${design.assignment_id}`);
        if (res.ok) {
          const config: AssignmentConfig = await res.json();
          setAssignmentConfig(config);
        }
      }
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        suppressDirtyRef.current = false;
      }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Load assignment config, existing design, and prior submission status when opened via ?assignment=<id>
  useEffect(() => {
    const aid = searchParams.get("assignment");
    if (!aid) return;
    Promise.all([
      fetch(`/api/bridge-assignments/${aid}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/bridge/by-assignment?assignmentId=${aid}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/bridge-submissions/mine?assignmentId=${aid}`).then(r => r.ok ? r.json() : null),
    ]).then(([config, existingDesign, priorSubmission]: [
      AssignmentConfig | null,
      { nodes: unknown[]; members: unknown[]; span_feet: number; load_lb: number; name: string; designer_name: string | null } | null,
      { cost: number; passed: boolean } | null,
    ]) => {
      if (!config) return;
      setAssignmentConfig(config);
      if (priorSubmission) setAssignmentSubmitted(true);
      suppressDirtyRef.current = true;
      // Deterministic save key: asgn_<assignmentId> — unique per student+assignment, no SQL column needed
      const saveKey = `asgn_${aid}`;
      const displayName = config.title || 'Bridge Assignment';
      if (existingDesign?.nodes?.length) {
        applyImportedBridgeState({
          nodes: existingDesign.nodes as Node[],
          members: existingDesign.members as Member[],
          spanFeet: config.span_feet,
          loadLb: config.load_lb,
          bridgeName: displayName,
          designerName: existingDesign.designer_name ?? undefined,
        });
        setActiveCloudName(saveKey);
        setIsDirty(false);
      } else {
        setSpanFeet(config.span_feet);
        setLoadLb(config.load_lb);
        setBridgeName(displayName);
        setActiveCloudName(saveKey);
      }
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        suppressDirtyRef.current = false;
      }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!hasLoadedRef.current || suppressDirtyRef.current) return;
    setIsDirty(true);
  }, [nodes, members, spanFeet, loadLb, snapStepFeet, snapToGrid, showGrid, bridgeName, designerName]);

  useEffect(() => {
    resetAnalysisState(true);
  }, [nodes, members, spanFeet, loadLb]);

  // Auto-save in assignment mode so work is always recoverable on reopen
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isDirty || !assignmentConfig || !activeCloudName || !session?.user) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      performCloudSave(activeCloudName);
    }, 4000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, nodes, members, assignmentConfig, activeCloudName]);

  // Hard navigation guard (tab close, refresh, browser back to external site)
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function safeNavigate(url: string) {
    if (isDirtyRef.current) { setLeaveUrl(url); } else { router.push(url); }
  }

  useEffect(() => {
    const { left, right } = SUPPORT_X[spanFeet];
    setNodes((prev) =>
      prev.map((n) =>
        n.id === SUPPORT_A_ID
          ? { ...n, x: left, y: ROADWAY_Y }
          : n.id === SUPPORT_B_ID
          ? { ...n, x: right, y: ROADWAY_Y }
          : n
      )
    );
  }, [spanFeet]);

  const nodeById = useMemo(() => {
    const map = new Map<string, Node>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  const spanFt = spanFeet;
  const { left, right } = SUPPORT_X[spanFt];
  const supportA = nodeById.get(SUPPORT_A_ID) ?? {
    x: left,
    y: ROADWAY_Y,
    id: SUPPORT_A_ID,
  };
  const supportB = nodeById.get(SUPPORT_B_ID) ?? {
    x: right,
    y: ROADWAY_Y,
    id: SUPPORT_B_ID,
  };
  const deckY = supportA.y;
  const spanUnits = supportB.x - supportA.x;

  function getFeetPerUnit() {
    const roadwayJoints = nodes.filter((n) => Math.abs(n.y - ROADWAY_Y) < 0.5);
    let leftRoadwayX = supportA.x;
    let rightRoadwayX = supportB.x;
    if (roadwayJoints.length >= 2) {
      leftRoadwayX = roadwayJoints[0].x;
      rightRoadwayX = roadwayJoints[0].x;
      for (const joint of roadwayJoints) {
        if (joint.x < leftRoadwayX) leftRoadwayX = joint.x;
        if (joint.x > rightRoadwayX) rightRoadwayX = joint.x;
      }
    }
    const abutmentUnits = Math.abs(rightRoadwayX - leftRoadwayX);
    if (abutmentUnits <= 0) return 0;
    return spanFt / abutmentUnits;
  }

  const feetPerUnit = getFeetPerUnit();
  const pixelsPerFoot =
    SUPPORT_X[spanFt].right > SUPPORT_X[spanFt].left
      ? (SUPPORT_X[spanFt].right - SUPPORT_X[spanFt].left) / spanFt
      : UNITS_PER_FOOT;
  const centerX = (supportA.x + supportB.x) / 2;
  const baseMarginX = Math.max(2, spanFt * 0.1);
  const marginX = Math.max(baseMarginX, 40) * UNITS_PER_FOOT;
  const marginUp = 20 * UNITS_PER_FOOT;
  const marginDown = 18 * UNITS_PER_FOOT;
  const minY = ROADWAY_Y - marginUp;
  const maxY = ROADWAY_Y + marginDown;
  const viewHeight = maxY - minY;
  const baseMinX = supportA.x - marginX;
  const baseMaxX = supportB.x + marginX;
  const baseViewWidth = baseMaxX - baseMinX;
  const canvasAspect =
    svgRect.width > 0 && svgRect.height > 0
      ? svgRect.width / svgRect.height
      : baseViewWidth / viewHeight;
  const targetViewWidth = viewHeight * canvasAspect;
  const minViewWidth = spanUnits + 6 * UNITS_PER_FOOT;
  const viewWidth = Math.max(minViewWidth, targetViewWidth);
  const minX = centerX - viewWidth / 2;
  const maxX = centerX + viewWidth / 2;
  const bridgeStartProgress =
    maxX - minX > 0 ? (supportA.x - minX) / (maxX - minX) : 0;
  const bridgeEndProgress =
    maxX - minX > 0 ? (supportB.x - minX) / (maxX - minX) : 1;

  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) ?? null,
    [members, selectedMemberId]
  );
  const memberPreviewStart = memberDragStartRef.current
    ? nodeById.get(memberDragStartRef.current) ?? null
    : null;
  const activeStressTestResult = isTesting
    ? liveStressTestResult
    : stressTestResult;
  const activeStressTestError = isTesting ? null : stressTestError;
  const failedMemberIdsForDisplay = isTesting
    ? activeStressTestResult?.failedMemberIds
    : stressTestResult?.failedMemberIds;
  const LIVE_DEFLECT_SCALE = 26;
  const GLOBAL_BOW_MAX = 24;
  const GLOBAL_BOW_START_UTIL = 0.9;
  const GLOBAL_BOW_FULL_UTIL = 1.8;
  const liveNodeOffsetById = useMemo(() => {
    const offsets = activeStressTestResult?.nodeDisplacements ?? null;
    if (!isTesting || !offsets) return null;
    const map = new Map<string, { dx: number; dy: number }>();
    for (const [id, d] of Object.entries(offsets)) {
      map.set(id, d);
    }
    return map;
  }, [activeStressTestResult, isTesting]);
  const memberUtilizationById = useMemo(() => {
    if (activeStressTestResult?.memberUtilizationById) {
      return activeStressTestResult.memberUtilizationById;
    }
    if (!activeStressTestResult?.worstMembers) return null;
    const map: Record<string, number> = {};
    for (const w of activeStressTestResult.worstMembers) map[w.id] = w.utilization;
    return map;
  }, [activeStressTestResult]);
  const memberHitStrokeWidth =
    tool === "erase"
      ? isCoarsePointer
        ? 28
        : 56
      : tool === "select"
      ? isCoarsePointer
        ? 18
        : 28
      : 28;
  const nodeHitRadius =
    tool === "erase"
      ? isCoarsePointer
        ? 11
        : 18
      : tool === "member"
      ? isCoarsePointer
        ? 11
        : 14
      : 14;
  const eraseCursor = isCoarsePointer ? "crosshair" : `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><g transform='rotate(-45,16,16)'><rect x='12' y='1' width='8' height='14' rx='1.5' fill='%23fdd835' stroke='%23e6b800' stroke-width='1'/><rect x='13' y='2' width='2.5' height='10' rx='1' fill='%23ffffff' fill-opacity='0.25'/><rect x='11.5' y='15' width='9' height='4' rx='0.5' fill='%23c0c0c0' stroke='%23999999' stroke-width='0.8'/><rect x='12' y='19' width='8' height='9' rx='1' fill='%23f4a0a0' stroke='%23cc7070' stroke-width='1'/><rect x='12' y='26' width='8' height='2' rx='0' fill='%23e07878'/><rect x='13.5' y='20' width='2.5' height='6' rx='1' fill='%23ffffff' fill-opacity='0.28'/></g></svg>") 23 23, crosshair`;
  const jointDragCursor = isCoarsePointer
    ? "crosshair"
    : dragNodeId
    ? "grabbing"
    : "grab";
  const memberCapById = useMemo(() => {
    if (activeStressTestResult?.memberCapById) {
      return activeStressTestResult.memberCapById;
    }
    if (!activeStressTestResult?.worstMembers) return null;
    const map: Record<string, number> = {};
    for (const w of activeStressTestResult.worstMembers) map[w.id] = w.cap;
    return map;
  }, [activeStressTestResult]);
  const demandProfile = useMemo(() => {
    if (!activeStressTestResult?.memberForces) return null;
    const roadwayNodes = nodes
      .filter((n) => Math.abs(n.y - ROADWAY_Y) < 0.5)
      .sort((a, b) => a.x - b.x);
    if (roadwayNodes.length < 2) return null;

    const raw: Array<{ id: string; value: number }> = roadwayNodes.map((n) => {
      const connected = members.filter((m) => m.a === n.id || m.b === n.id);
      if (connected.length === 0) return { id: n.id, value: 0 };
      let sum = 0;
      for (const m of connected) {
        sum += Math.abs(activeStressTestResult.memberForces[m.id] ?? 0);
      }
      return { id: n.id, value: sum / connected.length };
    });

    const smoothed = raw.map((item, idx) => {
      let sum = item.value;
      let count = 1;
      if (idx > 0) {
        sum += raw[idx - 1].value;
        count += 1;
      }
      if (idx < raw.length - 1) {
        sum += raw[idx + 1].value;
        count += 1;
      }
      return { id: item.id, value: sum / count };
    });

    const max = smoothed.reduce((acc, cur) => Math.max(acc, cur.value), 0);
    return { points: smoothed, max };
  }, [activeStressTestResult, members, nodes]);
  function getRenderedNodePosition(n: Node): { x: number; y: number } {
    const d = liveNodeOffsetById?.get(n.id);
    const x = n.x + (d?.dx ?? 0) * LIVE_DEFLECT_SCALE;
    const y = n.y - (d?.dy ?? 0) * LIVE_DEFLECT_SCALE + getGlobalBridgeBowAtX(x);

    return { x, y };
  }
  function getLiveDeckDeflectionAtX(x: number): number {
    if (!isTesting || !liveNodeOffsetById) return 0;
    const roadwayNodes = nodes
      .filter((n) => Math.abs(n.y - ROADWAY_Y) < 0.5)
      .sort((a, b) => a.x - b.x);
    if (roadwayNodes.length === 0) return 0;
    if (roadwayNodes.length === 1) {
      const d = liveNodeOffsetById.get(roadwayNodes[0].id);
      return -(d?.dy ?? 0) * LIVE_DEFLECT_SCALE;
    }
    const first = roadwayNodes[0];
    const last = roadwayNodes[roadwayNodes.length - 1];
    if (x <= first.x) {
      const d = liveNodeOffsetById.get(first.id);
      return -(d?.dy ?? 0) * LIVE_DEFLECT_SCALE;
    }
    if (x >= last.x) {
      const d = liveNodeOffsetById.get(last.id);
      return -(d?.dy ?? 0) * LIVE_DEFLECT_SCALE;
    }
    for (let i = 0; i < roadwayNodes.length - 1; i += 1) {
      const left = roadwayNodes[i];
      const right = roadwayNodes[i + 1];
      if (x < left.x || x > right.x) continue;
      const span = right.x - left.x;
      if (span <= 0) continue;
      const t = (x - left.x) / span;
      const dLeft = liveNodeOffsetById.get(left.id);
      const dRight = liveNodeOffsetById.get(right.id);
      const yLeft = -(dLeft?.dy ?? 0) * LIVE_DEFLECT_SCALE;
      const yRight = -(dRight?.dy ?? 0) * LIVE_DEFLECT_SCALE;
      return yLeft + (yRight - yLeft) * t;
    }
    return 0;
  }
  function getGlobalBridgeBowAtX(x: number): number {
    if (!isTesting || !activeStressTestResult) return 0;
    const util = activeStressTestResult.maxUtilization ?? 0;
    const severityRaw =
      (util - GLOBAL_BOW_START_UTIL) / (GLOBAL_BOW_FULL_UTIL - GLOBAL_BOW_START_UTIL);
    const severity = Math.max(0, Math.min(1, severityRaw));
    if (severity <= 0) return 0;
    const span = Math.max(1, Math.abs(supportB.x - supportA.x));
    const center = (supportA.x + supportB.x) / 2;
    const half = span / 2;
    const t = half > 0 ? (x - center) / half : 0;
    const shape = Math.max(0, 1 - t * t);
    const travelRaw =
      bridgeEndProgress - bridgeStartProgress > 0
        ? (testProgress - bridgeStartProgress) / (bridgeEndProgress - bridgeStartProgress)
        : 0;
    const travel = Math.max(0, Math.min(1, travelRaw));
    const onBridgeFactor = Math.sin(Math.PI * travel);
    const amp = GLOBAL_BOW_MAX * severity * Math.max(0, onBridgeFactor);
    return amp * shape;
  }
  function getStressStroke(force: number | null, utilization: number): string {
    if (force === null) return "#666";
    const t = Math.max(0, Math.min(1, utilization));
    if (force >= 0) {
      const intensity = Math.round(130 + t * 90);
      return `rgb(${intensity}, 52, 52)`;
    }
    const intensity = Math.round(130 + t * 90);
    return `rgb(52, 112, ${intensity})`;
  }
  const canUndo = historyRef.current.length > 0;
  const canRedo = redoRef.current.length > 0;
  const boxKeys = Object.keys(MEMBER_LIBRARY)
    .filter((k) => k.startsWith("box"))
    .sort((aKey, bKey) => {
      const aLabel = MEMBER_LIBRARY[aKey as MemberType]?.label ?? "";
      const bLabel = MEMBER_LIBRARY[bKey as MemberType]?.label ?? "";
      const aParsed = parseBoxTube(aLabel);
      const bParsed = parseBoxTube(bLabel);
      if (aParsed && bParsed) return aParsed.b - bParsed.b;
      if (aParsed) return -1;
      if (bParsed) return 1;
      return aKey.localeCompare(bKey);
    });
  const sizeKeys = boxKeys as MemberType[];
  const loadLevel = getLoadLevel(loadLb);
  const selectedLoadTon = nearestLoadTon(loadLb);
  function getMemberGrade(member: Member): MaterialGrade {
    return member.grade ?? "mild";
  }
  function getMaterialStrengthMultiplier(grade: MaterialGrade): number {
    return grade === "high" ? 1.5 : 1.0;
  }
  function getMaterialCostMultiplier(grade: MaterialGrade): number {
    return grade === "high" ? 1.3 : 1.0;
  }

  useEffect(() => {
    if (selectedMemberIds.size === 0) {
      setSelectedSizeMixed(false);
      setSelectedGradeMixed(false);
      return;
    }
    const selectedTypes = new Set<MemberType>();
    const selectedGrades = new Set<MaterialGrade>();
    for (const m of members) {
      if (selectedMemberIds.has(m.id)) {
        selectedTypes.add(m.type);
        selectedGrades.add(getMemberGrade(m));
      }
    }
    if (selectedTypes.size === 1) {
      const [onlyType] = Array.from(selectedTypes);
      setSelectedSizeMixed(false);
      if (onlyType) setActiveMemberType(onlyType);
    } else if (selectedTypes.size > 1) {
      setSelectedSizeMixed(true);
    }
    if (selectedGrades.size === 1) {
      const [onlyGrade] = Array.from(selectedGrades);
      setSelectedGradeMixed(false);
      if (onlyGrade) setMaterialGrade(onlyGrade);
    } else if (selectedGrades.size > 1) {
      setSelectedGradeMixed(true);
    }
  }, [members, selectedMemberIds]);

  function pushHistorySnapshot() {
    historyRef.current.push({
      nodes: nodes.map((n) => ({ ...n })),
      members: members.map((m) => ({ ...m })),
      spanFeet,
      loadLb,
      snapStepFeet,
      snapToGrid,
      showGrid,
    });
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
    }
    redoRef.current = [];
    setHistoryVersion((v) => v + 1);
  }

  function undoLastEdit() {
    const prev = historyRef.current.pop();
    if (!prev) return;
    redoRef.current.push({
      nodes: nodes.map((n) => ({ ...n })),
      members: members.map((m) => ({ ...m })),
      spanFeet,
      loadLb,
      snapStepFeet,
      snapToGrid,
      showGrid,
    });
    setNodes(prev.nodes);
    setMembers(prev.members);
    setSpanFeet(prev.spanFeet);
    setLoadLb(prev.loadLb);
    setSnapStepFeet(prev.snapStepFeet);
    setSnapToGrid(prev.snapToGrid);
    setShowGrid(prev.showGrid);
    setPendingNodeId(null);
    setSelectedMemberId(null);
    setSelectedMemberIds(new Set());
    setDragNodeId(null);
    setSelectionBox(null);
    setStressTestResult(null);
    setStressTestError(null);
    setHistoryVersion((v) => v + 1);
  }

  function redoLastEdit() {
    const next = redoRef.current.pop();
    if (!next) return;
    historyRef.current.push({
      nodes: nodes.map((n) => ({ ...n })),
      members: members.map((m) => ({ ...m })),
      spanFeet,
      loadLb,
      snapStepFeet,
      snapToGrid,
      showGrid,
    });
    setNodes(next.nodes);
    setMembers(next.members);
    setSpanFeet(next.spanFeet);
    setLoadLb(next.loadLb);
    setSnapStepFeet(next.snapStepFeet);
    setSnapToGrid(next.snapToGrid);
    setShowGrid(next.showGrid);
    setPendingNodeId(null);
    setSelectedMemberId(null);
    setSelectedMemberIds(new Set());
    setDragNodeId(null);
    setSelectionBox(null);
    setStressTestResult(null);
    setStressTestError(null);
    setHistoryVersion((v) => v + 1);
  }

  function resetDesign() {
    const confirmed = window.confirm("Erase the entire design?");
    if (!confirmed) return;
    pushHistorySnapshot();
    const { left: ax, right: bx } = SUPPORT_X[spanFeet];
    setNodes([
      { id: SUPPORT_A_ID, x: ax, y: ROADWAY_Y },
      { id: SUPPORT_B_ID, x: bx, y: ROADWAY_Y },
    ]);
    setMembers([]);
    setPendingNodeId(null);
    setSelectedMemberId(null);
    setSelectedMemberIds(new Set());
    setDragNodeId(null);
    setSelectionBox(null);
    setSnapStepFeet(DEFAULT_SNAP_STEP_FEET);
    setSnapToGrid(DEFAULT_SNAP_TO_GRID);
    setStressTestResult(null);
    setStressTestError(null);
    setBridgeName("");
    setDesignerName("");
  }

  function thicknessToStrokeWidth(t: MemberType) {
    return MEMBER_LIBRARY[t].strokeW * 1.4;
  }

  function isBoxType(type: MemberType) {
    return type.startsWith("box");
  }

  function memberFamilyFromType(_t: MemberType): "box" {
    return "box";
  }

  function normalizeMemberFamily(typeStr: string): "box" | "unknown" {
    const text = typeStr.toLowerCase().trim();
    if (text.includes("box") || text.includes("hss")) return "box";
    return "unknown";
  }

  function normalizeSizeLabel(label: string): string {
    return label.replace(/[×]/g, "x").replace(/\s+/g, " ").trim();
  }

  function parseBoxTube(label: string): { b: number; t: number } | null {
    const normalized = normalizeSizeLabel(label);
    const match = normalized.match(/box tube\s+([0-9.]+)"x([0-9.]+)"x([^"]+)"/i);
    if (!match) return null;
    const b = Number(match[1]);
    const tRaw = match[3].trim();
    if (!Number.isFinite(b) || b <= 0) return null;
    const t = parseFraction(tRaw);
    if (t === null || t <= 0) return null;
    return { b, t };
  }

  function formatMemberSizeNoGauge(type: MemberType): string {
    const label = MEMBER_LIBRARY[type]?.label ?? "";
    const parsed = parseBoxTube(label);
    if (parsed) {
      return `${parsed.b}"x${parsed.b}"`;
    }
    return label.replace(/^Steel Box Tube\s+/, "");
  }

  function parseFraction(value: string): number | null {
    if (value.includes("/")) {
      const [num, den] = value.split("/").map((v) => Number(v));
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
      return num / den;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  let boxCostCheckDone = false;
  if (!boxCostCheckDone && process.env.NODE_ENV !== "production") {
    boxCostCheckDone = true;
    const byOuter = new Map<number, Array<{ wall: number; cost: number; label: string }>>();
    const byWall = new Map<number, Array<{ outer: number; cost: number; label: string }>>();
    for (const entry of Object.values(MEMBER_LIBRARY)) {
      if (!entry.label.includes("Box Tube")) continue;
      const parsed = parseBoxTube(entry.label);
      if (!parsed) continue;
      const outer = parsed.b;
      const wall = parsed.t;
      if (!byOuter.has(outer)) byOuter.set(outer, []);
      if (!byWall.has(wall)) byWall.set(wall, []);
      byOuter.get(outer)?.push({ wall, cost: entry.costPerFt, label: entry.label });
      byWall.get(wall)?.push({ outer, cost: entry.costPerFt, label: entry.label });
    }
    for (const [outer, items] of byOuter) {
      const sorted = [...items].sort((a, b) => a.wall - b.wall);
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i].cost <= sorted[i - 1].cost) {
          console.warn(
            `Box cost monotonicity issue at outer ${outer}\":`,
            sorted[i - 1],
            sorted[i]
          );
        }
      }
    }
    for (const [wall, items] of byWall) {
      const sorted = [...items].sort((a, b) => a.outer - b.outer);
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i].cost <= sorted[i - 1].cost) {
          console.warn(
            `Box cost monotonicity issue at wall ${wall}\":`,
            sorted[i - 1],
            sorted[i]
          );
        }
      }
    }
  }

  function boxAreaIndex(b: number, t: number): number {
    return 4 * t * (b - t);
  }

  function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  const BASE_BOX_LABEL = 'Steel Box Tube 1"x1"x3/16"';
  const BASE_BOX_COST = MEMBER_LIBRARY.box_1.costPerFt;
  const BASE_BOX_AREA = (() => {
    const parsed = parseBoxTube(BASE_BOX_LABEL);
    return parsed ? boxAreaIndex(parsed.b, parsed.t) : 1;
  })();

  function getBoxAreaRatio(label: string): number {
    const parsed = parseBoxTube(label);
    if (!parsed || BASE_BOX_AREA <= 0) return 1;
    return boxAreaIndex(parsed.b, parsed.t) / BASE_BOX_AREA;
  }

  function getMemberStrengthIndex(member: Member): number {
    const label = MEMBER_LIBRARY[member.type]?.label ?? "";
    const family = normalizeMemberFamily(label);
    if (family === "box") {
      return getBoxAreaRatio(label);
    }
    return 1.0;
  }

  function getSpanFtFromUI(): number {
    return spanFeet;
  }

  function nearestLoadTon(loadInLb: number): (typeof LOAD_TON_OPTIONS)[number] {
    let best: (typeof LOAD_TON_OPTIONS)[number] = LOAD_TON_OPTIONS[0];
    let bestDiff = Math.abs(loadInLb - best * LB_PER_TON);
    for (const ton of LOAD_TON_OPTIONS) {
      const diff = Math.abs(loadInLb - ton * LB_PER_TON);
      if (diff < bestDiff) {
        best = ton;
        bestDiff = diff;
      }
    }
    return best;
  }

  function normalizeLoadLb(loadInLb: number): number {
    return nearestLoadTon(loadInLb) * LB_PER_TON;
  }

  function formatTons(loadInLb: number): string {
    const tons = loadInLb / LB_PER_TON;
    return `${Number.isInteger(tons) ? tons.toFixed(0) : tons.toFixed(2)} ton`;
  }

  function getLoadLbFromUI(): number {
    return loadLb;
  }

  function isSimpleBeamBridge(nodesList: Node[], membersList: Member[]): boolean {
    if (membersList.length !== 1) return false;
    const roadwayNodes = nodesList.filter((n) => Math.abs(n.y - ROADWAY_Y) < 0.5);
    if (roadwayNodes.length < 2) return false;
    let leftNode = roadwayNodes[0];
    let rightNode = roadwayNodes[0];
    for (const n of roadwayNodes) {
      if (n.x < leftNode.x) leftNode = n;
      if (n.x > rightNode.x) rightNode = n;
    }
    const onlyMember = membersList[0];
    const connectsAbutments =
      (onlyMember.a === leftNode.id && onlyMember.b === rightNode.id) ||
      (onlyMember.a === rightNode.id && onlyMember.b === leftNode.id);
    if (!connectsAbutments) return false;
    return true;
  }

  function getLoadLevel(load: number | string): LoadLevel {
    if (typeof load === "number") {
      if (load <= 2000) return "low";
      if (load <= 6000) return "med";
      return "high";
    }
    const text = load.toLowerCase();
    if (text.includes("people") || text.includes("walker")) return "low";
    if (text.includes("horse") || text.includes("buggy")) return "med";
    if (text.includes("car") || text.includes("cart")) return "med";
    if (text.includes("truck") || text.includes("semi")) return "high";
    return "med";
  }

  function setSelectedMemberType(nextType: MemberType) {
    if (selectedMemberIds.size === 0) return;
    pushHistorySnapshot();
    setMembers((prev) =>
      prev.map((m) =>
        selectedMemberIds.has(m.id)
          ? { ...m, type: nextType }
          : m
      )
    );
  }

  function setSelectedMemberGrade(nextGrade: MaterialGrade) {
    if (selectedMemberIds.size === 0) return;
    pushHistorySnapshot();
    setMembers((prev) =>
      prev.map((m) =>
        selectedMemberIds.has(m.id) ? { ...m, grade: nextGrade } : m
      )
    );
  }

  function stepMemberType(type: MemberType, direction: -1 | 1): MemberType {
    const keys = boxKeys as MemberType[];
    const idx = keys.indexOf(type);
    if (idx === -1) return type;
    const nextIdx = Math.min(keys.length - 1, Math.max(0, idx + direction));
    return keys[nextIdx];
  }

  function stepSelectedMemberSizes(direction: -1 | 1) {
    if (selectedMemberIds.size === 0) {
      const nextType = stepMemberType(activeMemberType, direction);
        setSelectedSizeMixed(false);
        setActiveMemberType(nextType);
        return;
      }
    pushHistorySnapshot();
    setMembers((prev) =>
      prev.map((m) =>
        selectedMemberIds.has(m.id)
          ? { ...m, type: stepMemberType(m.type, direction) }
          : m
      )
    );
  }

  function snapX(value: number) {
    const grid = pixelsPerFoot * snapStepFeet;
    const leftPx = SUPPORT_X[spanFt].left;
    return Math.round((value - leftPx) / grid) * grid + leftPx;
  }

  function snapY(value: number) {
    const grid = pixelsPerFoot * snapStepFeet;
    return Math.round((value - ROADWAY_Y) / grid) * grid + ROADWAY_Y;
  }

  function clampToRulerBounds(point: { x: number; y: number }) {
    const leftPx = SUPPORT_X[spanFt].left;
    const rightPx = SUPPORT_X[spanFt].right;
    const usablePx = rightPx - leftPx;
    const pxPerFt = usablePx / spanFt;
    const minY = ROADWAY_Y - VSPACE[spanFt].above * pxPerFt;
    const maxY = ROADWAY_Y + VSPACE[spanFt].below * pxPerFt;
    return {
      x: Math.min(Math.max(point.x, leftPx), rightPx),
      y: Math.min(Math.max(point.y, minY), maxY),
    };
  }

  function distancePointToSegment(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number
  ) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    return Math.hypot(px - cx, py - cy);
  }

  function segmentIntersectionPoint(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    dx: number,
    dy: number
  ) {
    const rX = bx - ax;
    const rY = by - ay;
    const sX = dx - cx;
    const sY = dy - cy;
    const denom = rX * sY - rY * sX;
    if (Math.abs(denom) < 1e-6) return null;
    const u = ((cx - ax) * rY - (cy - ay) * rX) / denom;
    const t = ((cx - ax) * sY - (cy - ay) * sX) / denom;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: ax + t * rX, y: ay + t * rY };
  }

  function findClosestMemberIntersection(x: number, y: number, threshold: number) {
    let best: { x: number; y: number } | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < members.length; i += 1) {
      const m1 = members[i];
      const a1 = nodeById.get(m1.a);
      const b1 = nodeById.get(m1.b);
      if (!a1 || !b1) continue;
      for (let j = i + 1; j < members.length; j += 1) {
        const m2 = members[j];
        const a2 = nodeById.get(m2.a);
        const b2 = nodeById.get(m2.b);
        if (!a2 || !b2) continue;
        const pt = segmentIntersectionPoint(a1.x, a1.y, b1.x, b1.y, a2.x, a2.y, b2.x, b2.y);
        if (!pt) continue;
        if (
          distancePointToSegment(pt.x, pt.y, a1.x, a1.y, b1.x, b1.y) > threshold ||
          distancePointToSegment(pt.x, pt.y, a2.x, a2.y, b2.x, b2.y) > threshold
        ) {
          continue;
        }
        const d = Math.hypot(pt.x - x, pt.y - y);
        if (d <= threshold && d < bestDist) {
          best = pt;
          bestDist = d;
        }
      }
    }
    return best;
  }

  function findClosestMemberIdAtPoint(
    x: number,
    y: number,
    threshold: number
  ): string | null {
    let bestId: string | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const m of members) {
      const a = nodeById.get(m.a);
      const b = nodeById.get(m.b);
      if (!a || !b) continue;
      const d = distancePointToSegment(x, y, a.x, a.y, b.x, b.y);
      if (d <= threshold && d < bestDist) {
        bestDist = d;
        bestId = m.id;
      }
    }
    return bestId;
  }

  function findClosestNodeAtPoint(
    x: number,
    y: number,
    threshold: number,
    excludeId?: string
  ): Node | null {
    let best: Node | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const n of nodes) {
      if (excludeId && n.id === excludeId) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= threshold && d < bestDist) {
        best = n;
        bestDist = d;
      }
    }
    return best;
  }

  function segmentIntersectsRect(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    rx1: number,
    ry1: number,
    rx2: number,
    ry2: number
  ) {
    const minX = Math.min(rx1, rx2);
    const maxX = Math.max(rx1, rx2);
    const minY = Math.min(ry1, ry2);
    const maxY = Math.max(ry1, ry2);

    const aInside = ax >= minX && ax <= maxX && ay >= minY && ay <= maxY;
    const bInside = bx >= minX && bx <= maxX && by >= minY && by <= maxY;
    if (aInside || bInside) return true;

    function intersects(x1: number, y1: number, x2: number, y2: number) {
      const d1 = (ax - x1) * (y2 - y1) - (ay - y1) * (x2 - x1);
      const d2 = (bx - x1) * (y2 - y1) - (by - y1) * (x2 - x1);
      const d3 = (x1 - ax) * (by - ay) - (y1 - ay) * (bx - ax);
      const d4 = (x2 - ax) * (by - ay) - (y2 - ay) * (bx - ax);
      return d1 * d2 <= 0 && d3 * d4 <= 0;
    }

    return (
      intersects(minX, minY, maxX, minY) ||
      intersects(maxX, minY, maxX, maxY) ||
      intersects(maxX, maxY, minX, maxY) ||
      intersects(minX, maxY, minX, minY)
    );
  }

  function svgPointFromClient(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    return pt.matrixTransform(ctm.inverse());
  }

  function onCanvasClick(e: React.MouseEvent<SVGSVGElement>) {
    if (isTesting) return;
    // Only Joint tool adds nodes by clicking empty canvas
    if (tool !== "joint") return;

    const target = e.target as HTMLElement;
    if (target?.dataset?.kind === "node") return;
    if (target?.dataset?.kind === "member-hit") return;

    const loc = svgPointFromClient(e.clientX, e.clientY);
    if (!loc) return;

    const raw = {
      x: snapToGrid ? snapX(loc.x) : loc.x,
      y: snapToGrid ? snapY(loc.y) : loc.y,
    };
    const snapped = !snapToGrid
      ? findClosestMemberIntersection(raw.x, raw.y, 18) ?? raw
      : raw;
    const { x, y } = clampToRulerBounds(snapped);

    const splitThreshold = 10;
    const endpointThreshold = 10;
    const intersectingMembers: Member[] = [];

    for (const m of members) {
      const a = nodeById.get(m.a);
      const b = nodeById.get(m.b);
      if (!a || !b) continue;

      const d = distancePointToSegment(x, y, a.x, a.y, b.x, b.y);
      if (d <= splitThreshold) intersectingMembers.push(m);
    }

    if (intersectingMembers.length > 0) {
      pushHistorySnapshot();
      const newId = crypto.randomUUID();
      setNodes((prev) => [...prev, { id: newId, x, y }]);
      setMembers((prev) => {
        let next = [...prev];
        for (const member of intersectingMembers) {
          const a = nodeById.get(member.a);
          const b = nodeById.get(member.b);
          if (!a || !b) continue;
          const distToA = Math.hypot(x - a.x, y - a.y);
          const distToB = Math.hypot(x - b.x, y - b.y);
          if (distToA <= endpointThreshold || distToB <= endpointThreshold) continue;
          next = next.filter((m) => m.id !== member.id);
          next.push(
            {
              id: crypto.randomUUID(),
              a: member.a,
              b: newId,
              type: member.type,
              grade: member.grade ?? "mild",
            },
            {
              id: crypto.randomUUID(),
              a: newId,
              b: member.b,
              type: member.type,
              grade: member.grade ?? "mild",
            }
          );
        }
        return next;
      });
      return;
    }

    pushHistorySnapshot();
    setNodes((prev) => [...prev, { id: crypto.randomUUID(), x, y }]);
  }

  function onNodeClick(nodeId: string) {
    if (isTesting) return;
    const isSupport = nodeId === SUPPORT_A_ID || nodeId === SUPPORT_B_ID;

    if (tool === "erase") {
      // Supports cannot be erased
      if (isSupport) return;

      pushHistorySnapshot();
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setMembers((prev) => prev.filter((m) => m.a !== nodeId && m.b !== nodeId));
      setPendingNodeId(null);
      setSelectedMemberId(null);
      setSelectedMemberIds(new Set());
      return;
    }

    if (tool === "select") {
      setSelectedMemberId(null);
      setSelectedMemberIds(new Set());
      setPendingNodeId(null);
      return;
    }

    if (tool === "member") {
      setSelectedMemberId(null);
      setSelectedMemberIds(new Set());
      if (pendingNodeId && pendingNodeId !== nodeId) {
        pushHistorySnapshot();
      }
      setPendingNodeId((prev) => {
        if (!prev) return nodeId;
        if (prev === nodeId) return null;

        const a = prev;
        const b = nodeId;

        setMembers((mPrev) => {
          const aNode = nodeById.get(a);
          const bNode = nodeById.get(b);
          if (!aNode || !bNode) return mPrev;

          const dx = bNode.x - aNode.x;
          const dy = bNode.y - aNode.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq === 0) return mPrev;

          const collinear = nodes
            .filter((n) => n.id !== a && n.id !== b)
            .map((n) => {
              const t = ((n.x - aNode.x) * dx + (n.y - aNode.y) * dy) / lenSq;
              const dist = distancePointToSegment(
                n.x,
                n.y,
                aNode.x,
                aNode.y,
                bNode.x,
                bNode.y
              );
              if (t > 0 && t < 1 && dist <= 6) return { id: n.id, t };
              return null;
            })
            .filter((v): v is { id: string; t: number } => v !== null)
            .sort((x, y) => x.t - y.t);

          const chain = [a, ...collinear.map((c) => c.id), b];

          const hasDirect = mPrev.some(
            (m) => (m.a === a && m.b === b) || (m.a === b && m.b === a)
          );

          if (chain.length === 2) {
            if (hasDirect) return mPrev;
            return [
              ...mPrev,
              { id: crypto.randomUUID(), a, b, type: activeMemberType, grade: materialGrade },
            ];
          }

          const next = hasDirect
            ? mPrev.filter(
                (m) => !((m.a === a && m.b === b) || (m.a === b && m.b === a))
              )
            : [...mPrev];

          for (let i = 0; i < chain.length - 1; i += 1) {
            const u = chain[i];
            const v = chain[i + 1];
            const exists = next.some(
              (m) => (m.a === u && m.b === v) || (m.a === v && m.b === u)
            );
            if (!exists) {
              next.push({
                id: crypto.randomUUID(),
                a: u,
                b: v,
                type: activeMemberType,
                grade: materialGrade,
              });
            }
          }

          return next;
        });

        return null;
      });
    }
  }

  function addMemberChain(a: string, b: string) {
    const aNode = nodeById.get(a);
    const bNode = nodeById.get(b);
    if (!aNode || !bNode) return;

    const dx = bNode.x - aNode.x;
    const dy = bNode.y - aNode.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return;

    const collinear = nodes
      .filter((n) => n.id !== a && n.id !== b)
      .map((n) => {
        const t = ((n.x - aNode.x) * dx + (n.y - aNode.y) * dy) / lenSq;
        const dist = distancePointToSegment(
          n.x,
          n.y,
          aNode.x,
          aNode.y,
          bNode.x,
          bNode.y
        );
        if (t > 0 && t < 1 && dist <= 6) return { id: n.id, t };
        return null;
      })
      .filter((v): v is { id: string; t: number } => v !== null)
      .sort((x, y) => x.t - y.t);

    const chain = [a, ...collinear.map((c) => c.id), b];
    setMembers((mPrev) => {
      const hasDirect = mPrev.some(
        (m) => (m.a === a && m.b === b) || (m.a === b && m.b === a)
      );

      if (chain.length === 2) {
        if (hasDirect) return mPrev;
        return [
          ...mPrev,
          { id: crypto.randomUUID(), a, b, type: activeMemberType, grade: materialGrade },
        ];
      }

      const next = hasDirect
        ? mPrev.filter((m) => !((m.a === a && m.b === b) || (m.a === b && m.b === a)))
        : [...mPrev];

      for (let i = 0; i < chain.length - 1; i += 1) {
        const u = chain[i];
        const v = chain[i + 1];
        const exists = next.some(
          (m) => (m.a === u && m.b === v) || (m.a === v && m.b === u)
        );
        if (!exists) {
          next.push({
            id: crypto.randomUUID(),
            a: u,
            b: v,
            type: activeMemberType,
            grade: materialGrade,
          });
        }
      }

      return next;
    });
  }

  function onMemberClick(memberId: string, shiftKey: boolean) {
    if (isTesting) return;
    if (tool === "erase") {
      pushHistorySnapshot();
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      if (selectedMemberId === memberId) setSelectedMemberId(null);
      if (selectedMemberIds.has(memberId)) {
        setSelectedMemberIds((prev) => {
          const next = new Set(prev);
          next.delete(memberId);
          return next;
        });
      }
      setPendingNodeId(null);
      return;
    }

    if (tool === "select") {
      setSelectedMemberId(memberId);
      setSelectedMemberIds((prev) => {
        if (!shiftKey) return new Set([memberId]);
        const next = new Set(prev);
        if (next.has(memberId)) next.delete(memberId);
        else next.add(memberId);
        return next.size > 0 ? next : new Set([memberId]);
      });
      setPendingNodeId(null);
      return;
    }
  }

  function ToolButton({ id, label }: { id: Tool; label: string }) {
    const active = tool === id;
    return (
      <button
        onClick={() => {
          setTool(id);
          setPendingNodeId(null);
          if (id !== "select") {
            setSelectedMemberId(null);
            setSelectedMemberIds(new Set());
          }
        }}
        className={`${styles.toolbarIconButton} ${
          active ? styles.toolbarIconButtonActive : ""
        }`}
        aria-pressed={active}
        title={label}
      >
        <img src={`/ui/${id}-icon.png`} alt={label} />
      </button>
    );
  }

  // -------- Cost calculations --------
  function memberLengthUnits(m: Member): number {
    const a = nodeById.get(m.a);
    const b = nodeById.get(m.b);
    if (!a || !b) return 0;

    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function memberLengthFeet(m: Member): number {
    return memberLengthUnits(m) * feetPerUnit;
  }

  const costSummary = useMemo(() => {
    let boxCost = 0;

    let totalFeet = 0;
    let memberCostTotal = 0;

    for (const m of members) {
      const ft = memberLengthFeet(m);
      const props = MEMBER_LIBRARY[m.type];
      const isBox = m.type.startsWith("box");
      const materialCostMultiplier = getMaterialCostMultiplier(getMemberGrade(m));
      const costPerFt =
        (isBox ? BASE_BOX_COST * getBoxAreaRatio(props.label) : props.costPerFt) *
        materialCostMultiplier;
      const c = ft * costPerFt;
      if (isBox) boxCost += c;

      totalFeet += ft;
      memberCostTotal += c;
    }

    const jointCost = nodes.length * COST_PER_JOINT;
    const totalCost = memberCostTotal + jointCost;

    return {
      totalFeet,
      memberCostTotal,
      jointCost,
      boxCost,
      totalCost,
    };
  }, [feetPerUnit, members, nodeById, nodes.length]);

  const selectedMemberStats = useMemo(() => {
  

    if (!selectedMember) return null;
    const ft = memberLengthFeet(selectedMember);
      const materialCostMultiplier = getMaterialCostMultiplier(getMemberGrade(selectedMember));
      const rate =
        (selectedMember.type.startsWith("box")
          ? BASE_BOX_COST * getBoxAreaRatio(MEMBER_LIBRARY[selectedMember.type].label)
          : MEMBER_LIBRARY[selectedMember.type].costPerFt) *
        materialCostMultiplier;
    const cost = ft * rate;
    return { ft, rate, cost };
    }, [feetPerUnit, selectedMember, nodeById]);
  const selectedMemberStress = useMemo(() => {
  if (!selectedMember) return null;
  if (!activeStressTestResult) return null;

  const rec = activeStressTestResult.worstMembers.find(
    (w) => w.id === selectedMember.id
  );
  if (!rec) return null;

  return {
    force: rec.force,
    cap: rec.cap,
    utilization: rec.utilization,
    mode: rec.force > 0 ? "COMPRESSION" : "TENSION",
    type: rec.type,
  };
}, [selectedMember, activeStressTestResult]);


  const riskyBays = useMemo(() => findNonTriangulatedBays(), [nodes, members]);
  const crossingMembers = useMemo(() => findCrossingMembersWithoutJunction(), [nodes, members]);
  const unstableJointIds = useMemo(() => {
    const ids = new Set<string>();
    const supportIds = new Set([SUPPORT_A_ID, SUPPORT_B_ID]);
    const collinearTolerance = 1e-3;

    for (const node of nodes) {
      if (supportIds.has(node.id)) continue;
      const connected = members.filter((m) => m.a === node.id || m.b === node.id);
      if (connected.length === 0) continue;
      if (connected.length === 1) {
        ids.add(node.id);
        continue;
      }
      if (connected.length !== 2) continue;

      const neighbors = connected
        .map((m) => nodeById.get(m.a === node.id ? m.b : m.a))
        .filter((n): n is Node => Boolean(n));
      if (neighbors.length !== 2) continue;

      const v1x = neighbors[0].x - node.x;
      const v1y = neighbors[0].y - node.y;
      const v2x = neighbors[1].x - node.x;
      const v2y = neighbors[1].y - node.y;
      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);
      if (len1 < 1e-6 || len2 < 1e-6) {
        ids.add(node.id);
        continue;
      }

      const cross = Math.abs(v1x * v2y - v1y * v2x) / (len1 * len2);
      const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
      if (cross <= collinearTolerance && dot < -0.999) {
        ids.add(node.id);
      }
    }

    return ids;
  }, [members, nodeById, nodes]);
  const longMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of members) {
      const ft = memberLengthFeet(m);
      const label = MEMBER_LIBRARY[m.type]?.label ?? "";
      const family = normalizeMemberFamily(label);
      const index = getMemberStrengthIndex(m);
      const base = family === "box" ? 8 : 12;
      const recommended = base * Math.sqrt(index);
      if (ft > recommended + 0.25) ids.add(m.id);
    }
    return ids;
  }, [feetPerUnit, members, nodeById]);
  const longMembersCount = longMemberIds.size;
  const topChordPass = useMemo(() => {
    const TOP_CHORD_Y_TOL = 0.01;
    const aboveRoadway = nodes.filter((n) => n.y < ROADWAY_Y - TOP_CHORD_Y_TOL);
    if (aboveRoadway.length < 2) return false;
    const aboveIds = new Set(aboveRoadway.map((n) => n.id));
    const adjacency = new Map<string, string[]>();
    for (const n of nodes) adjacency.set(n.id, []);
    const isTopChordEdge = (a: Node, b: Node) => {
      const aAbove = a.y < ROADWAY_Y - TOP_CHORD_Y_TOL;
      const bAbove = b.y < ROADWAY_Y - TOP_CHORD_Y_TOL;
      if (aAbove && bAbove) return true;
      if (aAbove || bAbove) {
        const midY = (a.y + b.y) / 2;
        return midY < ROADWAY_Y - TOP_CHORD_Y_TOL;
      }
      return false;
    };
    for (const m of members) {
      const a = nodeById.get(m.a);
      const b = nodeById.get(m.b);
      if (!a || !b) continue;
      if (!isTopChordEdge(a, b)) continue;
      adjacency.get(m.a)?.push(m.b);
      adjacency.get(m.b)?.push(m.a);
    }
    let left = aboveRoadway[0];
    let right = aboveRoadway[0];
    for (const n of aboveRoadway) {
      if (n.x < left.x) left = n;
      if (n.x > right.x) right = n;
    }
    const visited = new Set<string>([left.id]);
    const queue: string[] = [left.id];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      if (current === right.id) return true;
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    return false;
  }, [members, nodeById, nodes]);
  const bottomChordPass = useMemo(() => {
    const bottomNodes = nodes.filter((n) => Math.abs(n.y - ROADWAY_Y) < 0.5);
    if (bottomNodes.length < 2) return false;
    let left = bottomNodes[0];
    let right = bottomNodes[0];
    for (const n of bottomNodes) {
      if (n.x < left.x) left = n;
      if (n.x > right.x) right = n;
    }
    const bottomNodeIds = new Set(bottomNodes.map((n) => n.id));
    const adjacency = new Map<string, string[]>();
    for (const n of bottomNodes) adjacency.set(n.id, []);
    for (const m of members) {
      if (!bottomNodeIds.has(m.a) || !bottomNodeIds.has(m.b)) continue;
      const a = nodeById.get(m.a);
      const b = nodeById.get(m.b);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      if (dx === 0) continue;
      const slope = Math.abs((b.y - a.y) / dx);
      if (slope > 0.5) continue;
      adjacency.get(a.id)?.push(b.id);
      adjacency.get(b.id)?.push(a.id);
    }
    const visited = new Set<string>([left.id]);
    const queue: string[] = [left.id];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      if (current === right.id) return true;
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    return false;
  }, [members, nodeById, nodes]);
  const spanConnectivity = useMemo(() => {
    const adjacency = new Map<string, string[]>();
    for (const n of nodes) adjacency.set(n.id, []);
    for (const m of members) {
      if (!adjacency.has(m.a)) adjacency.set(m.a, []);
      if (!adjacency.has(m.b)) adjacency.set(m.b, []);
      adjacency.get(m.a)?.push(m.b);
      adjacency.get(m.b)?.push(m.a);
    }

    const visited = new Set<string>();
    const queue: string[] = [SUPPORT_A_ID];
    visited.add(SUPPORT_A_ID);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      if (current === SUPPORT_B_ID) return true;
      const next = adjacency.get(current) ?? [];
      for (const nId of next) {
        if (!visited.has(nId)) {
          visited.add(nId);
          queue.push(nId);
        }
      }
    }

    return false;
  }, [nodes, members]);
  const spanFtUi = getSpanFtFromUI();
  const loadLbUi = getLoadLbFromUI();
  const isSimpleBeam = isSimpleBeamBridge(nodes, members);
  const simpleBeamMember = isSimpleBeam ? members[0] : null;
  const isSimpleBeamBox = isSimpleBeam;
  const stressFailReason = isSimpleBeamBox
    ? "Box tubes require intermediate joints/supports in this simulator. Add joints or use a truss."
    : "";
  const unstableStructure =
    Boolean(stressTestError) && stressTestError?.includes("Structure unstable");
  function degree(nodeId: string) {
    let count = 0;
    for (const m of members) {
      if (m.a === nodeId || m.b === nodeId) count += 1;
    }
    return count;
  }
  const supportAOk = isSimpleBeam || degree(SUPPORT_A_ID) >= 2;
  const supportBOk = isSimpleBeam || degree(SUPPORT_B_ID) >= 2;
  const isTrussDesign = members.length > 1 && riskyBays.length === 0;
  const hasSupportToSupportMember = members.some(
    (m) =>
      (m.a === SUPPORT_A_ID && m.b === SUPPORT_B_ID) ||
      (m.a === SUPPORT_B_ID && m.b === SUPPORT_A_ID)
  );
  const longMembersFail = longMembersCount > 0;
  const unstableJointsFail = unstableJointIds.size > 0;
  const inspectionFailReasons = [
    !spanConnectivity ? "Connectivity: left support not connected to right support." : null,
    !supportAOk ? "Left support must connect to at least 2 members." : null,
    !supportBOk ? "Right support must connect to at least 2 members." : null,
    riskyBays.length > 0 ? "Non-triangulated bays present." : null,
    crossingMembers.length > 0 ? "Members intersect without a junction joint. Add a joint where members cross." : null,
    unstableJointsFail
      ? "Unstable joint present. Do not place a joint in the middle of a single member unless another member also connects there."
      : null,
    longMembersFail ? "Members exceed maximum length." : null,
    !topChordPass ? "Missing continuous top chord." : null,
    !bottomChordPass
      ? "Bottom chord is not continuous from left support to right support."
      : null,
  ].filter((reason): reason is string => Boolean(reason));
  const inspectionWarningItems = [
    isTrussDesign && longMembersCount > 0
      ? {
          id: "long-members",
          text: "Some members exceed recommended length for the selected size. Consider adding joints or using a larger section.",
          memberIds: Array.from(longMemberIds),
        }
      : null,
  ].filter(
    (warning): warning is { id: string; text: string; memberIds: string[] } =>
      Boolean(warning)
  );
  const inspectionPassRaw =
    spanConnectivity &&
    supportAOk &&
    supportBOk &&
    riskyBays.length === 0 &&
    crossingMembers.length === 0 &&
    !unstableJointsFail &&
    !longMembersFail &&
    topChordPass &&
    bottomChordPass;
  const inspectionPass = inspectionHasRun ? inspectionPassRaw : false;
  const canRunStressTest = inspectionPass;
  const stressTestPass = isSimpleBeamBox
    ? false
    : (stressTestResult?.failedMemberIds.length ?? 0) === 0 &&
      !stressTestError &&
      inspectionPassRaw;
  const stressTestStatusLabel = isSimpleBeamBox
    ? stressTestPass
    ? "Pass"
    : "Fail"
    : stressTestResult
    ? stressTestPass
      ? "Pass"
      : "Fail"
    : "Pending";

  const assignmentComplete = assignmentConfig !== null
    && stressTestPass
    && inspectionPass
    && stressTestResult !== null
    && costSummary.totalCost <= assignmentConfig.max_cost;

  function getVehicleType(nextLoadLb: number): VehicleType {
    const tons = nearestLoadTon(nextLoadLb);
    if (tons === 30) return "Semi";
    if (tons === 15) return "Box Truck";
    if (tons === 8) return "Pickup Truck";
    return "Small Car";
  }

  function renderVehicle(type: VehicleType, x: number, y: number) {
    if (type === "People Walking") {
      return (
        <g transform={`translate(${x} ${y}) scale(3)`}>
          {[0, 14, 28].map((dx, i) => (
            <g key={`walker-${i}`} transform={`translate(${dx} 0)`}>
              <circle cx={0} cy={0} r={3} fill="#333" />
              <line x1={0} y1={3} x2={0} y2={12} stroke="#333" strokeWidth={1.5} />
              <line x1={0} y1={6} x2={-5} y2={10} stroke="#333" strokeWidth={1.5} />
              <line x1={0} y1={6} x2={5} y2={10} stroke="#333" strokeWidth={1.5} />
            </g>
          ))}
        </g>
      );
    }

    if (type === "Horse & Carriage") {
      return (
        <g transform={`translate(${x} ${y}) scale(3)`}>
          {/* carriage */}
          <rect x={-10} y={-12} width={18} height={10} fill="#4a4a4a" rx={2} />
          <rect x={-4} y={-16} width={8} height={4} fill="#5a5a5a" rx={1} />
          <circle cx={-5} cy={6} r={4} fill="#333" />
          <circle cx={7} cy={6} r={4} fill="#333" />
          {/* harness */}
          <line x1={8} y1={-7} x2={14} y2={-7} stroke="#555" strokeWidth={1.2} />
          {/* horse */}
          <ellipse cx={18} cy={-6} rx={4} ry={2.6} fill="#555" />
          <circle cx={22} cy={-8} r={1.8} fill="#555" />
          <line x1={16} y1={-4} x2={16} y2={-1} stroke="#444" strokeWidth={1} />
          <line x1={20} y1={-4} x2={20} y2={-1} stroke="#444" strokeWidth={1} />
        </g>
      );
    }

    if (type === "Small Car") {
      return (
        <g>
          <image
            href="/ui/vehicles/small-car.svg"
            x={x - 92}
            y={y - 31}
            width={184}
            height={42}
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      );
    }

    if (type === "Pickup Truck") {
      return (
        <g>
          <image
            href="/ui/vehicles/pickup-truck.svg"
            x={x - 96}
            y={y - 32}
            width={192}
            height={44}
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      );
    }

    if (type === "Box Truck") {
      return (
        <g>
          <image
            href="/ui/vehicles/box-truck.svg"
            x={x - 92}
            y={y - 32}
            width={184}
            height={44}
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      );
    }

    if (type === "Semi") {
      return (
        <g>
          <image
            href="/ui/vehicles/semi.svg"
            x={x - 105}
            y={y - 34}
            width={210}
            height={46}
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      );
    }

    return (
      <g transform={`translate(${x} ${y}) scale(3)`}>
        <rect x={-24} y={-10} width={38} height={10} fill="#4b5b64" rx={2} />
        <rect x={-6} y={-15} width={14} height={5} fill="#5f6f79" rx={1} />
        <rect x={-22} y={-8} width={8} height={3} fill="#404d54" />
        <circle cx={-16} cy={6} r={4} fill="#2d3438" />
        <circle cx={-4} cy={6} r={4} fill="#2d3438" />
        <circle cx={8} cy={6} r={4} fill="#2d3438" />
      </g>
    );
  }

  function runStressTest() {
    const STEEL_E_PSI = 29_000_000;
    const CAPACITY_BOOST = 1.3;
    const STRESS_TEST_PENALTY = 0.70; // tweakable near the stress test code.
    const inchesPerUnit = feetPerUnit * 12;
    const axleSpacingFt = 8;
    function getMemberAreaIn2(member: Member): number {
      const props = MEMBER_LIBRARY[member.type];
      if (isBoxType(member.type)) {
        const parsed = parseBoxTube(props.label);
        if (!parsed) return 1;
        return 4 * parsed.t * (parsed.b - parsed.t);
      }
      return 1;
    }

    const activeNodeIds = new Set<string>([SUPPORT_A_ID, SUPPORT_B_ID]);
    for (const m of members) {
      activeNodeIds.add(m.a);
      activeNodeIds.add(m.b);
    }
    const activeNodes = nodes.filter((n) => activeNodeIds.has(n.id));
    const nodeCount = activeNodes.length;
    if (nodeCount === 0 || members.length === 0) {
      setStressTestResult(null);
    setStressTestError("Structure unstable - cannot run stress test.");
      return;
    }
    if (unstableJointIds.size > 0) {
      setStressTestResult(null);
      setStressTestError(
        "Unstable joint detected. Remove joints placed in the middle of a single member or connect another member to that joint."
      );
      return;
    }

    const nodeIndex = new Map<string, number>();
    activeNodes.forEach((n, i) => nodeIndex.set(n.id, i));
    const dofCount = nodeCount * 2;
    const K: number[][] = Array.from({ length: dofCount }, () =>
      Array.from({ length: dofCount }, () => 0)
    );

    function addStiffness(i: number, j: number, val: number) {
      K[i][j] += val;
    }

    for (const m of members) {
      const a = nodeById.get(m.a);
      const b = nodeById.get(m.b);
      if (!a || !b) continue;
        const dxIn = (b.x - a.x) * inchesPerUnit;
        const dyIn = (b.y - a.y) * inchesPerUnit;
        const L_in = Math.hypot(dxIn, dyIn);
        if (L_in === 0) continue;
        const c = dxIn / L_in;
        const s = dyIn / L_in;
        const A_in2 = getMemberAreaIn2(m);
        const k = (STEEL_E_PSI * A_in2) / L_in;

      const ia = (nodeIndex.get(m.a) ?? 0) * 2;
      const ib = (nodeIndex.get(m.b) ?? 0) * 2;

      const k11 = k * c * c;
      const k12 = k * c * s;
      const k22 = k * s * s;

      addStiffness(ia, ia, k11);
      addStiffness(ia, ia + 1, k12);
      addStiffness(ia + 1, ia, k12);
      addStiffness(ia + 1, ia + 1, k22);

      addStiffness(ia, ib, -k11);
      addStiffness(ia, ib + 1, -k12);
      addStiffness(ia + 1, ib, -k12);
      addStiffness(ia + 1, ib + 1, -k22);

      addStiffness(ib, ia, -k11);
      addStiffness(ib, ia + 1, -k12);
      addStiffness(ib + 1, ia, -k12);
      addStiffness(ib + 1, ia + 1, -k22);

      addStiffness(ib, ib, k11);
      addStiffness(ib, ib + 1, k12);
      addStiffness(ib + 1, ib, k12);
      addStiffness(ib + 1, ib + 1, k22);
    }

      const fixedDofs = new Set<number>();
      const idxA = nodeIndex.get(SUPPORT_A_ID);
      const idxB = nodeIndex.get(SUPPORT_B_ID);
      if (idxA !== undefined) {
        fixedDofs.add(idxA * 2);
        fixedDofs.add(idxA * 2 + 1);
      }
      if (idxB !== undefined) {
        fixedDofs.add(idxB * 2 + 1);
      }

      const supportIds = new Set([SUPPORT_A_ID, SUPPORT_B_ID]);

      // IMPORTANT: only choose load nodes that are actually in the solved system
      const roadwayNodes = activeNodes.filter(
        (n) => Math.abs(n.y - ROADWAY_Y) < 0.5 && !supportIds.has(n.id)
      );
      const nonSupportNodes = activeNodes.filter((n) => !supportIds.has(n.id));

      if (nonSupportNodes.length === 0) {
        setStressTestResult(null);
    setStressTestError(
          "Add at least one joint between the supports to run the stress test."
        );
        return;
      }
    const freeDofs = Array.from({ length: dofCount }, (_, i) => i).filter(
      (i) => !fixedDofs.has(i)
    );

    const Kff = freeDofs.map((r) => freeDofs.map((c) => K[r][c]));
    function solveLinearSystem(A: number[][], b: number[]) {
      const n = A.length;
      const M = A.map((row, i) => [...row, b[i]]);
      for (let i = 0; i < n; i += 1) {
        let maxRow = i;
        for (let r = i + 1; r < n; r += 1) {
          if (Math.abs(M[r][i]) > Math.abs(M[maxRow][i])) maxRow = r;
        }
        if (Math.abs(M[maxRow][i]) < 1e-10) return null;
        if (maxRow !== i) [M[i], M[maxRow]] = [M[maxRow], M[i]];
        const pivot = M[i][i];
        for (let c = i; c <= n; c += 1) M[i][c] /= pivot;
        for (let r = 0; r < n; r += 1) {
          if (r === i) continue;
          const factor = M[r][i];
          for (let c = i; c <= n; c += 1) {
            M[r][c] -= factor * M[i][c];
          }
        }
      }
      return M.map((row) => row[n]);
    }
    const computeResultForLoads = (
      loadNodeIds: string[],
      loadValues: number[]
    ): StressTestResult | null => {
      function getLengthCapacityDivisors(lengthFt: number): {
        compression: number;
        tension: number;
      } {
        if (lengthFt <= 5) return { compression: 1.1, tension: 1.0 };
        if (lengthFt <= 10) return { compression: 1.6, tension: 1.0 };
        if (lengthFt <= 15) return { compression: 2.7, tension: 1.0 };
        if (lengthFt <= 20) return { compression: 4.2, tension: 1.0 };
        if (lengthFt <= 25) return { compression: 6.0, tension: 1.0 };
        return { compression: 8.0, tension: 1.0 };
      }

      const F = Array.from({ length: dofCount }, () => 0);
      for (let i = 0; i < loadNodeIds.length; i += 1) {
        const nodeId = loadNodeIds[i];
        const load = loadValues[i] ?? 0;
        const idx = nodeIndex.get(nodeId);
        if (idx === undefined) continue;
        const dof = idx * 2 + 1;
        F[dof] += load;
      }
      const Ff = freeDofs.map((i) => F[i]);
      const uf = solveLinearSystem(Kff, Ff);
      if (!uf) return null;

      const U = Array.from({ length: dofCount }, () => 0);
      freeDofs.forEach((dof, i) => {
        U[dof] = uf[i];
      });

      const memberForces: Record<string, number> = {};
      const memberUtilizationById: Record<string, number> = {};
      const memberCapById: Record<string, number> = {};
      let maxTension = 0;
      let maxCompression = 0;
      let maxUtilization = 0;
      const worstMembers: {
        id: string;
        force: number;
        utilization: number;
        cap: number;
        type: MemberType;
      }[] = [];

      for (const m of members) {
        const a = nodeById.get(m.a);
        const b = nodeById.get(m.b);
        if (!a || !b) continue;
        const dxIn = (b.x - a.x) * inchesPerUnit;
        const dyIn = (b.y - a.y) * inchesPerUnit;
        const L_in = Math.hypot(dxIn, dyIn);
        if (L_in === 0) {
          memberForces[m.id] = 0;
          continue;
        }
        const c = dxIn / L_in;
        const s = dyIn / L_in;
        const ia = (nodeIndex.get(m.a) ?? 0) * 2;
        const ib = (nodeIndex.get(m.b) ?? 0) * 2;
        const u = [U[ia], U[ia + 1], U[ib], U[ib + 1]];
        const A_in2 = getMemberAreaIn2(m);
        const delta = -c * u[0] - s * u[1] + c * u[2] + s * u[3];
        const axial = (STEEL_E_PSI * A_in2 / L_in) * delta;
        const props = MEMBER_LIBRARY[m.type];

        // Proper Euler buckling using moment of inertia, not area
        let I_in4 = 1;
        if (isBoxType(m.type)) {
          const parsed = parseBoxTube(props.label);
          if (parsed) {
            const bDim = parsed.b;
            const tDim = parsed.t;
            I_in4 = (bDim ** 4 - (bDim - 2 * tDim) ** 4) / 12;
          }
        }
        const Pcr = (Math.PI ** 2 * STEEL_E_PSI * I_in4) / (L_in ** 2);

        const L_ft = L_in / 12;
        const lengthDivisors = getLengthCapacityDivisors(L_ft);
        const capTension =
          props.maxTension *
          getMaterialStrengthMultiplier(getMemberGrade(m)) *
          STRESS_TEST_PENALTY *
          CAPACITY_BOOST /
          lengthDivisors.tension;
        const capCompression =
          Math.min(props.maxCompression, Pcr) *
          getMaterialStrengthMultiplier(getMemberGrade(m)) *
          STRESS_TEST_PENALTY *
          CAPACITY_BOOST /
          lengthDivisors.compression;
        const cap = axial >= 0 ? capCompression : capTension;
        const lengthFail = longMemberIds.has(m.id);
        const utilization = lengthFail
          ? 1.01
          : cap > 0
          ? Math.abs(axial) / cap
          : 0;
        memberForces[m.id] = axial;
        memberUtilizationById[m.id] = utilization;
        memberCapById[m.id] = cap;
        worstMembers.push({
          id: m.id,
          force: axial,
          utilization,
          cap,
          type: m.type,
        });
        if (axial > maxTension) maxTension = axial;
        if (axial < maxCompression) maxCompression = axial;
        if (utilization > maxUtilization) maxUtilization = utilization;
      }

      worstMembers.sort((a, b) => b.utilization - a.utilization);
      const failedMemberIds = worstMembers
        .filter((m) => m.utilization > 1)
        .map((m) => m.id);

      const nodeDisplacements: Record<string, { dx: number; dy: number }> = {};
      for (const n of activeNodes) {
        const idx = nodeIndex.get(n.id);
        if (idx === undefined) continue;
        const uxIn = U[idx * 2] ?? 0;
        const uyIn = U[idx * 2 + 1] ?? 0;
        nodeDisplacements[n.id] = {
          dx: inchesPerUnit > 0 ? uxIn / inchesPerUnit : 0,
          dy: inchesPerUnit > 0 ? uyIn / inchesPerUnit : 0,
        };
      }

      return {
        memberForces,
        memberUtilizationById,
        memberCapById,
        nodeDisplacements,
        maxTension,
        maxCompression,
        failedMemberIds,
        maxUtilization,
        worstMembers,
      };
    };

    const axleSpacingUnits =
      feetPerUnit > 0 ? axleSpacingFt / feetPerUnit : 0;
    const loadPositions =
      roadwayNodes.length > 0 ? [...roadwayNodes] : [...nonSupportNodes];
    loadPositions.sort((a, b) => a.x - b.x);
    const centerX = (supportA.x + supportB.x) / 2;

    if (loadPositions.length === 0 || axleSpacingUnits <= 0) {
      setStressTestResult(null);
    setStressTestError("Structure unstable - cannot run stress test.");
      return;
    }

    const frames: StressTestResult[] = [];
    const envelopeByMember = new Map<
      string,
      { utilization: number; force: number; cap: number; type: MemberType }
    >();
    const maxAbsForceByMember = new Map<string, { force: number; cap: number }>();

    if (process.env.NODE_ENV !== "production") {
      const tol = 0.5;
      const nodeByIdLocal = new Map(nodes.map((n) => [n.id, n]));
      const mirrorKey = (x: number, y: number) =>
        `${Math.round((centerX * 2 - x) / tol) * tol},${Math.round(y / tol) * tol}`;
      const nodeKey = (x: number, y: number) =>
        `${Math.round(x / tol) * tol},${Math.round(y / tol) * tol}`;

      const roadwayLogs = loadPositions.map((n) => {
        const mirror = loadPositions.reduce<{
          id: string;
          x: number;
          y: number;
          dx: number;
          dy: number;
        } | null>((best, cand) => {
          const dx = Math.abs(cand.x - (centerX * 2 - n.x));
          const dy = Math.abs(cand.y - n.y);
          const dist = dx + dy;
          if (!best || dist < best.dx + best.dy) {
            return { id: cand.id, x: cand.x, y: cand.y, dx, dy };
          }
          return best;
        }, null);
        return {
          id: n.id,
          x: n.x,
          y: n.y,
          mirrorId: mirror?.id,
          mirrorX: mirror?.x,
          mirrorY: mirror?.y,
          dx: mirror?.dx,
          dy: mirror?.dy,
        };
      });

      const memberMirrorMap = new Map<string, string>();
      const memberKeyToId = new Map<string, string>();
      for (const m of members) {
        const a = nodeByIdLocal.get(m.a);
        const b = nodeByIdLocal.get(m.b);
        if (!a || !b) continue;
        const k1 = `${nodeKey(a.x, a.y)}|${nodeKey(b.x, b.y)}`;
        const k2 = `${nodeKey(b.x, b.y)}|${nodeKey(a.x, a.y)}`;
        memberKeyToId.set(k1, m.id);
        memberKeyToId.set(k2, m.id);
      }
      for (const m of members) {
        const a = nodeByIdLocal.get(m.a);
        const b = nodeByIdLocal.get(m.b);
        if (!a || !b) continue;
        const ma = mirrorKey(a.x, a.y);
        const mb = mirrorKey(b.x, b.y);
        const mk1 = `${ma}|${mb}`;
        const mk2 = `${mb}|${ma}`;
        const mirrorId = memberKeyToId.get(mk1) ?? memberKeyToId.get(mk2) ?? "none";
        memberMirrorMap.set(m.id, mirrorId);
      }

      console.log("Stress test symmetry debug: roadway nodes", roadwayLogs);
      console.log(
        "Stress test symmetry debug: member mirror map",
        Array.from(memberMirrorMap.entries())
      );
    }

      const runSweep = (positions: Node[], collectFrames: boolean) => {
        let anySuccess = false;
        const evaluateAtLeadNode = (leadNode: Node) => {
          const rearTargetX = leadNode.x + axleSpacingUnits;
          let rearNode = leadNode;
          let bestDist = Number.POSITIVE_INFINITY;
          for (const n of positions) {
            const d = Math.abs(n.x - rearTargetX);
            if (d < bestDist) {
              bestDist = d;
              rearNode = n;
            }
          }
          const loadNodeIds = [leadNode.id, rearNode.id];
          const loadValues = [-loadLb * 0.5, -loadLb * 0.5];
          const result = computeResultForLoads(loadNodeIds, loadValues);
          if (!result) return;
          anySuccess = true;
        if (collectFrames) frames.push(result);
        for (const [id, force] of Object.entries(result.memberForces)) {
          const prevForce = maxAbsForceByMember.get(id);
          if (!prevForce || Math.abs(force) > Math.abs(prevForce.force)) {
            const cap = result.memberCapById?.[id] ?? 0;
            maxAbsForceByMember.set(id, { force, cap });
          }
        }
        for (const w of result.worstMembers) {
          const prev = envelopeByMember.get(w.id);
          if (!prev || w.utilization > prev.utilization) {
            envelopeByMember.set(w.id, {
              utilization: w.utilization,
                force: w.force,
                cap: w.cap,
                type: w.type,
              });
            }
          }
        };

        for (const leadNode of positions) {
          evaluateAtLeadNode(leadNode);
        }
        return anySuccess;
      };

    if (!runSweep(loadPositions, true)) {
      setStressTestResult(null);
    setStressTestError("Structure unstable - cannot run stress test.");
      return;
    }

    const findClosestByX = (targetX: number) => {
      let best: Node | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const n of loadPositions) {
        const d = Math.abs(n.x - targetX);
        if (d < bestDist) {
          bestDist = d;
          best = n;
        }
      }
      return best;
    };
    const mirroredPositions: Node[] = [];
    const mirroredSeen = new Set<string>();
    for (const lead of loadPositions) {
      const mirrorX = centerX * 2 - lead.x;
      const mirror = findClosestByX(mirrorX);
      if (mirror && !mirroredSeen.has(mirror.id)) {
        mirroredSeen.add(mirror.id);
        mirroredPositions.push(mirror);
      }
    }
    if (mirroredPositions.length > 0) {
      mirroredPositions.sort((a, b) => a.x - b.x);
      runSweep(mirroredPositions, false);
    }
    if (frames.length === 0) {
      setStressTestResult(null);
    setStressTestError("Structure unstable - cannot run stress test.");
      return;
    }

    const envelopeWorstMembers = Array.from(envelopeByMember.entries()).map(
      ([id, rec]) => {
        const force = maxAbsForceByMember.get(id)?.force ?? rec.force;
        const cap = maxAbsForceByMember.get(id)?.cap ?? rec.cap;
        const utilization = cap > 0 ? Math.abs(force) / cap : 0;
        return {
          id,
          force,
          utilization,
          cap,
          type: rec.type,
        };
      }
    );

    const nodeByIdLocal = new Map(nodes.map((n) => [n.id, n]));
    const mirrorKey = (x: number, y: number) => {
      const tol = 0.5;
      const mx = Math.round((centerX * 2 - x) / tol) * tol;
      const my = Math.round(y / tol) * tol;
      return `${mx},${my}`;
    };
    const nodeKey = (x: number, y: number) => {
      const tol = 0.5;
      const kx = Math.round(x / tol) * tol;
      const ky = Math.round(y / tol) * tol;
      return `${kx},${ky}`;
    };
    const memberKeyToId = new Map<string, string>();
    for (const m of members) {
      const a = nodeByIdLocal.get(m.a);
      const b = nodeByIdLocal.get(m.b);
      if (!a || !b) continue;
      const k1 = `${nodeKey(a.x, a.y)}|${nodeKey(b.x, b.y)}`;
      const k2 = `${nodeKey(b.x, b.y)}|${nodeKey(a.x, a.y)}`;
      memberKeyToId.set(k1, m.id);
      memberKeyToId.set(k2, m.id);
    }
    const mirrorMap = new Map<string, string>();
    for (const m of members) {
      const a = nodeByIdLocal.get(m.a);
      const b = nodeByIdLocal.get(m.b);
      if (!a || !b) continue;
      const ma = mirrorKey(a.x, a.y);
      const mb = mirrorKey(b.x, b.y);
      const mk1 = `${ma}|${mb}`;
      const mk2 = `${mb}|${ma}`;
      const mirrorId = memberKeyToId.get(mk1) ?? memberKeyToId.get(mk2);
      if (mirrorId) mirrorMap.set(m.id, mirrorId);
    }

    const envelopeById = new Map(
      envelopeWorstMembers.map((m) => [m.id, m])
    );
    for (const [id, mirrorId] of mirrorMap.entries()) {
      if (id === mirrorId) continue;
      const a = envelopeById.get(id);
      const b = envelopeById.get(mirrorId);
      if (!a || !b) continue;
      if (b.utilization > a.utilization) {
        a.utilization = b.utilization;
        a.force = b.force;
        a.cap = b.cap;
        a.type = b.type;
      } else if (a.utilization > b.utilization) {
        b.utilization = a.utilization;
        b.force = a.force;
        b.cap = a.cap;
        b.type = a.type;
      }
    }
    envelopeWorstMembers.sort((a, b) => b.utilization - a.utilization);
    const envelopeMaxUtilization =
      envelopeWorstMembers[0]?.utilization ?? 0;
    const envelopeMaxTension = Math.max(
      0,
      ...envelopeWorstMembers.map((m) => m.force)
    );
    const envelopeMaxCompression = Math.min(
      0,
      ...envelopeWorstMembers.map((m) => m.force)
    );
    const failedMemberIds = envelopeWorstMembers
      .filter((m) => m.utilization > 1)
      .map((m) => m.id);
    const envelopeMemberForces: Record<string, number> = {};
    for (const m of envelopeWorstMembers) {
      envelopeMemberForces[m.id] = m.force;
    }

    const envelopeResult: StressTestResult = {
      memberForces: envelopeMemberForces,
      maxTension: envelopeMaxTension,
      maxCompression: envelopeMaxCompression,
      failedMemberIds,
      maxUtilization: envelopeMaxUtilization,
      worstMembers: envelopeWorstMembers,
    };

    const logCount = Math.min(8, envelopeWorstMembers.length);
    const topWorst = envelopeWorstMembers.slice(0, logCount).map((m) => {
      const member = members.find((mm) => mm.id === m.id);
      const lengthFt = member ? memberLengthUnits(member) * feetPerUnit : 0;
      return {
        id: m.id,
        type: m.type,
        force: m.force,
        mode: m.force > 0 ? "COMPRESSION" : "TENSION",
        cap: m.cap,
        utilization: m.utilization,
        lengthFt,
      };
    });
    console.log("Stress test worst members (top 8):", topWorst);
    console.log("Stress test fixed DOFs:", Array.from(fixedDofs).sort((a, b) => a - b));

    if (process.env.NODE_ENV !== "production") {
      const centerDiagnostics = members
        .map((m) => {
          const a = nodeById.get(m.a);
          const b = nodeById.get(m.b);
          if (!a || !b) return null;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const slope = dx !== 0 ? Math.abs(dy / dx) : Number.POSITIVE_INFINITY;
          const midX = (a.x + b.x) / 2;
          return { id: m.id, midX, slope };
        })
        .filter(
          (m): m is { id: string; midX: number; slope: number } =>
            m !== null && m.slope > 0.2 && m.slope < 5
        )
        .sort((a, b) => Math.abs(a.midX - centerX) - Math.abs(b.midX - centerX))
        .slice(0, 4)
        .map((m) => ({
          id: m.id,
          midX: m.midX,
          force: envelopeResult.memberForces[m.id] ?? 0,
        }));
      console.log("Stress test center member forces:", centerDiagnostics);
    }

    setStressTestFrames(frames);
    stressTestFramesRef.current = frames;
    setStressTestResult(envelopeResult);
    setStressTestError(null);
  }

  function clearStressTest() {
    setStressTestResult(null);
    setStressTestError(null);
    setStressTestFrames(null);
    stressTestFramesRef.current = null;
    setLiveStressTestResult(null);
  }

  function cancelStressTest() {
    if (testRafRef.current) {
      cancelAnimationFrame(testRafRef.current);
      testRafRef.current = null;
    }
    setIsTesting(false);
    setTestProgress(0);
    setStressTestResult(null);
    setStressTestError(null);
    setStressTestFrames(null);
    stressTestFramesRef.current = null;
    setLiveStressTestResult(null);
  }

  function startStressTest(forceStart = false) {
    if (isTesting) return;
    if (!forceStart && !canRunStressTest) {
      setStressTestResult(null);
    setStressTestError("Run and pass the design inspection before stress testing.");
      return;
    }
    setStressTestResult(null);
    setStressTestError(null);
    setStressTestFrames(null);
    stressTestFramesRef.current = null;
    setLiveStressTestResult(null);
    setIsTesting(true);
    setTestProgress(0);
    runStressTest();
    const durationMs = 9000;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const finalProgress = testStopProgressRef.current;
      const progress = Math.min(finalProgress, elapsed / durationMs);
      setTestProgress(progress);
      const frames = stressTestFramesRef.current;
      if (frames && frames.length > 0) {
        if (progress < bridgeStartProgress) {
          setLiveStressTestResult(null);
        } else {
        const spanProgressRaw =
          bridgeEndProgress - bridgeStartProgress > 0
            ? (progress - bridgeStartProgress) /
              (bridgeEndProgress - bridgeStartProgress)
            : 0;
        const spanProgress = Math.max(0, Math.min(1, spanProgressRaw));
        const idx = Math.min(
          frames.length - 1,
          Math.round(spanProgress * (frames.length - 1))
        );
        setLiveStressTestResult(frames[idx]);
        }
      }
      if (progress >= finalProgress) {
        setIsTesting(false);
        testRafRef.current = null;
        return;
      }
      testRafRef.current = requestAnimationFrame(tick);
    };

    testRafRef.current = requestAnimationFrame(tick);
  }

  function runBridgeExaminer() {
    if (isTesting) return;
    setInspectionHasRun(true);
    if (!inspectionPassRaw) {
      setStressTestResult(null);
      setStressTestError(
        "Bridge cannot be stress tested until it passes its design inspection."
      );
      return;
    }
    startStressTest(true);
  }

  function applySpanFeet(nextSpanFeet: 20 | 40 | 60 | 80 | 100) {
    pushHistorySnapshot();
    const { left: ax, right: bx } = SUPPORT_X[nextSpanFeet];
    setSpanFeet(nextSpanFeet);
    setNodes([
      { id: SUPPORT_A_ID, x: ax, y: ROADWAY_Y },
      { id: SUPPORT_B_ID, x: bx, y: ROADWAY_Y },
    ]);
    setMembers([]);
    setPendingNodeId(null);
    setSelectedMemberId(null);
    setSelectedMemberIds(new Set());
    setDragNodeId(null);
    setSelectionBox(null);
    setStressTestResult(null);
    setStressTestError(null);
  }

  // -------- Drag handlers --------
  function onNodeMouseDown(e: React.MouseEvent, nodeId: string) {
    if (isTesting) return;
    // Only allow dragging in select/joint (keeps Member workflow clean)
    if (tool === "member") {
      e.stopPropagation();
      memberDragStartRef.current = nodeId;
      setPendingNodeId(nodeId);
      const startNode = nodeById.get(nodeId);
      setMemberPreview(
        startNode ? { x: startNode.x, y: startNode.y, targetNodeId: null } : null
      );
      setSelectedMemberId(null);
      setSelectedMemberIds(new Set());
      return;
    }
    if (tool !== "select" && tool !== "joint") return;

    // Supports cannot be dragged
    if (nodeId === SUPPORT_A_ID || nodeId === SUPPORT_B_ID) return;

    e.stopPropagation();
    if (!dragUndoArmedRef.current) {
      pushHistorySnapshot();
      dragUndoArmedRef.current = true;
    }
    setDragNodeId(nodeId);
  }

  function onSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (isTesting) return;
    const loc = svgPointFromClient(e.clientX, e.clientY);
    if (!loc) return;

    const raw = {
      x: snapToGrid ? snapX(loc.x) : loc.x,
      y: snapToGrid ? snapY(loc.y) : loc.y,
    };
    const snapped =
      tool === "joint" && !snapToGrid
        ? findClosestMemberIntersection(raw.x, raw.y, 18) ?? raw
        : raw;
    const { x, y } = tool === "joint" ? clampToRulerBounds(snapped) : snapped;

    if (tool === "member" && memberDragStartRef.current) {
      const closest = findClosestNodeAtPoint(loc.x, loc.y, 12, memberDragStartRef.current);
      setMemberPreview(
        closest
          ? { x: closest.x, y: closest.y, targetNodeId: closest.id }
          : { x: loc.x, y: loc.y, targetNodeId: null }
      );
      setHoverPoint(null);
      return;
    }

    if (dragNodeId) {
      const nextPoint =
        tool === "select" ? clampToRulerBounds({ x, y }) : { x, y };
      setNodes((prev) =>
        prev.map((n) => (n.id === dragNodeId ? { ...n, ...nextPoint } : n))
      );
    }

    if (selectionBox) {
      setSelectionBox((prev) =>
        prev ? { ...prev, current: { x, y } } : prev
      );
      setHoverPoint(null);
      return;
    }

    if (tool === "joint" && !dragNodeId) {
      setHoverPoint({ x, y });
    } else {
      setHoverPoint(null);
    }
  }

  function endDrag() {
    if (!dragNodeId) return;
    setDragNodeId(null);
    dragUndoArmedRef.current = false;
  }

  function onSvgMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (isTesting) return;
    if (tool !== "select") return;
    const target = e.target as HTMLElement;
    if (target?.dataset?.kind === "node") return;
    const loc = svgPointFromClient(e.clientX, e.clientY);
    if (!loc) return;
    const nearestMemberId = findClosestMemberIdAtPoint(loc.x, loc.y, 12);
    if (nearestMemberId) {
      onMemberClick(nearestMemberId, e.shiftKey);
      return;
    }
    setSelectionBox({ start: { x: loc.x, y: loc.y }, current: { x: loc.x, y: loc.y } });
  }

  function finalizeSelectionBox() {
    if (!selectionBox) return;
    const { start, current } = selectionBox;
    const selected = new Set<string>();
    for (const m of members) {
      const a = nodeById.get(m.a);
      const b = nodeById.get(m.b);
      if (!a || !b) continue;
      if (
        segmentIntersectsRect(
          a.x,
          a.y,
          b.x,
          b.y,
          start.x,
          start.y,
          current.x,
          current.y
        )
      ) {
        selected.add(m.id);
      }
    }
    if (selected.size > 0) {
      setSelectedMemberIds(selected);
      setSelectedMemberId(Array.from(selected)[0] ?? null);
    } else {
      setSelectedMemberIds(new Set());
      setSelectedMemberId(null);
    }
    setSelectionBox(null);
  }

  function onSvgMouseUp(e: React.MouseEvent<SVGSVGElement>) {
    if (isTesting) return;
    if (tool === "member" && memberDragStartRef.current) {
      const startId = memberDragStartRef.current;
      memberDragStartRef.current = null;
      setMemberPreview(null);
      const loc = svgPointFromClient(e.clientX, e.clientY);
      if (loc) {
        const closest = findClosestNodeAtPoint(loc.x, loc.y, 12, startId);
        if (closest) {
          pushHistorySnapshot();
          addMemberChain(startId, closest.id);
        }
      }
      setPendingNodeId(null);
    }
    endDrag();
    finalizeSelectionBox();
  }

  function onSvgMouseLeave() {
    if (isTesting) return;
    endDrag();
    setSelectionBox(null);
    setHoverPoint(null);
    setMemberPreview(null);
  }

  // -------- A1: Engineering detection (logic only; console output) --------
  function areConnected(a: string, b: string): boolean {
    return members.some((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a));
  }

  function neighbors(id: string): string[] {
    const out: string[] = [];
    for (const m of members) {
      if (m.a === id) out.push(m.b);
      else if (m.b === id) out.push(m.a);
    }
    return out;
  }

  // Detect a simple 4-cycle A-B-C-D-A with no diagonals (A-C or B-D).
  // Conservative: won't catch every possible "bay" pattern, but avoids spam.
  function findNonTriangulatedBays(): { cycle: [string, string, string, string] }[] {
    const ids = nodes.map((n) => n.id);
    const risky: { cycle: [string, string, string, string] }[] = [];

    function keyOf(cycle: [string, string, string, string]) {
      return [...cycle].sort().join("|");
    }

    function hasDiagonalConnection(a: string, b: string) {
      if (areConnected(a, b)) return true;
      const aNode = nodeById.get(a);
      const bNode = nodeById.get(b);
      if (!aNode || !bNode) return false;
      for (const n of nodes) {
        if (n.id === a || n.id === b) continue;
        if (!areConnected(a, n.id) || !areConnected(n.id, b)) continue;
        const dist = distancePointToSegment(
          n.x,
          n.y,
          aNode.x,
          aNode.y,
          bNode.x,
          bNode.y
        );
        if (dist <= 2) return true;
      }
      return false;
    }

    function hasDiagonalIntersection(a: string, b: string) {
      const aNode = nodeById.get(a);
      const bNode = nodeById.get(b);
      if (!aNode || !bNode) return false;
      for (const m of members) {
        if (m.a === a || m.b === a || m.a === b || m.b === b) continue;
        const mA = nodeById.get(m.a);
        const mB = nodeById.get(m.b);
        if (!mA || !mB) continue;
        const pt = segmentIntersectionPoint(
          aNode.x,
          aNode.y,
          bNode.x,
          bNode.y,
          mA.x,
          mA.y,
          mB.x,
          mB.y
        );
        if (!pt) continue;
        const distToA = Math.hypot(pt.x - aNode.x, pt.y - aNode.y);
        const distToB = Math.hypot(pt.x - bNode.x, pt.y - bNode.y);
        if (distToA <= 2 || distToB <= 2) continue;
        return true;
      }
      return false;
    }

    for (const A of ids) {
      for (const B of neighbors(A)) {
        if (B === A) continue;

        for (const C of neighbors(B)) {
          if (C === A || C === B) continue;

          for (const D of neighbors(C)) {
            if (D === A || D === B || D === C) continue;

            // Close the cycle
            if (!areConnected(D, A)) continue;

            // Any 4-node cycle without a diagonal is non-triangulated
            const hasDiagonal =
              hasDiagonalConnection(A, C) ||
              hasDiagonalConnection(B, D) ||
              hasDiagonalIntersection(A, C) ||
              hasDiagonalIntersection(B, D);
            if (hasDiagonal) continue;

            const cycle: [string, string, string, string] = [A, B, C, D];
            const k = keyOf(cycle);
            const already = risky.some((r) => keyOf(r.cycle) === k);
            if (!already) risky.push({ cycle });
          }
        }
      }
    }

    return risky;
  }

  function findCrossingMembersWithoutJunction(): { pt: { x: number; y: number }; m1: string; m2: string }[] {
    const crossings: { pt: { x: number; y: number }; m1: string; m2: string }[] = [];
    const nodeSet = new Set(nodes.map(n => `${Math.round(n.x)},${Math.round(n.y)}`));
    for (let i = 0; i < members.length; i++) {
      const ma = members[i];
      const a1 = nodeById.get(ma.a);
      const b1 = nodeById.get(ma.b);
      if (!a1 || !b1) continue;
      for (let j = i + 1; j < members.length; j++) {
        const mb = members[j];
        // Skip members that share an endpoint (they always "meet" at the shared node)
        if (mb.a === ma.a || mb.a === ma.b || mb.b === ma.a || mb.b === ma.b) continue;
        const a2 = nodeById.get(mb.a);
        const b2 = nodeById.get(mb.b);
        if (!a2 || !b2) continue;
        const pt = segmentIntersectionPoint(a1.x, a1.y, b1.x, b1.y, a2.x, a2.y, b2.x, b2.y);
        if (!pt) continue;
        // Ignore if the crossing is at/near an endpoint (t≈0 or t≈1 means endpoint intersection — already covered by shared-endpoint check above, but guard with distance)
        const nearEndpoint =
          Math.hypot(pt.x - a1.x, pt.y - a1.y) < 3 ||
          Math.hypot(pt.x - b1.x, pt.y - b1.y) < 3 ||
          Math.hypot(pt.x - a2.x, pt.y - a2.y) < 3 ||
          Math.hypot(pt.x - b2.x, pt.y - b2.y) < 3;
        if (nearEndpoint) continue;
        // If a node already exists at this crossing, it's properly joined — not a problem
        const key = `${Math.round(pt.x)},${Math.round(pt.y)}`;
        if (nodeSet.has(key)) continue;
        // Check neighbourhood: any node within 6px counts as a junction
        const hasNearbyNode = nodes.some(n => Math.hypot(n.x - pt.x, n.y - pt.y) < 6);
        if (hasNearbyNode) continue;
        crossings.push({ pt, m1: ma.id, m2: mb.id });
      }
    }
    return crossings;
  }

  function renderScene() {
    return (
      <defs>
        <pattern id="stoneBlocks" width="14" height="10" patternUnits="userSpaceOnUse">
          <rect width="14" height="10" fill="#d8d8d8" />
          <path d="M0 5 H14" stroke="#b8b8b8" strokeWidth={1} />
          <path d="M7 0 V10" stroke="#c6c6c6" strokeWidth={1} />
        </pattern>
      </defs>
    );
  }

  function escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function buildExportSvgMarkup(): string {
    const width = 1150;
    const height = 650;
    const titleX = width - 360;
    const titleY = height - 190;
    const safeBridgeName = escapeXml(bridgeName || "");
    const safeDesignerName = escapeXml(designerName || "");
    const safeStressStatus = escapeXml(stressTestStatusLabel);

    const memberLines = members
      .map((m) => {
        const a = nodeById.get(m.a);
        const b = nodeById.get(m.b);
        if (!a || !b) return "";
        const w = Math.max(3.2, thicknessToStrokeWidth(m.type));
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#111111" stroke-width="${w}" stroke-linecap="round" />`;
      })
      .join("");

    const nodeCircles = nodes
      .map((n) => {
        const isSupport = n.id === SUPPORT_A_ID || n.id === SUPPORT_B_ID;
        const r = isSupport ? 10 : 7;
        return `<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="#ffffff" stroke="#111111" stroke-width="1.5" />`;
      })
      .join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
  <line x1="${supportA.x}" y1="${supportA.y}" x2="${supportB.x}" y2="${supportB.y}" stroke="#111111" stroke-width="10" stroke-linecap="square" />
  ${memberLines}
  ${nodeCircles}
  <rect x="${titleX}" y="${titleY}" width="330" height="178" fill="#ffffff" stroke="#111111" stroke-width="2" rx="8" />
  <text x="${titleX + 14}" y="${titleY + 28}" font-family="Arial, sans-serif" font-size="17" fill="#111111">Bridge Name: ${safeBridgeName}</text>
  <text x="${titleX + 14}" y="${titleY + 56}" font-family="Arial, sans-serif" font-size="17" fill="#111111">Designed by: ${safeDesignerName}</text>
  <text x="${titleX + 14}" y="${titleY + 84}" font-family="Arial, sans-serif" font-size="17" fill="#111111">Cost: $${costSummary.totalCost.toFixed(2)}</text>
  <text x="${titleX + 14}" y="${titleY + 112}" font-family="Arial, sans-serif" font-size="17" fill="#111111">Span &amp; Load: ${spanFeet} ft / ${formatTons(loadLb)}</text>
  <text x="${titleX + 14}" y="${titleY + 140}" font-family="Arial, sans-serif" font-size="17" fill="#111111">Scale: 1 square = 1 ft</text>
  <text x="${titleX + 14}" y="${titleY + 168}" font-family="Arial, sans-serif" font-size="17" fill="#111111">Inspection ${inspectionPass ? "Pass" : "Fail"} / Stress ${safeStressStatus}</text>
</svg>`;
  }

  function getBridgeExportBounds() {
    const padX = 8;
    const padY = 16;
    let minYNode = Number.POSITIVE_INFINITY;
    let maxYNode = Number.NEGATIVE_INFINITY;
    for (const n of nodes) {
      if (n.y < minYNode) minYNode = n.y;
      if (n.y > maxYNode) maxYNode = n.y;
    }
    if (!Number.isFinite(minYNode) || !Number.isFinite(maxYNode)) {
      minYNode = ROADWAY_Y - 20;
      maxYNode = ROADWAY_Y + 20;
    }
    const left = Math.min(supportA.x, supportB.x) - padX;
    const right = Math.max(supportA.x, supportB.x) + padX;
    const top = minYNode - padY;
    const bottom = maxYNode + padY;
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    const span = Math.max(1, Math.abs(supportB.x - supportA.x));
    const bridgeFraction = span / width;
    return { left, top, width, height, bridgeFraction };
  }

  function buildBridgeOnlyExportSvgMarkup(): string {
    const bounds = getBridgeExportBounds();
    const safeStroke = "#111111";
    const memberLines = members
      .map((m) => {
        const a = nodeById.get(m.a);
        const b = nodeById.get(m.b);
        if (!a || !b) return "";
        const w = Math.max(3.2, thicknessToStrokeWidth(m.type));
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${safeStroke}" stroke-width="${w}" stroke-linecap="round" />`;
      })
      .join("");
    const nodeCircles = nodes
      .map((n) => {
        const isSupport = n.id === SUPPORT_A_ID || n.id === SUPPORT_B_ID;
        const r = isSupport ? 10 : 7;
        return `<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="#ffffff" stroke="${safeStroke}" stroke-width="1.5" />`;
      })
      .join("");
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}">
  <rect x="${bounds.left}" y="${bounds.top}" width="${bounds.width}" height="${bounds.height}" fill="#ffffff" />
  <line x1="${supportA.x}" y1="${supportA.y}" x2="${supportB.x}" y2="${supportB.y}" stroke="${safeStroke}" stroke-width="10" stroke-linecap="square" />
  ${memberLines}
  ${nodeCircles}
</svg>`;
  }

  function getPaperDimensionsIn(size: ExportPaperSize): { width: number; height: number } {
    if (size === "legal") return { width: 14, height: 8.5 };
    return { width: 11, height: 8.5 };
  }

  function getMaxPrintableLengthIn(size: ExportPaperSize): number {
    return size === "legal" ? 13 : 10;
  }

  function closeExportDialog() {
    if (isExportingPdf) return;
    setShowExportDialog(false);
    setExportFormat("pdf");
    setExportPrintIntent(null);
    setExportPaperSize("letter");
    setExportPrintLengthIn("");
  }

  function closeSaveDialog() {
    setShowSaveDialog(false);
    setSavePendingName("");
  }

  async function onSaveClick() {
    if (!session?.user) { window.alert("Sign in to save your design."); return; }
    const name = bridgeName.trim();

    // If this design was opened from the cloud, save back to the same record directly
    if (activeCloudName) {
      await performCloudSave(activeCloudName);
      return;
    }

    if (!name) {
      setSavePendingName("");
      setSaveDialogMode("name-required");
      setShowSaveDialog(true);
      return;
    }
    // Check for duplicate name in cloud
    const exists = await checkBridgeNameExists(userId ?? "", name);
    if (exists) {
      setSaveDialogMode("confirm-replace");
      setShowSaveDialog(true);
      return;
    }
    await performCloudSave(name);
  }

  async function performCloudSave(name: string) {
    if (!session?.user || !userId) return;
    setSaveStatus("saving");
    // Don't overwrite the display name when saving under the internal asgn_ key
    if (!name.startsWith('asgn_') && name !== bridgeName) setBridgeName(name);
    try {
      await upsertBridgeDesign(userId, {
        name,
        spanFeet,
        loadLb,
        designerName,
        nodes,
        members,
        passed: stressTestResult != null ? stressTestPass : null,
        cost: costSummary.totalCost,
      });
      setActiveCloudName(name);
      setIsDirty(false);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
    closeSaveDialog();
  }

  async function handleSubmitAssignment() {
    if (!assignmentConfig || !userId) return;
    setAssignmentSubmitting(true);

    // Save the design first — the name asgn_<id> is the key for reloading on reopen
    const saveKey = `asgn_${assignmentConfig.id}`;
    try {
      await upsertBridgeDesign(userId, {
        name: saveKey,
        spanFeet,
        loadLb,
        designerName,
        nodes,
        members,
        passed: stressTestPass,
        cost: costSummary.totalCost,
      });
      setActiveCloudName(saveKey);
      setIsDirty(false);
    } catch (err) {
      setAssignmentSubmitting(false);
      alert(`Could not save your bridge before submitting. Please try again.\n\n${err instanceof Error ? err.message : 'Unknown error'}`);
      return;
    }

    const res = await fetch("/api/bridge-submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: assignmentConfig.id, cost: costSummary.totalCost, passed: true }),
    });
    if (res.ok) setAssignmentSubmitted(true);
    setAssignmentSubmitting(false);
  }

  function applyImportedBridgeState(parsed: {
    nodes?: Node[];
    members?: Member[];
    spanFeet?: 20 | 40 | 60 | 80 | 100;
    loadLb?: number;
    snapStepFeet?: 0.5 | 1 | 2.5 | 5;
    snapToGrid?: boolean;
    showGrid?: boolean;
    bridgeName?: string;
    designerName?: string;
    materialGrade?: MaterialGrade;
    activeMemberType?: MemberType;
  }) {
    if (!parsed?.nodes?.length || !parsed?.members) {
      window.alert("Invalid bridge file.");
      return;
    }

    const normalizedMembers: Member[] = parsed.members
      .map((m) => {
        if (!(m.type in MEMBER_LIBRARY)) return null;
        return { ...m, grade: m.grade ?? "mild" } as Member;
      })
      .filter((m): m is Member => Boolean(m));

    setSpanFeet(parsed.spanFeet ?? INITIAL_SPAN_FEET);
    setLoadLb(normalizeLoadLb(parsed.loadLb ?? LOAD_TON_OPTIONS[0] * LB_PER_TON));
    setSnapStepFeet(parsed.snapStepFeet ?? DEFAULT_SNAP_STEP_FEET);
    setSnapToGrid(parsed.snapToGrid ?? DEFAULT_SNAP_TO_GRID);
    setShowGrid(parsed.showGrid ?? false);
    setNodes(parsed.nodes);
    setMembers(normalizedMembers);
    setBridgeName(parsed.bridgeName ?? "");
    setDesignerName(parsed.designerName ?? "");
    setMaterialGrade(parsed.materialGrade === "high" ? "high" : "mild");
    if (parsed.activeMemberType && parsed.activeMemberType in MEMBER_LIBRARY) {
      setActiveMemberType(parsed.activeMemberType);
    }
    setPendingNodeId(null);
    setSelectedMemberId(null);
    setSelectedMemberIds(new Set());
    setSelectionBox(null);
    setDragNodeId(null);
    resetAnalysisState(true);
  }


  async function exportDesignPdf(options?: {
    printIntent: "yes" | "no";
    paperSize?: ExportPaperSize;
    printLengthIn?: number;
  }) {
    let svgUrl: string | null = null;
    try {
      setIsExportingPdf(true);
      const printIntent = options?.printIntent ?? "no";
      const svgMarkup =
        printIntent === "yes" ? buildBridgeOnlyExportSvgMarkup() : buildExportSvgMarkup();
      const svgBlob = new Blob([svgMarkup], {
        type: "image/svg+xml;charset=utf-8",
      });
      svgUrl = URL.createObjectURL(svgBlob);

      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to render export image."));
        img.src = svgUrl as string;
      });

      const exportWidth = image.naturalWidth || 1150;
      const exportHeight = image.naturalHeight || 650;
      const rasterScale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = exportWidth * rasterScale;
      canvas.height = exportHeight * rasterScale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create export canvas.");
      ctx.setTransform(rasterScale, 0, 0, rasterScale, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, exportWidth, exportHeight);
      ctx.drawImage(image, 0, 0, exportWidth, exportHeight);

      const pngData = canvas.toDataURL("image/png");
      const { jsPDF } = await import("jspdf");
      const selectedPaper: ExportPaperSize =
        printIntent === "yes" ? options?.paperSize ?? "letter" : "letter";
      const { width: pageW, height: pageH } = getPaperDimensionsIn(selectedPaper);
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "in",
        format: selectedPaper,
        compress: true,
      });

      const margin = 0.35;
      const maxRenderW = pageW - margin * 2;
      const maxRenderH = pageH - margin * 2;
      let renderW: number;
      if (printIntent === "yes" && options?.printLengthIn) {
        const bounds = getBridgeExportBounds();
        renderW = options.printLengthIn / Math.max(0.01, bounds.bridgeFraction);
        renderW = Math.min(maxRenderW, Math.max(2, renderW));
      } else {
        renderW = maxRenderW;
      }
      let renderH = (exportHeight / exportWidth) * renderW;
      if (renderH > maxRenderH) {
        renderH = maxRenderH;
        renderW = (exportWidth / exportHeight) * renderH;
      }
      const renderX = (pageW - renderW) / 2;
      const renderY = margin;
      pdf.addImage(pngData, "PNG", renderX, renderY, renderW, renderH, undefined, "FAST");

      if (printIntent === "yes") {
        const titleW = 3.65;
        const titleH = 1.96;
        const titleX = pageW - margin - titleW;
        const titleY = pageH - margin - titleH;
        pdf.setDrawColor(20, 20, 20);
        pdf.setLineWidth(0.02);
        pdf.roundedRect(titleX, titleY, titleW, titleH, 0.08, 0.08);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.setTextColor(20, 20, 20);
        const bridgeText = bridgeName.trim() || "";
        const designerText = designerName.trim() || "";
        pdf.text(`Bridge Name: ${bridgeText}`, titleX + 0.12, titleY + 0.28);
        pdf.text(`Designed by: ${designerText}`, titleX + 0.12, titleY + 0.54);
        pdf.text(`Cost: $${costSummary.totalCost.toFixed(2)}`, titleX + 0.12, titleY + 0.8);
        pdf.text(
          `Span & Load: ${spanFeet} ft / ${formatTons(loadLb)}`,
          titleX + 0.12,
          titleY + 1.06
        );
        pdf.text("Scale: 1 square = 1 ft", titleX + 0.12, titleY + 1.32);
        pdf.text(
          `Inspection ${inspectionPass ? "Pass" : "Fail"} / Stress ${stressTestStatusLabel}`,
          titleX + 0.12,
          titleY + 1.58
        );
      }

      const printedBridgeLengthIn =
        printIntent === "yes" && options?.printLengthIn
          ? options.printLengthIn
          : Math.abs(supportB.x - supportA.x) * (renderW / exportWidth);
      const feetPerInch = spanFeet / Math.max(0.01, printedBridgeLengthIn);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(20, 20, 20);
      pdf.text(
        `Print scale: 1 in = ${feetPerInch.toFixed(2)} ft`,
        renderX,
        Math.min(pageH - 0.15, renderY + renderH + 0.17)
      );

      const fileBase = (bridgeName.trim() || "bridge-design")
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "");
      pdf.save(`${fileBase || "bridge-design"}.pdf`);
    } catch (error) {
      console.error("Export failed:", error);
      window.alert("Could not export PDF. Please try again.");
    } finally {
      setIsExportingPdf(false);
      if (svgUrl) URL.revokeObjectURL(svgUrl);
    }
  }

  async function exportDesignImage(format: "png" | "jpeg") {
    let svgUrl: string | null = null;
    let downloadUrl: string | null = null;
    try {
      setIsExportingPdf(true);
      const svgMarkup = buildExportSvgMarkup();
      const svgBlob = new Blob([svgMarkup], {
        type: "image/svg+xml;charset=utf-8",
      });
      svgUrl = URL.createObjectURL(svgBlob);

      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to render export image."));
        img.src = svgUrl as string;
      });

      const exportWidth = image.naturalWidth || 1150;
      const exportHeight = image.naturalHeight || 650;
      const rasterScale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = exportWidth * rasterScale;
      canvas.height = exportHeight * rasterScale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create export canvas.");
      ctx.setTransform(rasterScale, 0, 0, rasterScale, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, exportWidth, exportHeight);
      ctx.drawImage(image, 0, 0, exportWidth, exportHeight);

      const mime = format === "jpeg" ? "image/jpeg" : "image/png";
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (nextBlob) => {
            if (!nextBlob) {
              reject(new Error("Could not create image blob."));
              return;
            }
            resolve(nextBlob);
          },
          mime,
          format === "jpeg" ? 0.92 : undefined
        );
      });
      downloadUrl = URL.createObjectURL(blob);
      const fileBase = (bridgeName.trim() || "bridge-design")
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const fileName = `${fileBase || "bridge-design"}.${format === "jpeg" ? "jpg" : "png"}`;
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      if (typeof a.download === "string") {
        a.click();
      } else {
        window.open(downloadUrl, "_blank", "noopener,noreferrer");
      }
      a.remove();
    } catch (error) {
      console.error("Export failed:", error);
      window.alert(`Could not export ${format.toUpperCase()}. Please try again.`);
    } finally {
      setIsExportingPdf(false);
      if (svgUrl) URL.revokeObjectURL(svgUrl);
      if (downloadUrl) {
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl as string), 1500);
      }
    }
  }

  // Keyboard shortcuts: V select, J joint, M member, E erase, Esc cancel, G snap toggle
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase();

      if (key === "v") {
        setTool("select");
        setPendingNodeId(null);
      }
      if (key === "j") {
        setTool("joint");
        setPendingNodeId(null);
        setSelectedMemberId(null);
        setSelectedMemberIds(new Set());
      }
      if (key === "m") {
        setTool("member");
        setPendingNodeId(null);
        setSelectedMemberId(null);
        setSelectedMemberIds(new Set());
      }
      if (key === "e") {
        setTool("erase");
        setPendingNodeId(null);
        setSelectedMemberId(null);
        setSelectedMemberIds(new Set());
      }

      if (key === "g") setSnapToGrid((s) => !s);
      if (key === "h") setShowGrid((s) => !s);

      if (key === "escape") {
        setPendingNodeId(null);
        setSelectedMemberId(null);
        setSelectedMemberIds(new Set());
        setDragNodeId(null);
        setSelectionBox(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    updateSvgRect();
    window.addEventListener("resize", updateSvgRect);
    window.addEventListener("scroll", updateSvgRect, { passive: true });
    const svg = svgRef.current;
    const resizeObserver = svg ? new ResizeObserver(() => updateSvgRect()) : null;
    if (svg && resizeObserver) resizeObserver.observe(svg);
    return () => {
      window.removeEventListener("resize", updateSvgRect);
      window.removeEventListener("scroll", updateSvgRect);
      if (resizeObserver && svg) resizeObserver.unobserve(svg);
    };
  }, [updateSvgRect]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => updateSvgRect());
    return () => window.cancelAnimationFrame(id);
  }, [
    costExpanded,
    optionsExpanded,
    materialExpanded,
    updateSvgRect,
  ]);

  // A1 console feedback (DevTools Console)
  useEffect(() => {
    if (!inspectionHasRun) return;
    const risky = findNonTriangulatedBays();
    if (risky.length > 0) {
      console.log("!? A1: Non-triangulated bays detected:", risky);
    } else {
      console.log("OK A1: No non-triangulated bays detected");
    }
  }, [inspectionHasRun, nodes, members]);

  useEffect(() => {
    if (!isTesting) return;
    const stopAtSupport =
      maxX - minX > 0 ? (supportB.x - minX) / (maxX - minX) : 1;
    if (stressTestError) {
      testStopProgressRef.current = Math.max(0, Math.min(1, stopAtSupport));
      return;
    }
    if (stressTestResult) {
      const failed = stressTestResult.failedMemberIds.length > 0;
      testStopProgressRef.current = failed ? Math.max(0, Math.min(1, stopAtSupport)) : 1;
    }
  }, [isTesting, stressTestError, stressTestResult, minX, maxX, supportA.x]);

  const maxPrintableLengthIn = getMaxPrintableLengthIn(exportPaperSize);
  const requestedPrintLength = Number(exportPrintLengthIn);
  const printLengthValid =
    Number.isFinite(requestedPrintLength) &&
    requestedPrintLength > 0 &&
    requestedPrintLength <= maxPrintableLengthIn;
  const canExportNow =
    exportFormat === "pdf"
      ? exportPrintIntent === "no" ||
        (exportPrintIntent === "yes" && printLengthValid)
      : true;

  return (
    <div className={styles.page}>
      <SiteHeader onLogoClick={() => safeNavigate("/")}>
      </SiteHeader>

      <main className={styles.main}>
        <div className={styles.frame}>
          <div className={styles.toolbarStrip}>
            <div className={styles.toolbarLeft}>
              <div className={styles.toolbarIcons}>
                {[
                  { src: "save-file-icon.png", label: "Save Design", disabled: false },
                  { src: "export-icon.png", label: "Export", disabled: false },
                ].map((item) => (
                  <button
                    key={item.src}
                    onClick={
                      item.src === "save-file-icon.png"
                        ? onSaveClick
                        : item.src === "export-icon.png"
                        ? () => setShowExportDialog(true)
                        : undefined
                    }
                    className={`${styles.toolbarIconButton} ${
                      item.disabled ? styles.toolbarIconButtonDisabled : ""
                    }`}
                    disabled={item.disabled}
                    title={item.label}
                  >
                    <img src={`/ui/${item.src}`} alt={item.label} />
                  </button>
                ))}
                {/* Save status feedback */}
                {saveStatus === "saving" && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#888" }}>Saving…</span>
                )}
                {saveStatus === "saved" && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#16a34a" }}>✓ Saved</span>
                )}
                {saveStatus === "error" && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>Save failed</span>
                )}
                <button
                  onClick={undoLastEdit}
                  className={`${styles.toolbarIconButton} ${
                    canUndo ? "" : styles.toolbarIconButtonDisabled
                  }`}
                  disabled={!canUndo}
                  title="Undo"
                >
                  <img src="/ui/undo-icon.png" alt="Undo" />
                </button>
                <button
                  onClick={redoLastEdit}
                  className={`${styles.toolbarIconButton} ${
                    canRedo ? "" : styles.toolbarIconButtonDisabled
                  }`}
                  disabled={!canRedo}
                  title="Redo"
                >
                  <img src="/ui/redo-icon.png" alt="Redo" />
                </button>
                <button
                  onClick={resetDesign}
                  className={styles.toolbarIconButton}
                  title="Reset"
                >
                  <img src="/ui/reset-icon.png" alt="Reset" />
                </button>
                <ToolButton id="select" label="Select" />
                <ToolButton id="joint" label="Joint" />
                <ToolButton id="member" label="Member" />
                <ToolButton id="erase" label="Erase" />
                <button
                  onClick={() => setSnapToGrid((prev) => !prev)}
                  className={`${styles.toolbarIconButton} ${
                    snapToGrid ? styles.toolbarIconButtonActive : ""
                  }`}
                  style={{ opacity: snapToGrid ? 1 : 0.4 }}
                  title={snapToGrid ? "Snap ON" : "Snap OFF"}
                >
                  <img src="/ui/snap-on-icon.png" alt="Snap" />
                </button>
                <button
                  onClick={() => setShowGrid((prev) => !prev)}
                  className={`${styles.toolbarIconButton} ${
                    showGrid ? styles.toolbarIconButtonActive : ""
                  }`}
                  style={{ opacity: showGrid ? 1 : 0.4 }}
                  title={showGrid ? "Grid ON" : "Grid OFF"}
                >
                  <img src="/ui/grid-on-icon.png" alt="Grid" />
                </button>
                <div
                  className={styles.toolbarGridSize}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <span className={styles.toolbarGridLabel}>Grid Size</span>
                  <select
                    value={snapStepFeet}
                    onChange={(e) =>
                      setSnapStepFeet(Number(e.target.value) as 0.5 | 1 | 2.5 | 5)
                    }
                    className={styles.toolbarSelect}
                    title="Snap increment in feet"
                  >
                    <option value={0.5}>0.5 ft</option>
                    <option value={1}>1 ft</option>
                    <option value={2.5}>2.5 ft</option>
                    <option value={5}>5 ft</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <main className={styles.content}>
            <section className={styles.viewportFrame}>
              <div
                style={{
                  width: "1150px",
                  height: "650px",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <main style={{ background: "transparent", color: "#222" }}>
      {/* Canvas */}
      <div
        style={{
          marginTop: 0,
          border: "1px solid #bdbdbd",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative", width: 1150, height: 650, overflow: "hidden" }}>
          <svg
            width={1150}
            height={28}
            viewBox="0 0 1150 28"
            style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 6 }}
          >
            <g opacity={0.75}>
              {(() => {
                const leftPx = SUPPORT_X[spanFt].left;
                const rightPx = SUPPORT_X[spanFt].right;
                const usablePx = rightPx - leftPx;
                const pxPerFt = usablePx / spanFt;
                const rulerTopY = 0;
                return (
                  <>
                    <line x1={leftPx} y1={rulerTopY} x2={rightPx} y2={rulerTopY}
                      stroke="#141414" strokeWidth={1} opacity={0.55} />
                    {Array.from({ length: spanFt + 1 }).map((_, ft) => {
                      const x = leftPx + ft * pxPerFt;
                      if (x < leftPx || x > rightPx) return null;
                      const isMajor = ft % 5 === 0;
                      return (
                        <g key={`rt-fixed-${ft}`}>
                          <line x1={x} y1={rulerTopY} x2={x} y2={rulerTopY + (isMajor ? 10 : 6)}
                            stroke="#141414" strokeWidth={1} opacity={isMajor ? 0.85 : 0.55} />
                          {isMajor ? (
                            <text x={x + 2} y={rulerTopY + 16} fill="#141414" fontSize={10} opacity={0.85}>
                              {ft}
                            </text>
                          ) : null}
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </g>
          </svg>
          <svg
            width={60}
            height={650}
            viewBox="0 0 60 650"
            style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 6 }}
          >
            <g opacity={0.75}>
              {Array.from({ length: VSPACE[spanFt].above + VSPACE[spanFt].below + 1 }).map((_, i) => {
                const usablePx = SUPPORT_X[spanFt].right - SUPPORT_X[spanFt].left;
                const pxPerFt = usablePx / spanFt;
                const ft = VSPACE[spanFt].above - i;
                const y = ft >= 0 ? ROADWAY_Y - ft * pxPerFt : ROADWAY_Y + Math.abs(ft) * pxPerFt;
                if (y < 0 || y > 650) return null;
                const isMajor = ft % 5 === 0;
                const showLabel = spanFt === 20 ? true : isMajor;
                return (
                  <g key={`rl-fixed-${i}`}>
                    <line x1={0} y1={y} x2={isMajor ? 10 : 6} y2={y}
                      stroke="#141414" strokeWidth={1} opacity={isMajor ? 0.85 : 0.55} />
                    <text x={isMajor ? 12 : 10} y={y + 3} fill="#141414"
                      fontSize={isMajor ? 10 : 8} opacity={isMajor ? 0.85 : 0.6}>
                      {showLabel ? (ft >= 0 ? `+${ft}` : ft) : ""}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
          <div
            style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}
          >
            <BridgeScene />
          </div>
          <div style={{ position: "relative", zIndex: 1 }}>
            <svg
              ref={svgRef}
              width={1150}
              height={650}
              viewBox="0 0 1150 650"
              onClick={onCanvasClick}
              onMouseDown={onSvgMouseDown}
              onMouseMove={onSvgMouseMove}
              onMouseUp={onSvgMouseUp}
              onMouseLeave={onSvgMouseLeave}
              style={{
                display: "block",
                cursor:
                  tool === "select"
                    ? "default"
                    : tool === "joint" || tool === "member"
                    ? "crosshair"
                    : tool === "erase"
                    ? eraseCursor
                    : dragNodeId
                    ? "grabbing"
                    : "default",
                userSelect: "none",
              }}
            >
          {renderScene()}

        {/* Piers */}
        <g opacity={0.45}>
          {[supportA, supportB].map((s) => (
            <g key={`pier-${s.id}`}>
              <rect
                x={s.x - 28}
                y={deckY - 8}
                width={56}
                height={28}
                fill="url(#stoneBlocks)"
              />
              <rect
                x={s.x - 9}
                y={s.y + 18}
                width={18}
                height={(420 - s.y) * 0.7}
                fill="#a0a0a0"
              />
              <rect
                x={s.x - 18}
                y={s.y + 18 + (420 - s.y) * 0.7}
                width={36}
                height={14}
                fill="#7f7f7f"
              />
            </g>
          ))}
        </g>

        {/* Grid (optional) */}
        {showGrid ? (
          <>
            {(() => {
              const designLeft = supportA.x;
              const designRight = supportB.x;
              const designMinY = ROADWAY_Y - VSPACE[spanFt].above * pixelsPerFoot;
              const designMaxY = ROADWAY_Y + VSPACE[spanFt].below * pixelsPerFoot;
              const baseY =
                ROADWAY_Y +
                Math.floor((designMinY - ROADWAY_Y) / pixelsPerFoot) * pixelsPerFoot;
              const baseX = designLeft;
              const rows =
                Math.ceil((designMaxY - baseY) / pixelsPerFoot) + 1;
              const cols =
                Math.ceil((designRight - baseX) / pixelsPerFoot) + 1;

              return (
                <>
                  <g opacity={1}>
                    {Array.from({ length: rows }).map((_, i) => {
                      const y = baseY + i * pixelsPerFoot;
                      if (y < designMinY || y > designMaxY) return null;
                      return (
                        <line
                          key={`h-${i}`}
                          x1={designLeft}
                          y1={y}
                          x2={designRight}
                          y2={y}
                          stroke="rgba(0,0,0,0.08)"
                          strokeWidth={1}
                        />
                      );
                    })}
                    {Array.from({ length: cols }).map((_, i) => {
                      const x = baseX + i * pixelsPerFoot;
                      if (x < designLeft || x > designRight) return null;
                      return (
                        <line
                          key={`v-${i}`}
                          x1={x}
                          y1={designMinY}
                          x2={x}
                          y2={designMaxY}
                          stroke="rgba(0,0,0,0.08)"
                          strokeWidth={1}
                        />
                      );
                    })}
                  </g>
                  <g opacity={1}>
                    {/*
                      Major grid lines align to the ruler origins:
                      - X origin at left support
                      - Y origin at roadway
                    */}
                    {Array.from({ length: rows }).map((_, i) => {
                      const y = baseY + i * pixelsPerFoot;
                      if (y < designMinY || y > designMaxY) return null;
                      if (Math.round((ROADWAY_Y - y) / pixelsPerFoot) % 5 !== 0) {
                        return null;
                      }
                      return (
                        <line
                          key={`h-major-${i}`}
                          x1={designLeft}
                          y1={y}
                          x2={designRight}
                          y2={y}
                          stroke="rgba(0,0,0,0.18)"
                          strokeWidth={1}
                        />
                      );
                    })}
                    {Array.from({ length: cols }).map((_, i) => {
                      const x = baseX + i * pixelsPerFoot;
                      if (x < designLeft || x > designRight) return null;
                      if (Math.round((x - designLeft) / pixelsPerFoot) % 5 !== 0) {
                        return null;
                      }
                      return (
                        <line
                          key={`v-major-${i}`}
                          x1={x}
                          y1={designMinY}
                          x2={x}
                          y2={designMaxY}
                          stroke="rgba(0,0,0,0.18)"
                          strokeWidth={1}
                        />
                      );
                    })}
                  </g>
                </>
              );
            })()}
          </>
        ) : null}

          {/* Road approaches (20/40/60 ft spans) */}
          {spanFeet === 20 ||
          spanFeet === 40 ||
          spanFeet === 60 ||
          spanFeet === 80 ||
          spanFeet === 100 ? (
            <>
              <rect
                x={minX}
                y={deckY - 6}
                width={supportA.x - minX}
                height={12}
                fill="#8a8a8a"
                opacity={0.6}
              />
              <rect
                x={supportB.x}
                y={deckY - 6}
                width={maxX - supportB.x}
                height={12}
                fill="#8a8a8a"
                opacity={0.6}
              />
            </>
          ) : null}

          {/* Deck */}
          <rect
            x={supportA.x}
            y={supportA.y - 5}
            width={supportB.x - supportA.x}
            height={10}
            fill="#e2e5e8"
            opacity={0.35}
          />
          <line
            x1={supportA.x}
            y1={supportA.y - 9}
            x2={supportB.x}
            y2={supportB.y - 9}
            stroke="white"
            strokeWidth={1.5}
            opacity={0.35}
          />
          <line
            x1={supportA.x}
            y1={supportA.y}
            x2={supportB.x}
            y2={supportB.y}
            stroke="#f7d36a"
            strokeWidth={1.4}
            strokeDasharray="8 10"
            opacity={0.6}
          />
          <line
            x1={minX}
            y1={supportA.y}
            x2={supportA.x}
            y2={supportA.y}
            stroke="#f7d36a"
            strokeWidth={1.2}
            strokeDasharray="8 10"
            opacity={0.45}
          />
          <line
            x1={supportB.x}
            y1={supportB.y}
            x2={maxX}
            y2={supportB.y}
            stroke="#f7d36a"
            strokeWidth={1.2}
            strokeDasharray="8 10"
            opacity={0.45}
          />

          {/* Crosshair guides (Joint mode) */}
          {tool === "joint" && hoverPoint ? (
            <g opacity={0.35} pointerEvents="none">
              <line
                x1={hoverPoint.x}
                y1={0}
                x2={hoverPoint.x}
                y2={650}
                stroke="#ff2bd6"
                strokeWidth={1}
                strokeDasharray="4 6"
              />
              <line
                x1={0}
                y1={hoverPoint.y}
                x2={1150}
                y2={hoverPoint.y}
                stroke="#ff2bd6"
                strokeWidth={1}
                strokeDasharray="4 6"
              />
            </g>
          ) : null}

          {tool === "select" && selectionBox ? (
            <rect
              x={Math.min(selectionBox.start.x, selectionBox.current.x)}
              y={Math.min(selectionBox.start.y, selectionBox.current.y)}
              width={Math.abs(selectionBox.current.x - selectionBox.start.x)}
              height={Math.abs(selectionBox.current.y - selectionBox.start.y)}
              fill="rgba(120, 200, 255, 0.08)"
              stroke="rgba(120, 200, 255, 0.6)"
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          ) : null}

          {tool === "member" && memberPreviewStart && memberPreview ? (
            <g opacity={0.7} pointerEvents="none">
              <line
                x1={memberPreviewStart.x}
                y1={memberPreviewStart.y}
                x2={memberPreview.x}
                y2={memberPreview.y}
                stroke="#4f5560"
                strokeWidth={thicknessToStrokeWidth(activeMemberType)}
                strokeDasharray={memberPreview.targetNodeId ? "none" : "10 8"}
                strokeLinecap="round"
              />
              <circle
                cx={memberPreview.x}
                cy={memberPreview.y}
                r={memberPreview.targetNodeId ? 8 : 5}
                fill={memberPreview.targetNodeId ? "rgba(79, 85, 96, 0.22)" : "rgba(79, 85, 96, 0.12)"}
                stroke="#4f5560"
                strokeWidth={1.5}
              />
            </g>
          ) : null}

          {/* A2: highlight non-triangulated bays */}
          <g opacity={0.35} pointerEvents="none">
            {inspectionHasRun
              ? riskyBays.map((bay, index) => {
                const [aId, bId, cId, dId] = bay.cycle;
                const a = nodeById.get(aId);
                const b = nodeById.get(bId);
                const c = nodeById.get(cId);
                const d = nodeById.get(dId);
                if (!a || !b || !c || !d) return null;
                const points = `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`;
                return (
                  <polygon
                    key={`bay-${index}`}
                    points={points}
                    fill="yellow"
                    stroke="gold"
                    strokeWidth={2}
                  />
                );
              })
              : null}
            </g>


          {/* A3: highlight crossing members without junction */}
          {inspectionHasRun && crossingMembers.length > 0 ? (
            <g pointerEvents="none">
              {crossingMembers.map((c, idx) => (
                <g key={`crossing-${idx}`}>
                  <circle cx={c.pt.x} cy={c.pt.y} r={10} fill="none" stroke="#f97316" strokeWidth={2.5} />
                  <line x1={c.pt.x - 6} y1={c.pt.y} x2={c.pt.x + 6} y2={c.pt.y} stroke="#f97316" strokeWidth={2.5} strokeLinecap="round" />
                  <line x1={c.pt.x} y1={c.pt.y - 6} x2={c.pt.x} y2={c.pt.y + 6} stroke="#f97316" strokeWidth={2.5} strokeLinecap="round" />
                </g>
              ))}
            </g>
          ) : null}

          {/* Members */}
          <g opacity={0.95}>
            {members.map((m) => {
              const a = nodeById.get(m.a);
              const b = nodeById.get(m.b);
              if (!a || !b) return null;
              const aPos = getRenderedNodePosition(a);
              const bPos = getRenderedNodePosition(b);

              const width = thicknessToStrokeWidth(m.type);
              const stressForce = activeStressTestResult?.memberForces[m.id] ?? null;
              const utilization = memberUtilizationById?.[m.id] ?? 0;
              const capForMember = memberCapById?.[m.id] ?? 0;
              const stressTestHasRun = Boolean(activeStressTestResult);
              const stressTestFailing = stressTestHasRun && !stressTestPass;
              const vehicleOnBridge =
                isTesting &&
                testProgress >= bridgeStartProgress &&
                testProgress <= bridgeEndProgress;
              const showLiveFailureEffects = !isTesting || vehicleOnBridge;
              const isFailed = failedMemberIdsForDisplay?.includes(m.id) ?? false;
              const displayForce = stressForce;
              const displayUtilization = utilization;
              const displayCap = capForMember;
              const dx = bPos.x - aPos.x;
              const dy = bPos.y - aPos.y;
              const L = Math.hypot(dx, dy);
              const shouldCartoon = isTesting && stressTestHasRun && vehicleOnBridge;
              const bow =
                shouldCartoon && isFailed && displayForce !== null && displayForce >= 0
                  ? Math.sin(testProgress * Math.PI * 10) * 8
                  : 0;
              const jitterX =
                shouldCartoon && isFailed && displayForce !== null && displayForce < 0
                  ? Math.sin(testProgress * Math.PI * 18) * 3
                  : 0;
              const jitterY =
                shouldCartoon && isFailed && displayForce !== null && displayForce < 0
                  ? Math.cos(testProgress * Math.PI * 16) * 3
                  : 0;
              const ux = L > 0 ? dx / L : 0;
              const uy = L > 0 ? dy / L : 0;
              const px = -uy;
              const py = ux;
              const cx = aPos.x + dx * 0.5;
              const cy = aPos.y + dy * 0.5;
              const curveCx = cx + px * bow + jitterX;
              const curveCy = cy + py * bow + jitterY;
              const visibleStroke =
                stressTestHasRun && isFailed && showLiveFailureEffects
                  ? getStressStroke(displayForce, displayUtilization)
                  : "#666";
              const strokeVisualWeight =
                stressTestFailing && isFailed ? width + 1.5 : width;

              return (
                <g key={m.id}>
                  {/* Wide invisible hit line */}
                  <line
                    x1={aPos.x}
                    y1={aPos.y}
                    x2={bPos.x}
                    y2={bPos.y}
                    stroke="transparent"
                    strokeWidth={memberHitStrokeWidth}
                    data-kind="member-hit"
                    pointerEvents="stroke"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMemberClick(m.id, e.shiftKey);
                    }}
                    style={{
                      cursor:
                        tool === "erase"
                          ? eraseCursor
                          : tool === "member"
                          ? "crosshair"
                          : "default",
                    }}
                  />
                  {/* Visible member */}
                  <path
                    d={`M ${aPos.x} ${aPos.y} Q ${curveCx} ${curveCy} ${bPos.x} ${bPos.y}`}
                    stroke={visibleStroke}
                    strokeWidth={strokeVisualWeight}
                    fill="none"
                    opacity={0.9}
                  />
                    {inspectionHasRun && longMemberIds.has(m.id) && L > 0 ? (
                      (() => {
                      const half = 10;
                      return (
                        <line
                          x1={cx - px * half}
                          y1={cy - py * half}
                          x2={cx + px * half}
                          y2={cy + py * half}
                          stroke="rgba(138, 43, 226, 0.9)"
                          strokeWidth={3}
                          opacity={0.9}
                          pointerEvents="none"
                        />
                      );
                    })()
                  ) : null}
                  {stressTestFailing && isFailed && showLiveFailureEffects ? (
                    <line
                      x1={aPos.x}
                      y1={aPos.y}
                      x2={bPos.x}
                      y2={bPos.y}
                      stroke={getStressStroke(
                        displayForce,
                        Math.max(1, displayUtilization)
                      )}
                      strokeWidth={width + 2}
                      opacity={0.45}
                      pointerEvents="none"
                    />
                  ) : null}
                  {tool === "select" && selectedMemberIds.has(m.id) ? (
                    <line
                      x1={aPos.x}
                      y1={aPos.y}
                      x2={bPos.x}
                      y2={bPos.y}
                      stroke="rgba(170, 220, 255, 0.9)"
                      strokeWidth={width + 5}
                      opacity={0.9}
                      pointerEvents="none"
                    />
                  ) : null}
                  {stressTestFailing && isFailed && showLiveFailureEffects ? (
                    <text
                      x={cx}
                      y={cy}
                      fill={getStressStroke(
                        displayForce,
                        Math.max(1, displayUtilization)
                      )}
                      fontSize={12}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      pointerEvents="none"
                    >
                      {displayCap > 0 && displayForce !== null
                        ? `${Math.round((Math.abs(displayForce) / displayCap) * 100)}%`
                        : "!"}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>

          {/* Stress test vehicle */}
          {isTesting ? (
            <g pointerEvents="none">
              {(() => {
                const vehicleX = minX + testProgress * (maxX - minX);
                const vehicleY =
                  deckY -
                  18 +
                  getGlobalBridgeBowAtX(vehicleX) +
                  getLiveDeckDeflectionAtX(vehicleX);
                return renderVehicle(getVehicleType(loadLb), vehicleX, vehicleY);
              })()}
            </g>
          ) : null}

          {/* Nodes */}
          {nodes.map((n) => {
            const isSupport = n.id === SUPPORT_A_ID || n.id === SUPPORT_B_ID;
            const isPending = pendingNodeId === n.id && tool === "member";
            const p = getRenderedNodePosition(n);

              return (
                <g key={n.id}>
                  {tool !== "select" && !isSupport ? (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={nodeHitRadius}
                      fill="transparent"
                      stroke="transparent"
                      strokeWidth={1}
                      data-kind="node"
                      onMouseDown={(e) => onNodeMouseDown(e, n.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onNodeClick(n.id);
                      }}
                    />
                  ) : null}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isSupport ? 10 : isPending ? 9 : 7}
                    fill="#e6e6e6"
                    stroke="#444"
                    strokeWidth={1}
                    opacity={isSupport ? 1 : isPending ? 1 : 0.95}
                    data-kind="node"
                    onMouseDown={(e) => onNodeMouseDown(e, n.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onNodeClick(n.id);
                    }}
                    style={{
                      cursor:
                        tool === "erase"
                          ? eraseCursor
                          : tool === "member"
                          ? "crosshair"
                          : tool === "select"
                          ? "default"
                          : tool === "joint"
                          ? isSupport
                            ? "default"
                            : jointDragCursor
                          : "pointer",
                    }}
                  />
                </g>
              );
            })}

          {/* Rulers moved to fixed overlays */}

          {showGrid ? (
            <text
              x={supportA.x + 12}
              y={ROADWAY_Y + VSPACE[spanFt].below * pixelsPerFoot - 12}
              fill="#333"
              fontSize={10}
              opacity={0.6}
            >
              1 square = 1 ft
            </text>
          ) : null}
            </svg>
            <div
              style={{
                position: "absolute",
                right: 18,
                bottom: 18,
                background: "rgba(255,255,255,0.95)",
                border: "2px solid #1f1f1f",
                borderRadius: 10,
                padding: "8px 10px",
                minWidth: 180,
                fontSize: 11,
                color: "#222",
                boxShadow: "0 6px 12px rgba(0,0,0,0.18)",
                lineHeight: 1.4,
              }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontWeight: 700 }}>Bridge Name</span>
                  <input
                    value={bridgeName}
                    onChange={(e) => setBridgeName(e.target.value)}
                    placeholder="Enter name"
                    style={{
                      border: "none",
                      borderBottom: "1px solid #999",
                      background: "transparent",
                      padding: "0 4px",
                      fontSize: 11,
                      flex: 1,
                      minWidth: 80,
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontWeight: 700 }}>Designed by:</span>
                  <input
                    value={designerName}
                    onChange={(e) => setDesignerName(e.target.value)}
                    placeholder="Name"
                    style={{
                      border: "none",
                      borderBottom: "1px solid #999",
                      background: "transparent",
                      padding: "0 4px",
                      fontSize: 11,
                      flex: 1,
                      minWidth: 80,
                    }}
                  />
                </div>
                <div>Cost: ${costSummary.totalCost.toFixed(2)}</div>
                <div>
                  Span &amp; Load: {spanFeet} ft / {formatTons(loadLb)}
                </div>
                <div>
                  Inspection {inspectionPass ? "Pass" : "Fail"} / Stress Test{" "}
                  {stressTestStatusLabel}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

                </main>
              </div>
            </section>

            <aside className={styles.rightPanel}>
              {assignmentConfig && (
                <div className={styles.sideCard} style={{ background: assignmentSubmitted ? "#f0fdf4" : "#fffbeb", border: `2px solid ${assignmentSubmitted ? "#86efac" : "#fde68a"}` }}>
                  <div className={styles.sideCardHeader} style={{ borderBottom: `1px solid ${assignmentSubmitted ? "#86efac" : "#fde68a"}` }}>
                    <div className={styles.sideCardTitle} style={{ color: assignmentSubmitted ? "#166534" : "#92400e" }}>
                      {assignmentSubmitted ? "✓ Assignment Submitted" : "🌉 Assignment"}
                    </div>
                  </div>
                  <div className={styles.sideCardBody}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 8 }}>
                      {assignmentConfig.title || "Bridge Assignment"}
                    </div>
                    <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>Span: {assignmentConfig.span_feet} ft (locked)</div>
                      <div style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>Load: {assignmentConfig.load_lb / 2000} ton (locked)</div>
                      <div style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>
                        Budget: ${costSummary.totalCost.toFixed(2)} / ${assignmentConfig.max_cost.toFixed(2)}
                        {costSummary.totalCost > assignmentConfig.max_cost && (
                          <span style={{ color: "#dc2626", marginLeft: 4 }}>— over budget!</span>
                        )}
                      </div>
                    </div>
                    {!assignmentSubmitted && (
                      assignmentComplete ? (
                        <button
                          onClick={handleSubmitAssignment}
                          disabled={assignmentSubmitting}
                          style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none",
                            background: assignmentSubmitting ? "#86efac" : "#16a34a",
                            color: "#fff", fontWeight: 800, fontSize: 13, cursor: assignmentSubmitting ? "not-allowed" : "pointer" }}>
                          {assignmentSubmitting ? "Submitting…" : "Submit Assignment"}
                        </button>
                      ) : (
                        <div style={{ fontSize: 11, color: "#92400e", fontStyle: "italic" }}>
                          {!inspectionPass ? "Run inspection first" : !stressTestResult ? "Run stress test to verify" : !stressTestPass ? "Bridge failed stress test" : "Over budget — reduce material cost"}
                        </div>
                      )
                    )}
                    {assignmentSubmitted && (
                      <>
                        <div style={{ fontSize: 12, color: "#166534", fontWeight: 700, marginBottom: nodes.length > 0 ? 0 : 8 }}>
                          Great work! Your bridge passed and was submitted.
                        </div>
                        {nodes.length > 0 && assignmentComplete && (
                          <button
                            onClick={handleSubmitAssignment}
                            disabled={assignmentSubmitting}
                            style={{ width: "100%", marginTop: 10, padding: "10px", borderRadius: 8, border: "none",
                              background: assignmentSubmitting ? "#86efac" : "#15803d",
                              color: "#fff", fontWeight: 800, fontSize: 13, cursor: assignmentSubmitting ? "not-allowed" : "pointer" }}>
                            {assignmentSubmitting ? "Resubmitting…" : "↺ Resubmit Improved Bridge"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
              <div className={styles.sideCard}>
                <div className={styles.sideCardHeader}>
                  <div className={styles.sideCardTitle}>Load & Span</div>
                  <button
                    className={styles.sideCardToggle}
                    onClick={() => setOptionsExpanded((v) => !v)}
                    aria-expanded={optionsExpanded}
                    aria-label="Toggle Load & Span"
                  >
                    {optionsExpanded ? "v" : "^"}
                  </button>
                </div>
                {optionsExpanded ? (
                  <div className={styles.sideCardBody}>
                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={{ fontWeight: 600, fontSize: 12, color: "#0d0d0d" }}>
                        Span
                      </label>
                      <select
                        value={spanFeet}
                        onChange={(e) =>
                          applySpanFeet(Number(e.target.value) as 20 | 40 | 60 | 80 | 100)
                        }
                        disabled={!!assignmentConfig}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 8,
                          border: "1px solid #b8b8b8",
                          background: assignmentConfig ? "#f3f4f6" : "#ffffff",
                          fontSize: 12,
                          fontWeight: 600,
                          opacity: assignmentConfig ? 0.7 : 1,
                        }}
                      >
                        <option value={20}>20 ft</option>
                        <option value={40}>40 ft</option>
                        <option value={60}>60 ft</option>
                        <option value={80}>80 ft</option>
                        <option value={100}>100 ft</option>
                      </select>

                      <label
                        style={{
                          fontWeight: 600,
                          fontSize: 12,
                          marginTop: 4,
                          color: "#000",
                        }}
                      >
                        Load
                      </label>
                      <select
                        value={selectedLoadTon}
                        onChange={(e) =>
                          setLoadLb(Number(e.target.value) * LB_PER_TON)
                        }
                        disabled={!!assignmentConfig}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 8,
                          border: "1px solid #b8b8b8",
                          background: assignmentConfig ? "#f3f4f6" : "#ffffff",
                          fontSize: 12,
                          fontWeight: 600,
                          opacity: assignmentConfig ? 0.7 : 1,
                        }}
                      >
                        <option value={8}>8 Ton</option>
                        <option value={15}>15 Ton</option>
                        <option value={30}>30 Ton</option>
                      </select>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className={styles.sideCard}>
                <div className={styles.sideCardHeader}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className={styles.sideCardTitle}>Material</div>
                    <button
                      onClick={() => stepSelectedMemberSizes(1)}
                      title="Size up"
                      style={{
                        border: "1px solid #b8b8b8",
                        borderRadius: 6,
                        padding: 2,
                        background: "transparent",
                        cursor: "pointer",
                        lineHeight: 1,
                      }}
                    >
                      <img src="/ui/up-arrow.png" alt="Size up" width={18} height={18} />
                    </button>
                    <button
                      onClick={() => stepSelectedMemberSizes(-1)}
                      title="Size down"
                      style={{
                        border: "1px solid #b8b8b8",
                        borderRadius: 6,
                        padding: 2,
                        background: "transparent",
                        cursor: "pointer",
                        lineHeight: 1,
                      }}
                    >
                      <img src="/ui/down-arrow.png" alt="Size down" width={18} height={18} />
                    </button>
                  </div>
                  <span />
                </div>
                <div className={styles.sideCardBody} style={{ display: "grid", gap: 10 }}>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: "#0d0d0d" }}>
                      Grade
                    </span>
                    <select
                      value={selectedGradeMixed ? "mixed" : materialGrade}
                      onChange={(e) => {
                        const next: MaterialGrade =
                          e.target.value === "high" ? "high" : "mild";
                        setSelectedGradeMixed(false);
                        setMaterialGrade(next);
                        if (selectedMemberIds.size > 0) {
                          setSelectedMemberGrade(next);
                        }
                      }}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 8,
                        border: "1px solid #b8b8b8",
                        background: "#ffffff",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {selectedGradeMixed ? (
                        <option value="mixed">Mixed</option>
                      ) : null}
                      <option value="mild">Mild Steel</option>
                      <option value="high">High Strength Steel</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: "#0d0d0d" }}>
                      Size
                    </span>
                      <select
                        value={selectedSizeMixed ? "mixed" : activeMemberType}
                        onChange={(e) => {
                          if (e.target.value === "mixed") return;
                          const nextType = e.target.value as MemberType;
                          setSelectedSizeMixed(false);
                          setActiveMemberType(nextType);
                          if (selectedMemberIds.size > 0) {
                            setSelectedMemberType(nextType);
                          }
                        }}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 8,
                          border: "1px solid #b8b8b8",
                          background: "#ffffff",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {selectedSizeMixed ? (
                          <option value="mixed">Mixed</option>
                        ) : null}
                        {boxKeys.map((key) => (
                          <option key={key} value={key}>
                            {formatMemberSizeNoGauge(key as MemberType)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className={styles.sideCard}>
                <div className={styles.sideCardHeader}>
                  <div className={styles.sideCardTitle}>Cost</div>
                  <button
                    className={styles.sideCardToggle}
                    onClick={() => setCostExpanded((v) => !v)}
                    aria-expanded={costExpanded}
                    aria-label="Toggle Cost"
                  >
                    {costExpanded ? "v" : "^"}
                  </button>
                </div>
                <div style={{ fontWeight: 700, color: "#1b7f3a", marginBottom: 6 }}>
                  ${costSummary.totalCost.toFixed(2)}
                </div>
                {costExpanded ? (
                  <div className={styles.sideCardBody} style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 700, color: "#1b7f3a" }}>
                      ${costSummary.totalCost.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 11, color: "#444" }}>
                      {costSummary.totalFeet.toFixed(2)} ft total
                    </div>
                    <div style={{ fontSize: 11 }}>
                      Joints: ${costSummary.jointCost.toFixed(2)} ({nodes.length})
                    </div>
                    <div style={{ fontSize: 11 }}>
                      Steel Box Beam: ${costSummary.boxCost.toFixed(2)}
                    </div>
                    {selectedMemberStats ? (
                      <div style={{ fontSize: 11, marginTop: 6 }}>
                        Selected: {selectedMemberStats.ft.toFixed(2)} ft @ $
                        {selectedMemberStats.rate}/ft = $
                        {selectedMemberStats.cost.toFixed(2)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className={styles.sideCard}>
                <div className={styles.sideCardHeader}>
                  <div className={styles.sideCardTitle}>Bridge Examiner</div>
                </div>
                <div className={styles.sideCardBody} style={{ display: "grid", gap: 12 }}>
                    <button
                      onClick={runBridgeExaminer}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #b8b8b8",
                        background: "#eeeeee",
                        color: "#222",
                        cursor: isTesting ? "wait" : "pointer",
                        fontWeight: 700,
                        fontSize: 12,
                        width: "fit-content",
                      }}
                    >
                      {isTesting ? "Running Test..." : "Run Bridge Test"}
                    </button>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 800, fontSize: 12 }}>Design Inspection</div>
                      <div style={{ fontWeight: 700 }}>
                        {!inspectionHasRun
                          ? "Not run"
                          : inspectionPass
                          ? "Pass"
                          : "Fail"}
                      </div>
                      {inspectionHasRun && inspectionFailReasons.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11 }}>
                          {inspectionFailReasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      ) : null}
                      {inspectionHasRun && inspectionWarningItems.length > 0 ? (
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: 18,
                            fontSize: 11,
                            color: "#8a5b00",
                          }}
                        >
                          {inspectionWarningItems.map((warning) => (
                            <li key={warning.id}>
                              {warning.text}{" "}
                              <button
                                onClick={() => {
                                  const next = new Set(warning.memberIds);
                                  setSelectedMemberIds(next);
                                  setSelectedMemberId(warning.memberIds[0] ?? null);
                                  setTool("select");
                                }}
                                style={{
                                  fontWeight: 700,
                                  color: "#c92a2a",
                                  textShadow: "0 0 6px rgba(255, 77, 77, 0.6)",
                                  background: "transparent",
                                  border: "none",
                                  padding: 0,
                                  cursor: "pointer",
                                }}
                              >
                                {warning.memberIds.length}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontWeight: 800, fontSize: 12 }}>Stress Test</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={clearStressTest}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #b8b8b8",
                            background: "#ffffff",
                            color: "#222",
                            cursor: "pointer",
                            fontWeight: 600,
                            fontSize: 12,
                          }}
                        >
                          Clear Stress Test
                        </button>
                        {isTesting ? (
                          <button
                            onClick={cancelStressTest}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid #b8b8b8",
                              background: "#ffffff",
                              color: "#222",
                              cursor: "pointer",
                              fontWeight: 600,
                              fontSize: 12,
                            }}
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 11, color: "#444" }}>
                        {isTesting
                          ? "Running..."
                          : inspectionHasRun && !inspectionPass
                          ? "Bridge cannot be stress tested until it passes its design inspection."
                          : stressFailReason
                          ? stressFailReason
                          : activeStressTestError
                          ? activeStressTestError
                          : ""}
                      </div>
                      {activeStressTestResult ? (
                        <>
                          <div style={{ fontSize: 11 }}>
                            # of members passed stress:{" "}
                            <button
                              onClick={() => {
                                const failed = new Set(
                                  stressTestResult?.failedMemberIds ?? []
                                );
                                const passed = members
                                  .filter((m) => !failed.has(m.id))
                                  .map((m) => m.id);
                                const next = new Set(passed);
                                setSelectedMemberIds(next);
                                setSelectedMemberId(passed[0] ?? null);
                                setTool("select");
                              }}
                              style={{
                                fontWeight: 700,
                                color: "#1e8e3e",
                                textShadow: "0 0 6px rgba(46, 204, 113, 0.6)",
                                background: "transparent",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                              }}
                            >
                              {Math.max(
                                0,
                                members.length -
                                  (stressTestResult?.failedMemberIds.length ?? 0)
                              )}
                            </button>
                          </div>
                          <div style={{ fontSize: 11 }}>
                            # of members failed stress:{" "}
                            <button
                              onClick={() => {
                                const failed = stressTestResult?.failedMemberIds ?? [];
                                const next = new Set(failed);
                                setSelectedMemberIds(next);
                                setSelectedMemberId(failed[0] ?? null);
                                setTool("select");
                              }}
                              style={{
                                fontWeight: 700,
                                color: "#c92a2a",
                                textShadow: "0 0 6px rgba(255, 77, 77, 0.6)",
                                background: "transparent",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                              }}
                            >
                              {stressTestResult?.failedMemberIds.length ?? 0}
                            </button>
                          </div>
                          {selectedMemberStress && (
                            <div
                              style={{
                                marginTop: 10,
                                fontSize: 11,
                                paddingTop: 8,
                                borderTop: "1px solid #ddd",
                              }}
                            >
                              <div style={{ fontWeight: 700 }}>Selected member</div>
                              <div>Mode: {selectedMemberStress.mode}</div>
                              <div>
                                Force: {selectedMemberStress.force.toFixed(0)} lb
                              </div>
                              <div>Cap: {selectedMemberStress.cap.toFixed(0)} lb</div>
                              <div>
                                Utilization:{" "}
                                {(selectedMemberStress.utilization * 100).toFixed(0)}%
                              </div>
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>
                  </div>
              </div>
            </aside>
          </main>
        </div>
      </main>

      {leaveUrl && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}>
          <div style={{ background: "#fff", border: "2px solid #1f1f1f", borderRadius: 16,
            padding: "28px 32px", maxWidth: 400, width: "100%", textAlign: "center",
            boxShadow: "0 12px 32px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 900, color: "#111" }}>
              Unsaved Changes
            </h3>
            <p style={{ margin: "0 0 24px", fontSize: 14, color: "#555", lineHeight: 1.6 }}>
              You have unsaved changes to your bridge design. If you leave now your recent changes will be lost.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => setLeaveUrl(null)}
                style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #d1d5db",
                  background: "#fff", color: "#111", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Stay & Keep Editing
              </button>
              {bridgeName.trim() && (
                <button onClick={async () => {
                  const url = leaveUrl!;
                  setLeaveUrl(null);
                  await performCloudSave(activeCloudName ?? bridgeName.trim());
                  // isDirty is now false after save — router.push will pass through
                  router.push(url);
                }}
                  style={{ padding: "10px 20px", borderRadius: 8, border: "none",
                    background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  Save & Leave
                </button>
              )}
              <button onClick={() => {
                const url = leaveUrl!;
                setIsDirty(false); // Clear before navigating so pushState lets it through
                setLeaveUrl(null);
                router.push(url);
              }}
                style={{ padding: "10px 20px", borderRadius: 8, border: "none",
                  background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Leave Without Saving
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveDialog ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(480px, 96vw)",
              background: "#fff",
              border: "2px solid #1f1f1f",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 12px 28px rgba(0,0,0,0.28)",
              display: "grid",
              gap: 12,
              color: "#111",
            }}
          >
            {saveDialogMode === "name-required" ? (
              <>
                <div style={{ fontWeight: 800, fontSize: 18, color: "#111" }}>Name Your Bridge</div>
                <p style={{ margin: 0, fontSize: 14, color: "#555" }}>
                  Enter a name for this design before saving.
                </p>
                <input
                  type="text"
                  value={savePendingName}
                  onChange={(e) => setSavePendingName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && savePendingName.trim() && performCloudSave(savePendingName.trim())}
                  placeholder="My Bridge Design"
                  autoFocus
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #6a6a6a",
                    fontSize: 14,
                    color: "#111",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                  <button onClick={closeSaveDialog}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #6a6a6a",
                      background: "#fff", color: "#111", cursor: "pointer", fontWeight: 700 }}>
                    Cancel
                  </button>
                  <button
                    onClick={() => { const n = savePendingName.trim(); if (n) performCloudSave(n); }}
                    disabled={!savePendingName.trim()}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #1d5f2c",
                      background: savePendingName.trim() ? "#2f9e44" : "#b7d9bf",
                      color: "#fff", fontWeight: 700,
                      cursor: savePendingName.trim() ? "pointer" : "not-allowed" }}>
                    Save
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 800, fontSize: 18, color: "#111" }}>Replace Existing Design?</div>
                <p style={{ margin: 0, fontSize: 14, color: "#555" }}>
                  A design named <strong>"{bridgeName}"</strong> is already saved.
                  Do you want to replace it?
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                  <button onClick={closeSaveDialog}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #6a6a6a",
                      background: "#fff", color: "#111", cursor: "pointer", fontWeight: 700 }}>
                    Cancel
                  </button>
                  <button onClick={() => performCloudSave(bridgeName.trim())}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #b45309",
                      background: "#d97706", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                    Replace
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {showExportDialog ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(520px, 96vw)",
              background: "#fff",
              border: "2px solid #1f1f1f",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 12px 28px rgba(0,0,0,0.28)",
              display: "grid",
              gap: 12,
              color: "#111",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18, color: "#111" }}>Export Design</div>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 14, color: "#111", fontWeight: 600 }}>
                File type
              </span>
              <select
                value={exportFormat}
                onChange={(e) => {
                  const next = e.target.value as ExportFormat;
                  setExportFormat(next);
                  if (next !== "pdf") setExportPrintIntent("no");
                }}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #6a6a6a",
                  fontSize: 14,
                  background: "#fff",
                  color: "#111",
                }}
              >
                <option value="pdf">PDF</option>
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
              </select>
            </label>

            {exportFormat === "pdf" ? (
              <>
                <div style={{ fontSize: 14, color: "#111", fontWeight: 600 }}>
                  Do you plan to print this design?
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setExportPrintIntent("yes")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #6a6a6a",
                      background: exportPrintIntent === "yes" ? "#1f6feb" : "#fff",
                      color: exportPrintIntent === "yes" ? "#fff" : "#111",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setExportPrintIntent("no")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #6a6a6a",
                      background: exportPrintIntent === "no" ? "#1f6feb" : "#fff",
                      color: exportPrintIntent === "no" ? "#fff" : "#111",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    No
                  </button>
                </div>
              </>
            ) : null}

            {exportFormat === "pdf" && exportPrintIntent === "yes" ? (
              <>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 14, color: "#111", fontWeight: 600 }}>
                    What size paper do you plan to use?
                  </span>
                  <select
                    value={exportPaperSize}
                    onChange={(e) => setExportPaperSize(e.target.value as ExportPaperSize)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #6a6a6a",
                      fontSize: 14,
                      background: "#fff",
                      color: "#111",
                    }}
                  >
                    <option value="letter">Letter (11 × 8.5 in)</option>
                    <option value="legal">Legal (14 × 8.5 in)</option>
                  </select>
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, color: "#333" }}>
                    What length would you like your bridge to print in? (inches)
                  </span>
                  <input
                    type="number"
                    min={1}
                    step={0.1}
                    value={exportPrintLengthIn}
                    onChange={(e) => setExportPrintLengthIn(e.target.value)}
                    placeholder={`Max ${maxPrintableLengthIn.toFixed(2)} in`}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${exportPrintLengthIn && !printLengthValid ? "#c92a2a" : "#6a6a6a"}`,
                      fontSize: 14,
                      color: "#111",
                    }}
                  />
                  <span style={{ fontSize: 12, color: "#333", fontWeight: 600 }}>
                    Max for {exportPaperSize}: {maxPrintableLengthIn.toFixed(2)} in
                  </span>
                </label>
              </>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                onClick={closeExportDialog}
                disabled={isExportingPdf}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #6a6a6a",
                  background: "#fff",
                  color: "#111",
                  cursor: isExportingPdf ? "not-allowed" : "pointer",
                  fontWeight: 700,
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!canExportNow || isExportingPdf) return;
                  if (exportFormat === "pdf") {
                    if (!exportPrintIntent) return;
                    if (exportPrintIntent === "no") {
                      await exportDesignPdf({ printIntent: "no" });
                    } else {
                      await exportDesignPdf({
                        printIntent: "yes",
                        paperSize: exportPaperSize,
                        printLengthIn: requestedPrintLength,
                      });
                    }
                  } else {
                    await exportDesignImage(exportFormat);
                  }
                  closeExportDialog();
                }}
                disabled={!canExportNow || isExportingPdf}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #1d5f2c",
                  background: canExportNow && !isExportingPdf ? "#2f9e44" : "#b7d9bf",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: canExportNow && !isExportingPdf ? "pointer" : "not-allowed",
                }}
              >
                {isExportingPdf ? "Exporting..." : "Export Now"}
              </button>
            </div>
          </div>
        </div>
      ) : null}


      <footer className={styles.footerStrip} />
    </div>
  );
}

export default function BridgeToolPageRoot() {
  return (
    <React.Suspense fallback={null}>
      <BridgeToolPage />
    </React.Suspense>
  );
}










