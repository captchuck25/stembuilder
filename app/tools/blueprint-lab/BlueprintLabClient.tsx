'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ToolbarUserMenu from '@/app/components/ToolbarUserMenu';

import Canvas2D from './components/Canvas2D';
import ToolPalette, { ROOF_APPLICABLE_TOOLS, SANDBOX_APPLICABLE_TOOLS, SECTION_APPLICABLE_TOOLS } from './components/ToolPalette';
import PropertiesPanel from './components/PropertiesPanel';
import ViewTabs, { PlaceholderView, ViewId } from './components/ViewTabs';
import FloorPicker from './components/FloorPicker';
import StatusBar from './components/StatusBar';
import SpecsView from './components/SpecsView';
import ElevationsView from './components/ElevationsView';
import RoofPlanView from './components/RoofPlanView';
import RoomsView from './components/RoomsView';
import SandboxView from './components/SandboxView';

// Lazy-load the 3D scene so three.js (~600KB gz) only ships when the user
// switches to the 3D tab.
const Scene3D = dynamic(() => import('./components/Scene3D'), {
  ssr: false,
  loading: () => (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: T.inkSoft, fontSize: 13,
    }}>Loading 3D view…</div>
  ),
});
import {
  DEFAULT_WALL_HEIGHT, DEFAULT_WALL_STATUS, DEFAULT_WALL_THICKNESS,
  DIMENSION_DEFAULT_OFFSET, DOOR_DEFAULTS, FURNITURE_CATALOG, LINE_DEFAULTS, STAIR_DEFAULTS, WINDOW_DEFAULTS,
  Dimension, Door, DoorType, DoorTypeSettings, FurnitureItem, FurnitureKind,
  Level, LineColor, LineEntity, LineStyle, LineWeight,
  Project, RoomLabel, SectionCut, Selection, Stair, StairShape, TextLabel, ToolId, Vec2, Wall, WallStatus, WallType,
  Window, WindowType, WindowTypeSettings, emptyLevel, makeId, newProject,
} from './engine/types';
import { autoDetectRoomBoundary, driveDimension, polygonAreaSqFt, wallPolygon } from './engine/geometry';
import { syncLinkedStairs, linkedGeometryPatch } from './engine/stairs';
import { buildPrimarySectionCut } from './engine/sectionPrimitives';
import { T } from './engine/theme';

