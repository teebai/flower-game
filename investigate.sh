#!/bin/bash
echo "🔍 INVESTIGATING CHANGES"
echo "========================"
echo ""

# 1. Check if new files were created
echo "1. NEW FILES THAT SHOULD EXIST:"
ls -la src/board/components/ActionZone.tsx 2>/dev/null || echo "   ❌ ActionZone.tsx MISSING"
ls -la src/board/components/GameMenu.tsx 2>/dev/null || echo "   ❌ GameMenu.tsx MISSING"
ls -la src/board/components/DiscardPile.tsx 2>/dev/null || echo "   ❌ DiscardPile.tsx MISSING"
ls -la src/board/components/TurnInfoBar.tsx 2>/dev/null || echo "   ❌ TurnInfoBar.tsx MISSING"
ls -la src/board/components/CounterWindow.tsx 2>/dev/null || echo "   ❌ CounterWindow.tsx MISSING"
ls -la src/board/hooks/useDynamicArena.ts 2>/dev/null || echo "   ❌ useDynamicArena.ts MISSING"

echo ""
echo "2. MODIFIED FILES - Last changed:"
stat -f "%Sm" src/board/FlowerBoard.tsx 2>/dev/null || echo "   FlowerBoard.tsx not found"
stat -f "%Sm" src/styles.css 2>/dev/null || echo "   styles.css not found"
stat -f "%Sm" engine/engine.ts 2>/dev/null || echo "   engine.ts not found"

echo ""
echo "3. CHECK IF FLOWERBOARD IMPORTS NEW COMPONENTS:"
grep -n "ActionZone\|GameMenu\|DiscardPile\|TurnInfoBar" src/board/FlowerBoard.tsx 2>/dev/null | head -10 || echo "   ❌ No new imports found"

echo ""
echo "4. CHECK IF STYLES HAVE NEW CSS:"
grep -n "action-zone\|game-menu\|discard-pile" src/styles.css 2>/dev/null | head -5 || echo "   ❌ No new styles found"

echo ""
echo "5. CHECK BUILD ERRORS:"
npx tsc --noEmit 2>&1 | grep -i "error" | head -10 || echo "   No TypeScript errors found"

echo ""
echo "========================"
echo "Common issues:"
echo "❌ Files not saved (Kimi Code showed code but didn't write)"
echo "❌ Wrong file paths (created in wrong directory)"
echo "❌ Import errors (new components not imported in parent)"
echo "❌ Syntax errors (build fails, falls back to cached version)"
echo "❌ Vite cache (needs manual reload or cache clear)"
