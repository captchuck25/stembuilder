"use client";
import { useSession } from "next-auth/react";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import TowerScene from "./components/TowerScene";
import SiteHeader from "@/app/components/SiteHeader";
import {
  upsertTowerDesign,
  checkTowerNameExists,
  fetchTowerDesignById,
} from "@/lib/towerDesigns";
import styles from "./tower-layout.module.css";
import {
  generateTower,
  TOWER_STYLE_INFO,
  type TowerStyle,
} from "./engine/towerTemplates";

import {
  type MemberType,
  type MaterialGrade,
  type Node,
  type Member,
  MEMBER_LIBRARY,
  LB_PER_TON,
  LOAD_TON_OPTIONS,
  COST_PER_JOINT,
  DEFAULT_SNAP_TO_GRID,
  DEFAULT_SNAP_STEP_FEET,
  BASE_BOX_COST,
  getBoxAreaRatio,
  getMemberGrade,
  getMaterialCostMultiplier,
  parseBoxTube,
  thicknessToStrokeWidth,
  formatMemberSizeNoGauge,
  nearestLoadTon,
  normalizeLoadLb,
  formatTons,
  getStressStroke,
  getUtilizationStroke,
} from "@/app/tools/bridge/engine/members";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GROUND_Y,
  TOP_Y,
  CENTER_X,
  HEIGHT_OPTIONS,
  FOOTPRINT_OPTIONS,
  INITIAL_HEIGHT_FEET,
  INITIAL_FOOTPRINT_FEET,
  type HeightFeet,
  type FootprintFeet,
  getPxPerFt,
  getFootprintBounds,
  getTowerSiteCost,
  isGroundNode,
  isTopNode,
  normalizeHeightFeet,
  normalizeFootprintFeet,
} from "./engine/tower";
import {
  runCrushStressTest,
  type StressTestResult,
} from "./engine/solver";
import {
  distancePointToSegment,
  segmentIntersectionPoint,
  segmentIntersectsRect,
} from "./engine/geometry";
import { inspectTower } from "./engine/inspection";
import {
  initCollapse,
  stepCollapse,
  stubTipKey,
  type CollapseState,
} from "./engine/collapse";

type Tool = "select" | "joint" | "member" | "erase";

type ExportPaperSize = "letter" | "legal";
type ExportFormat = "pdf" | "png" | "jpeg";

// Costs run in the hundreds of thousands — always show thousands separators.
const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtLb = (n: number) => Math.round(n).toLocaleString("en-US");

// Fraction of the animated test spent lowering the press plate onto the
// tower before the load starts ramping from 0% to 100%.
const LOAD_START_PROGRESS = 0.18;
// Press plate geometry (canvas px).
const PLATE_PARK_LIFT = 34;
const PLATE_THICKNESS = 14;

// Small tower diagram for the setup wizard's style gallery, drawn from the
// same generator that produces the on-canvas guide.
function TowerPreview({ style }: { style: TowerStyle | "freestyle" }) {
  const W = 150;
  const H = 100;
  const REF_H = 30;
  const REF_W = 15;
  const YG = 90;
  const S = 76 / REF_H;
  const X0 = (W - REF_W * S) / 2;
  const px = (ft: number) => X0 + ft * S;
  const py = (ft: number) => YG - ft * S;
  const tpl = style === "freestyle" ? null : generateTower(style, REF_H, REF_W);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden style={{ display: "block", margin: "0 auto" }}>
      <line x1={0} y1={YG} x2={W} y2={YG} stroke="#8a8a8a" strokeWidth={3} />
      <rect x={px(-2)} y={py(REF_H) - 8} width={(REF_W + 4) * S} height={6} rx={1.5} fill="#64748b" />
      {style === "freestyle" ? (
        <text
          x={px(REF_W / 2)}
          y={py(REF_H / 2) + 9}
          textAnchor="middle"
          fontSize={26}
          fontWeight={800}
          fill="#94a3b8"
        >
          ?
        </text>
      ) : tpl ? (
        <g>
          {tpl.members.map(([a, b], i) => (
            <line
              key={`m${i}`}
              x1={px(tpl.nodes[a].x)}
              y1={py(tpl.nodes[a].y)}
              x2={px(tpl.nodes[b].x)}
              y2={py(tpl.nodes[b].y)}
              stroke="#334155"
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          ))}
          {tpl.nodes.map((nd, i) => (
            <circle
              key={`n${i}`}
              cx={px(nd.x)}
              cy={py(nd.y)}
              r={2.3}
              fill="#f1f5f9"
              stroke="#334155"
              strokeWidth={1.2}
            />
          ))}
        </g>
      ) : null}
    </svg>
  );
}

type HistoryEntry = {
  nodes: Node[];
  members: Member[];
  heightFeet: HeightFeet;
  footprintFeet: FootprintFeet;
  loadLb: number;
  snapStepFeet: 0.5 | 1 | 2.5 | 5;
  snapToGrid: boolean;
  showGrid: boolean;
};

function TowerToolPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const router = useRouter();
  const searchParams = useSearchParams();
  // Teacher demo mode: when ?asStudent=<uuid> is present, the page loads the named
  // student's saved design read-only — saves, autosave, submit, and the leave guard
  // all skip so nothing persists back to the student's record.
  const viewAsStudent = searchParams.get("asStudent");
  // Teacher trying the assignment themselves: full student experience (locked
  // height/footprint/load, budget) but nothing is saved or submitted.
  const teacherDemo = searchParams.get("demo") === "teacher";
  const isDemoMode = !!viewAsStudent || teacherDemo;
  const [viewingStudent, setViewingStudent] = useState<{ name: string; email: string } | null>(null);
  const [demoDesignFound, setDemoDesignFound] = useState<boolean | null>(null);
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
  const historyRef = useRef<HistoryEntry[]>([]);
  const redoRef = useRef<HistoryEntry[]>([]);
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
  const [optionsExpanded, setOptionsExpanded] = useState<boolean>(true);
  // Examiner results render as a dropdown overlaying the canvas so they never
  // push the layout down; dismissible, re-shown on the next run.
  const [resultsDropdownDismissed, setResultsDropdownDismissed] = useState(false);
  // Setup wizard (fresh sandbox visits only) + tower-style design guide.
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [wizardHeight, setWizardHeight] = useState<HeightFeet>(INITIAL_HEIGHT_FEET);
  const [wizardFootprint, setWizardFootprint] = useState<FootprintFeet>(INITIAL_FOOTPRINT_FEET);
  const [wizardLoad, setWizardLoad] = useState<number>(LOAD_TON_OPTIONS[0]);
  const [wizardStyle, setWizardStyle] = useState<TowerStyle | "freestyle">("freestyle");
  const [guideStyle, setGuideStyle] = useState<TowerStyle | null>(null);
  const [guideVisible, setGuideVisible] = useState(true);
  const [materialExpanded, setMaterialExpanded] = useState<boolean>(true);
  const [heightFeet, setHeightFeet] = useState<HeightFeet>(INITIAL_HEIGHT_FEET);
  const [footprintFeet, setFootprintFeet] = useState<FootprintFeet>(INITIAL_FOOTPRINT_FEET);
  const [loadLb, setLoadLb] = useState<number>(LOAD_TON_OPTIONS[0] * LB_PER_TON);
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
  // Collapse simulation (runs after a failed crush test reaches the load at
  // which the first member lets go). collapseFrame just drives re-renders.
  const collapseRef = useRef<CollapseState | null>(null);
  const collapseRafRef = useRef<number | null>(null);
  const [collapseActive, setCollapseActive] = useState<boolean>(false);
  const [, setCollapseFrame] = useState<number>(0);
  const shakeRef = useRef<{ start: number } | null>(null);
  // After the wreck settles the view auto-returns to the upright analysis;
  // this toggles back to the wreckage on demand.
  const [wreckVisible, setWreckVisible] = useState<boolean>(true);
  const wreckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showExportDialog, setShowExportDialog] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [exportPrintIntent, setExportPrintIntent] = useState<"yes" | "no" | null>(null);
  const [exportPaperSize, setExportPaperSize] = useState<ExportPaperSize>("letter");
  const [exportPrintLengthIn, setExportPrintLengthIn] = useState<string>("");
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [showSaveDialog, setShowSaveDialog] = useState<boolean>(false);
  // "name-required" = tower has no name yet, "confirm-replace" = name already exists in cloud
  const [saveDialogMode, setSaveDialogMode] = useState<"name-required" | "confirm-replace">("name-required");
  const [savePendingName, setSavePendingName] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Assignment mode (phase 2 — the routes below don't exist yet, so this only
  // activates once the tower assignment loop ships; the UI is kept in step
  // with the Bridge Builder so that work is server-side only).
  interface AssignmentConfig { id: string; title: string; height_feet: HeightFeet; footprint_feet: FootprintFeet; load_lb: number; max_cost: number; }
  const [assignmentConfig, setAssignmentConfig] = useState<AssignmentConfig | null>(null);
  const [assignmentSubmitted, setAssignmentSubmitted] = useState(false);
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);

  // Unlike the bridge, the tower has no preset supports: any joint the
  // student places on the ground line becomes a pinned footing.
  const [nodes, setNodes] = useState<Node[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [towerName, setTowerName] = useState<string>("");
  const [designerName, setDesignerName] = useState<string>("");
  // Default tube is the 2"×2" box: its ~12 ft recommended length is what the
  // wizard guides are designed under, so a traced guide passes inspection.
  const [activeMemberType, setActiveMemberType] = useState<MemberType>("box_5");
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

  function clearCollapse() {
    if (collapseRafRef.current) {
      cancelAnimationFrame(collapseRafRef.current);
      collapseRafRef.current = null;
    }
    if (wreckTimerRef.current) {
      clearTimeout(wreckTimerRef.current);
      wreckTimerRef.current = null;
    }
    collapseRef.current = null;
    shakeRef.current = null;
    setCollapseActive(false);
    setWreckVisible(true);
  }

  function resetAnalysisState(cancelRunningTest = false) {
    if (cancelRunningTest && testRafRef.current) {
      cancelAnimationFrame(testRafRef.current);
      testRafRef.current = null;
    }
    clearCollapse();
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

  // Responsive canvas: the drawing keeps its fixed 1150×650 coordinate space
  // and is scaled uniformly to fill the available frame width.
  const viewportFrameRef = useRef<HTMLElement | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  React.useLayoutEffect(() => {
    const el = viewportFrameRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setCanvasScale(w / CANVAS_WIDTH);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
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
    fetchTowerDesignById(id).then(async design => {
      if (!design) return;
      suppressDirtyRef.current = true;
      applyImportedTowerState({
        nodes: design.nodes as Node[],
        members: design.members as Member[],
        heightFeet: design.height_feet ?? undefined,
        footprintFeet: design.footprint_feet ?? undefined,
        loadLb: design.load_lb ?? undefined,
        towerName: design.name,
        designerName: design.designer_name ?? undefined,
      });
      setActiveCloudName(design.name);
      setIsDirty(false);
      // If this design was created for an assignment, restore assignment mode
      if (design.assignment_id) {
        const res = await fetch(`/api/tower-assignments/${design.assignment_id}`);
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
    type DesignRow = { nodes: unknown[]; members: unknown[]; height_feet: number; footprint_feet: number; load_lb: number; name: string; designer_name: string | null };
    const designPromise: Promise<DesignRow | null> = teacherDemo
      ? Promise.resolve(null) // teacher demo starts from a blank canvas
      : viewAsStudent
      ? fetch(`/api/teacher/student-work/tower?studentId=${encodeURIComponent(viewAsStudent)}&assignmentId=${aid}`)
          .then(r => r.ok ? r.json() : null)
          .then((payload: { design: (DesignRow & { id?: string }) | null; student: { name: string; email: string } | null } | null) => {
            if (payload?.student) setViewingStudent(payload.student);
            setDemoDesignFound(!!payload?.design);
            return payload?.design ?? null;
          })
          .catch(err => {
            console.error("teacher demo-view: design fetch failed", err);
            return null;
          })
      : fetch(`/api/tower/by-assignment?assignmentId=${aid}`).then(r => r.ok ? r.json() : null);
    const submissionPromise = viewAsStudent || teacherDemo
      ? Promise.resolve(null)
      : fetch(`/api/tower-submissions/mine?assignmentId=${aid}`).then(r => r.ok ? r.json() : null);
    Promise.all([
      fetch(`/api/tower-assignments/${aid}`).then(r => r.ok ? r.json() : null),
      designPromise,
      submissionPromise,
    ]).then(([config, existingDesign, priorSubmission]: [
      AssignmentConfig | null,
      DesignRow | null,
      { cost: number; passed: boolean } | null,
    ]) => {
      if (!config) return;
      setAssignmentConfig(config);
      if (priorSubmission) setAssignmentSubmitted(true);
      suppressDirtyRef.current = true;
      // Deterministic save key: asgn_<assignmentId> — unique per student+assignment, no SQL column needed
      const saveKey = `asgn_${aid}`;
      const displayName = config.title || 'Tower Assignment';
      if (existingDesign?.nodes?.length) {
        applyImportedTowerState({
          nodes: existingDesign.nodes as Node[],
          members: existingDesign.members as Member[],
          heightFeet: config.height_feet,
          footprintFeet: config.footprint_feet,
          loadLb: config.load_lb,
          towerName: displayName,
          designerName: existingDesign.designer_name ?? undefined,
        });
        setActiveCloudName(saveKey);
        setIsDirty(false);
      } else {
        setHeightFeet(normalizeHeightFeet(config.height_feet));
        setFootprintFeet(normalizeFootprintFeet(config.footprint_feet));
        setLoadLb(config.load_lb);
        setTowerName(displayName);
        setActiveCloudName(saveKey);
      }
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        suppressDirtyRef.current = false;
      }));
    }).catch(err => {
      console.error("tower assignment load failed", err);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Show the setup wizard only on a fresh sandbox visit — never when opening
  // a saved design (?id=), an assignment (?assignment=), or teacher demo view.
  useEffect(() => {
    if (
      searchParams.get("id") ||
      searchParams.get("assignment") ||
      viewAsStudent ||
      teacherDemo
    )
      return;
    setShowSetupWizard(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startFromWizard() {
    suppressDirtyRef.current = true;
    if (wizardHeight !== heightFeet || wizardFootprint !== footprintFeet) {
      applyScenario(wizardHeight, wizardFootprint);
    }
    setLoadLb(wizardLoad * LB_PER_TON);
    setGuideStyle(wizardStyle === "freestyle" ? null : wizardStyle);
    setGuideVisible(true);
    // Each guide is drawn on a particular grid — snap must match or students
    // can't land joints on it.
    if (wizardStyle !== "freestyle") {
      setSnapStepFeet(TOWER_STYLE_INFO[wizardStyle].snapFeet);
    }
    setShowSetupWizard(false);
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        suppressDirtyRef.current = false;
      })
    );
  }

  useEffect(() => {
    if (isDemoMode) return;
    if (!hasLoadedRef.current || suppressDirtyRef.current) return;
    setIsDirty(true);
  }, [isDemoMode, nodes, members, heightFeet, footprintFeet, loadLb, snapStepFeet, snapToGrid, showGrid, towerName, designerName]);

  useEffect(() => {
    resetAnalysisState(true);
  }, [nodes, members, heightFeet, footprintFeet, loadLb]);

  // Auto-save in assignment mode so work is always recoverable on reopen
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isDemoMode) return;
    if (!isDirty || !assignmentConfig || !activeCloudName || !session?.user) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      performCloudSave(activeCloudName);
    }, 4000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, nodes, members, assignmentConfig, activeCloudName, isDemoMode]);

  // Hard navigation guard (tab close, refresh, browser back to external site)
  useEffect(() => {
    if (isDemoMode) return;
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, isDemoMode]);

  function safeNavigate(url: string) {
    if (isDirtyRef.current) { setLeaveUrl(url); } else { router.push(url); }
  }

  const nodeById = useMemo(() => {
    const map = new Map<string, Node>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  // -------- Scenario geometry --------
  // Vertical scale is fixed in pixels (ground → target line = 480 px), so
  // pixels-per-foot follows the chosen height; the footprint is centered.
  const pixelsPerFoot = getPxPerFt(heightFeet);
  const feetPerUnit = 1 / pixelsPerFoot;
  const { left: footLeft, right: footRight } = getFootprintBounds(heightFeet, footprintFeet);

  const footingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of nodes) if (isGroundNode(n)) ids.add(n.id);
    return ids;
  }, [nodes]);
  const topNodeIds = useMemo(
    () => nodes.filter((n) => isTopNode(n)).map((n) => n.id),
    [nodes]
  );

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
  function getRenderedNodePosition(n: Node): { x: number; y: number } {
    const d = liveNodeOffsetById?.get(n.id);
    const x = n.x + (d?.dx ?? 0) * LIVE_DEFLECT_SCALE;
    const y = n.y - (d?.dy ?? 0) * LIVE_DEFLECT_SCALE;
    return { x, y };
  }
  // While a collapse sim is active (or settled awaiting Clear), nodes render at
  // their simulated positions instead of the elastic-deflection positions.
  function getDisplayNodePosition(n: Node): { x: number; y: number } {
    const c = collapseRef.current;
    if (c && wreckVisible) {
      const p = c.points.get(n.id);
      if (p) return { x: p.x, y: p.y };
    }
    return getRenderedNodePosition(n);
  }
  // Load fraction the press is applying right now: 0 while the plate is
  // still descending, ramping to 1 (or to the break point) during the test.
  const crushProgress = Math.max(
    0,
    Math.min(1, (testProgress - LOAD_START_PROGRESS) / (1 - LOAD_START_PROGRESS))
  );
  const plateTouching = isTesting && testProgress >= LOAD_START_PROGRESS;
  // Underside of the press plate: parked above the target line when idle,
  // lowered onto the tower during the test, riding the highest top joint as
  // the tower squashes, and driven by the collapse sim once it lets go.
  function getPlateBottomY(): number {
    const sim = wreckVisible ? collapseRef.current : null;
    if (sim) return sim.plateBottomY;
    const parked = TOP_Y - PLATE_PARK_LIFT;
    if (!isTesting) return parked;
    const approach = Math.min(1, testProgress / LOAD_START_PROGRESS);
    if (approach < 1) return parked + PLATE_PARK_LIFT * approach;
    let highest = Number.POSITIVE_INFINITY;
    for (const id of topNodeIds) {
      const n = nodeById.get(id);
      if (!n) continue;
      const y = getRenderedNodePosition(n).y;
      if (y < highest) highest = y;
    }
    return Number.isFinite(highest) ? Math.max(TOP_Y, highest) : TOP_Y;
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
  const selectedLoadTon = nearestLoadTon(loadLb);
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

  function snapshotEntry(): HistoryEntry {
    return {
      nodes: nodes.map((n) => ({ ...n })),
      members: members.map((m) => ({ ...m })),
      heightFeet,
      footprintFeet,
      loadLb,
      snapStepFeet,
      snapToGrid,
      showGrid,
    };
  }

  function pushHistorySnapshot() {
    historyRef.current.push(snapshotEntry());
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
    }
    redoRef.current = [];
    setHistoryVersion((v) => v + 1);
  }

  function restoreEntry(entry: HistoryEntry) {
    setNodes(entry.nodes);
    setMembers(entry.members);
    setHeightFeet(entry.heightFeet);
    setFootprintFeet(entry.footprintFeet);
    setLoadLb(entry.loadLb);
    setSnapStepFeet(entry.snapStepFeet);
    setSnapToGrid(entry.snapToGrid);
    setShowGrid(entry.showGrid);
    setPendingNodeId(null);
    setSelectedMemberId(null);
    setSelectedMemberIds(new Set());
    setDragNodeId(null);
    setSelectionBox(null);
    setStressTestResult(null);
    setStressTestError(null);
    setHistoryVersion((v) => v + 1);
  }

  function undoLastEdit() {
    const prev = historyRef.current.pop();
    if (!prev) return;
    redoRef.current.push(snapshotEntry());
    restoreEntry(prev);
  }

  function redoLastEdit() {
    const next = redoRef.current.pop();
    if (!next) return;
    historyRef.current.push(snapshotEntry());
    restoreEntry(next);
  }

  function resetDesign() {
    const confirmed = window.confirm("Erase the entire design?");
    if (!confirmed) return;
    pushHistorySnapshot();
    setNodes([]);
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
    setTowerName("");
    setDesignerName("");
    // Back to the starter screen after a reset — sandbox mode only
    // (assignments lock the scenario and never offer templates).
    if (!assignmentConfig && !isDemoMode) {
      setWizardHeight(heightFeet);
      setWizardFootprint(footprintFeet);
      setWizardLoad(selectedLoadTon);
      setWizardStyle(guideStyle ?? "freestyle");
      setGuideStyle(null);
      setShowSetupWizard(true);
    }
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

  // Snap origins: x from the left edge of the footprint, y from the ground —
  // so the ground line and the target-height line are always on-grid.
  function snapX(value: number) {
    const grid = pixelsPerFoot * snapStepFeet;
    return Math.round((value - footLeft) / grid) * grid + footLeft;
  }

  function snapY(value: number) {
    const grid = pixelsPerFoot * snapStepFeet;
    return Math.round((value - GROUND_Y) / grid) * grid + GROUND_Y;
  }

  // Joints live inside the design box: footprint wide, ground to target line.
  function clampToRulerBounds(point: { x: number; y: number }) {
    return {
      x: Math.min(Math.max(point.x, footLeft), footRight),
      y: Math.min(Math.max(point.y, TOP_Y), GROUND_Y),
    };
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

  function svgPointFromClient(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return null;
    // Map client px → the fixed 1150×650 viewBox space. Rect-based math stays
    // exact under the responsive scale transform on the canvas wrapper.
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) * CANVAS_WIDTH) / rect.width,
      y: ((clientY - rect.top) * CANVAS_HEIGHT) / rect.height,
    };
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

    // Don't place a joint on top of an existing one
    const duplicateThreshold = 8;
    const tooClose = nodes.some(n => Math.hypot(n.x - x, n.y - y) <= duplicateThreshold);
    if (tooClose) return;

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

    if (tool === "erase") {
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
        addMemberChain(prev, nodeId);
        return null;
      });
    }
  }

  // Connect two joints; any joints lying on the line between them become
  // intermediate joints in a chain of members.
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
    const siteCost = getTowerSiteCost(heightFeet, footprintFeet);
    const totalCost = memberCostTotal + jointCost + siteCost;

    return {
      totalFeet,
      memberCostTotal,
      jointCost,
      boxCost,
      siteCost,
      totalCost,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feetPerUnit, members, nodeById, nodes.length, heightFeet, footprintFeet]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // -------- Design inspection --------
  // All rules live in engine/inspection.ts so the wizard templates can be
  // verified against the exact same checks in tests.
  const inspection = useMemo(
    () => inspectTower({ nodes, members, feetPerUnit, heightFeet }),
    [nodes, members, feetPerUnit, heightFeet]
  );
  const {
    riskyBays,
    crossingMembers,
    unstableJointIds,
    longMemberIds,
    failReasons: inspectionFailReasons,
    warnings: inspectionWarningItems,
    pass: inspectionPassRaw,
  } = inspection;
  const inspectionPass = inspectionHasRun ? inspectionPassRaw : false;
  const canRunStressTest = inspectionPass;
  const stressTestPass =
    (stressTestResult?.failedMemberIds.length ?? 0) === 0 &&
    !stressTestError &&
    inspectionPassRaw;
  const stressTestStatusLabel = stressTestResult
    ? stressTestPass
      ? "Pass"
      : "Fail"
    : "Pending";
  // The load at which the weakest member gave out — the teaching number
  // behind a failed test ("held 18,200 of 30,000 lb").
  const failLoadLb =
    stressTestResult && stressTestResult.maxUtilization > 1
      ? loadLb / stressTestResult.maxUtilization
      : null;
  const displayLoadLb = isTesting
    ? loadLb * crushProgress
    : stressTestResult
    ? failLoadLb ?? loadLb
    : 0;

  const assignmentComplete = assignmentConfig !== null
    && stressTestPass
    && inspectionPass
    && stressTestResult !== null
    && costSummary.totalCost <= assignmentConfig.max_cost;

  function runStressTest() {
    const result = runCrushStressTest({
      nodes,
      members,
      supportIds: footingIds,
      loadNodeIds: topNodeIds,
      loadLb,
      feetPerUnit,
      unstableJointIds,
      longMemberIds,
    });
    if (!result.ok) {
      setStressTestResult(null);
      setStressTestError(result.error);
      return;
    }
    setStressTestFrames(result.frames);
    stressTestFramesRef.current = result.frames;
    setStressTestResult(result.envelope);
    setStressTestError(null);
  }
  function clearStressTest() {
    clearCollapse();
    setStressTestResult(null);
    setStressTestError(null);
    setStressTestFrames(null);
    stressTestFramesRef.current = null;
    setLiveStressTestResult(null);
    setResultsDropdownDismissed(false);
  }

  function cancelStressTest() {
    if (testRafRef.current) {
      cancelAnimationFrame(testRafRef.current);
      testRafRef.current = null;
    }
    clearCollapse();
    setIsTesting(false);
    setTestProgress(0);
    setStressTestResult(null);
    setStressTestError(null);
    setStressTestFrames(null);
    stressTestFramesRef.current = null;
    setLiveStressTestResult(null);
  }

  // Hand off from the elastic crush test to the collapse simulation at the
  // load step where the first member lets go.
  function beginCollapse(progressAtBreak: number, frames: StressTestResult[]) {
    const loadRange = 1 - LOAD_START_PROGRESS;
    const loadProgress = Math.max(
      0,
      Math.min(1, loadRange > 0 ? (progressAtBreak - LOAD_START_PROGRESS) / loadRange : 0)
    );
    const idx = Math.min(
      frames.length - 1,
      Math.round(loadProgress * (frames.length - 1))
    );
    const frame = frames[idx];
    const offsets = frame.nodeDisplacements ?? {};

    const posOf = (id: string) => {
      const n = nodeById.get(id);
      if (!n) return { x: 0, y: 0 };
      const d = offsets[id];
      return {
        x: n.x + (d?.dx ?? 0) * LIVE_DEFLECT_SCALE,
        y: n.y - (d?.dy ?? 0) * LIVE_DEFLECT_SCALE,
      };
    };

    // The member that broke goes first; everything already near capacity
    // follows as the load it was carrying redistributes.
    const utilById = frame.memberUtilizationById ?? {};
    const failedIds = new Set<string>(frame.failedMemberIds);
    for (const m of members) {
      if ((utilById[m.id] ?? 0) >= 0.9) failedIds.add(m.id);
    }
    if (failedIds.size === 0) {
      for (const id of stressTestResult?.failedMemberIds ?? []) failedIds.add(id);
    }

    let plateBottomY = Number.POSITIVE_INFINITY;
    for (const id of topNodeIds) {
      const y = posOf(id).y;
      if (y < plateBottomY) plateBottomY = y;
    }
    if (!Number.isFinite(plateBottomY)) plateBottomY = TOP_Y;

    collapseRef.current = initCollapse({
      nodes,
      members,
      failedIds,
      posOf,
      pinnedIds: footingIds,
      topIds: topNodeIds,
      plateBottomY,
      groundY: GROUND_Y,
      nowMs: performance.now(),
    });
    shakeRef.current = { start: performance.now() };
    setCollapseActive(true);

    const loop = (now: number) => {
      const sim = collapseRef.current;
      if (!sim) {
        collapseRafRef.current = null;
        return;
      }
      stepCollapse(sim, now);
      setCollapseFrame((v) => v + 1);
      if (now - sim.startedMs > 3400) {
        sim.settled = true;
        setIsTesting(false);
        collapseRafRef.current = null;
        // Hold the wreck a beat, then return to the upright stress analysis
        // so the design remains studyable (toggle brings the wreck back).
        wreckTimerRef.current = setTimeout(() => {
          setWreckVisible(false);
          wreckTimerRef.current = null;
        }, 1600);
        return;
      }
      collapseRafRef.current = requestAnimationFrame(loop);
    };
    collapseRafRef.current = requestAnimationFrame(loop);
  }

  function startStressTest(forceStart = false) {
    if (isTesting) return;
    if (!forceStart && !canRunStressTest) {
      setStressTestResult(null);
      setStressTestError("Run and pass the design inspection before stress testing.");
      return;
    }
    clearCollapse();
    setStressTestResult(null);
    setStressTestError(null);
    setStressTestFrames(null);
    stressTestFramesRef.current = null;
    setLiveStressTestResult(null);
    setIsTesting(true);
    setTestProgress(0);
    runStressTest();
    const durationMs = 7000;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const finalProgress = testStopProgressRef.current;
      const progress = Math.min(finalProgress, elapsed / durationMs);
      setTestProgress(progress);
      const frames = stressTestFramesRef.current;
      if (frames && frames.length > 0) {
        if (progress < LOAD_START_PROGRESS) {
          setLiveStressTestResult(null);
        } else {
          const loadRange = 1 - LOAD_START_PROGRESS;
          const loadProgressRaw =
            loadRange > 0 ? (progress - LOAD_START_PROGRESS) / loadRange : 0;
          const loadProgress = Math.max(0, Math.min(1, loadProgressRaw));
          const idx = Math.min(
            frames.length - 1,
            Math.round(loadProgress * (frames.length - 1))
          );
          setLiveStressTestResult(frames[idx]);
        }
      }
      if (progress >= finalProgress) {
        const framesNow = stressTestFramesRef.current;
        const hasFailure =
          !!framesNow && framesNow.some((f) => f.failedMemberIds.length > 0);
        if (hasFailure && finalProgress < 1 && !collapseRef.current) {
          // The press reached the break load — hand off to the collapse sim
          // instead of ending the test.
          beginCollapse(progress, framesNow);
          testRafRef.current = null;
          return;
        }
        setIsTesting(false);
        testRafRef.current = null;
        return;
      }
      testRafRef.current = requestAnimationFrame(tick);
    };

    testRafRef.current = requestAnimationFrame(tick);
  }

  function runTowerExaminer() {
    if (isTesting) return;
    setInspectionHasRun(true);
    setResultsDropdownDismissed(false);
    if (!inspectionPassRaw) {
      setStressTestResult(null);
      setStressTestError(
        "Tower cannot be stress tested until it passes its design inspection."
      );
      return;
    }
    startStressTest(true);
  }

  // Height and footprint both change the pixel↔feet mapping, so a scenario
  // change starts a fresh canvas (same as changing the bridge span).
  function applyScenario(nextHeight: HeightFeet, nextFootprint: FootprintFeet) {
    pushHistorySnapshot();
    setHeightFeet(nextHeight);
    setFootprintFeet(nextFootprint);
    setNodes([]);
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
      const nextPoint = clampToRulerBounds({ x, y });
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

    // Snap dragged node onto a nearby member and split it
    const draggedNode = nodes.find(n => n.id === dragNodeId);
    if (draggedNode) {
      const SNAP_THRESHOLD = 14;
      let bestMemberId: string | null = null;
      let bestDist = SNAP_THRESHOLD;
      let bestPt: { x: number; y: number } | null = null;
      for (const m of members) {
        if (m.a === dragNodeId || m.b === dragNodeId) continue;
        const a = nodeById.get(m.a);
        const b = nodeById.get(m.b);
        if (!a || !b) continue;
        const abx = b.x - a.x, aby = b.y - a.y;
        const abLenSq = abx * abx + aby * aby;
        if (abLenSq === 0) continue;
        const t = Math.max(0, Math.min(1, ((draggedNode.x - a.x) * abx + (draggedNode.y - a.y) * aby) / abLenSq));
        const cx = a.x + abx * t, cy = a.y + aby * t;
        const d = Math.hypot(draggedNode.x - cx, draggedNode.y - cy);
        if (d < bestDist) { bestDist = d; bestMemberId = m.id; bestPt = { x: cx, y: cy }; }
      }
      if (bestMemberId && bestPt) {
        const target = members.find(m => m.id === bestMemberId)!;
        setNodes(prev => prev.map(n => n.id === dragNodeId ? { ...n, ...bestPt! } : n));
        setMembers(prev => [
          ...prev.filter(m => m.id !== bestMemberId),
          { id: crypto.randomUUID(), a: target.a, b: dragNodeId, type: target.type, grade: target.grade },
          { id: crypto.randomUUID(), a: dragNodeId, b: target.b, type: target.type, grade: target.grade },
        ]);
      }
    }

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

  function renderDefs() {
    return (
      <defs>
        <linearGradient id="footingConcrete" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dcdfe1" />
          <stop offset="1" stopColor="#bcc0c3" />
        </linearGradient>
        <linearGradient id="footingConcreteDark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c2c6c9" />
          <stop offset="1" stopColor="#a8adb1" />
        </linearGradient>
        <linearGradient id="pressSteel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b93a1" />
          <stop offset="0.5" stopColor="#5b6472" />
          <stop offset="1" stopColor="#3f4753" />
        </linearGradient>
        <linearGradient id="pressColumn" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7d8695" />
          <stop offset="0.5" stopColor="#a4acb8" />
          <stop offset="1" stopColor="#6b7382" />
        </linearGradient>
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

  function exportMemberLines(stroke: string): string {
    return members
      .map((m) => {
        const a = nodeById.get(m.a);
        const b = nodeById.get(m.b);
        if (!a || !b) return "";
        const w = Math.max(3.2, thicknessToStrokeWidth(m.type));
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" />`;
      })
      .join("");
  }

  function exportNodeCircles(stroke: string): string {
    return nodes
      .map((n) => {
        const r = footingIds.has(n.id) ? 10 : 7;
        return `<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="#ffffff" stroke="${stroke}" stroke-width="1.5" />`;
      })
      .join("");
  }

  function buildExportSvgMarkup(): string {
    const width = CANVAS_WIDTH;
    const height = CANVAS_HEIGHT;
    const titleX = width - 360;
    const titleY = height - 218;
    const safeTowerName = escapeXml(towerName || "");
    const safeDesignerName = escapeXml(designerName || "");
    const safeStressStatus = escapeXml(stressTestStatusLabel);
    const groundLeft = footLeft - 60;
    const groundRight = footRight + 60;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
  <line x1="${groundLeft}" y1="${GROUND_Y}" x2="${groundRight}" y2="${GROUND_Y}" stroke="#111111" stroke-width="6" stroke-linecap="square" />
  <line x1="${footLeft}" y1="${TOP_Y}" x2="${footRight}" y2="${TOP_Y}" stroke="#111111" stroke-width="1.5" stroke-dasharray="8 6" />
  ${exportMemberLines("#111111")}
  ${exportNodeCircles("#111111")}
  <rect x="${titleX}" y="${titleY}" width="330" height="206" fill="#ffffff" stroke="#111111" stroke-width="2" rx="8" />
  <text x="${titleX + 14}" y="${titleY + 28}" font-family="Arial, sans-serif" font-size="17" fill="#111111">Tower Name: ${safeTowerName}</text>
  <text x="${titleX + 14}" y="${titleY + 56}" font-family="Arial, sans-serif" font-size="17" fill="#111111">Designed by: ${safeDesignerName}</text>
  <text x="${titleX + 14}" y="${titleY + 84}" font-family="Arial, sans-serif" font-size="17" fill="#111111">Cost: $${fmtMoney(costSummary.totalCost)}</text>
  <text x="${titleX + 14}" y="${titleY + 112}" font-family="Arial, sans-serif" font-size="17" fill="#111111">Height &amp; Load: ${heightFeet} ft / ${formatTons(loadLb)}</text>
  <text x="${titleX + 14}" y="${titleY + 140}" font-family="Arial, sans-serif" font-size="17" fill="#111111">Footprint: ${footprintFeet} ft</text>
  <text x="${titleX + 14}" y="${titleY + 168}" font-family="Arial, sans-serif" font-size="17" fill="#111111">Scale: 1 square = 1 ft</text>
  <text x="${titleX + 14}" y="${titleY + 196}" font-family="Arial, sans-serif" font-size="17" fill="#111111">Inspection ${inspectionPass ? "Pass" : "Fail"} / Stress ${safeStressStatus}</text>
</svg>`;
  }

  function getTowerExportBounds() {
    const padX = 16;
    const padY = 16;
    let minYNode = TOP_Y;
    for (const n of nodes) {
      if (n.y < minYNode) minYNode = n.y;
    }
    const left = footLeft - padX;
    const right = footRight + padX;
    const top = minYNode - padY;
    const bottom = GROUND_Y + padY;
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);
    // Fraction of the exported image height taken up by the tower itself
    // (ground → target line) — drives the "print at N inches tall" scale.
    const towerFraction = (GROUND_Y - TOP_Y) / height;
    return { left, top, width, height, towerFraction };
  }

  function buildTowerOnlyExportSvgMarkup(): string {
    const bounds = getTowerExportBounds();
    const safeStroke = "#111111";
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}">
  <rect x="${bounds.left}" y="${bounds.top}" width="${bounds.width}" height="${bounds.height}" fill="#ffffff" />
  <line x1="${bounds.left}" y1="${GROUND_Y}" x2="${bounds.left + bounds.width}" y2="${GROUND_Y}" stroke="${safeStroke}" stroke-width="6" stroke-linecap="square" />
  ${exportMemberLines(safeStroke)}
  ${exportNodeCircles(safeStroke)}
</svg>`;
  }

  // Print exports go portrait so a tall tower uses the page; the design
  // sheet (not for print) keeps the landscape canvas.
  function getPaperDimensionsIn(size: ExportPaperSize): { width: number; height: number } {
    if (size === "legal") return { width: 8.5, height: 14 };
    return { width: 8.5, height: 11 };
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
    if (isDemoMode) return;
    if (!session?.user) { window.alert("Sign in to save your design."); return; }
    const name = towerName.trim();

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
    const exists = await checkTowerNameExists(name);
    if (exists) {
      setSaveDialogMode("confirm-replace");
      setShowSaveDialog(true);
      return;
    }
    await performCloudSave(name);
  }

  // Rasterize the tower SVG to a small JPEG data URL for use as a thumbnail
  // in My Work cards and the teacher gradebook. Returns null if rendering fails.
  async function captureTowerThumbnail(): Promise<string | null> {
    if (!members.length) return null;
    try {
      const svgMarkup = buildTowerOnlyExportSvgMarkup();
      const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new window.Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error("thumb render failed"));
          i.src = url;
        });
        const W = 240, H = 140;
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
        const srcW = img.naturalWidth || 1, srcH = img.naturalHeight || 1;
        const scale = Math.min(W / srcW, H / srcH);
        const dw = srcW * scale, dh = srcH * scale;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        return canvas.toDataURL("image/jpeg", 0.78);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      return null;
    }
  }

  async function performCloudSave(name: string) {
    if (isDemoMode) return;
    if (!session?.user || !userId) return;
    setSaveStatus("saving");
    // Don't overwrite the display name when saving under the internal asgn_ key
    if (!name.startsWith('asgn_') && name !== towerName) setTowerName(name);
    const thumbnail = await captureTowerThumbnail();
    try {
      await upsertTowerDesign({
        name,
        thumbnail,
        heightFeet,
        footprintFeet,
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
    if (isDemoMode) return;
    if (!assignmentConfig || !userId) return;
    setAssignmentSubmitting(true);

    // Save the design first — the name asgn_<id> is the key for reloading on reopen
    const saveKey = `asgn_${assignmentConfig.id}`;
    const thumbnail = await captureTowerThumbnail();
    try {
      await upsertTowerDesign({
        name: saveKey,
        thumbnail,
        heightFeet,
        footprintFeet,
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
      alert(`Could not save your tower before submitting. Please try again.\n\n${err instanceof Error ? err.message : 'Unknown error'}`);
      return;
    }

    const res = await fetch("/api/tower-submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId: assignmentConfig.id, cost: costSummary.totalCost, passed: true }),
    });
    if (res.ok) setAssignmentSubmitted(true);
    setAssignmentSubmitting(false);
  }

  function applyImportedTowerState(parsed: {
    nodes?: Node[];
    members?: Member[];
    heightFeet?: number;
    footprintFeet?: number;
    loadLb?: number;
    snapStepFeet?: 0.5 | 1 | 2.5 | 5;
    snapToGrid?: boolean;
    showGrid?: boolean;
    towerName?: string;
    designerName?: string;
    materialGrade?: MaterialGrade;
    activeMemberType?: MemberType;
  }) {
    if (!parsed?.nodes?.length || !parsed?.members) {
      window.alert("Invalid tower file.");
      return;
    }

    const normalizedMembers: Member[] = parsed.members
      .map((m) => {
        if (!(m.type in MEMBER_LIBRARY)) return null;
        return { ...m, grade: m.grade ?? "mild" } as Member;
      })
      .filter((m): m is Member => Boolean(m));

    setHeightFeet(normalizeHeightFeet(parsed.heightFeet ?? INITIAL_HEIGHT_FEET));
    setFootprintFeet(normalizeFootprintFeet(parsed.footprintFeet ?? INITIAL_FOOTPRINT_FEET));
    setLoadLb(normalizeLoadLb(parsed.loadLb ?? LOAD_TON_OPTIONS[0] * LB_PER_TON));
    setSnapStepFeet(parsed.snapStepFeet ?? DEFAULT_SNAP_STEP_FEET);
    setSnapToGrid(parsed.snapToGrid ?? DEFAULT_SNAP_TO_GRID);
    setShowGrid(parsed.showGrid ?? false);
    setNodes(parsed.nodes);
    setMembers(normalizedMembers);
    setTowerName(parsed.towerName ?? "");
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
        printIntent === "yes" ? buildTowerOnlyExportSvgMarkup() : buildExportSvgMarkup();
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

      const exportWidth = image.naturalWidth || CANVAS_WIDTH;
      const exportHeight = image.naturalHeight || CANVAS_HEIGHT;
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
      const portrait = printIntent === "yes";
      const paper = getPaperDimensionsIn(selectedPaper);
      const pageW = portrait ? paper.width : paper.height;
      const pageH = portrait ? paper.height : paper.width;
      const pdf = new jsPDF({
        orientation: portrait ? "portrait" : "landscape",
        unit: "in",
        format: selectedPaper,
        compress: true,
      });

      const margin = 0.35;
      const maxRenderW = pageW - margin * 2;
      const maxRenderH = pageH - margin * 2;
      let renderH: number;
      if (printIntent === "yes" && options?.printLengthIn) {
        const bounds = getTowerExportBounds();
        renderH = options.printLengthIn / Math.max(0.01, bounds.towerFraction);
        renderH = Math.min(maxRenderH, Math.max(2, renderH));
      } else {
        renderH = maxRenderH;
      }
      let renderW = (exportWidth / exportHeight) * renderH;
      if (renderW > maxRenderW) {
        renderW = maxRenderW;
        renderH = (exportHeight / exportWidth) * renderW;
      }
      const renderX = (pageW - renderW) / 2;
      const renderY = margin;
      pdf.addImage(pngData, "PNG", renderX, renderY, renderW, renderH, undefined, "FAST");

      if (printIntent === "yes") {
        const titleW = 3.65;
        const titleH = 2.2;
        const titleX = pageW - margin - titleW;
        const titleY = pageH - margin - titleH;
        pdf.setDrawColor(20, 20, 20);
        pdf.setLineWidth(0.02);
        pdf.roundedRect(titleX, titleY, titleW, titleH, 0.08, 0.08);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.setTextColor(20, 20, 20);
        const towerText = towerName.trim() || "";
        const designerText = designerName.trim() || "";
        pdf.text(`Tower Name: ${towerText}`, titleX + 0.12, titleY + 0.28);
        pdf.text(`Designed by: ${designerText}`, titleX + 0.12, titleY + 0.54);
        pdf.text(`Cost: $${fmtMoney(costSummary.totalCost)}`, titleX + 0.12, titleY + 0.8);
        pdf.text(
          `Height & Load: ${heightFeet} ft / ${formatTons(loadLb)}`,
          titleX + 0.12,
          titleY + 1.06
        );
        pdf.text(`Footprint: ${footprintFeet} ft`, titleX + 0.12, titleY + 1.32);
        pdf.text("Scale: 1 square = 1 ft", titleX + 0.12, titleY + 1.58);
        pdf.text(
          `Inspection ${inspectionPass ? "Pass" : "Fail"} / Stress ${stressTestStatusLabel}`,
          titleX + 0.12,
          titleY + 1.84
        );
      }

      const printedTowerHeightIn =
        printIntent === "yes" && options?.printLengthIn
          ? options.printLengthIn
          : (GROUND_Y - TOP_Y) * (renderH / exportHeight);
      const feetPerInch = heightFeet / Math.max(0.01, printedTowerHeightIn);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(20, 20, 20);
      pdf.text(
        `Print scale: 1 in = ${feetPerInch.toFixed(2)} ft`,
        renderX,
        Math.min(pageH - 0.15, renderY + renderH + 0.17)
      );

      const fileBase = (towerName.trim() || "tower-design")
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "");
      pdf.save(`${fileBase || "tower-design"}.pdf`);
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

      const exportWidth = image.naturalWidth || CANVAS_WIDTH;
      const exportHeight = image.naturalHeight || CANVAS_HEIGHT;
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
      const fileBase = (towerName.trim() || "tower-design")
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const fileName = `${fileBase || "tower-design"}.${format === "jpeg" ? "jpg" : "png"}`;
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

  // Where the animated test stops: at 100% load on a pass, at the first
  // failing load step on a failure (the collapse takes over there), or as
  // soon as the plate touches down if the solve itself errored.
  useEffect(() => {
    if (!isTesting) return;
    if (stressTestError) {
      testStopProgressRef.current = LOAD_START_PROGRESS;
      return;
    }
    if (stressTestResult) {
      const failed = stressTestResult.failedMemberIds.length > 0;
      const frames = stressTestFramesRef.current;
      const failIdx = frames?.findIndex((f) => f.failedMemberIds.length > 0) ?? -1;
      if (failed && frames && frames.length > 1 && failIdx >= 0) {
        const failProgress =
          LOAD_START_PROGRESS +
          (failIdx / (frames.length - 1)) * (1 - LOAD_START_PROGRESS);
        testStopProgressRef.current = Math.max(0.02, Math.min(1, failProgress));
      } else {
        testStopProgressRef.current = 1;
      }
    }
  }, [isTesting, stressTestError, stressTestResult]);

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

  // Press rig geometry (columns just outside the footprint, crossbeam above
  // the parked plate). Drawn every render so the target height is obvious.
  const rigColumnX = { left: footLeft - 52, right: footRight + 52 };
  const rigBeamY = TOP_Y - PLATE_PARK_LIFT - PLATE_THICKNESS - 44;
  const plateBottomY = getPlateBottomY();
  const plateTopY = plateBottomY - PLATE_THICKNESS;
  const plateLeft = footLeft - 18;
  const plateWidth = footRight - footLeft + 36;
  const gridRows = Math.round(heightFeet) + 1;
  const gridCols = Math.round(footprintFeet) + 1;

  return (
    <div className={styles.page}>
      <SiteHeader onLogoClick={() => safeNavigate("/")}>
      </SiteHeader>

      {isDemoMode && (
        <div style={{
          background: "#fef3c7", borderBottom: "3px solid #f59e0b", color: "#78350f",
          padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, flexWrap: "wrap", fontFamily: "system-ui,sans-serif",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {teacherDemo
              ? "🔧 Demo mode — try the assignment yourself; nothing is saved or submitted"
              : <>👁 Viewing {viewingStudent?.name || "student"}&apos;s work — changes won&apos;t be saved</>}
            {demoDesignFound === false && (
              <span style={{ marginLeft: 12, padding: "2px 10px", borderRadius: 999,
                background: "#fde68a", color: "#7c2d12", fontSize: 12, fontWeight: 800 }}>
                No saved tower yet for this assignment
              </span>
            )}
          </div>
          <button
            onClick={() => {
              try { window.close(); } catch {}
              // Fallback if window.close is blocked (tab not opened via JS)
              setTimeout(() => { window.location.href = "/teachers/dashboard"; }, 50);
            }}
            style={{ padding: "6px 14px", borderRadius: 8, border: "2px solid #92400e",
              background: "#fff", color: "#78350f", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            ← Close
          </button>
        </div>
      )}

      <main className={styles.main}>
        <div className={styles.frame}>
          <div className={styles.topBand}>
            <div className={styles.toolClusterWrap}>
              <div className={styles.toolCluster}>
                <div className={styles.toolRow}>
                {[
                  { src: "save-file-icon.png", label: "Save Design", disabled: false, hidden: isDemoMode },
                  { src: "export-icon.png", label: "Export", disabled: false, hidden: false },
                ].filter(item => !item.hidden).map((item) => (
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
                </div>
                <div className={styles.toolRow}>
                <ToolButton id="select" label="Select" />
                <ToolButton id="joint" label="Joint" />
                <ToolButton id="member" label="Member" />
                <ToolButton id="erase" label="Erase" />
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
                <div className={styles.gridSizePill} title="Grid snap size in feet">
                  <span className={styles.gridSizeLabel}>Grid</span>
                  <select
                    value={snapStepFeet}
                    onChange={(e) =>
                      setSnapStepFeet(Number(e.target.value) as 0.5 | 1 | 2.5 | 5)
                    }
                    className={styles.gridSizeSelect}
                    title="Grid snap size in feet"
                  >
                    <option value={0.5}>0.5 ft</option>
                    <option value={1}>1 ft</option>
                    <option value={2.5}>2.5 ft</option>
                    <option value={5}>5 ft</option>
                  </select>
                </div>
                </div>
              </div>
              {saveStatus === "saving" && (
                <span className={styles.saveStatus} style={{ color: "#888" }}>Saving…</span>
              )}
              {saveStatus === "saved" && (
                <span className={styles.saveStatus} style={{ color: "#16a34a" }}>✓ Saved</span>
              )}
              {saveStatus === "error" && (
                <span className={styles.saveStatus} style={{ color: "#dc2626" }}>Save failed</span>
              )}
              {/* Reserved: the Class Project mode (shared with the Bridge
                  Builder) plugs in here once students have finished the
                  standard challenge ladder. */}
              <span
                title="Class Project mode is coming soon"
                style={{
                  marginLeft: "auto",
                  alignSelf: "center",
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px dashed #94a3b8",
                  color: "#64748b",
                  fontSize: 11,
                  fontWeight: 700,
                  background: "rgba(255,255,255,0.7)",
                  cursor: "default",
                  whiteSpace: "nowrap",
                }}
              >
                Class Project · coming soon
              </span>
            </div>

            <section className={styles.panelRow}>
              {assignmentConfig && (
                <div className={styles.sideCard} style={{ background: assignmentSubmitted ? "#f0fdf4" : "#fffbeb", border: `2px solid ${assignmentSubmitted ? "#86efac" : "#fde68a"}` }}>
                  <div className={styles.sideCardHeader} style={{ borderBottom: `1px solid ${assignmentSubmitted ? "#86efac" : "#fde68a"}` }}>
                    <div className={styles.sideCardTitle} style={{ color: assignmentSubmitted ? "#166534" : "#92400e" }}>
                      {assignmentSubmitted ? "✓ Assignment Submitted" : "🗼 Assignment"}
                    </div>
                  </div>
                  <div className={styles.sideCardBody}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 8 }}>
                      {assignmentConfig.title || "Tower Assignment"}
                    </div>
                    <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>Height: {assignmentConfig.height_feet} ft (locked)</div>
                      <div style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>Footprint: {assignmentConfig.footprint_feet} ft (locked)</div>
                      <div style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>Crush load: {assignmentConfig.load_lb / 2000} ton (locked)</div>
                      <div style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>
                        Budget: ${fmtMoney(costSummary.totalCost)} / ${fmtMoney(assignmentConfig.max_cost)}
                        {costSummary.totalCost > assignmentConfig.max_cost && (
                          <span style={{ color: "#dc2626", marginLeft: 4 }}>— over budget!</span>
                        )}
                      </div>
                    </div>
                    {isDemoMode ? (
                      <div style={{ fontSize: 11, color: "#92400e", fontStyle: "italic" }}>
                        Demo view — submit and save are disabled.
                      </div>
                    ) : (
                      <>
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
                              {!inspectionPass ? "Run inspection first" : !stressTestResult ? "Run stress test to verify" : !stressTestPass ? "Tower failed stress test" : "Over budget — reduce material cost"}
                            </div>
                          )
                        )}
                        {assignmentSubmitted && (
                          <>
                            <div style={{ fontSize: 12, color: "#166534", fontWeight: 700, marginBottom: nodes.length > 0 ? 0 : 8 }}>
                              Great work! Your tower passed and was submitted.
                            </div>
                            {nodes.length > 0 && assignmentComplete && (
                              <button
                                onClick={handleSubmitAssignment}
                                disabled={assignmentSubmitting}
                                style={{ width: "100%", marginTop: 10, padding: "10px", borderRadius: 8, border: "none",
                                  background: assignmentSubmitting ? "#86efac" : "#15803d",
                                  color: "#fff", fontWeight: 800, fontSize: 13, cursor: assignmentSubmitting ? "not-allowed" : "pointer" }}>
                                {assignmentSubmitting ? "Resubmitting…" : "↺ Resubmit Improved Tower"}
                              </button>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
              <div className={styles.sideCard}>
                <div className={styles.sideCardHeader}>
                  <div className={styles.sideCardTitle}>Height, Footprint &amp; Load</div>
                  <button
                    className={styles.sideCardToggle}
                    onClick={() => setOptionsExpanded((v) => !v)}
                    aria-expanded={optionsExpanded}
                    aria-label="Toggle Height, Footprint & Load"
                  >
                    {optionsExpanded ? "v" : "^"}
                  </button>
                </div>
                {optionsExpanded ? (
                  <div className={styles.sideCardBody}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 12, color: "#0d0d0d" }}>
                          Height
                        </span>
                        <select
                          value={heightFeet}
                          onChange={(e) =>
                            applyScenario(normalizeHeightFeet(e.target.value), footprintFeet)
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
                            width: "100%",
                            minWidth: 0,
                          }}
                        >
                          {HEIGHT_OPTIONS.map((h) => (
                            <option key={h} value={h}>{h} ft</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 12, color: "#0d0d0d" }}>
                          Footprint
                        </span>
                        <select
                          value={footprintFeet}
                          onChange={(e) =>
                            applyScenario(heightFeet, normalizeFootprintFeet(e.target.value))
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
                            width: "100%",
                            minWidth: 0,
                          }}
                        >
                          {FOOTPRINT_OPTIONS.map((w) => (
                            <option key={w} value={w}>{w} ft</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 12, color: "#000" }}>
                          Load
                        </span>
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
                            width: "100%",
                            minWidth: 0,
                          }}
                        >
                          {LOAD_TON_OPTIONS.map((t) => (
                            <option key={t} value={t}>{t} Ton</option>
                          ))}
                        </select>
                      </label>
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
                  <button
                    className={styles.sideCardToggle}
                    onClick={() => setMaterialExpanded((v) => !v)}
                    aria-expanded={materialExpanded}
                    aria-label="Toggle Material"
                  >
                    {materialExpanded ? "v" : "^"}
                  </button>
                </div>
                {materialExpanded ? (
                <div
                  className={styles.sideCardBody}
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
                >
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
                        width: "100%",
                        minWidth: 0,
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
                          width: "100%",
                          minWidth: 0,
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
                ) : null}
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
                <div style={{ fontWeight: 700, color: "#1b7f3a", marginBottom: 2 }}>
                  ${fmtMoney(costSummary.totalCost)}
                </div>
                {costExpanded ? (
                  <div className={`${styles.cardDropdown} ${styles.cardDropdownLeft}`}>
                    <button
                      className={styles.cardDropdownClose}
                      onClick={() => setCostExpanded(false)}
                      aria-label="Close cost details"
                    >
                      ✕
                    </button>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 11 }}>
                        Site (foundation &amp; crane): ${fmtMoney(costSummary.siteCost)}
                      </div>
                      <div style={{ fontSize: 11, color: "#444" }}>
                        {costSummary.totalFeet.toFixed(2)} ft total
                      </div>
                      <div style={{ fontSize: 11 }}>
                        Joints: ${fmtMoney(costSummary.jointCost)} ({nodes.length})
                      </div>
                      <div style={{ fontSize: 11 }}>
                        Steel Box Beam: ${fmtMoney(costSummary.boxCost)}
                      </div>
                      {selectedMemberStats ? (
                        <div style={{ fontSize: 11, marginTop: 6 }}>
                          Selected: {selectedMemberStats.ft.toFixed(2)} ft @ $
                          {selectedMemberStats.rate}/ft = $
                          {fmtMoney(selectedMemberStats.cost)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className={styles.sideCard}>
                <div className={styles.sideCardHeader}>
                  <div className={styles.sideCardTitle}>Tower Examiner</div>
                </div>
                <div
                  className={styles.sideCardBody}
                  style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}
                >
                    <button
                      onClick={runTowerExaminer}
                      style={{
                        padding: "6px 10px",
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
                      {isTesting ? "Crushing..." : "Run Tower Test"}
                    </button>
                    <div style={{ display: "grid", gap: 4, flex: "1 1 100px", alignContent: "start" }}>
                      <div style={{ fontWeight: 800, fontSize: 12 }}>Design Inspection</div>
                      <div style={{ fontWeight: 700 }}>
                        {!inspectionHasRun
                          ? "Not run"
                          : inspectionPass
                          ? "Pass"
                          : "Fail"}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 4, flex: "1.4 1 150px", alignContent: "start" }}>
                      <div style={{ fontWeight: 800, fontSize: 12 }}>Crush Test</div>
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
                          Clear Crush Test
                        </button>
                        {collapseActive && !isTesting ? (
                          <button
                            onClick={() => setWreckVisible((v) => !v)}
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
                            {wreckVisible ? "Show Stress Analysis" : "Show Collapse"}
                          </button>
                        ) : null}
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
                      {isTesting ? (
                        <div style={{ fontSize: 11, color: "#444" }}>
                          {plateTouching ? `Load: ${fmtLb(displayLoadLb)} lb` : "Lowering the press..."}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {!resultsDropdownDismissed &&
                  !isTesting &&
                  ((inspectionHasRun &&
                    (inspectionFailReasons.length > 0 ||
                      inspectionWarningItems.length > 0)) ||
                    activeStressTestResult ||
                    activeStressTestError) ? (
                    <div className={styles.cardDropdown}>
                      <button
                        className={styles.cardDropdownClose}
                        onClick={() => setResultsDropdownDismissed(true)}
                        aria-label="Dismiss results"
                      >
                        ✕
                      </button>
                      {inspectionHasRun && !inspectionPass ? (
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#b45309", margin: "0 0 6px" }}>
                          Tower cannot be stress tested until it passes its
                          design inspection.
                        </div>
                      ) : activeStressTestError ? (
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#b45309", margin: "0 0 6px" }}>
                          {activeStressTestError}
                        </div>
                      ) : null}
                      {inspectionHasRun && inspectionFailReasons.length > 0 ? (
                        <ul style={{ margin: "0 0 6px", paddingLeft: 18, fontSize: 11 }}>
                          {inspectionFailReasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      ) : null}
                      {inspectionHasRun && inspectionWarningItems.length > 0 ? (
                        <ul
                          style={{
                            margin: "0 0 6px",
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
                      {activeStressTestResult ? (
                        <>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              marginBottom: 6,
                              color: stressTestPass ? "#166534" : "#b91c1c",
                            }}
                          >
                            {stressTestPass
                              ? `Held the full ${fmtLb(loadLb)} lb crush load.`
                              : failLoadLb !== null
                              ? `Failed at about ${fmtLb(failLoadLb)} lb — ${Math.round(
                                  (failLoadLb / loadLb) * 100
                                )}% of the ${fmtLb(loadLb)} lb target.`
                              : "Failed the crush test."}
                          </div>
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
                              <div
                                style={{
                                  fontWeight: 700,
                                  color:
                                    selectedMemberStress.utilization > 1
                                      ? "#dc2626"
                                      : selectedMemberStress.utilization >= 0.9
                                      ? "#d97706"
                                      : "#16a34a",
                                }}
                              >
                                {selectedMemberStress.utilization > 1
                                  ? "FAILED — over capacity"
                                  : selectedMemberStress.utilization >= 0.9
                                  ? "Holding — near capacity"
                                  : "Holding"}
                              </div>
                              <div>Mode: {selectedMemberStress.mode}</div>
                              <div>
                                Force: {selectedMemberStress.force.toFixed(0)} lb
                              </div>
                              <div>Cap: {selectedMemberStress.cap.toFixed(0)} lb</div>
                              <div>
                                Utilization:{" "}
                                {(selectedMemberStress.utilization * 100).toFixed(0)}%
                                {" of capacity"}
                              </div>
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>
                  ) : null}
              </div>
            </section>
          </div>

          <main className={styles.content}>
            <section
              ref={viewportFrameRef}
              className={styles.viewportFrame}
              style={{ height: Math.round(CANVAS_HEIGHT * canvasScale) }}
            >
              <div
                style={{
                  width: `${CANVAS_WIDTH}px`,
                  height: `${CANVAS_HEIGHT}px`,
                  overflow: "hidden",
                  position: "relative",
                  transform: `scale(${canvasScale})`,
                  transformOrigin: "top left",
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
        <div style={{ position: "relative", width: CANVAS_WIDTH, height: CANVAS_HEIGHT, overflow: "hidden" }}>
          {/* Top ruler: feet across the footprint */}
          <svg
            width={CANVAS_WIDTH}
            height={28}
            viewBox={`0 0 ${CANVAS_WIDTH} 28`}
            style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 6 }}
          >
            <g opacity={0.75}>
              <line x1={footLeft} y1={0} x2={footRight} y2={0}
                stroke="#141414" strokeWidth={1} opacity={0.55} />
              {Array.from({ length: gridCols }).map((_, ft) => {
                const x = footLeft + ft * pixelsPerFoot;
                const isMajor = ft % 5 === 0;
                return (
                  <g key={`rt-${ft}`}>
                    <line x1={x} y1={0} x2={x} y2={isMajor ? 10 : 6}
                      stroke="#141414" strokeWidth={1} opacity={isMajor ? 0.85 : 0.55} />
                    {isMajor ? (
                      <text x={x + 2} y={16} fill="#141414" fontSize={10} opacity={0.85}>
                        {ft}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          </svg>
          {/* Left ruler: feet up from the ground */}
          <svg
            width={60}
            height={CANVAS_HEIGHT}
            viewBox={`0 0 60 ${CANVAS_HEIGHT}`}
            style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 6 }}
          >
            <g opacity={0.75}>
              {Array.from({ length: gridRows }).map((_, ft) => {
                const y = GROUND_Y - ft * pixelsPerFoot;
                const isMajor = ft % 5 === 0;
                return (
                  <g key={`rl-${ft}`}>
                    <line x1={0} y1={y} x2={isMajor ? 10 : 6} y2={y}
                      stroke="#141414" strokeWidth={1} opacity={isMajor ? 0.85 : 0.55} />
                    {isMajor ? (
                      <text x={12} y={y + 3} fill="#141414" fontSize={10} opacity={0.85}>
                        {ft}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          </svg>
          <div
            style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}
          >
            <TowerScene />
          </div>
          <div style={{ position: "relative", zIndex: 1 }}>
            <svg
              ref={svgRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
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
                transform: (() => {
                  // Brief camera shake when the collapse begins.
                  const s = shakeRef.current;
                  if (!s) return undefined;
                  const k = (performance.now() - s.start) / 600;
                  if (k >= 1) return undefined;
                  const amp = 6 * (1 - k);
                  const t = performance.now();
                  return `translate(${Math.sin(t * 0.09) * amp}px, ${
                    Math.cos(t * 0.11) * amp
                  }px)`;
                })(),
              }}
            >
          {renderDefs()}

          {/* Press rig: two columns outside the footprint carrying the
              crossbeam the press plate hangs from. */}
          <g pointerEvents="none">
            {[rigColumnX.left, rigColumnX.right].map((cx, i) => (
              <g key={`rig-col-${i}`}>
                <rect
                  x={cx - 9}
                  y={rigBeamY}
                  width={18}
                  height={GROUND_Y - rigBeamY}
                  fill="url(#pressColumn)"
                  stroke="#4b5563"
                  strokeWidth={1}
                />
                <rect
                  x={cx - 20}
                  y={GROUND_Y - 6}
                  width={40}
                  height={6}
                  fill="#4b5563"
                />
              </g>
            ))}
            <rect
              x={rigColumnX.left - 20}
              y={rigBeamY - 16}
              width={rigColumnX.right - rigColumnX.left + 40}
              height={18}
              rx={2}
              fill="url(#pressSteel)"
              stroke="#374151"
              strokeWidth={1}
            />
            {[0.25, 0.5, 0.75].map((t) => {
              const x = rigColumnX.left + (rigColumnX.right - rigColumnX.left) * t;
              return (
                <circle
                  key={`rivet-${t}`}
                  cx={x}
                  cy={rigBeamY - 7}
                  r={2.4}
                  fill="#cbd5e1"
                  opacity={0.7}
                />
              );
            })}
          </g>

          {/* Design box: the footprint the tower must fit inside, and the
              target-height line the press plate bears on. */}
          <g pointerEvents="none">
            <rect
              x={footLeft}
              y={TOP_Y}
              width={footRight - footLeft}
              height={GROUND_Y - TOP_Y}
              fill="rgba(255,255,255,0.10)"
              stroke="rgba(37, 99, 235, 0.35)"
              strokeWidth={1.5}
              strokeDasharray="6 6"
            />
            <line
              x1={footLeft - 30}
              y1={TOP_Y}
              x2={footRight + 30}
              y2={TOP_Y}
              stroke="#2563eb"
              strokeWidth={1.5}
              strokeDasharray="8 6"
              opacity={0.7}
            />
            <text
              x={footRight + 36}
              y={TOP_Y + 4}
              fill="#1d4ed8"
              fontSize={11}
              fontWeight={700}
              opacity={0.85}
            >
              Target height: {heightFeet} ft
            </text>
            <text
              x={CENTER_X}
              y={GROUND_Y + 44}
              fill="#f8fafc"
              fontSize={11}
              fontWeight={700}
              textAnchor="middle"
              opacity={0.9}
            >
              Footprint: {footprintFeet} ft
            </text>
          </g>

          {/* Tower-style design guide: faint dashed template from the wizard.
              Pure overlay — measurement-exact feet mapped through the same
              footprint/ground coordinates the real geometry uses. */}
          {guideStyle && guideVisible && !isTesting && !assignmentConfig
            ? (() => {
                const tpl = generateTower(guideStyle, heightFeet, footprintFeet);
                const gx = (ft: number) => footLeft + ft * pixelsPerFoot;
                const gy = (ft: number) => GROUND_Y - ft * pixelsPerFoot;
                return (
                  <g pointerEvents="none" opacity={0.35}>
                    {tpl.members.map(([a, b], i) => (
                      <line
                        key={`guide-m-${i}`}
                        x1={gx(tpl.nodes[a].x)}
                        y1={gy(tpl.nodes[a].y)}
                        x2={gx(tpl.nodes[b].x)}
                        y2={gy(tpl.nodes[b].y)}
                        stroke="#2563eb"
                        strokeWidth={3}
                        strokeDasharray="7 6"
                        strokeLinecap="round"
                      />
                    ))}
                    {tpl.nodes.map((nd, i) => (
                      <circle
                        key={`guide-n-${i}`}
                        cx={gx(nd.x)}
                        cy={gy(nd.y)}
                        r={5}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth={2}
                        strokeDasharray="2 3"
                      />
                    ))}
                  </g>
                );
              })()
            : null}

        {/* Grid (optional) */}
        {showGrid ? (
          <>
            <g opacity={1}>
              {Array.from({ length: gridRows }).map((_, ft) => {
                const y = GROUND_Y - ft * pixelsPerFoot;
                return (
                  <line
                    key={`h-${ft}`}
                    x1={footLeft}
                    y1={y}
                    x2={footRight}
                    y2={y}
                    stroke={ft % 5 === 0 ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.08)"}
                    strokeWidth={1}
                  />
                );
              })}
              {Array.from({ length: gridCols }).map((_, ft) => {
                const x = footLeft + ft * pixelsPerFoot;
                return (
                  <line
                    key={`v-${ft}`}
                    x1={x}
                    y1={TOP_Y}
                    x2={x}
                    y2={GROUND_Y}
                    stroke={ft % 5 === 0 ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.08)"}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          </>
        ) : null}

          {/* Crosshair guides (Joint mode) */}
          {tool === "joint" && hoverPoint ? (
            <g opacity={0.35} pointerEvents="none">
              <line
                x1={hoverPoint.x}
                y1={0}
                x2={hoverPoint.x}
                y2={CANVAS_HEIGHT}
                stroke="#ff2bd6"
                strokeWidth={1}
                strokeDasharray="4 6"
              />
              <line
                x1={0}
                y1={hoverPoint.y}
                x2={CANVAS_WIDTH}
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

          {/* Highlight non-triangulated panels */}
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

          {/* Highlight crossing members without junction */}
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

          {/* Footings: concrete pads under every joint on the ground line */}
          <g pointerEvents="none">
            {nodes.filter((n) => footingIds.has(n.id)).map((n) => (
              <g key={`footing-${n.id}`}>
                <rect
                  x={n.x - 16}
                  y={GROUND_Y}
                  width={32}
                  height={12}
                  rx={2}
                  fill="url(#footingConcrete)"
                  stroke="#8f959a"
                  strokeWidth={1.2}
                />
                <rect
                  x={n.x - 24}
                  y={GROUND_Y + 12}
                  width={48}
                  height={10}
                  rx={2}
                  fill="url(#footingConcreteDark)"
                  stroke="#868c91"
                  strokeWidth={1.2}
                />
              </g>
            ))}
          </g>

          {/* Members */}
          <g opacity={0.95}>
            {members.map((m) => {
              const a = nodeById.get(m.a);
              const b = nodeById.get(m.b);
              if (!a || !b) return null;
              const aPos = getDisplayNodePosition(a);
              const bPos = getDisplayNodePosition(b);

              const width = thicknessToStrokeWidth(m.type);
              const stressForce = activeStressTestResult?.memberForces[m.id] ?? null;
              const utilization = memberUtilizationById?.[m.id] ?? 0;
              const capForMember = memberCapById?.[m.id] ?? 0;
              const stressTestHasRun = Boolean(activeStressTestResult);
              const stressTestFailing = stressTestHasRun && !stressTestPass;
              const showLiveFailureEffects = !isTesting || plateTouching;
              const isFailed = failedMemberIdsForDisplay?.includes(m.id) ?? false;
              const displayForce = stressForce;
              const displayUtilization = utilization;
              const displayCap = capForMember;
              const dx = bPos.x - aPos.x;
              const dy = bPos.y - aPos.y;
              const L = Math.hypot(dx, dy);
              const shouldCartoon = isTesting && stressTestHasRun && plateTouching;
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
                stressTestHasRun && showLiveFailureEffects && displayForce !== null
                  ? isFailed
                    ? getStressStroke(displayForce, displayUtilization)
                    : getUtilizationStroke(displayForce, displayUtilization)
                  : "#666";
              const strokeVisualWeight =
                stressTestFailing && isFailed ? width + 1.5 : width;

              // Severed members during/after collapse: two dangling stubs.
              const collapseSim = collapseRef.current;
              if (collapseSim && wreckVisible && collapseSim.brokenIds.has(m.id)) {
                const tipA = collapseSim.points.get(stubTipKey(m.id, "a"));
                const tipB = collapseSim.points.get(stubTipKey(m.id, "b"));
                const stubColor = getStressStroke(
                  displayForce,
                  Math.max(1, displayUtilization)
                );
                return (
                  <g key={m.id}>
                    {tipA ? (
                      <line
                        x1={aPos.x}
                        y1={aPos.y}
                        x2={tipA.x}
                        y2={tipA.y}
                        stroke={stubColor}
                        strokeWidth={width}
                        strokeLinecap="round"
                        opacity={0.9}
                      />
                    ) : null}
                    {tipB ? (
                      <line
                        x1={bPos.x}
                        y1={bPos.y}
                        x2={tipB.x}
                        y2={tipB.y}
                        stroke={stubColor}
                        strokeWidth={width}
                        strokeLinecap="round"
                        opacity={0.9}
                      />
                    ) : null}
                  </g>
                );
              }

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

          {/* Press plate + piston. Parked above the target line when idle,
              lowered onto the tower for the test, and riding the wreck down
              during a collapse. */}
          <g pointerEvents="none">
            <rect
              x={CENTER_X - 11}
              y={rigBeamY}
              width={22}
              height={Math.max(0, plateTopY - rigBeamY)}
              fill="url(#pressColumn)"
              stroke="#4b5563"
              strokeWidth={1}
            />
            <rect
              x={plateLeft}
              y={plateTopY}
              width={plateWidth}
              height={PLATE_THICKNESS}
              rx={2}
              fill="url(#pressSteel)"
              stroke="#374151"
              strokeWidth={1.2}
            />
            <rect
              x={plateLeft + 2}
              y={plateBottomY - 3}
              width={plateWidth - 4}
              height={3}
              fill="#1f2937"
              opacity={0.8}
            />
            {(isTesting && plateTouching) || (!isTesting && stressTestResult) ? (
              <g>
                <rect
                  x={plateLeft + plateWidth + 12}
                  y={plateTopY - 6}
                  width={150}
                  height={40}
                  rx={6}
                  fill="rgba(255,255,255,0.92)"
                  stroke="#374151"
                  strokeWidth={1}
                />
                <text
                  x={plateLeft + plateWidth + 22}
                  y={plateTopY + 12}
                  fill={
                    !isTesting && stressTestResult && !stressTestPass ? "#b91c1c" : "#111827"
                  }
                  fontSize={15}
                  fontWeight={800}
                >
                  {fmtLb(displayLoadLb)} lb
                </text>
                <text
                  x={plateLeft + plateWidth + 22}
                  y={plateTopY + 28}
                  fill="#4b5563"
                  fontSize={11}
                  fontWeight={600}
                >
                  {!isTesting && stressTestResult && !stressTestPass
                    ? `failed — target ${fmtLb(loadLb)} lb`
                    : `of ${fmtLb(loadLb)} lb`}
                </text>
              </g>
            ) : null}
          </g>

          {/* Collapse dust puffs */}
          {collapseRef.current && wreckVisible && collapseRef.current.puffs.length > 0 ? (
            <g pointerEvents="none">
              {collapseRef.current.puffs.map((sp, i) => {
                const age = (performance.now() - sp.t0) / 1000;
                if (age > 1.1) return null;
                const k = Math.min(1, age / 1.1);
                return (
                  <g key={`puff-${i}`} opacity={(1 - k) * 0.7}>
                    <circle cx={sp.x - 10 - k * 18} cy={GROUND_Y - 4 - k * 14} r={5 + k * 12} fill="#c9bfb0" />
                    <circle cx={sp.x + 8 + k * 16} cy={GROUND_Y - 6 - k * 18} r={6 + k * 14} fill="#d6cdc0" />
                    <circle cx={sp.x} cy={GROUND_Y - 8 - k * 24} r={4 + k * 10} fill="#e0d8cc" />
                  </g>
                );
              })}
            </g>
          ) : null}

          {/* Nodes */}
          {nodes.map((n) => {
            const isFooting = footingIds.has(n.id);
            const isPending = pendingNodeId === n.id && tool === "member";
            const p = getDisplayNodePosition(n);

              return (
                <g key={n.id}>
                  {tool !== "select" ? (
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
                    r={isFooting ? 10 : isPending ? 9 : 7}
                    fill={isFooting ? "#d9dde2" : "#e6e6e6"}
                    stroke="#444"
                    strokeWidth={isFooting ? 1.6 : 1}
                    opacity={isPending ? 1 : 0.95}
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
                          ? jointDragCursor
                          : "pointer",
                    }}
                  />
                </g>
              );
            })}

          {showGrid ? (
            <text
              x={footLeft + 12}
              y={GROUND_Y - 12}
              fill="#333"
              fontSize={10}
              opacity={0.6}
            >
              1 square = 1 ft
            </text>
          ) : null}
            </svg>
            {guideStyle && !assignmentConfig ? (
              <button
                onClick={() => setGuideVisible((v) => !v)}
                title={`${guideVisible ? "Hide" : "Show"} the ${TOWER_STYLE_INFO[guideStyle].label} guide`}
                style={{
                  position: "absolute",
                  left: 70,
                  top: 36,
                  zIndex: 5,
                  padding: "5px 12px",
                  borderRadius: 999,
                  border: "1px solid #2563eb",
                  background: guideVisible ? "#eff6ff" : "rgba(255,255,255,0.9)",
                  color: "#1d4ed8",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: guideVisible ? 1 : 0.6,
                }}
              >
                {guideVisible
                  ? `Hide ${TOWER_STYLE_INFO[guideStyle].label} guide`
                  : `Show ${TOWER_STYLE_INFO[guideStyle].label} guide`}
              </button>
            ) : null}
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
                  <span style={{ fontWeight: 700 }}>Tower Name</span>
                  <input
                    value={towerName}
                    onChange={(e) => setTowerName(e.target.value)}
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
                <div>Cost: ${fmtMoney(costSummary.totalCost)}</div>
                <div>
                  Height &amp; Load: {heightFeet} ft / {formatTons(loadLb)}
                </div>
                <div>Footprint: {footprintFeet} ft</div>
                <div>
                  Inspection {inspectionPass ? "Pass" : "Fail"} / Crush Test{" "}
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

          </main>
        </div>
      </main>

      {showSetupWizard && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#fff",
              border: "2px solid #1f1f1f",
              borderRadius: 16,
              padding: "26px 30px",
              maxWidth: 760,
              width: "100%",
              boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
            }}
          >
            <h3 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 900, color: "#111" }}>
              Plan Your Tower
            </h3>
            <p style={{ margin: "0 0 18px", fontSize: 13, color: "#555", lineHeight: 1.5 }}>
              Pick how tall the tower must be, how much ground it may use, and
              how hard the press will push down on it. Then choose a lattice
              style to guide your design — or go freestyle. You can change any
              of this while you build.
            </p>
            <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: "#111" }}>Height</span>
                <select
                  value={wizardHeight}
                  onChange={(e) => setWizardHeight(normalizeHeightFeet(e.target.value))}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #b8b8b8",
                    fontSize: 13,
                    fontWeight: 600,
                    minWidth: 110,
                    color: "#111111",
                    background: "#ffffff",
                  }}
                >
                  {HEIGHT_OPTIONS.map((h) => (
                    <option key={h} value={h}>{h} ft</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: "#111" }}>Footprint</span>
                <select
                  value={wizardFootprint}
                  onChange={(e) => setWizardFootprint(normalizeFootprintFeet(e.target.value))}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #b8b8b8",
                    fontSize: 13,
                    fontWeight: 600,
                    minWidth: 110,
                    color: "#111111",
                    background: "#ffffff",
                  }}
                >
                  {FOOTPRINT_OPTIONS.map((w) => (
                    <option key={w} value={w}>{w} ft wide</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: "#111" }}>Crush Load</span>
                <select
                  value={wizardLoad}
                  onChange={(e) => setWizardLoad(Number(e.target.value))}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #b8b8b8",
                    fontSize: 13,
                    fontWeight: 600,
                    minWidth: 110,
                    color: "#111111",
                    background: "#ffffff",
                  }}
                >
                  {LOAD_TON_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t} Ton
                    </option>
                  ))}
                </select>
              </label>
              <div
                style={{
                  alignSelf: "end",
                  fontSize: 12,
                  color: "#475569",
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "8px 12px",
                }}
              >
                Site cost for this tower:{" "}
                <strong style={{ color: "#111" }}>
                  ${getTowerSiteCost(wizardHeight, wizardFootprint).toLocaleString()}
                </strong>{" "}
                — foundation &amp; crane, before any steel.
              </div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, color: "#111" }}>
              Tower style
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 10,
                marginBottom: 22,
              }}
            >
              {(
                ["freestyle", "zigzag", "xbrace", "tapered", "taperedX"] as const
              ).map((s) => (
                <button
                  key={s}
                  onClick={() => setWizardStyle(s)}
                  style={{
                    border: wizardStyle === s ? "3px solid #2563eb" : "1px solid #cbd5e1",
                    borderRadius: 12,
                    background: wizardStyle === s ? "#eff6ff" : "#fff",
                    padding: "10px 8px 6px",
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  <TowerPreview style={s} />
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#111", marginTop: 4 }}>
                    {s === "freestyle" ? "Freestyle" : TOWER_STYLE_INFO[s].label}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", minHeight: 28 }}>
                    {s === "freestyle"
                      ? "Design your own way"
                      : TOWER_STYLE_INFO[s].caption}
                  </div>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={startFromWizard}
                style={{
                  padding: "10px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Start Designing
              </button>
            </div>
          </div>
        </div>
      )}

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
              You have unsaved changes to your tower design. If you leave now your recent changes will be lost.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => setLeaveUrl(null)}
                style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #d1d5db",
                  background: "#fff", color: "#111", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Stay & Keep Editing
              </button>
              {towerName.trim() && (
                <button onClick={async () => {
                  const url = leaveUrl!;
                  setLeaveUrl(null);
                  await performCloudSave(activeCloudName ?? towerName.trim());
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
                <div style={{ fontWeight: 800, fontSize: 18, color: "#111" }}>Name Your Tower</div>
                <p style={{ margin: 0, fontSize: 14, color: "#555" }}>
                  Enter a name for this design before saving.
                </p>
                <input
                  type="text"
                  value={savePendingName}
                  onChange={(e) => setSavePendingName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && savePendingName.trim() && performCloudSave(savePendingName.trim())}
                  placeholder="My Tower Design"
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
                  A design named <strong>&quot;{towerName}&quot;</strong> is already saved.
                  Do you want to replace it?
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                  <button onClick={closeSaveDialog}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #6a6a6a",
                      background: "#fff", color: "#111", cursor: "pointer", fontWeight: 700 }}>
                    Cancel
                  </button>
                  <button onClick={() => performCloudSave(towerName.trim())}
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
                    <option value="letter">Letter (8.5 × 11 in)</option>
                    <option value="legal">Legal (8.5 × 14 in)</option>
                  </select>
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, color: "#333" }}>
                    How tall would you like your tower to print? (inches)
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

export default function TowerToolPageRoot() {
  return (
    <React.Suspense fallback={null}>
      <TowerToolPage />
    </React.Suspense>
  );
}
