'use client';
import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import * as Blockly from 'blockly';
import { BlockDef } from '../engine/blocks';
import { ScriptNode } from '../engine/runtime';
import { registerBlockDefs, buildToolbox, workspaceToScript, getDarkTheme } from '../engine/blocklyDefs';

export interface BlocklyWorkspaceHandle {
  getScript: () => ScriptNode[];
  getXml: () => string;
  clear: () => void;
  /** Drop a block's XML onto the workspace (used to re-add a library function) */
  insertXml: (xml: string) => void;
  /** Highlight the currently executing block (null clears the highlight) */
  highlight: (id: string | null) => void;
}

interface Props {
  availableBlocks: BlockDef[];
  initialXml?: string;
  disabled?: boolean;
  /** Theme's collectible name — the sensor block's label matches the art */
  itemName?: string;
  /** Live script as the student edits (the page counts it, library-aware) */
  onScriptChange?: (script: ScriptNode[]) => void;
  /** 📚 Library definitions (name → XML): loaded collapsed + undeletable, survive Clear */
  libraryXml?: Record<string, string>;
}

/** Library definitions can be opened and edited, but not deleted by accident */
function lockLibraryDefs(ws: Blockly.WorkspaceSvg, lib?: Record<string, string>) {
  if (!lib) return;
  for (const b of ws.getBlocksByType('define_trick', false)) {
    const name = String(b.getFieldValue('NAME') ?? '');
    if (name && name in lib) b.setDeletable(false);
  }
}

const BlocklyWorkspace = forwardRef<BlocklyWorkspaceHandle, Props>(
  ({ availableBlocks, initialXml, disabled, itemName = 'crystal', onScriptChange, libraryXml }, ref) => {
    const libraryRef = useRef(libraryXml);
    libraryRef.current = libraryXml;
    const onScriptRef = useRef(onScriptChange);
    onScriptRef.current = onScriptChange;
    const containerRef = useRef<HTMLDivElement>(null);
    const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);

    useEffect(() => {
      if (!containerRef.current) return;

      registerBlockDefs(itemName);

      const workspace = Blockly.inject(containerRef.current, {
        toolbox: buildToolbox(availableBlocks) as Blockly.utils.toolbox.ToolboxInfo,
        renderer: 'zelos',
        theme: getDarkTheme(),
        // Self-hosted media (see public/blockly-media) — never load from Google's appspot default.
        media: '/blockly-media/',
        scrollbars: true,
        trashcan: true,
        sounds: false,
        // Wheel SCROLLS the workspace (kids kept zooming by accident) — zooming
        // is the +/− buttons or pinch only
        zoom: { controls: true, wheel: false, pinch: true, startScale: 0.85, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
        move: { scrollbars: true, drag: true, wheel: true },
        grid: { spacing: 22, length: 3, colour: 'rgba(148,163,184,0.18)', snap: false },
      });

      workspaceRef.current = workspace;
      // Live block count — mirrors countBlocks on the compiled script so the
      // number the student sees is the number par/limit judge
      const report = () => onScriptRef.current?.(workspaceToScript(workspace));
      workspace.addChangeListener((e: Blockly.Events.Abstract) => { if (!e.isUiEvent) report(); });
      setTimeout(report, 0);

      if (initialXml) {
        try {
          const dom = Blockly.utils.xml.textToDom(initialXml);
          Blockly.Xml.domToWorkspace(dom, workspace);
        } catch {
          // ignore invalid XML — start with empty workspace
        }
      }
      lockLibraryDefs(workspace, libraryRef.current);

      return () => {
        workspace.dispose();
        workspaceRef.current = null;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // initialize once; key prop handles challenge changes

    // Library changes while the workspace is open (Forget / Reset library):
    // still-library defs stay locked; a def that WAS locked but is no longer
    // in the library was injected from it — remove it from the canvas.
    useEffect(() => {
      const ws = workspaceRef.current;
      if (!ws) return;
      const lib = libraryXml ?? {};
      for (const b of ws.getBlocksByType('define_trick', false)) {
        const name = String(b.getFieldValue('NAME') ?? '');
        if (name && name in lib) b.setDeletable(false);
        else if (!b.isDeletable()) b.dispose(true);
      }
    }, [libraryXml]);

    useImperativeHandle(ref, () => ({
      insertXml: (xml: string) => {
        const ws = workspaceRef.current;
        if (!ws) return;
        try {
          const dom = Blockly.utils.xml.textToDom(`<xml xmlns="https://developers.google.com/blockly/xml">${xml}</xml>`);
          Blockly.Xml.domToWorkspace(dom, ws);
          lockLibraryDefs(ws, libraryRef.current);
        } catch { /* ignore */ }
      },
      getScript: () =>
        workspaceRef.current ? workspaceToScript(workspaceRef.current) : [],
      getXml: () => {
        if (!workspaceRef.current) return '<xml xmlns="https://developers.google.com/blockly/xml"></xml>';
        const dom = Blockly.Xml.workspaceToDom(workspaceRef.current);
        return Blockly.Xml.domToText(dom);
      },
      clear: () => {
        // Clear wipes the student's program but keeps their library on the canvas
        const ws = workspaceRef.current;
        if (!ws) return;
        ws.clear();
        const lib = libraryRef.current ?? {};
        const defs = Object.keys(lib).map((n, i) => lib[n].replace('<block ', `<block collapsed="true" x="20" y="${20 + i * 64}" `)).join('');
        if (defs) {
          try { Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(`<xml xmlns="https://developers.google.com/blockly/xml">${defs}</xml>`), ws); } catch { /* ignore */ }
          lockLibraryDefs(ws, lib);
        }
      },
      highlight: (id: string | null) => workspaceRef.current?.highlightBlock(id),
    }));

    return (
      <div style={{ position: 'relative', height: '100%', width: '100%' }}>
        <style>{`
          .blocklyFlyoutLabelText { fill: #94a3b8 !important; font-weight: 700; }
          .blocklyText { font-weight: 600; }
        `}</style>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
        {disabled && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            cursor: 'not-allowed', background: 'rgba(0,0,0,0.18)',
          }} />
        )}
      </div>
    );
  }
);

BlocklyWorkspace.displayName = 'BlocklyWorkspace';
export default BlocklyWorkspace;
