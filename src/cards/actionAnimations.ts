// ============================================================
// FLOWER GAME — ACTION ANIMATIONS
// Maps power card names to their full-screen animation assets.
// Special cases for multi-phase animations (natural_disaster, let_go).
// ============================================================

import windAnim from '../assets/animations/wind-animation.gif';
import divineProtectionAnim from '../assets/animations/divine_protection-animation.gif';
import bugAnim from '../assets/animations/bug-animation.gif';
import beeAnim from '../assets/animations/bee-animation.gif';
import doubleHappinessAnim from '../assets/animations/double_happiness-animation.gif';
import tradePresentAnim from '../assets/animations/trade_present-animation.gif';
import tradeFateAnim from '../assets/animations/trade_fate-animation.gif';
import letGoAnim1 from '../assets/animations/let_go-animation1.gif';
import letGoAnim2 from '../assets/animations/let_go-animation2.gif';
import springAnim from '../assets/animations/spring-animation.gif';
import summerAnim from '../assets/animations/summer-animation.gif';
import autumnAnim from '../assets/animations/autumn-animation.gif';
import winterAnim from '../assets/animations/winter-animation.gif';
import naturalDisasterAnim1 from '../assets/animations/natural_disaster-animation1.gif';
import naturalDisasterAnim2 from '../assets/animations/natural_disaster-animation2.gif';
import eclipseAnim from '../assets/animations/eclipse-animation.gif';
import greatResetAnim from '../assets/animations/great_reset-animation.gif';

import type { PowerCardName } from '../types/gameTypes';

export type AnimationPhase = 'cast' | 'success' | 'win';

/** Get animation URL for a power card action */
export function getActionAnimation(name: PowerCardName, phase?: AnimationPhase): string | null {
  switch (name) {
    case 'wind': return windAnim;
    case 'divine_protection': return divineProtectionAnim;
    case 'bug': return bugAnim;
    case 'bee': return beeAnim;
    case 'double_happiness': return doubleHappinessAnim;
    case 'trade_present': return tradePresentAnim;
    case 'trade_fate': return tradeFateAnim;
    case 'let_go': return phase === 'win' ? letGoAnim2 : letGoAnim1;
    case 'spring': return springAnim;
    case 'summer': return summerAnim;
    case 'autumn': return autumnAnim;
    case 'winter': return winterAnim;
    case 'natural_disaster': return phase === 'success' ? naturalDisasterAnim2 : naturalDisasterAnim1;
    case 'eclipse': return eclipseAnim;
    case 'great_reset': return greatResetAnim;
    default: return null;
  }
}

/** Names that have multi-phase animations */
export const MULTI_PHASE_POWERS: PowerCardName[] = ['natural_disaster', 'let_go'];
