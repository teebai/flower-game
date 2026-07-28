/**
 * CharacterAvatar.tsx — The single character preview component.
 *
 * Used by the landing page hero (and reusable anywhere a character preview
 * is needed). Renders through the ACTIVE_RENDERER registry, so swapping the
 * character design later means adding a new renderer — never touching this
 * component or any page.
 */

import type { CSSProperties } from 'react';
import { ACTIVE_RENDERER } from './renderers';
import type { CharacterDNA } from '../mmorpg/game/CharacterGenerator';
import './character-avatar.css';

export interface CharacterAvatarProps {
  /** Character DNA to render. */
  dna: CharacterDNA;
  /** Render width in CSS pixels (default 160). */
  size?: number;
  /** Enable the gentle floating animation (bob + slight rotation + aura). */
  floating?: boolean;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function CharacterAvatar({ dna, size = 160, floating = false }: CharacterAvatarProps) {
  const Renderer = ACTIVE_RENDERER;
  return (
    <div
      className={floating ? 'char-avatar char-avatar--floating' : 'char-avatar'}
      style={{ width: size, height: size * 0.8 }}
    >
      <div
        className="char-avatar__aura"
        style={{ '--aura-color': hex(dna.glowColor) } as CSSProperties}
      />
      <div className="char-avatar__body">
        <Renderer dna={dna} size={size} />
      </div>
    </div>
  );
}
