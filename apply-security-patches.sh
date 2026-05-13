#!/bin/bash
set -euo pipefail

PROJECT_DIR="${1:-$(pwd)}"
SERVER_FILE="$PROJECT_DIR/server/index.ts"
BACKUP_FILE="$SERVER_FILE.backup.$(date +%Y%m%d-%H%M%S)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🔒 Flower Game Server Security Patcher"
echo "========================================"
echo ""

if [ ! -f "$SERVER_FILE" ]; then
    echo "${RED}❌ Error: $SERVER_FILE not found${NC}"
    exit 1
fi

echo "📁 Project: $PROJECT_DIR"
echo "🎯 Target: server/index.ts"
echo ""

cp "$SERVER_FILE" "$BACKUP_FILE"
echo "${GREEN}✅ Backup created: $BACKUP_FILE${NC}"
echo ""

echo "🔧 PATCH 1: Hardening FLOWER_ADMIN_KEY..."
if grep -q "flowerBugAdmin2026" "$SERVER_FILE"; then
    sed -i '' "s/const FLOWER_ADMIN_KEY = process.env.FLOWER_ADMIN_KEY ?? 'flowerBugAdmin2026!'/const FLOWER_ADMIN_KEY = process.env.FLOWER_ADMIN_KEY || (() => { throw new Error('FLOWER_ADMIN_KEY env var required'); })()/g" "$SERVER_FILE"
    echo "${GREEN}✅ Admin key hardened${NC}"
else
    echo "${YELLOW}⚠️  Default admin key not found — may already be patched${NC}"
fi

echo ""
echo "🔧 PATCH 2: Restricting CORS origins..."
if grep -q "origins: '\*'" "$SERVER_FILE"; then
    sed -i '' "s/origins: '\*',/origins: (ctx) => {\\n    const allowed = (process.env.ALLOWED_ORIGINS || 'http:\\/\\/localhost:3000').split(',');\\n    const origin = ctx.get('origin') || '';\\n    return allowed.includes(origin) ? origin : allowed[0];\\n  },/g" "$SERVER_FILE"
    echo "${GREEN}✅ CORS restricted${NC}"
else
    echo "${YELLOW}⚠️  CORS wildcard not found${NC}"
fi

echo ""
echo "🔧 PATCH 3: Adding path traversal protection..."
if grep -q "path.join(distDir, ctx.path)" "$SERVER_FILE"; then
    sed -i '' 's/const resolved = path.join(distDir, ctx.path)/const sanitized = path.normalize(ctx.path).replace(\/^\\.\.(\\/|$)+\/, "");\\n    const resolved = path.join(distDir, sanitized);\\n    if (!resolved.startsWith(path.resolve(distDir))) {\\n      ctx.status = 403;\\n      ctx.body = "Forbidden";\\n      return;\\n    }/g' "$SERVER_FILE"
    echo "${GREEN}✅ Path traversal protection added${NC}"
else
    echo "${YELLOW}⚠️  Static file path not found${NC}"
fi

echo ""
echo "========================================"
echo "🔍 Verification Checks"
echo "========================================"

EXIT_CODE=0

if grep -q "flowerBugAdmin2026" "$SERVER_FILE"; then
    echo "${RED}❌ FAIL: Default admin key still present${NC}"
    EXIT_CODE=1
else
    echo "${GREEN}✅ Admin key: Clean${NC}"
fi

if grep -q "origins: '\*'" "$SERVER_FILE"; then
    echo "${RED}❌ FAIL: CORS wildcard still present${NC}"
    EXIT_CODE=1
else
    echo "${GREEN}✅ CORS: Restricted${NC}"
fi

if grep -q "path.join(distDir, ctx.path)" "$SERVER_FILE"; then
    echo "${RED}❌ FAIL: Unsanitized path still present${NC}"
    EXIT_CODE=1
else
    echo "${GREEN}✅ Static files: Sanitized${NC}"
fi

echo ""
echo "========================================"

if [ "$EXIT_CODE" -eq 0 ]; then
    echo "${GREEN}🎉 All patches applied successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "  export FLOWER_ADMIN_KEY=\"$(openssl rand -hex 32)\""
    echo "  export ALLOWED_ORIGINS=\"http://localhost:3000,https://yourgame.com\""
    echo ""
    echo "  npm run dev"
else
    echo "${RED}⚠️  Some patches failed. Restore backup:${NC}"
    echo "  cp $BACKUP_FILE $SERVER_FILE"
    exit 1
fi

echo ""
echo "Backup: $BACKUP_FILE"
