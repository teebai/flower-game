/**
 * SvgRenderer.tsx — Default procedural SVG character renderer.
 *
 * Draws the teebai.flowers character (white humanoid with daisy eyes, petal
 * ring, earlobes and glow) as a lightweight inline SVG, from CharacterDNA
 * only — no assets required. This is the renderer the landing page ships
 * with until final character art assets are provided.
 */

import type { CharacterRenderProps } from './types';

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

const DAISY_PETALS = [6, 7, 8, 9, 10, 12];

export function SvgRenderer({ dna, size = 160 }: CharacterRenderProps) {
  const hs = dna.headScale * dna.bodyScale;
  const r = 18 * hs;
  const cy = 35;
  const petalCount = DAISY_PETALS[dna.eyeType] ?? 8;

  return (
    <svg
      viewBox="0 0 100 80"
      width={size}
      height={size * 0.8}
      className="char-renderer-svg"
      aria-label="Character preview"
      role="img"
    >
      {/* Glow aura */}
      <circle
        cx="50" cy="40" r={30 * dna.bodyScale}
        fill={hex(dna.glowColor)}
        opacity={dna.glowIntensity * 0.55}
      />
      {/* Head */}
      <ellipse cx="50" cy={cy} rx={r} ry={r * 1.05} fill="#FFFFFF" stroke="#C9C2D8" strokeWidth={1.2} />
      {/* Left daisy eye */}
      {Array.from({ length: petalCount }).map((_, i) => {
        const a = (i / petalCount) * Math.PI * 2 - Math.PI / 2;
        const ex = 44 + Math.cos(a) * 5;
        const ey = cy + Math.sin(a) * 5;
        return (
          <ellipse
            key={`le-${i}`}
            cx={ex} cy={ey} rx={5} ry={2.5}
            fill={hex(dna.eyePetalColor)}
            transform={`rotate(${(a * 180) / Math.PI}, ${ex}, ${ey})`}
            opacity={0.9}
          />
        );
      })}
      <circle cx="44" cy={cy} r={4} fill="#333333" />
      <circle cx="42.5" cy={cy - 1.5} r={1.5} fill="#FFFFFF" opacity={0.9} />
      {/* Right daisy eye */}
      {Array.from({ length: petalCount }).map((_, i) => {
        const a = (i / petalCount) * Math.PI * 2 - Math.PI / 2;
        const ex = 56 + Math.cos(a) * 5;
        const ey = cy + Math.sin(a) * 5;
        return (
          <ellipse
            key={`re-${i}`}
            cx={ex} cy={ey} rx={5} ry={2.5}
            fill={hex(dna.eyePetalColor)}
            transform={`rotate(${(a * 180) / Math.PI}, ${ex}, ${ey})`}
            opacity={0.9}
          />
        );
      })}
      <circle cx="56" cy={cy} r={4} fill="#333333" />
      <circle cx="54.5" cy={cy - 1.5} r={1.5} fill="#FFFFFF" opacity={0.9} />
      {/* Mouth */}
      <path
        d={`M 46 ${cy + 8} Q 50 ${cy + 5.5} 54 ${cy + 8}`}
        fill="none" stroke="#8B8499" strokeWidth={1.4} strokeLinecap="round"
      />
      {/* Body */}
      <path
        d={`M 42 ${cy + r * 0.8} Q 50 ${cy + r * 0.8 - 5} 58 ${cy + r * 0.8} L 56 ${cy + r * 0.8 + 18} Q 50 ${cy + r * 0.8 + 21} 44 ${cy + r * 0.8 + 18} Z`}
        fill="#FFFFFF" stroke="#C9C2D8" strokeWidth={1}
      />
      {/* Earlobes */}
      <ellipse cx={50 - r * 0.9} cy={cy - 2} rx={2.5 * dna.earScale} ry={8 * dna.earScale} fill="#FFFFFF" stroke="#D5CFE2" strokeWidth={0.8} opacity={0.85} />
      <ellipse cx={50 + r * 0.9} cy={cy - 2} rx={2.5 * dna.earScale} ry={8 * dna.earScale} fill="#FFFFFF" stroke="#D5CFE2" strokeWidth={0.8} opacity={0.85} />
    </svg>
  );
}
