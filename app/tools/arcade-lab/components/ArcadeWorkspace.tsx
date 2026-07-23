'use client';
import { useEffect, useRef } from 'react';
import * as Blockly from 'blockly';
import { ScriptOwner } from '../engine/types';
import { registerArcadeBlocks, buildArcadeToolbox } from '../engine/blocks';
import { getDarkTheme } from '../../block-lab/engine/blocklyDefs';

interface Props {
  owner: ScriptOwner;
  xml: string;
  /** Fires (debounced) whenever the student edits the sheet */
  onXmlChange: (xml: string) => void;
}

// One Blockly workspace showing a single object type's script sheet.
// Remounted via key={owner} when the student switches objects in the rail.
export default function ArcadeWorkspace({ owner, xml, onXmlChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onXmlChange);
  onChangeRef.current = onXmlChange;

  useEffect(() => {
    if (!containerRef.current) return;
    registerArcadeBlocks();

    const workspace = Blockly.inject(containerRef.current, {
      toolbox: buildArcadeToolbox(owner) as Blockly.utils.toolbox.ToolboxInfo,
      renderer: 'zelos',
      theme: getDarkTheme(),
      scrollbars: true,
      trashcan: true,
      sounds: false,
      zoom: { controls: true, wheel: true, startScale: 0.8, maxScale: 2.5, minScale: 0.3, scaleSpeed: 1.2 },
      grid: { spacing: 22, length: 3, colour: 'rgba(148,163,184,0.18)', snap: false },
    });

    if (xml) {
      try {
        Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), workspace);
      } catch { /* corrupt sheet — start empty */ }
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const listener = (e: Blockly.Events.Abstract) => {
      if (e.isUiEvent) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const dom = Blockly.Xml.workspaceToDom(workspace);
        onChangeRef.current(Blockly.Xml.domToText(dom));
      }, 350);
    };
    workspace.addChangeListener(listener);

    return () => {
      if (timer) clearTimeout(timer);
      workspace.removeChangeListener(listener);
      workspace.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]); // xml intentionally omitted — loaded once per mount; key remounts on owner switch

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <style>{`
        .blocklyFlyoutLabelText { fill: #94a3b8 !important; font-weight: 700; }
        .blocklyText { font-weight: 600; }
      `}</style>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