export default function BlueprintLabClient() {
  const [project, setProject] = useState<Project>(() => newProject());

  // ─── Undo / redo ──────────────────────────────────────────────────────────
  // Strategy: a useEffect watches `project` and pushes the PREVIOUS state to
  // undoStack on every change — except (a) during a "live op" (drags etc.)
  // where multiple frame updates should collapse into one entry, and (b)
  // immediately after undo/redo, where the project change is itself the
  // result of a history navigation.
  const HISTORY_LIMIT = 100;
  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);
  const prevProjectRef = useRef<Project>(project);
  // During a "live op" (drag, or click-move-click) this holds the PRE-op
  // project. The entry is recorded at endLiveOp — and only if the gesture
  // actually changed something — so the whole gesture collapses into one undo
  // entry and a click that merely grabs a grip leaves no phantom entry.
  // null = not currently in a live op.
  const liveOpSnapshotRef = useRef<Project | null>(null);
  // Set by the load / new-project paths so the single project swap they trigger
  // isn't recorded as an undoable edit. undo/redo do NOT use this — they update
  // prevProjectRef directly so they can't be broken by a stuck flag.
  const suppressNextHistoryRef = useRef(false);

  const pushHistory = useCallback((snapshot: Project) => {
    setUndoStack(s => {
      const next = [...s, snapshot];
      return next.length > HISTORY_LIMIT ? next.slice(-HISTORY_LIMIT) : next;
    });
    setRedoStack([]);
  }, []);

  useEffect(() => {
    if (prevProjectRef.current === project) return;
    const prev = prevProjectRef.current;
    // Advance the ref FIRST so this effect is idempotent even if it re-runs.
    prevProjectRef.current = project;
    if (suppressNextHistoryRef.current) { suppressNextHistoryRef.current = false; return; }
    // Inside a live op: defer recording to endLiveOp, which collapses the whole
    // gesture into one entry (and skips it entirely if nothing changed).
    if (liveOpSnapshotRef.current !== null) return;
    pushHistory(prev);
  }, [project, pushHistory]);

  const beginLiveOp = useCallback(() => {
    // Snapshot the pre-op state but DON'T record yet: grabbing a grip without
    // dragging must not leave a no-op undo entry (which would also desync the
    // stack — a reference-equal undo target makes setProject bail and skips the
    // history effect, so a later edit could be dropped).
    liveOpSnapshotRef.current = prevProjectRef.current;
  }, []);
  const endLiveOp = useCallback(() => {
    const snap = liveOpSnapshotRef.current;
    liveOpSnapshotRef.current = null;
    // Record one entry for the whole gesture — but only if it changed anything.
    // (prevProjectRef tracks the latest project even mid-live-op, so this
    // compares the pre-op state against the committed result.)
    if (snap !== null && snap !== prevProjectRef.current) pushHistory(snap);
  }, [pushHistory]);
  const cancelLiveOp = useCallback(() => {
    // Abandon the op without recording it. The caller restores the pre-op state
    // via its own updates; suppress that one capture so it isn't logged as a
    // fresh edit.
    liveOpSnapshotRef.current = null;
    suppressNextHistoryRef.current = true;
  }, []);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, project]);
    setUndoStack(s => s.slice(0, -1));
    // Point prevProjectRef at the target BEFORE swapping so the history effect
    // is a no-op whether or not it fires (it won't fire if prev === project by
    // reference). This is what keeps undo/redo from ever desyncing the stack.
    prevProjectRef.current = prev;
    setProject(prev);
  }, [undoStack, project]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(s => [...s, project]);
    setRedoStack(r => r.slice(0, -1));
    prevProjectRef.current = next;
    setProject(next);
  }, [redoStack, project]);

  // Keyboard shortcuts: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y = redo.
  // Ctrl/Cmd+S = manual cloud save.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
      else if (k === 's') { e.preventDefault(); saveRef.current?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ─── Save / load ──────────────────────────────────────────────────────────
  // Hybrid model:
  //   1. localStorage backup: silent autosave of the current draft so reloads
  //      never lose work even before the user has hit Save.
  //   2. Cloud save: Save button (or Ctrl/Cmd+S) writes the named project to
  //      /api/blueprint-lab/designs, upserted by (user_id, name) so saving
  //      with the same name overwrites.
  // The cloud row's id is remembered in the draft so subsequent saves
  // continue to target the same row.
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const urlDesignId = searchParams.get('id');

  type SaveStatus = 'idle' | 'saving' | 'saved' | 'unsaved' | 'error';
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const cloudIdRef = useRef<string | null>(null);
  const restoredOnceRef = useRef(false);
  // Set true by the restore-on-mount load so the autosave effect skips the
  // single project change it triggers — otherwise a freshly-opened design
  // would immediately read as "Unsaved changes".
  const justRestoredRef = useRef(false);
  const saveRef = useRef<(() => void) | null>(null);

  const LOCAL_DRAFT_KEY = 'blueprint-lab:draft';

  type Draft = { project: Project; cloudId: string | null; savedAt: number | null };

  // Restore-on-mount: prefer ?id=... (load from cloud) over the localStorage
  // draft. If neither, leave the fresh new-project state alone.
  //
  // NOTE: do NOT add a `cancelled` flag tied to the effect cleanup here. React
  // StrictMode (on by default in dev) mounts → unmounts → remounts: the first
  // run's cleanup would flip `cancelled` true, and the in-flight fetch would
  // then discard its result — so the design would silently never load in dev.
  // `restoredOnceRef` already guarantees this body runs exactly once for the
  // component's lifetime, and a setState after a real unmount is a harmless
  // no-op in React 18/19.
  useEffect(() => {
    if (restoredOnceRef.current) return;
    restoredOnceRef.current = true;

    (async () => {
      if (urlDesignId) {
        try {
          const res = await fetch(`/api/blueprint-lab/designs/${urlDesignId}`);
          if (res.ok) {
            const row = await res.json() as { id: string; name: string; doc_json: Project };
            suppressNextHistoryRef.current = true;
            justRestoredRef.current = true;
            setProject(migrateProject({ ...row.doc_json, name: row.name }));
            cloudIdRef.current = row.id;
            setSaveStatus('saved');
            setLastSavedAt(Date.now());
            return;
          }
        } catch { /* fall through to localStorage */ }
      }
      try {
        const raw = localStorage.getItem(LOCAL_DRAFT_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw) as Draft;
        if (!draft?.project) return;
        suppressNextHistoryRef.current = true;
        justRestoredRef.current = true;
        setProject(migrateProject(draft.project));
        cloudIdRef.current = draft.cloudId ?? null;
        if (draft.savedAt) { setSaveStatus('saved'); setLastSavedAt(draft.savedAt); }
        else setSaveStatus('unsaved');
      } catch { /* corrupt draft — ignore */ }
    })();
  }, [urlDesignId]);

  // localStorage autosave on project change (debounced ~500ms). Also flips
  // status to 'unsaved' so the user sees that the cloud copy is stale.
  useEffect(() => {
    if (!restoredOnceRef.current) return;
    // The project change that the restore-on-mount load triggers isn't a user
    // edit — don't mark it unsaved (but still let it persist to localStorage).
    if (justRestoredRef.current) {
      justRestoredRef.current = false;
    } else {
      setSaveStatus(s => (s === 'saved' || s === 'idle') ? 'unsaved' : s);
    }
    const t = setTimeout(() => {
      try {
        const draft: Draft = { project, cloudId: cloudIdRef.current, savedAt: lastSavedAt };
        localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(draft));
      } catch { /* quota or disabled — ignore */ }
    }, 500);
    return () => clearTimeout(t);
  // lastSavedAt is intentionally excluded — it doesn't represent a draft change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  const saveToCloud = useCallback(async () => {
    if (!session?.user?.id) { setSaveStatus('error'); setSaveError('Sign in to save to My Work'); return; }
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const res = await fetch('/api/blueprint-lab/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: project.name,
          docJson: project,
          units: project.units,
          thumbnail: null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveStatus('error');
        setSaveError(err.error ?? `Save failed (${res.status})`);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (body.id) cloudIdRef.current = body.id;
      const now = Date.now();
      setLastSavedAt(now);
      setSaveStatus('saved');
      try {
        const draft: Draft = { project, cloudId: cloudIdRef.current, savedAt: now };
        localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(draft));
      } catch { /* ignore */ }
    } catch (e) {
      setSaveStatus('error');
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }, [project, session?.user?.id]);

  // Expose the latest save fn to the Ctrl+S handler without re-binding it.
  useEffect(() => { saveRef.current = saveToCloud; }, [saveToCloud]);

  const [tool, setTool] = useState<ToolId>('select');
  const [selections, setSelections] = useState<Selection[]>([]);
  const [view, setView] = useState<ViewId>('2d');

  // Keep the user on whatever tab they were viewing across refreshes. Restore
  // once on mount (a UI preference, so localStorage not the cloud doc), then
  // persist on change. The ready-ref keeps the initial persist from clobbering
  // the saved value before the restore has applied.
  const viewPersistReady = useRef(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('blueprint-lab:view');
      const valid: readonly string[] = ['2d', '3d', 'specs', 'roof-plan', 'elevations', 'rooms', 'sandbox', 'print'];
      if (saved && valid.includes(saved)) setView(saved as ViewId);
    } catch { /* storage unavailable — keep default */ }
    viewPersistReady.current = true;
  }, []);
  useEffect(() => {
    if (!viewPersistReady.current) return;
    try { localStorage.setItem('blueprint-lab:view', view); } catch { /* ignore */ }
  }, [view]);

  // Open a saved design in place (from the Open menu in the top bar). Replaces
  // the current project, resets history + selection, and points the URL at the
  // opened id so a refresh reloads the same plan. Mirrors the cloud branch of
  // restore-on-mount; justRestoredRef keeps it from reading as "unsaved".
  const openDesign = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/blueprint-lab/designs/${id}`);
      if (!res.ok) return;
      const row = await res.json() as { id: string; name: string; doc_json: Project };
      justRestoredRef.current = true;
      suppressNextHistoryRef.current = true;
      setProject(migrateProject({ ...row.doc_json, name: row.name }));
      cloudIdRef.current = row.id;
      setUndoStack([]);
      setRedoStack([]);
      setSelections([]);
      setSaveStatus('saved');
      setLastSavedAt(Date.now());
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('id', row.id);
        window.history.replaceState(null, '', url.toString());
      } catch { /* URL update is best-effort */ }
    } catch { /* network/parse error — leave current project untouched */ }
  }, []);

  // Start a fresh blank plan (the "+ New" button). Confirms first if there are
  // unsaved changes, then resets project + history + cloud target and drops the
  // ?id= from the URL so it's no longer pointed at the previously-open plan.
  const handleNewProject = useCallback(() => {
    if (saveStatus === 'unsaved' &&
        !window.confirm('Start a new plan and discard unsaved changes?')) {
      return;
    }
    justRestoredRef.current = true;
    suppressNextHistoryRef.current = true;
    setProject(newProject());
    cloudIdRef.current = null;
    setUndoStack([]);
    setRedoStack([]);
    setSelections([]);
    setSaveStatus('idle');
    setLastSavedAt(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('id');
      window.history.replaceState(null, '', url.toString());
    } catch { /* URL update is best-effort */ }
  }, [saveStatus]);
  // When the active view changes, snap the tool back to 'select' if the
  // previous tool isn't applicable to the new view (e.g. user was on Wall
  // in 2D, switches to Specs — Wall is grayed there, so the active tool
  // should reset to a sensible default). Only enforced for tools that have
  // a clear no-op in the new view; otherwise we leave the tool alone.
  useEffect(() => {
    if (view === 'specs' && !SECTION_APPLICABLE_TOOLS.includes(tool)) {
      setTool('select');
    }
    if (view === 'roof-plan' && !ROOF_APPLICABLE_TOOLS.includes(tool)) {
      setTool('select');
    }
    if (view === 'sandbox' && !SANDBOX_APPLICABLE_TOOLS.includes(tool)) {
      setTool('select');
    }
  }, [view, tool]);
  const [gridInches, setGridInches] = useState(12);
  // Defaults reflect typical floor-plan workflow: clean paper (grid off),
  // freehand precision (snap off), but right-angle lock ON (rare to draw
  // diagonal walls).
  const [gridVisible, setGridVisible] = useState(false);
  const [snapToGridOn, setSnapToGridOn] = useState(false);
  const [orthoOn, setOrthoOn] = useState(true);
  // Cursor + zoom were previously displayed in the status bar; now unused by
  // the parent, but Canvas2D still emits them. Pass-through no-ops below.
  const [defaultWallThickness, setDefaultWallThickness] = useState(DEFAULT_WALL_THICKNESS);
  const [defaultWallHeight, setDefaultWallHeight] = useState(DEFAULT_WALL_HEIGHT);
  const [defaultWallType, setDefaultWallType] = useState<WallType>('wall');
  const [defaultWallStatus, setDefaultWallStatus] = useState<WallStatus>(DEFAULT_WALL_STATUS);
  const [offsetDistance, setOffsetDistance] = useState(12); // 1 ft default
  // Door tool state: active type + per-type placement defaults (size + variant
  // fields). When the user edits a placed door, the changes mirror back to
  // this state so the next placement of the same type uses the new settings.
  const [activeDoorType, setActiveDoorType] = useState<DoorType>('room');
  const [doorTypeSettings, setDoorTypeSettings] = useState<Record<DoorType, DoorTypeSettings>>(() => {
    const init = {} as Record<DoorType, DoorTypeSettings>;
    (Object.keys(DOOR_DEFAULTS) as DoorType[]).forEach(k => {
      init[k] = {
        width: DOOR_DEFAULTS[k].width,
        height: DOOR_DEFAULTS[k].height,
        ...(k === 'entry' ? { sidePanels: 'none' as const, sidePanelWidth: 14 } : {}),
        ...(k === 'sliding' ? { slideStyle: 'interior' as const } : {}),
        ...(k === 'barn' ? { panels: 'single' as const } : {}),
      };
    });
    return init;
  });

  // Window tool state — parallels door state.
  const [activeWindowType, setActiveWindowType] = useState<WindowType>('double-hung');
  const [windowTypeSettings, setWindowTypeSettings] = useState<Record<WindowType, WindowTypeSettings>>(() => {
    const init = {} as Record<WindowType, WindowTypeSettings>;
    (Object.keys(WINDOW_DEFAULTS) as WindowType[]).forEach(k => {
      init[k] = {
        width: WINDOW_DEFAULTS[k].width,
        height: WINDOW_DEFAULTS[k].height,
        headHeight: WINDOW_DEFAULTS[k].headHeight,
        ...(k === 'casement' || k === 'double-hung' ? { panels: 'single' as const } : {}),
        ...(k === 'bay' ? { bayProjection: 18 } : {}),
      };
    });
    return init;
  });

  // Defaults for the rest of the tools.
  const [dimensionOffset, setDimensionOffset] = useState<number>(DIMENSION_DEFAULT_OFFSET);
  // Default to a canonical room type so the dropdown matches on first open.
  const [roomLabelDefaultName, setRoomLabelDefaultName] = useState('BEDROOM');
  const [textDefaultText, setTextDefaultText] = useState('Text');
  // Room-boundary polyline drafting. When set, Canvas2D enters polyline-input
  // mode for that room (clicks add vertices, click-on-start or Enter commits,
  // Esc cancels). Cleared on commit/cancel.
  const [boundaryDraftRoomId, setBoundaryDraftRoomId] = useState<string | null>(null);
  const [stairDefaults, setStairDefaults] = useState({
    width: STAIR_DEFAULTS.width,
    length: STAIR_DEFAULTS.length,
    direction: 'up' as 'up' | 'down',
    shape: 'straight' as StairShape,
  });
  const [activeFurnitureKind, setActiveFurnitureKind] = useState<FurnitureKind>('bed-queen');
  const [furnitureSettings, setFurnitureSettings] = useState<Record<FurnitureKind, { width: number; depth: number }>>(() => {
    const init = {} as Record<FurnitureKind, { width: number; depth: number }>;
    (Object.keys(FURNITURE_CATALOG) as FurnitureKind[]).forEach(k => {
      init[k] = { width: FURNITURE_CATALOG[k].width, depth: FURNITURE_CATALOG[k].depth };
    });
    return init;
  });

  const [defaultLineStyle, setDefaultLineStyle]   = useState<LineStyle>(LINE_DEFAULTS.style);
  const [defaultLineWeight, setDefaultLineWeight] = useState<LineWeight>(LINE_DEFAULTS.weight);
  const [defaultLineColor, setDefaultLineColor]   = useState<LineColor>(LINE_DEFAULTS.color);

  const activeLevel: Level = useMemo(
    () => project.levels.find(l => l.id === project.activeLevelId) ?? project.levels[0],
    [project],
  );

  // The floor directly below the active one (greatest elevation still below it),
  // for the 2D "show floor below" ghost underlay. Null on the lowest floor.
  // The reference floor drawn faintly under the active one (the optional
  // "ghost" the user traces against). Prefer the floor directly BELOW; but when
  // the active level is the lowest (e.g. a BASEMENT has nothing below it), fall
  // back to the floor directly ABOVE — so the basement can ghost the first
  // floor, exactly like the 2nd floor ghosts the first.
  const floorBelow: Level | null = useMemo(() => {
    const below = project.levels.filter(l => l.elevation < activeLevel.elevation);
    if (below.length > 0) return below.reduce((a, b) => (b.elevation > a.elevation ? b : a));
    const above = project.levels.filter(l => l.elevation > activeLevel.elevation);
    if (above.length > 0) return above.reduce((a, b) => (b.elevation < a.elevation ? b : a));
    return null;
  }, [project.levels, activeLevel]);

  const selectedWalls: Wall[] = useMemo(() => {
    const wallIds = new Set(selections.filter(s => s.kind === 'wall').map(s => s.id));
    return activeLevel.walls.filter(w => wallIds.has(w.id));
  }, [selections, activeLevel]);

  const selectedDoors: Door[] = useMemo(() => {
    const doorIds = new Set(selections.filter(s => s.kind === 'door').map(s => s.id));
    return activeLevel.doors.filter(d => doorIds.has(d.id));
  }, [selections, activeLevel]);

  const selectedWindows: Window[] = useMemo(() => {
    const winIds = new Set(selections.filter(s => s.kind === 'window').map(s => s.id));
    return activeLevel.windows.filter(w => winIds.has(w.id));
  }, [selections, activeLevel]);

  const selectedDimensions: Dimension[] = useMemo(() => {
    const ids = new Set(selections.filter(s => s.kind === 'dimension').map(s => s.id));
    return activeLevel.dimensions.filter(d => ids.has(d.id));
  }, [selections, activeLevel]);

  const selectedRoomLabels: RoomLabel[] = useMemo(() => {
    const ids = new Set(selections.filter(s => s.kind === 'roomLabel').map(s => s.id));
    return activeLevel.roomLabels.filter(r => ids.has(r.id));
  }, [selections, activeLevel]);

  const selectedTexts: TextLabel[] = useMemo(() => {
    const ids = new Set(selections.filter(s => s.kind === 'text').map(s => s.id));
    return (activeLevel.texts ?? []).filter(t => ids.has(t.id));
  }, [selections, activeLevel]);

  const selectedStairs: Stair[] = useMemo(() => {
    const ids = new Set(selections.filter(s => s.kind === 'stair').map(s => s.id));
    return activeLevel.stairs.filter(s => ids.has(s.id));
  }, [selections, activeLevel]);

  const selectedFurniture: FurnitureItem[] = useMemo(() => {
    const ids = new Set(selections.filter(s => s.kind === 'furniture').map(s => s.id));
    return activeLevel.furniture.filter(f => ids.has(f.id));
  }, [selections, activeLevel]);

  const selectedLines: LineEntity[] = useMemo(() => {
    const ids = new Set(selections.filter(s => s.kind === 'line').map(s => s.id));
    return (activeLevel.lines ?? []).filter(l => ids.has(l.id));
  }, [selections, activeLevel]);

  const selectedSectionCuts: SectionCut[] = useMemo(() => {
    const ids = new Set(selections.filter(s => s.kind === 'sectionCut').map(s => s.id));
    return (project.sectionCuts ?? []).filter(c => ids.has(c.id));
  }, [selections, project.sectionCuts]);

  // ─── Mutation helpers ─────────────────────────────────────────────────────
  const updateLevel = useCallback((mut: (l: Level) => Level) => {
    setProject(p => ({
      ...p,
      levels: p.levels.map(l => l.id === p.activeLevelId ? mut(l) : l),
    }));
  }, []);

  // Keep cross-floor stair mirrors in sync whenever the floor count changes
  // (covers loading an existing multi-story project AND adding a floor).
  // `syncLinkedStairs` is idempotent and returns the SAME object when nothing
  // is missing, so this never loops.
  useEffect(() => {
    setProject(p => syncLinkedStairs(p));
  }, [project.levels.length]);

  // Section cuts are project-wide, not per-level — they apply to every floor
  // at the same plan position. Appends one cut to project.sectionCuts.
  const handleAddSectionCut = useCallback((cut: SectionCut) => {
    setProject(p => ({ ...p, sectionCuts: [...(p.sectionCuts ?? []), cut] }));
  }, []);

  // Auto-place the primary section: a transverse cut across the main ridge,
  // through the widest clear bay (avoiding doors/windows + parallel-wall steps).
  // Lives on the plan so the placed line is immediately visible there; the
  // selection jumps to it so the user can nudge or delete right away.
  const handleAutoPlaceSection = useCallback(() => {
    const cut = buildPrimarySectionCut(project);
    if (!cut) {
      window.alert(
        'No roof yet.\n\nThe primary section cuts across the main ridge to establish '
        + 'overall building height — draw your roof on the Roof Plan first.',
      );
      return;
    }
    setProject(p => ({ ...p, sectionCuts: [...(p.sectionCuts ?? []), cut] }));
    setSelections([{ kind: 'sectionCut', id: cut.id }]);
  }, [project]);

  // Update one or more section cuts. Used by the Select-tool free-translate
  // drag (position/start/end) and the F key (facing flip).
  const handleUpdateSectionCuts = useCallback((ids: string[], patch: Partial<SectionCut>) => {
    const idSet = new Set(ids);
    setProject(p => ({
      ...p,
      sectionCuts: (p.sectionCuts ?? []).map(c => idSet.has(c.id) ? { ...c, ...patch } : c),
    }));
  }, []);

  // ─── Auto-trim helpers ────────────────────────────────────────────────────
  // Split a wall at parameter positions `cutTs` (distances from wall.start
  // along the wall axis). Re-assigns openings to whichever segment they sit
  // on; openings straddling a cut are dropped. Returns the new level state.
  type SplitContext = {
    walls: Wall[];
    doors: Door[];
    windows: Window[];
    lines: LineEntity[];
  };
  function splitWallByParams(ctx: SplitContext, wallId: string, cutTs: number[]): SplitContext {
    const w = ctx.walls.find(x => x.id === wallId);
    if (!w) return ctx;
    const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y;
    const L = Math.hypot(dx, dy);
    if (L === 0) return ctx;
    const ux = dx / L, uy = dy / L;
    const ts = [...new Set(cutTs.filter(t => t > 1 && t < L - 1))].sort((a, b) => a - b);
    if (ts.length === 0) return ctx;
    // Build the new wall segments.
    const cuts = [0, ...ts, L];
    const newWalls: Wall[] = [];
    const segRanges: { id: string; t0: number; t1: number }[] = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const t0 = cuts[i], t1 = cuts[i + 1];
      const sw: Wall = {
        ...w,
        id: makeId('wall'),
        start: i === 0 ? { ...w.start } : { x: w.start.x + ux * t0, y: w.start.y + uy * t0 },
        end:   i === cuts.length - 2 ? { ...w.end } : { x: w.start.x + ux * t1, y: w.start.y + uy * t1 },
      };
      newWalls.push(sw);
      segRanges.push({ id: sw.id, t0, t1 });
    }
    const reassign = <T extends { wallId: string; positionAlong: number; width: number }>(op: T): T | null => {
      if (op.wallId !== w.id) return op;
      const opStart = op.positionAlong - op.width / 2;
      const opEnd   = op.positionAlong + op.width / 2;
      for (const r of segRanges) {
        if (opStart >= r.t0 - 0.001 && opEnd <= r.t1 + 0.001) {
          return { ...op, wallId: r.id, positionAlong: op.positionAlong - r.t0 };
        }
      }
      return null; // straddles a cut — drop
    };
    return {
      ...ctx,
      walls: [...ctx.walls.filter(x => x.id !== w.id), ...newWalls],
      doors: ctx.doors.map(reassign).filter((d): d is Door => d != null),
      windows: ctx.windows.map(reassign).filter((wn): wn is Window => wn != null),
    };
  }
  function splitLineByParams(ctx: SplitContext, lineId: string, cutTs: number[]): SplitContext {
    const l = ctx.lines.find(x => x.id === lineId);
    if (!l) return ctx;
    const dx = l.end.x - l.start.x, dy = l.end.y - l.start.y;
    const L = Math.hypot(dx, dy);
    if (L === 0) return ctx;
    const ux = dx / L, uy = dy / L;
    const ts = [...new Set(cutTs.filter(t => t > 0.5 && t < L - 0.5))].sort((a, b) => a - b);
    if (ts.length === 0) return ctx;
    const cuts = [0, ...ts, L];
    const newLines: LineEntity[] = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const t0 = cuts[i], t1 = cuts[i + 1];
      newLines.push({
        ...l,
        id: makeId('line'),
        start: i === 0 ? { ...l.start } : { x: l.start.x + ux * t0, y: l.start.y + uy * t0 },
        end:   i === cuts.length - 2 ? { ...l.end } : { x: l.start.x + ux * t1, y: l.start.y + uy * t1 },
      });
    }
    return { ...ctx, lines: [...ctx.lines.filter(x => x.id !== l.id), ...newLines] };
  }
  // Find segment-segment intersection parameter t along segment A's axis.
  function intersectT(aStart: Vec2, aEnd: Vec2, bStart: Vec2, bEnd: Vec2): number | null {
    const rX = aEnd.x - aStart.x, rY = aEnd.y - aStart.y;
    const sX = bEnd.x - bStart.x, sY = bEnd.y - bStart.y;
    const denom = rX * sY - rY * sX;
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((bStart.x - aStart.x) * sY - (bStart.y - aStart.y) * sX) / denom;
    const u = ((bStart.x - aStart.x) * rY - (bStart.y - aStart.y) * rX) / denom;
    const EPS = 1e-4;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
    return t; // parametric position 0..1 along segment A
  }

  // Dedup near-duplicate cut positions (e.g. two coincident polygon-face
  // hits at the same wall corner) and sort ascending. Cuts within DEDUP_IN
  // inches of each other collapse to a single position.
  function dedupSortedCuts(cuts: number[]): number[] {
    const DEDUP_IN = 0.25;
    const sorted = [...cuts].sort((a, b) => a - b);
    const out: number[] = [];
    for (const t of sorted) {
      if (out.length === 0 || Math.abs(t - out[out.length - 1]) > DEDUP_IN) {
        out.push(t);
      }
    }
    return out;
  }

  // Like intersectT, but treats segment B as an INFINITE line: the hit must
  // lie within segment A (t in [0,1]) but may lie anywhere along B's line.
  // Used so a wall's long face still registers a cut even when it stops short
  // of the centerline it's cutting (a T-junction butting into a near face).
  function intersectLineT(aStart: Vec2, aEnd: Vec2, bStart: Vec2, bEnd: Vec2): number | null {
    const rX = aEnd.x - aStart.x, rY = aEnd.y - aStart.y;
    const sX = bEnd.x - bStart.x, sY = bEnd.y - bStart.y;
    const denom = rX * sY - rY * sX;
    if (Math.abs(denom) < 1e-9) return null; // parallel
    const t = ((bStart.x - aStart.x) * sY - (bStart.y - aStart.y) * sX) / denom;
    const EPS = 1e-4;
    if (t < -EPS || t > 1 + EPS) return null;
    return t;
  }

  // Distance from point p to segment [a, b].
  function pointSegDist(p: Vec2, a: Vec2, b: Vec2): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    if (L2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  // Minimum distance between two 2D segments (0 if they cross).
  function segSegDist(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): number {
    if (intersectT(a1, a2, b1, b2) != null) return 0;
    return Math.min(
      pointSegDist(a1, b1, b2), pointSegDist(a2, b1, b2),
      pointSegDist(b1, a1, a2), pointSegDist(b2, a1, a2),
    );
  }

  // Cut positions where wall B connects to (or crosses) the centerline
  // A = [start, end] — used by the Trim tool. Returns parametric t values
  // along A. Handles BOTH a full cross (B passes through A) AND a T-junction
  // where B merely butts into A's near face: in that case B's long faces stop
  // short of A's centerline, so we intersect their infinite LINES rather than
  // their segments. A connection gate (B's body must come within reach of A's
  // centerline) keeps a far-off parallel wall from spuriously cutting A.
  // `aHalfThick` is half the thickness of the entity being trimmed (0 for a
  // zero-width line).
  function intersectTWithWallFaces(start: Vec2, end: Vec2, B: Wall, aHalfThick: number): number[] {
    // Gate: B must reach A's body. A face-touching T-junction sits exactly
    // aHalfThick from A's centerline; the +2" slop forgives snap near-misses.
    if (segSegDist(start, end, B.start, B.end) > aHalfThick + 2) return [];
    const poly = wallPolygon(B); // [start+n, end+n, end-n, start-n]
    const longFaces: [Vec2, Vec2][] = [
      [poly[0], poly[1]], // +n long face
      [poly[3], poly[2]], // -n long face
    ];
    const out: number[] = [];
    for (const [a, b] of longFaces) {
      const t = intersectLineT(start, end, a, b);
      if (t != null && t > 0 && t < 1) out.push(t);
    }
    return out;
  }

  // Adding a wall auto-trims any line it crosses (per the user's "trim a
  // line that is being cut by another line OR wall" rule). The wall itself
  // is NOT split — walls typically meet at endpoints, not crossings.
  const handleAddWall = useCallback((w: Wall) => {
    updateLevel(l => {
      let ctx: SplitContext = {
        walls: [...l.walls, w], doors: l.doors, windows: l.windows,
        lines: [...(l.lines ?? [])],
      };
      for (const existing of (l.lines ?? [])) {
        const eDx = existing.end.x - existing.start.x, eDy = existing.end.y - existing.start.y;
        const eL = Math.hypot(eDx, eDy);
        if (eL === 0) continue;
        const t = intersectT(existing.start, existing.end, w.start, w.end);
        if (t == null) continue;
        ctx = splitLineByParams(ctx, existing.id, [t * eL]);
      }
      return { ...l, walls: ctx.walls, doors: ctx.doors, windows: ctx.windows, lines: ctx.lines };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateLevel]);

  // Bulk-append walls in ONE edit (one undo entry) WITHOUT the intersection
  // auto-split handleAddWall performs. Used by the Mirror tool so reflected
  // copies land exactly mirrored rather than being chopped at crossings. Each
  // wall is stamped with the active level id. (Openings are NOT copied — the
  // mirror covers wall geometry; carrying doors/windows is a later refinement.)
  const handleAddWalls = useCallback((walls: Wall[]) => {
    if (walls.length === 0) return;
    updateLevel(l => ({
      ...l,
      walls: [...l.walls, ...walls.map(w => ({ ...w, levelId: l.id }))],
    }));
  }, [updateLevel]);

  const handleUpdateWalls = useCallback((ids: string[], patch: Partial<Wall>) => {
    const idSet = new Set(ids);
    updateLevel(l => ({
      ...l,
      walls: l.walls.map(w => idSet.has(w.id) ? { ...w, ...patch } : w),
    }));
    if (patch.thickness != null) setDefaultWallThickness(patch.thickness);
    if (patch.height != null) setDefaultWallHeight(patch.height);
    if (patch.type != null) setDefaultWallType(patch.type);
    if (patch.status != null) setDefaultWallStatus(patch.status);
  }, [updateLevel]);

  const handleDeleteSelections = useCallback(() => {
    if (selections.length === 0) return;
    const wallIds  = new Set(selections.filter(s => s.kind === 'wall').map(s => s.id));
    const doorIds  = new Set(selections.filter(s => s.kind === 'door').map(s => s.id));
    const winIds   = new Set(selections.filter(s => s.kind === 'window').map(s => s.id));
    const dimIds   = new Set(selections.filter(s => s.kind === 'dimension').map(s => s.id));
    const labelIds = new Set(selections.filter(s => s.kind === 'roomLabel').map(s => s.id));
    const textIds  = new Set(selections.filter(s => s.kind === 'text').map(s => s.id));
    const stairIds = new Set(selections.filter(s => s.kind === 'stair').map(s => s.id));
    const furnIds  = new Set(selections.filter(s => s.kind === 'furniture').map(s => s.id));
    const lineIds  = new Set(selections.filter(s => s.kind === 'line').map(s => s.id));
    const cutIds   = new Set(selections.filter(s => s.kind === 'sectionCut').map(s => s.id));
    updateLevel(l => ({
      ...l,
      walls:      wallIds.size > 0 ? l.walls.filter(w => !wallIds.has(w.id)) : l.walls,
      doors:      l.doors     .filter(d => !doorIds.has(d.id)  && !wallIds.has(d.wallId)),
      windows:    l.windows   .filter(w => !winIds .has(w.id)  && !wallIds.has(w.wallId)),
      dimensions: dimIds.size > 0   ? l.dimensions.filter(d => !dimIds.has(d.id))   : l.dimensions,
      roomLabels: labelIds.size > 0 ? l.roomLabels.filter(r => !labelIds.has(r.id)) : l.roomLabels,
      texts:      textIds.size > 0  ? (l.texts ?? []).filter(t => !textIds.has(t.id)) : (l.texts ?? []),
      stairs:     stairIds.size > 0 ? l.stairs    .filter(s => !stairIds.has(s.id)) : l.stairs,
      furniture:  furnIds.size > 0  ? l.furniture .filter(f => !furnIds.has(f.id))  : l.furniture,
      lines:      lineIds.size > 0  ? (l.lines ?? []).filter(x => !lineIds.has(x.id)) : (l.lines ?? []),
    }));
    // Section cuts are project-wide, not part of the level — strip them
    // separately. Also drop any per-cut drafting snapshots they owned.
    if (cutIds.size > 0) {
      setProject(p => {
        const remainingCuts = (p.sectionCuts ?? []).filter(c => !cutIds.has(c.id));
        let nextDrafting = p.sectionDrafting;
        if (nextDrafting?.cuts) {
          const cuts = { ...nextDrafting.cuts };
          for (const id of cutIds) delete cuts[id];
          nextDrafting = {
            ...nextDrafting,
            cuts: Object.keys(cuts).length ? cuts : undefined,
          };
          if (!nextDrafting.typical && !nextDrafting.cuts) nextDrafting = undefined;
        }
        return { ...p, sectionCuts: remainingCuts, sectionDrafting: nextDrafting };
      });
    }
    setSelections([]);
  }, [selections, updateLevel]);

  const handleAddDoor = useCallback((d: Door) => {
    updateLevel(l => ({ ...l, doors: [...l.doors, d] }));
  }, [updateLevel]);

  const handleUpdateDoorTypeSettings = useCallback((doorType: DoorType, patch: Partial<DoorTypeSettings>) => {
    setDoorTypeSettings(prev => ({
      ...prev,
      [doorType]: { ...prev[doorType], ...patch },
    }));
  }, []);

  const handleUpdateWindowTypeSettings = useCallback((wt: WindowType, patch: Partial<WindowTypeSettings>) => {
    setWindowTypeSettings(prev => ({
      ...prev,
      [wt]: { ...prev[wt], ...patch },
    }));
  }, []);

  const handleAddWindow = useCallback((w: Window) => {
    updateLevel(l => ({ ...l, windows: [...l.windows, w] }));
  }, [updateLevel]);

  // ─── Dimensions / Room labels / Stairs / Furniture ─────────────────────────
  const handleAddDimension = useCallback((d: Dimension) => {
    updateLevel(l => ({ ...l, dimensions: [...l.dimensions, d] }));
  }, [updateLevel]);

  const handleUpdateDimensions = useCallback((ids: string[], patch: Partial<Dimension>) => {
    const idSet = new Set(ids);
    updateLevel(l => ({
      ...l,
      dimensions: l.dimensions.map(d => idSet.has(d.id) ? { ...d, ...patch } : d),
    }));
    if (patch.offset != null) setDimensionOffset(patch.offset);
  }, [updateLevel]);

  // Driving dimension: move the co-selected element so this dimension's measured
  // length becomes `targetInches`. One setProject ⇒ one undo entry. The element
  // is whichever drivable object is currently selected alongside the dimension.
  const handleDriveDimension = useCallback((dimId: string, targetInches: number) => {
    setProject(p => {
      const level = p.levels.find(l => l.id === p.activeLevelId);
      if (!level) return p;
      const dim = level.dimensions.find(d => d.id === dimId);
      if (!dim) return p;
      const el = selections.find(s =>
        s.kind === 'wall' || s.kind === 'door' || s.kind === 'window' || s.kind === 'furniture' || s.kind === 'stair');
      if (!el) return p;
      const next = driveDimension(level, dim, { kind: el.kind, id: el.id }, targetInches);
      if (!next) return p;
      return { ...p, levels: p.levels.map(l => l.id === level.id ? next : l) };
    });
  }, [selections]);

  const handleAddRoomLabel = useCallback((r: RoomLabel) => {
    updateLevel(l => ({ ...l, roomLabels: [...l.roomLabels, r] }));
  }, [updateLevel]);

  const handleAddText = useCallback((t: TextLabel) => {
    updateLevel(l => ({ ...l, texts: [...(l.texts ?? []), t] }));
  }, [updateLevel]);

  const handleUpdateTexts = useCallback((ids: string[], patch: Partial<TextLabel>) => {
    const idSet = new Set(ids);
    updateLevel(l => ({
      ...l,
      texts: (l.texts ?? []).map(t => idSet.has(t.id) ? { ...t, ...patch } : t),
    }));
  }, [updateLevel]);

  const handleUpdateRoomLabels = useCallback((ids: string[], patch: Partial<RoomLabel>) => {
    const idSet = new Set(ids);
    updateLevel(l => ({
      ...l,
      roomLabels: l.roomLabels.map(r => idSet.has(r.id) ? { ...r, ...patch } : r),
    }));
  }, [updateLevel]);

  const handleStartBoundaryDraft = useCallback((roomId: string) => {
    setBoundaryDraftRoomId(roomId);
    // Make sure the canvas isn't on a tool that swallows clicks (Wall, Trim,
    // etc.). Switch to Select so the boundary-draft input is the only thing
    // intercepting clicks.
    setTool('select');
  }, []);

  const handleCancelBoundaryDraft = useCallback(() => {
    setBoundaryDraftRoomId(null);
  }, []);

  const handleCommitBoundary = useCallback((roomId: string, points: Vec2[]) => {
    if (points.length < 3) { setBoundaryDraftRoomId(null); return; }
    const sf = polygonAreaSqFt(points);
    updateLevel(l => ({
      ...l,
      roomLabels: l.roomLabels.map(r =>
        r.id === roomId ? { ...r, boundary: points, squareFeet: sf } : r,
      ),
    }));
    setBoundaryDraftRoomId(null);
  }, [updateLevel]);

  // Auto-detect a rectangular room footprint from the surrounding walls (shoots
  // rays to the 4 enclosing wall faces). Returns true on success; false when the
  // room isn't clearly enclosed (caller shows a "draw it manually" hint).
  const handleAutoBoundary = useCallback((roomId: string): boolean => {
    const room = activeLevel.roomLabels.find(r => r.id === roomId);
    if (!room) return false;
    const poly = autoDetectRoomBoundary(room.position, activeLevel.walls);
    if (!poly) return false;
    const sf = polygonAreaSqFt(poly);
    updateLevel(l => ({
      ...l,
      roomLabels: l.roomLabels.map(r =>
        r.id === roomId ? { ...r, boundary: poly, squareFeet: sf } : r,
      ),
    }));
    return true;
  }, [activeLevel, updateLevel]);

  const handleClearBoundary = useCallback((roomId: string) => {
    updateLevel(l => ({
      ...l,
      roomLabels: l.roomLabels.map(r => {
        if (r.id !== roomId) return r;
        const { boundary: _b, ...rest } = r;
        void _b;
        return rest;
      }),
    }));
  }, [updateLevel]);

  const handleAddStair = useCallback((s: Stair) => {
    // Add to the active level, then mirror onto the floor above (linked DN copy).
    setProject(p => syncLinkedStairs({
      ...p,
      levels: p.levels.map(l => l.id === p.activeLevelId ? { ...l, stairs: [...l.stairs, s] } : l),
    }));
  }, []);

  const handleUpdateStairs = useCallback((ids: string[], patch: Partial<Stair>) => {
    const idSet = new Set(ids);
    setProject(p => {
      const active = p.levels.find(l => l.id === p.activeLevelId);
      // linkGroups of the stairs being edited → propagate geometry to their
      // mirrors on OTHER floors so the linked flights stay vertically aligned.
      const groups = new Set(
        (active?.stairs ?? []).filter(s => idSet.has(s.id) && s.linkGroup).map(s => s.linkGroup as string),
      );
      const geom = linkedGeometryPatch(patch);
      const hasGeom = Object.keys(geom).length > 0;
      return {
        ...p,
        levels: p.levels.map(l => ({
          ...l,
          stairs: l.stairs.map(s => {
            if (l.id === p.activeLevelId && idSet.has(s.id)) return { ...s, ...patch };
            if (hasGeom && s.linkGroup && groups.has(s.linkGroup)) return { ...s, ...geom };
            return s;
          }),
        })),
      };
    });
    if (patch.width != null || patch.length != null || patch.direction != null || patch.shape != null) {
      setStairDefaults(prev => ({
        width: patch.width ?? prev.width,
        length: patch.length ?? prev.length,
        direction: patch.direction ?? prev.direction,
        shape: patch.shape ?? prev.shape,
      }));
    }
  }, []);

  const handleAddFurniture = useCallback((f: FurnitureItem) => {
    updateLevel(l => ({ ...l, furniture: [...l.furniture, f] }));
  }, [updateLevel]);

  const handleUpdateFurniture = useCallback((ids: string[], patch: Partial<FurnitureItem>) => {
    const idSet = new Set(ids);
    updateLevel(l => ({
      ...l,
      furniture: l.furniture.map(f => idSet.has(f.id) ? { ...f, ...patch } : f),
    }));
    if (ids.length > 0 && (patch.width != null || patch.depth != null)) {
      const sample = activeLevel.furniture.find(f => idSet.has(f.id));
      if (sample) {
        setFurnitureSettings(prev => ({
          ...prev,
          [sample.kind]: {
            width: patch.width ?? prev[sample.kind].width,
            depth: patch.depth ?? prev[sample.kind].depth,
          },
        }));
      }
    }
  }, [updateLevel, activeLevel.furniture]);

  const handleUpdateFurnitureKindSize = useCallback((kind: FurnitureKind, size: { width?: number; depth?: number }) => {
    setFurnitureSettings(prev => ({
      ...prev,
      [kind]: {
        width: size.width ?? prev[kind].width,
        depth: size.depth ?? prev[kind].depth,
      },
    }));
  }, []);

  // Adding a line auto-trims any wall or line it crosses (the new line is
  // the cutter; crossed entities split at the crossings). The new line
  // itself is NOT split — it remains a single segment.
  const handleAddLine = useCallback((line: LineEntity) => {
    updateLevel(l => {
      let ctx: SplitContext = {
        walls: l.walls, doors: l.doors, windows: l.windows,
        lines: [...(l.lines ?? [])],
      };
      // Walls first.
      for (const w of l.walls) {
        const wDx = w.end.x - w.start.x, wDy = w.end.y - w.start.y;
        const wL = Math.hypot(wDx, wDy);
        if (wL === 0) continue;
        const t = intersectT(w.start, w.end, line.start, line.end);
        if (t == null) continue;
        ctx = splitWallByParams(ctx, w.id, [t * wL]);
      }
      // Then existing lines.
      for (const existing of (l.lines ?? [])) {
        const eDx = existing.end.x - existing.start.x, eDy = existing.end.y - existing.start.y;
        const eL = Math.hypot(eDx, eDy);
        if (eL === 0) continue;
        const t = intersectT(existing.start, existing.end, line.start, line.end);
        if (t == null) continue;
        ctx = splitLineByParams(ctx, existing.id, [t * eL]);
      }
      ctx.lines.push(line);
      return { ...l, walls: ctx.walls, doors: ctx.doors, windows: ctx.windows, lines: ctx.lines };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateLevel]);

  // Bulk-append lines in ONE edit (one undo entry) WITHOUT the intersection
  // auto-split that handleAddLine performs. Used by the Mirror tool: a reflected
  // copy should land exactly mirrored, not get chopped where it happens to cross
  // a wall (which would be a surprising edit to the wall engine). Each line is
  // stamped with the active level id.
  const handleAddLines = useCallback((lines: LineEntity[]) => {
    if (lines.length === 0) return;
    updateLevel(l => ({
      ...l,
      lines: [...(l.lines ?? []), ...lines.map(ln => ({ ...ln, levelId: l.id }))],
    }));
  }, [updateLevel]);

  // ─── Trim tool: one-click ────────────────────────────────────────────────
  // Click a target wall or line. The target is split at EVERY crossing with
  // any other wall or line. Openings on a split wall are re-assigned to the
  // segment they sit on (any straddling a cut are dropped).
  // STEM Sketch trim model: click any piece of a wall that's been cut by
  // another wall/line and that piece disappears. The wall is conceptually
  // split at every crossing, then the interval containing the click point
  // is removed (leaving the other pieces intact). End-overshoot is the
  // common case — a wall punching past another wall leaves a short stub on
  // the far side, the user clicks the stub, the stub vanishes.
  const handleTrimWall = useCallback((wallId: string, clickPoint: Vec2) => {
    updateLevel(l => {
      const w = l.walls.find(x => x.id === wallId);
      if (!w) return l;
      const wDx = w.end.x - w.start.x, wDy = w.end.y - w.start.y;
      const wL = Math.hypot(wDx, wDy);
      if (wL === 0) return l;
      // Collect every cut as a parametric position in INCHES along the wall.
      const rawCuts: number[] = [];
      for (const lineObj of (l.lines ?? [])) {
        const t = intersectT(w.start, w.end, lineObj.start, lineObj.end);
        if (t != null) rawCuts.push(t * wL);
      }
      for (const other of l.walls) {
        if (other.id === w.id) continue;
        for (const t of intersectTWithWallFaces(w.start, w.end, other, w.thickness / 2)) {
          rawCuts.push(t * wL);
        }
      }
      // Keep only cuts strictly inside the wall, dedup near-duplicates, sort.
      const cuts = dedupSortedCuts(
        rawCuts.filter(t => t > 0.5 && t < wL - 0.5),
      );
      if (cuts.length === 0) return l;
      // Project the click onto the wall's centerline → click position in
      // inches. Clamp to [0, wL] so a slightly off-wall click still maps to
      // a real interval.
      const proj = ((clickPoint.x - w.start.x) * wDx + (clickPoint.y - w.start.y) * wDy) / (wL * wL);
      const clickT = Math.max(0, Math.min(wL, proj * wL));
      // Boundaries divide the wall into intervals; find which one contains
      // the click and that's the one to remove.
      // Traditional CAD trim: remove ONLY the span between the two crossings
      // that bracket the click; keep the outer portions as WHOLE walls (they
      // span intermediate crossings rather than splitting at every one), so
      // trimming an end stub leaves the rest as one continuous wall. Openings
      // are reassigned to whichever surviving segment they land on; ones in the
      // removed span (or straddling a cut) are dropped.
      let prev = 0;     // nearest crossing below the click (or the wall start)
      let next = wL;    // nearest crossing above the click (or the wall end)
      for (const c of cuts) {
        if (c < clickT) prev = c;
        else if (c > clickT) { next = c; break; }
      }
      const ux = wDx / wL, uy = wDy / wL;
      const pointAt = (t: number): Vec2 => ({ x: w.start.x + ux * t, y: w.start.y + uy * t });
      const newWalls: Wall[] = [];
      const segRanges: { id: string; t0: number; t1: number }[] = [];
      const addSeg = (t0: number, t1: number, atStart: boolean, atEnd: boolean) => {
        if (t1 - t0 < 1) return; // skip slivers <1"
        const sw: Wall = {
          ...w,
          id: makeId('wall'),
          start: atStart ? { ...w.start } : pointAt(t0),
          end:   atEnd   ? { ...w.end }   : pointAt(t1),
        };
        newWalls.push(sw);
        segRanges.push({ id: sw.id, t0, t1 });
      };
      if (prev > 1)      addSeg(0, prev, true, false);
      if (next < wL - 1) addSeg(next, wL, false, true);
      const reassign = <T extends { wallId: string; positionAlong: number; width: number }>(op: T): T | null => {
        if (op.wallId !== w.id) return op;
        const opStart = op.positionAlong - op.width / 2;
        const opEnd   = op.positionAlong + op.width / 2;
        for (const r of segRanges) {
          if (opStart >= r.t0 - 0.001 && opEnd <= r.t1 + 0.001) {
            return { ...op, wallId: r.id, positionAlong: op.positionAlong - r.t0 };
          }
        }
        return null;
      };
      return {
        ...l,
        walls: [...l.walls.filter(x => x.id !== w.id), ...newWalls],
        doors: l.doors.map(reassign).filter((d): d is Door => d != null),
        windows: l.windows.map(reassign).filter((wn): wn is Window => wn != null),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateLevel]);

  const handleTrimLine = useCallback((lineId: string, clickPoint: Vec2) => {
    updateLevel(l => {
      const target = (l.lines ?? []).find(x => x.id === lineId);
      if (!target) return l;
      const tDx = target.end.x - target.start.x, tDy = target.end.y - target.start.y;
      const tL = Math.hypot(tDx, tDy);
      if (tL === 0) return l;
      const rawCuts: number[] = [];
      for (const w of l.walls) {
        for (const t of intersectTWithWallFaces(target.start, target.end, w, 0)) {
          rawCuts.push(t * tL);
        }
      }
      for (const other of (l.lines ?? [])) {
        if (other.id === target.id) continue;
        const t = intersectT(target.start, target.end, other.start, other.end);
        if (t != null) rawCuts.push(t * tL);
      }
      const cuts = dedupSortedCuts(
        rawCuts.filter(t => t > 0.5 && t < tL - 0.5),
      );
      if (cuts.length === 0) return l;
      const proj = ((clickPoint.x - target.start.x) * tDx + (clickPoint.y - target.start.y) * tDy) / (tL * tL);
      const clickT = Math.max(0, Math.min(tL, proj * tL));
      // Traditional CAD trim: remove ONLY the span between the two crossings
      // that bracket the click, and keep the outer portions as WHOLE lines.
      // The kept pieces span any intermediate crossings instead of being split
      // at every one — so trimming an end stub leaves the rest as a single
      // continuous line (not shattered into a piece per crossing).
      let prev = 0;     // nearest crossing below the click (or the line start)
      let next = tL;    // nearest crossing above the click (or the line end)
      for (const c of cuts) {
        if (c < clickT) prev = c;
        else if (c > clickT) { next = c; break; }
      }
      const ux = tDx / tL, uy = tDy / tL;
      const pointAt = (t: number): Vec2 => ({ x: target.start.x + ux * t, y: target.start.y + uy * t });
      const newLines: LineEntity[] = [];
      if (prev > 0.5) {
        newLines.push({ ...target, id: makeId('line'), start: { ...target.start }, end: pointAt(prev) });
      }
      if (next < tL - 0.5) {
        newLines.push({ ...target, id: makeId('line'), start: pointAt(next), end: { ...target.end } });
      }
      return {
        ...l,
        lines: [...(l.lines ?? []).filter(x => x.id !== target.id), ...newLines],
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateLevel]);

  const handleUpdateLines = useCallback((ids: string[], patch: Partial<LineEntity>) => {
    const idSet = new Set(ids);
    updateLevel(l => ({
      ...l,
      lines: (l.lines ?? []).map(line => idSet.has(line.id) ? { ...line, ...patch } : line),
    }));
    // Mirror style/weight/color changes back to the per-tool defaults so the
    // next line drawn inherits the user's edits.
    if (patch.style  != null) setDefaultLineStyle(patch.style);
    if (patch.weight != null) setDefaultLineWeight(patch.weight);
    if (patch.color  != null) setDefaultLineColor(patch.color);
  }, [updateLevel]);

  const handleUpdateDefaultLine = useCallback((patch: { style?: LineStyle; weight?: LineWeight; color?: LineColor }) => {
    if (patch.style  != null) setDefaultLineStyle(patch.style);
    if (patch.weight != null) setDefaultLineWeight(patch.weight);
    if (patch.color  != null) setDefaultLineColor(patch.color);
  }, []);

  // ─── Floor management ─────────────────────────────────────────────────────
  // Default floor-to-floor offset: 8' wall plate + 12" floor system.
  const DEFAULT_FLOOR_STACK_HEIGHT = 108;

  const setActiveLevelId = useCallback((id: string) => {
    setProject(p => ({ ...p, activeLevelId: id }));
    setSelections([]);
  }, []);

  const handleAddFloor = useCallback((where: 'above' | 'below' | 'basement') => {
    setProject(p => {
      const sorted = [...p.levels].sort((a, b) => a.elevation - b.elevation);
      const top = sorted[sorted.length - 1];
      const bottom = sorted[0];
      let newElevation: number;
      let newName: string;
      if (where === 'basement') {
        newElevation = Math.min(0, bottom.elevation) - 108;
        newName = 'Basement';
      } else if (where === 'below') {
        newElevation = bottom.elevation - DEFAULT_FLOOR_STACK_HEIGHT;
        newName = `Floor ${p.levels.length + 1}`;
      } else {
        newElevation = top.elevation + DEFAULT_FLOOR_STACK_HEIGHT;
        newName = `Floor ${p.levels.length + 1}`;
      }
      const level = emptyLevel(newName, newElevation);
      // Mirror any existing staircases onto/around the new floor (linked DN copy).
      return syncLinkedStairs({ ...p, levels: [...p.levels, level], activeLevelId: level.id });
    });
    setSelections([]);
  }, []);

  const handleRenameFloor = useCallback((id: string, name: string) => {
    setProject(p => ({
      ...p,
      levels: p.levels.map(l => l.id === id ? { ...l, name } : l),
    }));
  }, []);

  const handleUpdateFloorElevation = useCallback((id: string, elevation: number) => {
    setProject(p => ({
      ...p,
      levels: p.levels.map(l => l.id === id ? { ...l, elevation } : l),
    }));
  }, []);

  const handleDeleteFloor = useCallback((id: string) => {
    setProject(p => {
      if (p.levels.length <= 1) return p;
      const filtered = p.levels.filter(l => l.id !== id);
      const newActive = p.activeLevelId === id ? filtered[0].id : p.activeLevelId;
      return { ...p, levels: filtered, activeLevelId: newActive };
    });
    setSelections([]);
  }, []);

  const handleDuplicateFloor = useCallback((id: string) => {
    setProject(p => {
      const src = p.levels.find(l => l.id === id);
      if (!src) return p;
      // Create a fresh level with copies of the content, new ids on each entity.
      const sorted = [...p.levels].sort((a, b) => a.elevation - b.elevation);
      const top = sorted[sorted.length - 1];
      const elevation = top.elevation + DEFAULT_FLOOR_STACK_HEIGHT;
      const copy = emptyLevel(`${src.name} copy`, elevation);
      // Map old wall ids → new wall ids so anchored doors/windows still resolve.
      const wallIdMap = new Map<string, string>();
      copy.walls = src.walls.map(w => {
        const newId = w.id + '_dup_' + Date.now().toString(36);
        wallIdMap.set(w.id, newId);
        return { ...w, id: newId, levelId: copy.id };
      });
      copy.doors = src.doors.map(d => ({
        ...d, id: d.id + '_dup', levelId: copy.id,
        wallId: wallIdMap.get(d.wallId) ?? d.wallId,
      }));
      copy.windows = src.windows.map(w => ({
        ...w, id: w.id + '_dup', levelId: copy.id,
        wallId: wallIdMap.get(w.wallId) ?? w.wallId,
      }));
      copy.dimensions = src.dimensions.map(d => ({ ...d, id: d.id + '_dup', levelId: copy.id }));
      copy.roomLabels = src.roomLabels.map(r => ({ ...r, id: r.id + '_dup', levelId: copy.id }));
      copy.texts = (src.texts ?? []).map(t => ({ ...t, id: t.id + '_dup', levelId: copy.id }));
      copy.stairs = src.stairs.map(s => ({ ...s, id: s.id + '_dup', levelId: copy.id }));
      copy.furniture = src.furniture.map(f => ({ ...f, id: f.id + '_dup', levelId: copy.id }));
      copy.lines = (src.lines ?? []).map(l => ({ ...l, id: l.id + '_dup', levelId: copy.id }));
      return { ...p, levels: [...p.levels, copy], activeLevelId: copy.id };
    });
    setSelections([]);
  }, []);

  const handleUpdateWindows = useCallback((ids: string[], patch: Partial<Window>) => {
    const idSet = new Set(ids);
    updateLevel(l => ({
      ...l,
      windows: l.windows.map(w => idSet.has(w.id) ? { ...w, ...patch } : w),
    }));
    if (ids.length > 0) {
      const sample = activeLevel.windows.find(w => idSet.has(w.id));
      if (sample) {
        const sp: Partial<WindowTypeSettings> = {};
        if (patch.width != null)         sp.width = patch.width;
        if (patch.height != null)        sp.height = patch.height;
        if (patch.headHeight != null)    sp.headHeight = patch.headHeight;
        if (patch.panels != null)        sp.panels = patch.panels;
        if (patch.bayProjection != null) sp.bayProjection = patch.bayProjection;
        if (Object.keys(sp).length > 0) handleUpdateWindowTypeSettings(sample.windowType, sp);
      }
    }
  }, [updateLevel, activeLevel.windows, handleUpdateWindowTypeSettings]);

  const handleUpdateDoors = useCallback((ids: string[], patch: Partial<Door>) => {
    const idSet = new Set(ids);
    updateLevel(l => ({
      ...l,
      doors: l.doors.map(d => idSet.has(d.id) ? { ...d, ...patch } : d),
    }));
    // Mirror size + variant changes back to the per-type placement defaults
    // so the NEXT door placed inherits the user's edits.
    if (ids.length > 0) {
      const sample = activeLevel.doors.find(d => idSet.has(d.id));
      if (sample) {
        const sp: Partial<DoorTypeSettings> = {};
        if (patch.width != null)          sp.width = patch.width;
        if (patch.height != null)         sp.height = patch.height;
        if (patch.sidePanels != null)     sp.sidePanels = patch.sidePanels;
        if (patch.sidePanelWidth != null) sp.sidePanelWidth = patch.sidePanelWidth;
        if (patch.slideStyle != null)     sp.slideStyle = patch.slideStyle;
        if (patch.panels != null)         sp.panels = patch.panels;
        if (Object.keys(sp).length > 0) handleUpdateDoorTypeSettings(sample.doorType, sp);
      }
    }
  }, [updateLevel, activeLevel.doors, handleUpdateDoorTypeSettings]);

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: T.bg, color: T.ink, fontFamily: 'ui-sans-serif, system-ui',
    }}>
      {/* Top app bar — consolidates the former 120px SiteHeader into this
          single row: SB logo on the left, Home + profile on the right, so the
          drafting workspace gets the reclaimed vertical space. */}
      <div style={{
        height: 52, background: T.panel,
        borderBottom: `1px solid ${T.line}`,
        display: 'flex', alignItems: 'center',
        padding: '0 18px', gap: 14, flexShrink: 0,
      }}>
        {/* STEM Builder brand logo → home */}
        <Link href="/" title="STEM Builder home" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <img src="/ui/sb-logo.png" alt="STEM Builder" style={{ height: 32, width: 'auto', display: 'block' }} />
        </Link>

        {/* Brand — plain logo + text, matching STEM Sketch's brand block */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.15 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.2px', color: T.ink }}>Blueprint Lab</span>
          <span style={{ fontSize: 10, color: T.inkMuted }}>draft · plan · build</span>
        </div>

        <div style={{ width: 1, height: 22, background: T.line }} />

        <UndoRedoButtons
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={undo}
          onRedo={redo}
        />

        <input
          value={project.name}
          onChange={e => setProject(p => ({ ...p, name: e.target.value }))}
          style={{
            background: T.bg, border: `1px solid ${T.line}`,
            color: T.ink, fontSize: 13, fontWeight: 500,
            padding: '5px 10px', borderRadius: 6, fontFamily: 'inherit',
            minWidth: 200, outline: 'none',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = T.panel; }}
          onBlur={e => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.background = T.bg; }}
        />

        <NewButton onNew={handleNewProject} />

        <OpenMenu
          currentId={cloudIdRef.current}
          hasUnsavedChanges={saveStatus === 'unsaved'}
          signedIn={!!session?.user?.id}
          onOpen={openDesign}
        />

        <SaveButton
          status={saveStatus}
          error={saveError}
          lastSavedAt={lastSavedAt}
          signedIn={!!session?.user?.id}
          onSave={saveToCloud}
        />

        <FloorPicker
          levels={project.levels}
          activeLevelId={project.activeLevelId}
          onSelectLevel={setActiveLevelId}
          onAddFloor={handleAddFloor}
          onRenameFloor={handleRenameFloor}
          onDeleteFloor={handleDeleteFloor}
          onDuplicateFloor={handleDuplicateFloor}
          onUpdateElevation={handleUpdateFloorElevation}
        />

        <span style={{ flex: 1 }} />

        <ViewTabs view={view} onChange={setView} />

        <div style={{ width: 1, height: 22, background: T.line }} />

        <Link
          href="/"
          style={{
            display: 'inline-flex', alignItems: 'center', height: 30, boxSizing: 'border-box',
            border: `1px solid ${T.lineStrong}`, background: T.panel, color: T.ink,
            padding: '0 12px', borderRadius: 6,
            fontWeight: 500, fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap',
          }}
        >← Home</Link>

        <ToolbarUserMenu />
      </div>

      {/* Workspace */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ToolPalette tool={tool} onChange={setTool} view={view} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {view === '3d' ? (
            <Scene3D project={project} />
          ) : view === 'specs' ? (
            <SpecsView project={project} onChange={setProject} tool={tool} onChangeTool={setTool} />
          ) : view === 'roof-plan' ? (
            <RoofPlanView
              project={project}
              onChange={setProject}
              tool={tool}
              onChangeTool={setTool}
              onBeginLiveOp={beginLiveOp}
              onEndLiveOp={endLiveOp}
            />
          ) : view === 'elevations' ? (
            <ElevationsView project={project} onChange={setProject} tool={tool} onChangeTool={setTool} />
          ) : view === 'sandbox' ? (
            <SandboxView project={project} onChange={setProject} tool={tool} onChangeTool={setTool} orthoOn={orthoOn} onBeginLiveOp={beginLiveOp} onEndLiveOp={endLiveOp} />
          ) : view === 'rooms' ? (
            <RoomsView
              project={project}
              onJumpToRoom={(levelId, roomId) => {
                // Switch to that floor + that room and pop back to the 2D plan.
                if (project.activeLevelId !== levelId) {
                  setProject(p => ({ ...p, activeLevelId: levelId }));
                }
                setSelections([{ kind: 'roomLabel', id: roomId }]);
                setView('2d');
                setTool('select');
              }}
            />
          ) : view === '2d' ? (
            <Canvas2D
              level={activeLevel}
              floorBelow={floorBelow}
              tool={tool}
              selections={selections}
              gridInches={gridInches}
              gridVisible={gridVisible}
              snapToGridOn={snapToGridOn}
              orthoOn={orthoOn}
              defaultWallThickness={defaultWallThickness}
              defaultWallHeight={defaultWallHeight}
              defaultWallType={defaultWallType}
              defaultWallStatus={defaultWallStatus}
              offsetDistance={offsetDistance}
              activeDoorType={activeDoorType}
              doorTypeSettings={doorTypeSettings}
              activeWindowType={activeWindowType}
              windowTypeSettings={windowTypeSettings}
              onAddWall={handleAddWall}
              onAddWalls={handleAddWalls}
              onUpdateWalls={handleUpdateWalls}
              onAddDoor={handleAddDoor}
              onUpdateDoors={handleUpdateDoors}
              onAddWindow={handleAddWindow}
              onUpdateWindows={handleUpdateWindows}
              dimensionOffset={dimensionOffset}
              roomLabelDefaultName={roomLabelDefaultName}
              textDefaultText={textDefaultText}
              stairDefaults={stairDefaults}
              activeFurnitureKind={activeFurnitureKind}
              furnitureSettings={furnitureSettings}
              onAddDimension={handleAddDimension}
              onAddRoomLabel={handleAddRoomLabel}
              onAddText={handleAddText}
              onAddStair={handleAddStair}
              onAddFurniture={handleAddFurniture}
              onAddLine={handleAddLine}
              onAddLines={handleAddLines}
              onUpdateStairs={handleUpdateStairs}
              onUpdateDimensions={handleUpdateDimensions}
              onUpdateRoomLabels={handleUpdateRoomLabels}
              onUpdateTexts={handleUpdateTexts}
              onUpdateFurniture={handleUpdateFurniture}
              onUpdateLines={handleUpdateLines}
              onTrimWall={handleTrimWall}
              onTrimLine={handleTrimLine}
              defaultLineStyle={defaultLineStyle}
              defaultLineWeight={defaultLineWeight}
              defaultLineColor={defaultLineColor}
              onChangeTool={setTool}
              onBeginLiveOp={beginLiveOp}
              onEndLiveOp={endLiveOp}
              onCancelLiveOp={cancelLiveOp}
              onSelectionsChange={setSelections}
              onDeleteSelections={handleDeleteSelections}
              onCursorChange={() => {}}
              onZoomChange={() => {}}
              onOffsetDistanceChange={setOffsetDistance}
              sectionCuts={project.sectionCuts ?? []}
              onAddSectionCut={handleAddSectionCut}
              onUpdateSectionCuts={handleUpdateSectionCuts}
              onAutoPlaceSection={handleAutoPlaceSection}
              boundaryDraftRoomId={boundaryDraftRoomId}
              onCommitBoundary={handleCommitBoundary}
              onCancelBoundaryDraft={handleCancelBoundaryDraft}
            />
          ) : (
            <PlaceholderView view={view} />
          )}

          <StatusBar
            gridInches={gridInches}
            gridVisible={gridVisible}
            snapToGridOn={snapToGridOn}
            orthoOn={orthoOn}
            onToggleGrid={() => setGridVisible(v => !v)}
            onToggleSnap={() => setSnapToGridOn(v => !v)}
            onToggleOrtho={() => setOrthoOn(v => !v)}
            onChangeGrid={setGridInches}
            activeFloor={activeLevel.name}
          />
        </div>

        {view === '2d' && <PropertiesPanel
          tool={tool}
          activeLevel={activeLevel}
          selections={selections}
          selectedWalls={selectedWalls}
          selectedDoors={selectedDoors}
          selectedWindows={selectedWindows}
          defaultWallThickness={defaultWallThickness}
          defaultWallHeight={defaultWallHeight}
          defaultWallType={defaultWallType}
          defaultWallStatus={defaultWallStatus}
          offsetDistance={offsetDistance}
          activeDoorType={activeDoorType}
          doorTypeSettings={doorTypeSettings}
          activeWindowType={activeWindowType}
          windowTypeSettings={windowTypeSettings}
          onUpdateWalls={handleUpdateWalls}
          onUpdateDoors={handleUpdateDoors}
          onUpdateWindows={handleUpdateWindows}
          onUpdateDefaultWall={patch => {
            if (patch.thickness != null) setDefaultWallThickness(patch.thickness);
            if (patch.height != null) setDefaultWallHeight(patch.height);
            if (patch.type != null) setDefaultWallType(patch.type);
            if (patch.status != null) setDefaultWallStatus(patch.status);
          }}
          onUpdateOffsetDistance={setOffsetDistance}
          onChangeActiveDoorType={setActiveDoorType}
          onUpdateDoorTypeSettings={handleUpdateDoorTypeSettings}
          onChangeActiveWindowType={setActiveWindowType}
          onUpdateWindowTypeSettings={handleUpdateWindowTypeSettings}
          selectedDimensions={selectedDimensions}
          selectedRoomLabels={selectedRoomLabels}
          selectedTexts={selectedTexts}
          selectedStairs={selectedStairs}
          selectedFurniture={selectedFurniture}
          selectedLines={selectedLines}
          dimensionOffset={dimensionOffset}
          roomLabelDefaultName={roomLabelDefaultName}
          textDefaultText={textDefaultText}
          stairDefaults={stairDefaults}
          activeFurnitureKind={activeFurnitureKind}
          furnitureSettings={furnitureSettings}
          defaultLineStyle={defaultLineStyle}
          defaultLineWeight={defaultLineWeight}
          defaultLineColor={defaultLineColor}
          onUpdateLines={handleUpdateLines}
          onUpdateDefaultLine={handleUpdateDefaultLine}
          onUpdateDimensions={handleUpdateDimensions}
          onDriveDimension={handleDriveDimension}
          onUpdateRoomLabels={handleUpdateRoomLabels}
          onUpdateTexts={handleUpdateTexts}
          onUpdateStairs={handleUpdateStairs}
          onUpdateFurniture={handleUpdateFurniture}
          onUpdateDimensionOffset={setDimensionOffset}
          onUpdateRoomLabelDefaultName={setRoomLabelDefaultName}
          onUpdateTextDefaultText={setTextDefaultText}
          onUpdateStairDefaults={p => setStairDefaults(prev => ({ ...prev, ...p }))}
          onChangeActiveFurnitureKind={setActiveFurnitureKind}
          onUpdateFurnitureKindSize={handleUpdateFurnitureKindSize}
          selectedSectionCuts={selectedSectionCuts}
          onUpdateSectionCuts={handleUpdateSectionCuts}
          boundaryDraftRoomId={boundaryDraftRoomId}
          onStartBoundaryDraft={handleStartBoundaryDraft}
          onCancelBoundaryDraft={handleCancelBoundaryDraft}
          onClearBoundary={handleClearBoundary}
          onAutoBoundary={handleAutoBoundary}
          onDelete={handleDeleteSelections}
        />}
      </div>
    </div>
  );
}

// Bring older saved projects up to the current Level shape (any field added
// after the original save needs a default here so the app doesn't crash).
function migrateProject(p: Project): Project {
  return {
    ...p,
    levels: p.levels.map(l => ({
      ...l,
      lines: l.lines ?? [],
      texts: l.texts ?? [],
      // Legacy wall types: 'exterior'/'interior' collapse to 'wall'. Exterior
      // is now derived from geometry (perimeter), not stored on the wall.
      walls: l.walls.map(w => (
        (w.type as string) === 'partition' ? w : { ...w, type: 'wall' as const }
      )),
    })),
  };
}

function UndoRedoButtons({ canUndo, canRedo, onUndo, onRedo }: {
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
}) {
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  const meta = isMac ? '⌘' : 'Ctrl';
  const baseBtn: React.CSSProperties = {
    width: 30, height: 30, padding: 0,
    background: T.panel, border: `1px solid ${T.lineStrong}`, borderRadius: 6,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'inherit', fontSize: 14,
    transition: 'all 120ms',
  };
  const renderBtn = (label: string, enabled: boolean, title: string, onClick: () => void, glyph: React.ReactNode) => (
    <button
      onClick={onClick}
      disabled={!enabled}
      title={title}
      style={{
        ...baseBtn,
        opacity: enabled ? 1 : 0.4,
        cursor: enabled ? 'pointer' : 'not-allowed',
        color: enabled ? T.ink : T.inkMuted,
      }}
      onMouseEnter={e => { if (enabled) e.currentTarget.style.background = T.bg; }}
      onMouseLeave={e => { if (enabled) e.currentTarget.style.background = T.panel; }}
    >
      {glyph}
      <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>{label}</span>
    </button>
  );
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {renderBtn(
        'Undo', canUndo, `Undo (${meta}+Z)`, onUndo,
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 7h7a3 3 0 010 6H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M5 4L3 7l2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {renderBtn(
        'Redo', canRedo, `Redo (${meta}+Shift+Z)`, onRedo,
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M13 7H6a3 3 0 000 6h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M11 4l2 3-2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

// ─── Open menu ────────────────────────────────────────────────────────────
// Dropdown that lists the signed-in user's saved Blueprint Lab plans and loads
// the chosen one in place. Uses the same 📂 folder icon as STEM Sketch's
// "Load a saved design" button.
type SavedDesignRow = {
  id: string;
  name: string;
  units: string;
  thumbnail: string | null;
  updated_at: string;
};

function OpenMenu({ currentId, hasUnsavedChanges, signedIn, onOpen }: {
  currentId: string | null;
  hasUnsavedChanges: boolean;
  signedIn: boolean;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [designs, setDesigns] = useState<SavedDesignRow[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Fetch the list each time the menu opens so it reflects recent saves.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch('/api/blueprint-lab/designs')
      .then(r => (r.ok ? r.json() : []))
      .then((d: SavedDesignRow[]) => { if (!cancelled) setDesigns(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setDesigns([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  // Close on outside click or Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(id: string) {
    if (id === currentId) { setOpen(false); return; }
    if (hasUnsavedChanges &&
        !window.confirm('You have unsaved changes. Open another plan and discard them?')) {
      return;
    }
    onOpen(id);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Open a saved plan"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 30, padding: '0 8px',
          background: open ? T.bg : T.panel,
          border: `1px solid ${T.lineStrong}`, borderRadius: 6,
          cursor: 'pointer', color: T.ink, fontFamily: 'inherit',
          fontSize: 14, fontWeight: 500, transition: 'all 120ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = T.bg; }}
        onMouseLeave={e => { e.currentTarget.style.background = open ? T.bg : T.panel; }}
      >
        <span style={{ lineHeight: 1 }}>📂</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          width: 300, maxHeight: 380, overflowY: 'auto',
          background: T.panel, border: `1px solid ${T.lineStrong}`,
          borderRadius: 10, boxShadow: T.shadow, zIndex: 1000,
          padding: 6,
        }}>
          {!signedIn ? (
            <div style={{ padding: '18px 14px', fontSize: 12, color: T.inkSoft, textAlign: 'center' }}>
              Sign in to open your saved plans.
            </div>
          ) : loading ? (
            <div style={{ padding: '18px 14px', fontSize: 12, color: T.inkSoft, textAlign: 'center' }}>
              Loading…
            </div>
          ) : designs.length === 0 ? (
            <div style={{ padding: '18px 14px', fontSize: 12, color: T.inkSoft, textAlign: 'center' }}>
              No saved plans yet. Use Save to create one.
            </div>
          ) : (
            designs.map(d => {
              const isCurrent = d.id === currentId;
              return (
                <button
                  key={d.id}
                  onClick={() => pick(d.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 8px', borderRadius: 8, border: 'none',
                    background: isCurrent ? T.accentSoft : 'transparent',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = T.bg; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isCurrent ? T.accentSoft : 'transparent'; }}
                >
                  <div style={{
                    width: 48, height: 36, flexShrink: 0, borderRadius: 6,
                    border: `1px solid ${T.line}`, background: T.panel2,
                    overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {d.thumbnail ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={d.thumbnail} alt={d.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <span style={{ fontSize: 16, opacity: 0.4 }}>📐</span>
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: T.ink,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {d.name}
                    </div>
                    <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1 }}>
                      {d.units} · {new Date(d.updated_at).toLocaleDateString()}
                      {isCurrent ? ' · open' : ''}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// Compact text button matching STEM Sketch's "+ New" — starts a blank plan.
function NewButton({ onNew }: { onNew: () => void }) {
  return (
    <button
      onClick={onNew}
      title="Start a new blank plan"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 30, padding: '0 10px',
        background: T.panel, border: `1px solid ${T.lineStrong}`, borderRadius: 6,
        cursor: 'pointer', color: T.ink, fontFamily: 'inherit',
        fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', transition: 'all 120ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = T.bg; }}
      onMouseLeave={e => { e.currentTarget.style.background = T.panel; }}
    >
      + New
    </button>
  );
}

// Icon-only cloud Save button matching STEM Sketch's ☁ button. Save status is
// conveyed through the background tint + tooltip rather than inline text so the
// toolbar stays compact.
function SaveButton({ status, error, lastSavedAt, signedIn, onSave }: {
  status: 'idle' | 'saving' | 'saved' | 'unsaved' | 'error';
  error: string | null;
  lastSavedAt: number | null;
  signedIn: boolean;
  onSave: () => void;
}) {
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  const meta = isMac ? '⌘' : 'Ctrl';
  const tip =
    !signedIn              ? 'Sign in to save to My Work'
    : status === 'saving'  ? 'Saving…'
    : status === 'error'   ? `Save failed: ${error ?? 'try again'}`
    : status === 'saved'   ? `Saved ${formatSavedTime(lastSavedAt)} — Save (${meta}+S)`
    : status === 'unsaved' ? `Unsaved changes — Save (${meta}+S)`
    :                        `Save to My Work (${meta}+S)`;
  const isBusy = status === 'saving';
  const bg =
    status === 'unsaved' ? T.accentSoft :
    status === 'error'   ? '#fdecec' :
    T.panel;
  const border =
    status === 'unsaved' ? T.accent :
    status === 'error'   ? T.danger :
    status === 'saved'   ? T.good :
    T.lineStrong;
  const glyphColor =
    status === 'error' ? T.danger :
    status === 'saved' ? T.good :
    status === 'unsaved' ? T.accentInk :
    T.inkSoft;
  return (
    <button
      onClick={onSave}
      disabled={isBusy}
      title={tip}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 30, padding: '0 8px',
        background: bg, border: `1px solid ${border}`, borderRadius: 6,
        cursor: isBusy ? 'wait' : 'pointer',
        fontSize: 15, lineHeight: 1, color: glyphColor,
        opacity: isBusy ? 0.6 : 1, transition: 'all 120ms',
      }}
      onMouseEnter={e => { if (!isBusy) e.currentTarget.style.background = T.bg; }}
      onMouseLeave={e => { if (!isBusy) e.currentTarget.style.background = bg; }}
    >
      ☁
    </button>
  );
}

function formatSavedTime(ts: number | null): string {
  if (!ts) return '';
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString();
}
