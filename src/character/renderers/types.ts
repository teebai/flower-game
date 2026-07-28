/**
 * types.ts — Character renderer contract.
 *
 * A CharacterRenderer turns procedural CharacterDNA into a visual. Any
 * renderer implementation (SVG, image sprites, canvas, …) can be dropped in
 * as long as it honours this interface.
 */

import type { ComponentType } from 'react';
import type { CharacterDNA } from '../../mmorpg/game/CharacterGenerator';

export interface CharacterRenderProps {
  /** The procedural DNA describing the character. */
  dna: CharacterDNA;
  /** Render width in CSS pixels. Height follows the renderer's aspect ratio. */
  size?: number;
}

export type CharacterRenderer = ComponentType<CharacterRenderProps>;
