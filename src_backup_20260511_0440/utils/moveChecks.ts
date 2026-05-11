/**
 * Move-check utilities extracted from FlowerBoard.tsx
 * Used by GardenFlowerField for hover-level computation.
 */

export function moveNeedsTargetPlayer(type: string): boolean {
  return [
    'plantOpponent', 'playWindSingle', 'playWindDouble', 'playBug', 'playBee',
    'naturalDisaster', 'tradePresent', 'tradeFate', 'doubleHappiness',
    'doubleHappinessTake', 'doubleHappinessGive',
  ].includes(type);
}

export function moveRequiresTargetSet(type: string): boolean {
  return ['playWindSingle', 'playWindDouble', 'playBug', 'naturalDisaster'].includes(type);
}

export function moveUsesEditableSetTarget(type: string): boolean {
  return ['playWindSingle', 'playWindDouble', 'playBug', 'playBee', 'naturalDisaster'].includes(type);
}
