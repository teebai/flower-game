import re

with open('src/styles.css', 'r') as f:
    content = f.read()

# Find and remove the old drag-active rule block
old_pattern = r'''/\* DRAG ACTIVE -- subtle pulse on all flowers in droppable gardens \*/
\.garden-grid\.is-drag-active \.garden-flower-particle \{
  animation: gardenDragPulse 1\.2s ease-in-out infinite;
  filter: brightness\(1\.15\) saturate\(1\.15\);
  z-index: 999 !important;
  pointer-events: none;
  transition: --flower-scale 0\.25s ease, filter 0\.25s ease;
\}'''

content = re.sub(old_pattern, '', content)

# Also remove any stray duplicate of the new rule
new_pattern = r'''/\* DRAG ACTIVE -- only highlight the hovered/targeted set, not all flowers \*/
\.garden-grid\.is-drag-active \.garden-flower-particle \{
  filter: brightness\(1\.05\) saturate\(1\.05\);
  transition: --flower-scale 0\.25s ease, filter 0\.25s ease;
\}
\.garden-grid\.is-drag-active \.garden-flower-particle\.is-target-set \{
  animation: gardenDragPulse 1\.2s ease-in-out infinite;
  filter: brightness\(1\.15\) saturate\(1\.15\);
  z-index: 999 !important;
  pointer-events: none;
\}
\.garden-grid\.is-drag-active \.garden-flower-particle\.is-target-flower \{
  animation: flowerTargetWiggle 0\.6s ease-in-out infinite;
  filter: drop-shadow\(0 0 12px rgba\(78,204,163,0\.7\)\);
  z-index: 999 !important;
  --flower-scale: 1\.5;
  pointer-events: none;
\}'''

# Remove all occurrences
content = re.sub(new_pattern, '', content)

# Now add the correct rule once
new_rule = '''/* DRAG ACTIVE -- only highlight the hovered/targeted set, not all flowers */
.garden-grid.is-drag-active .garden-flower-particle {
  filter: brightness(1.05) saturate(1.05);
  transition: --flower-scale 0.25s ease, filter 0.25s ease;
}
.garden-grid.is-drag-active .garden-flower-particle.is-target-set {
  animation: gardenDragPulse 1.2s ease-in-out infinite;
  filter: brightness(1.15) saturate(1.15);
  z-index: 999 !important;
  pointer-events: none;
}
.garden-grid.is-drag-active .garden-flower-particle.is-target-flower {
  animation: flowerTargetWiggle 0.6s ease-in-out infinite;
  filter: drop-shadow(0 0 12px rgba(78,204,163,0.7));
  z-index: 999 !important;
  --flower-scale: 1.5;
  pointer-events: none;
}
'''

# Insert before the .is-target-set rule (line ~5292)
insert_before = '.is-target-set {'
content = content.replace(insert_before, new_rule + insert_before)

with open('src/styles.css', 'w') as f:
    f.write(content)

print("Fixed")
