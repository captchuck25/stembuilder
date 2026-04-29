'use client';
import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import * as Blockly from 'blockly';
import { BlockDef } from '../engine/blocks';
import { ScriptNode } from '../engine/runtime';
import { registerBlockDefs, buildToolbox, workspaceToScript } from '../engine/blocklyDefs';

export interface BlocklyWorkspaceHandle {
  getScript: () => ScriptNode[];
  getXml: () => string;
  clear: () => void;
}

interface Props {
  availableBlocks: BlockDef[];
  initialXml?: string;
  disabled?: boolean;
}

const BlocklyWorkspace = forwardRef<BlocklyWorkspaceHandle, Props>(
  ({ availableBlocks, initialXml, disabled }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);

    useEffect(() => {
      if (!containerRef.current) return;

      registerBlockDefs();

      const workspace = Blockly.inject(containerRef.current, {
        toolbox: buildToolbox(availableBlocks) as Blockly.utils.toolbox.ToolboxInfo,
        scrollbars: true,
        trashcan: true,
        sounds: false,
        zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
        grid: { spacing: 20, length: 3, colour: '#e8e8e8', snap: false },
      });

      workspaceRef.current = workspace;

      if (initialXml) {
        try {
          const dom = Blockly.utils.xml.textToDom(initialXml);
          Blockly.Xml.domToWorkspace(dom, workspace);
        } catch {
          // ignore invalid XML — start with empty workspace
        }
      }

      return () => {
        workspace.dispose();
        workspaceRef.current = null;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // initialize once; key prop handles challenge changes

    useImperativeHandle(ref, () => ({
      getScript: () =>
        workspaceRef.current ? workspaceToScript(workspaceRef.current) : [],
      getXml: () => {
        if (!workspaceRef.current) return '<xml xmlns="https://developers.google.com/blockly/xml"></xml>';
        const dom = Blockly.Xml.workspaceToDom(workspaceRef.current);
        return Blockly.Xml.domToText(dom);
      },
      clear: () => workspaceRef.current?.clear(),
    }));

    return (
      <div style={{ position: 'relative', height: '100%', width: '100%' }}>
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
