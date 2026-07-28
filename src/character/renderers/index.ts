/**
 * ═══════════════════════════════════════════════════════════════════════
 *  TO REPLACE THE CHARACTER DESIGN:
 *  add your asset files to src/character/renderers/, implement
 *  CharacterRenderer (see types.ts), and set ACTIVE_RENDERER below —
 *  no other code changes needed. The landing page hero, the enter-world
 *  transition and any future previews all render through this registry.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { SvgRenderer } from './SvgRenderer';
import type { CharacterRenderer } from './types';

/** The renderer every character preview in the app uses. */
export const ACTIVE_RENDERER: CharacterRenderer = SvgRenderer;

export type { CharacterRenderer, CharacterRenderProps } from './types';
