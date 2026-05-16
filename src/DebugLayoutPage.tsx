// ============================================================
// DEBUG LAYOUT PAGE — Isolated test harness for garden layout
// URL: /debug-layout?debug=layout
// ============================================================

import React, { useState, useCallback } from 'react';
import { GardenFlowerField } from './board/GardenFlowerField';
import type { GardenSet, FlowerColor } from './types/gameTypes';
import { uid } from '../utils/shuffle';
import { normalizeGardenTokens } from '../engine/garden';

const COLORS: FlowerColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'black'];

function makeFlower(color: FlowerColor): { id: string; color: FlowerColor; kind: 'flower'; isWildcard: boolean } {
  return { id: uid(), color, kind: 'flower', isWildcard: false };
}

function resolveSetColor(set: GardenSet): FlowerColor | null {
  const normalColors: FlowerColor[] = ['blue', 'purple', 'red', 'orange', 'yellow', 'green', 'black'];
  for (const f of set.flowers) {
    const c = f.representedColor ?? f.color;
    if (normalColors.includes(c)) return c;
  }
  return null;
}

function reclassifySet(set: GardenSet): GardenSet {
  const f = set.flowers;
  return {
    ...set,
    isComplete: f.length >= 3,
    isSolid: f.length >= 5,
    containsTripleRainbow: f.some((fl) => fl.color === 'triple_rainbow'),
    isDivine: f.some((fl) => fl.color === 'divine'),
  };
}

export default function DebugLayoutPage() {
  const [sets, setSets] = useState<GardenSet[]>([
    { id: uid(), flowers: [makeFlower('red')], isComplete: false, isSolid: false, containsTripleRainbow: false, isDivine: false },
  ]);
  const [logs, setLogs] = useState<string[]>([]);
  const [discardedCount, setDiscardedCount] = useState(0);

  const originalLog = console.log;
  React.useEffect(() => {
    console.log = (...args: unknown[]) => {
      const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      if (msg.includes('[OrganicLayout]')) {
        setLogs((prev) => [...prev.slice(-49), msg]);
      }
      originalLog.apply(console, args);
    };
    return () => {
      console.log = originalLog;
    };
  }, []);

  const plantFlowerAuto = useCallback((color: FlowerColor) => {
    setSets((prev) => {
      const next = prev.map((s) => ({ ...s, flowers: [...s.flowers] }));

      const matchIdx = next.findIndex(
        (s) => !s.isDivine && resolveSetColor(s) === color
      );

      const flower = makeFlower(color);

      if (matchIdx !== -1) {
        next[matchIdx] = reclassifySet({
          ...next[matchIdx],
          flowers: [...next[matchIdx].flowers, flower],
        });
      } else {
        next.push(reclassifySet({
          id: uid(),
          flowers: [flower],
          isComplete: false,
          isSolid: false,
          containsTripleRainbow: false,
          isDivine: false,
        }));
      }

      return next;
    });
  }, []);

  const plantAllColors = useCallback(() => {
    setSets((prev) => {
      let next = prev.map((s) => ({ ...s, flowers: [...s.flowers] }));
      for (const color of COLORS) {
        const matchIdx = next.findIndex(
          (s) => !s.isDivine && resolveSetColor(s) === color
        );
        // Plant 3 flowers per color so sets survive a divine merge
        const newFlowers = [makeFlower(color), makeFlower(color), makeFlower(color)];
        if (matchIdx !== -1) {
          next[matchIdx] = reclassifySet({
            ...next[matchIdx],
            flowers: [...next[matchIdx].flowers, ...newFlowers],
          });
        } else {
          next.push(reclassifySet({
            id: uid(),
            flowers: newFlowers,
            isComplete: false,
            isSolid: false,
            containsTripleRainbow: false,
            isDivine: false,
          }));
        }
      }
      return next;
    });
  }, []);

  const simulateDivineMerge = useCallback(() => {
    setSets((prev) => {
      const colorCounts = new Map<string, number>();
      for (const set of prev) {
        if (set.isDivine || set.isToken) continue;
        for (const f of set.flowers) {
          const c = f.representedColor ?? f.color;
          if (COLORS.includes(c as FlowerColor)) colorCounts.set(c, (colorCounts.get(c) || 0) + 1);
        }
      }
      const result = normalizeGardenTokens({ sets: prev }, 1);
      const newSets = result.garden.sets;
      if (result.discardedFlowers && result.discardedFlowers.length > 0) {
        setDiscardedCount((c) => c + result.discardedFlowers!.length);
        setLogs((prevLogs) => [
          ...prevLogs,
          `🔮 Merge! ${result.discardedFlowers!.length} consumed. Colors: ${colorCounts.size} (${Array.from(colorCounts.keys()).join(',')})`
        ]);
      } else {
        setLogs((prevLogs) => [
          ...prevLogs,
          `⚠️ No merge. Colors: ${colorCounts.size} (${Array.from(colorCounts.keys()).join(',') || 'none'}), sets=${prev.length}`
        ]);
      }
      return newSets;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSets([{ id: uid(), flowers: [makeFlower('red')], isComplete: false, isSolid: false, containsTripleRainbow: false, isDivine: false }]);
    setLogs([]);
    setDiscardedCount(0);
  }, []);

  return (
    <div style={{ padding: 20, background: '#1a1a2e', minHeight: '100vh', color: '#fff' }}>
      <h2>Debug Layout Page</h2>
      <p style={{ color: '#aaa', fontSize: 12 }}>
        Same-color flowers auto-group into one set. Container auto-scales to fit everything.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#aaa' }}>Plant:</span>
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => plantFlowerAuto(c)}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              background: '#4ecca3',
              color: '#1a1a2e',
              border: 'none',
              borderRadius: 4,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            +{c}
          </button>
        ))}
        <button
          onClick={plantAllColors}
          style={{ padding: '6px 14px', background: '#d4a017', color: '#1a1a2e', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}
        >
          +All 7
        </button>
        <button
          onClick={simulateDivineMerge}
          style={{ padding: '6px 14px', background: '#9b59b6', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}
        >
          🔮 Divine Merge
        </button>
        <button onClick={clearAll} style={{ padding: '6px 14px', marginLeft: 8, background: '#c44', color: '#fff', border: 'none', borderRadius: 4 }}>
          Reset
        </button>
        {discardedCount > 0 && (
          <span style={{ fontSize: 12, color: '#aaa', marginLeft: 8 }}>
            Discarded: {discardedCount} 🌸
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Garden container — expands with content */}
        <div
          style={{
            minWidth: 200,
            minHeight: 160,
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 12,
            border: '2px dashed rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <GardenFlowerField sets={sets} playerId="p0" />
        </div>

        <div style={{ flex: 1, maxHeight: 400, overflow: 'auto', background: '#111', padding: 10, borderRadius: 8 }}>
          <h4 style={{ margin: '0 0 8px' }}>Layout Logs</h4>
          {logs.length === 0 && <p style={{ color: '#666', fontSize: 12 }}>No logs yet. Add a flower or run divine merge.</p>}
          {logs.map((log, i) => (
            <pre key={i} style={{ margin: '2px 0', fontSize: 10, color: '#ccc', whiteSpace: 'pre-wrap' }}>
              {log}
            </pre>
          ))}
        </div>
      </div>
    </div>
  );
}
