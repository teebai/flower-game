export function gardenEllipseRadii(
  totalFlowers: number, totalSets: number, emphasis: number,
  gardenW: number, gardenH: number, gooMargin = 12,
): { rx: number; ry: number } {
  const baseRadius = 28 + Math.min(10, totalFlowers * 0.9) + Math.min(8, totalSets * 1.6);
  const wobble = 2.5 + Math.min(4, totalSets * 0.55) + Math.min(3, totalFlowers * 0.1);
  const stretchX = 1.05 + Math.min(0.18, totalSets * 0.015);
  const stretchY = 0.88 + Math.min(0.16, totalFlowers * 0.012);
  const safeRadius = baseRadius - wobble * 0.85 + emphasis;
  const rx = (safeRadius * stretchX * gardenW) / 100 - gooMargin;
  const ry = (safeRadius * stretchY * gardenH) / 100 - gooMargin;
  return { rx: Math.max(rx, 8), ry: Math.max(ry, 8) };
}

export function clampToEllipse(x: number, y: number, rx: number, ry: number): { x: number; y: number } {
  const nx = x / rx, ny = y / ry;
  const d = Math.sqrt(nx * nx + ny * ny);
  if (d <= 1) return { x, y };
  return { x: x / d, y: y / d };
}
