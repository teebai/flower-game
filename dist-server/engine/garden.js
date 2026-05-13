"use strict";
// ============================================================
// FLOWER GAME — GARDEN MANAGEMENT
// ============================================================
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.canWindTarget = exports.canBugTarget = exports.removeFromSet = exports.plantFlower = exports.normalizeGardenTokens = exports.resolveSetColor = exports.findTargetSet = exports.hasWinningSetCount = exports.completedSets = exports.classifySet = void 0;
var shuffle_1 = require("../utils/shuffle");
// ── Set Classification ────────────────────────────────────────
/**
 * Recalculates isComplete, isSolid, containsTripleRainbow, isDivine
 * for a given set based on its current flowers.
 */
function classifySet(set) {
    var hasDivine = set.flowers.some(function (f) { return f.color === 'divine'; });
    var hasTripleRainbow = set.flowers.some(function (f) { return f.color === 'triple_rainbow'; });
    var flowerCount = set.flowers.length;
    if (set.isToken) {
        return __assign(__assign({}, set), { flowers: [], isComplete: true, isSolid: false, containsTripleRainbow: false, isDivine: true, isToken: true });
    }
    // Divine Flower: always complete, always invulnerable, always its own set
    if (hasDivine) {
        return __assign(__assign({}, set), { isComplete: true, isSolid: false, containsTripleRainbow: false, isDivine: true });
    }
    // Any 7-flower set is promoted into a Divine set
    if (flowerCount >= 7) {
        return __assign(__assign({}, set), { isComplete: true, isSolid: false, containsTripleRainbow: false, isDivine: true });
    }
    // Triple Rainbow standalone (no other flowers combined with it)
    if (hasTripleRainbow && flowerCount === 1) {
        return __assign(__assign({}, set), { isComplete: true, isSolid: false, containsTripleRainbow: true, isDivine: false });
    }
    // Triple Rainbow combined with other flowers → always Solid Set
    if (hasTripleRainbow && flowerCount > 1) {
        return __assign(__assign({}, set), { isComplete: true, isSolid: true, containsTripleRainbow: true, isDivine: false });
    }
    // Normal / Solid sets
    var isComplete = flowerCount >= 3;
    var isSolid = flowerCount >= 5;
    return __assign(__assign({}, set), { isComplete: isComplete, isSolid: isSolid, containsTripleRainbow: false, isDivine: false });
}
exports.classifySet = classifySet;
// ── Garden Queries ────────────────────────────────────────────
function completedSets(garden) {
    return garden.sets.filter(function (s) { return s.isComplete; });
}
exports.completedSets = completedSets;
function hasWinningSetCount(garden) {
    return completedSets(garden).length >= 3;
}
exports.hasWinningSetCount = hasWinningSetCount;
/**
 * Find the set a new flower should be added to, based on colour.
 * Returns null if no matching incomplete set exists.
 */
function findTargetSet(garden, color, isWildcard) {
    var _a, _b;
    if (isWildcard)
        return null; // caller must specify a target set for wildcards
    // Look for an existing incomplete (or complete, to build Solid) set of this colour
    return (_b = (_a = garden.sets.find(function (s) { return !s.isDivine && resolveSetColor(s) === color; })) !== null && _a !== void 0 ? _a : garden.sets.find(isUnanchoredWildcardSet)) !== null && _b !== void 0 ? _b : null;
}
exports.findTargetSet = findTargetSet;
var NORMAL_FLOWER_COLORS = [
    'blue', 'purple', 'red', 'orange', 'yellow', 'green', 'black',
];
function getFlowerEffectiveColor(flower) {
    var _a;
    var candidate = (_a = flower.representedColor) !== null && _a !== void 0 ? _a : flower.color;
    return NORMAL_FLOWER_COLORS.includes(candidate) ? candidate : null;
}
function persistFlowerRepresentation(flower, chosenColor) {
    if (!(flower.isWildcard || flower.color === 'triple_rainbow'))
        return flower;
    if (!chosenColor || !NORMAL_FLOWER_COLORS.includes(chosenColor)) {
        var _representedColor = flower.representedColor, rest = __rest(flower, ["representedColor"]);
        return rest;
    }
    return __assign(__assign({}, flower), { representedColor: chosenColor });
}
function isUnanchoredWildcardSet(set) {
    if (set.isDivine || set.isToken || resolveSetColor(set) !== null)
        return false;
    return set.flowers.length > 0
        && set.flowers.every(function (flower) { return flower.isWildcard && flower.color !== 'triple_rainbow'; });
}
function anchorWildcardSet(set, chosenColor) {
    return __assign(__assign({}, set), { flowers: set.flowers.map(function (flower) { return persistFlowerRepresentation(flower, chosenColor); }) });
}
/**
 * Returns the "effective colour" of a set (first flower with a usable colour).
 */
function resolveSetColor(set) {
    for (var _i = 0, _a = set.flowers; _i < _a.length; _i++) {
        var flower = _a[_i];
        var color = getFlowerEffectiveColor(flower);
        if (color)
            return color;
    }
    return null;
}
exports.resolveSetColor = resolveSetColor;
function isNormalTokenCandidate(flower) {
    if (flower.color === 'divine' || flower.color === 'triple_rainbow') {
        return false;
    }
    return getFlowerEffectiveColor(flower) !== null;
}
function chooseSevenColorPicks(sets) {
    var picks = [];
    var _loop_1 = function (color) {
        var candidates = [];
        sets.forEach(function (set, setIndex) {
            if (set.isDivine || set.isToken)
                return;
            set.flowers.forEach(function (flower, flowerIndex) {
                if (getFlowerEffectiveColor(flower) !== color || !isNormalTokenCandidate(flower))
                    return;
                candidates.push({
                    color: color,
                    setId: set.id,
                    setIndex: setIndex,
                    flowerIndex: flowerIndex,
                    flower: flower,
                    setIsComplete: set.isComplete,
                    setSize: set.flowers.length,
                });
            });
        });
        if (candidates.length === 0)
            return { value: null };
        candidates.sort(function (a, b) {
            if (a.setIsComplete !== b.setIsComplete)
                return Number(a.setIsComplete) - Number(b.setIsComplete);
            if (a.setSize !== b.setSize)
                return a.setSize - b.setSize;
            if (a.setIndex !== b.setIndex)
                return a.setIndex - b.setIndex;
            return a.flowerIndex - b.flowerIndex;
        });
        picks.push(candidates[0]);
    };
    for (var _i = 0, NORMAL_FLOWER_COLORS_1 = NORMAL_FLOWER_COLORS; _i < NORMAL_FLOWER_COLORS_1.length; _i++) {
        var color = NORMAL_FLOWER_COLORS_1[_i];
        var state_1 = _loop_1(color);
        if (typeof state_1 === "object")
            return state_1.value;
    }
    return picks;
}
function mergeDifferentColorFlowers(sets) {
    var workingSets = sets.map(function (set) { return (__assign(__assign({}, set), { flowers: __spreadArray([], set.flowers, true) })); });
    var discardedFlowers = [];
    var lastTokenId;
    while (true) {
        var picks = chooseSevenColorPicks(workingSets);
        if (!picks)
            break;
        var removalMap = new Map();
        var insertionIndex = Math.max(0, Math.min.apply(Math, picks.map(function (pick) { return pick.setIndex; })));
        for (var _i = 0, picks_1 = picks; _i < picks_1.length; _i++) {
            var pick = picks_1[_i];
            if (!removalMap.has(pick.setId))
                removalMap.set(pick.setId, new Set());
            removalMap.get(pick.setId).add(pick.flowerIndex);
            discardedFlowers.push(pick.flower);
        }
        var nextSets = [];
        var _loop_2 = function (set) {
            var removals = removalMap.get(set.id);
            if (!removals || removals.size === 0) {
                nextSets.push(set);
                return "continue";
            }
            var remainingFlowers = set.flowers.filter(function (_, index) { return !removals.has(index); });
            if (remainingFlowers.length > 0) {
                nextSets.push(classifySet(__assign(__assign({}, set), { flowers: remainingFlowers })));
            }
        };
        for (var _a = 0, workingSets_1 = workingSets; _a < workingSets_1.length; _a++) {
            var set = workingSets_1[_a];
            _loop_2(set);
        }
        var tokenSet = classifySet({
            id: (0, shuffle_1.uid)(),
            flowers: [],
            isComplete: true,
            isSolid: false,
            containsTripleRainbow: false,
            isDivine: true,
            isToken: true,
        });
        nextSets.splice(Math.min(insertionIndex, nextSets.length), 0, tokenSet);
        workingSets = nextSets;
        lastTokenId = tokenSet.id;
    }
    if (!lastTokenId)
        return { sets: sets };
    return { sets: workingSets, affectedSetId: lastTokenId, discardedFlowers: discardedFlowers };
}
function normalizeGardenTokens(garden) {
    var merged = mergeDifferentColorFlowers(garden.sets);
    return {
        garden: { sets: merged.sets },
        affectedSetId: merged.affectedSetId,
        discardedFlowers: merged.discardedFlowers,
    };
}
exports.normalizeGardenTokens = normalizeGardenTokens;
function finalizeTokenMerge(sets, affectedSetId, triggersGodsFavourite) {
    var _a;
    var merged = normalizeGardenTokens({ sets: sets });
    return {
        garden: merged.garden,
        triggersGodsFavourite: triggersGodsFavourite || Boolean(merged.affectedSetId),
        affectedSetId: (_a = merged.affectedSetId) !== null && _a !== void 0 ? _a : affectedSetId,
        discardedFlowers: merged.discardedFlowers,
    };
}
/**
 * Plant a flower into the garden.
 *
 * @param garden     The target player's garden (immutable input)
 * @param flower     The flower card being planted
 * @param targetSetId  For wildcards/triple rainbow, the set ID to plant into.
 *                     For regular flowers, omit — auto-matched by colour.
 * @param chosenColor  For wildcards (rainbow/bee), the colour they represent.
 */
function plantFlower(garden, flower, targetSetId, chosenColor, placementMode) {
    var _a, _b, _c;
    if (placementMode === void 0) { placementMode = 'auto'; }
    var sets = garden.sets.map(function (s) { return (__assign(__assign({}, s), { flowers: __spreadArray([], s.flowers, true) })); });
    // ── Divine Flower ─────────────────────────────────────────
    if (flower.color === 'divine') {
        var newSet = classifySet({
            id: (0, shuffle_1.uid)(),
            flowers: [flower],
            isComplete: false,
            isSolid: false,
            containsTripleRainbow: false,
            isDivine: true,
        });
        return {
            garden: { sets: __spreadArray(__spreadArray([], sets, true), [newSet], false) },
            triggersGodsFavourite: true,
            affectedSetId: newSet.id,
        };
    }
    // ── Triple Rainbow standalone ─────────────────────────────
    if (flower.color === 'triple_rainbow' && !targetSetId) {
        var newSet = classifySet({
            id: (0, shuffle_1.uid)(),
            flowers: [flower],
            isComplete: false,
            isSolid: false,
            containsTripleRainbow: true,
            isDivine: false,
        });
        return {
            garden: { sets: __spreadArray(__spreadArray([], sets, true), [newSet], false) },
            triggersGodsFavourite: true, // completes a set on its own
            affectedSetId: newSet.id,
        };
    }
    var isRegularFlower = !flower.isWildcard && flower.color !== 'triple_rainbow';
    if (placementMode === 'auto' && !(flower.isWildcard || flower.color === 'triple_rainbow') && (targetSetId || chosenColor)) {
        throw new Error('Regular flowers are auto-matched by colour');
    }
    // ── Wildcard / Triple Rainbow combined into existing set ───
    if (targetSetId && !isRegularFlower) {
        var idx = sets.findIndex(function (s) { return s.id === targetSetId; });
        if (idx === -1)
            throw new Error("Set ".concat(targetSetId, " not found in garden"));
        var target = sets[idx];
        if (target.isDivine)
            throw new Error('Cannot plant into a Divine set');
        var wasComplete = target.isComplete;
        var anchoredColor = (_b = (_a = resolveSetColor(target)) !== null && _a !== void 0 ? _a : chosenColor) !== null && _b !== void 0 ? _b : undefined;
        if (anchoredColor && isUnanchoredWildcardSet(target)) {
            target = anchorWildcardSet(target, anchoredColor);
        }
        target.flowers.push(persistFlowerRepresentation(flower, anchoredColor));
        var updated = classifySet(target);
        sets[idx] = updated;
        var triggersGodsFavourite = !wasComplete ? updated.isComplete : wasComplete;
        return finalizeTokenMerge(sets, updated.id, triggersGodsFavourite);
    }
    // ── Regular flower — match by colour ──────────────────────
    var effectiveColor = (_c = chosenColor !== null && chosenColor !== void 0 ? chosenColor : getFlowerEffectiveColor(flower)) !== null && _c !== void 0 ? _c : flower.color;
    var storedFlower = persistFlowerRepresentation(flower, chosenColor);
    if (flower.isWildcard && !getFlowerEffectiveColor(storedFlower)) {
        throw new Error('Rainbow flowers need a chosen color when starting a new set');
    }
    var existingIdx = sets.findIndex(function (s) { return !s.isDivine && resolveSetColor(s) === effectiveColor; });
    if (existingIdx !== -1) {
        // Add to existing set
        var target = sets[existingIdx];
        var wasComplete = target.isComplete;
        target.flowers.push(storedFlower);
        var updated = classifySet(target);
        sets[existingIdx] = updated;
        // God's Favourite triggers on: first completion OR adding to already-complete
        var triggersGodsFavourite = updated.isComplete; // true whether completing or extending
        return finalizeTokenMerge(sets, updated.id, triggersGodsFavourite);
    }
    else {
        var anchorableIdx = sets.findIndex(isUnanchoredWildcardSet);
        if (anchorableIdx !== -1) {
            var target = anchorWildcardSet(sets[anchorableIdx], effectiveColor);
            var wasComplete = target.isComplete;
            target.flowers.push(storedFlower);
            var updated = classifySet(target);
            sets[anchorableIdx] = updated;
            var triggersGodsFavourite = updated.isComplete || wasComplete;
            return finalizeTokenMerge(sets, updated.id, triggersGodsFavourite);
        }
        // Start a new set
        var newSet = classifySet({
            id: (0, shuffle_1.uid)(),
            flowers: [storedFlower],
            isComplete: false,
            isSolid: false,
            containsTripleRainbow: false,
            isDivine: false,
        });
        return finalizeTokenMerge(__spreadArray(__spreadArray([], sets, true), [newSet], false), newSet.id, false);
    }
}
exports.plantFlower = plantFlower;
/**
 * Remove flowers from a set (Wind steal, Bug, Natural Disaster).
 * Returns the updated garden and removed flowers.
 *
 * @param count  Number of flowers to remove from the set (-1 = destroy whole set)
 */
function removeFromSet(garden, setId, count) {
    var sets = garden.sets.map(function (s) { return (__assign(__assign({}, s), { flowers: __spreadArray([], s.flowers, true) })); });
    var idx = sets.findIndex(function (s) { return s.id === setId; });
    if (idx === -1)
        throw new Error("Set ".concat(setId, " not found"));
    var target = sets[idx];
    if (target.isDivine)
        throw new Error('Divine sets are invulnerable');
    var removedFlowers;
    if (count === -1 || count >= target.flowers.length) {
        // Destroy entire set (Natural Disaster)
        removedFlowers = target.flowers;
        sets.splice(idx, 1);
    }
    else {
        // Remove specific number — prefer flowers that actually belong to the set's
        // visible colour, then other non-triple flowers, then triple rainbow.
        removedFlowers = [];
        var remaining = count;
        var sourceColor_1 = resolveSetColor(target);
        var preferred = target.flowers.filter(function (f) { return f.color !== 'triple_rainbow' && sourceColor_1 !== null && getFlowerEffectiveColor(f) === sourceColor_1; });
        var otherNonTR = target.flowers.filter(function (f) { return f.color !== 'triple_rainbow' && !(sourceColor_1 !== null && getFlowerEffectiveColor(f) === sourceColor_1); });
        var tr = target.flowers.filter(function (f) { return f.color === 'triple_rainbow'; });
        while (remaining > 0 && preferred.length > 0) {
            removedFlowers.push(preferred.pop());
            remaining--;
        }
        while (remaining > 0 && otherNonTR.length > 0) {
            removedFlowers.push(otherNonTR.pop());
            remaining--;
        }
        while (remaining > 0 && tr.length > 0) {
            removedFlowers.push(tr.pop());
            remaining--;
        }
        target.flowers = __spreadArray(__spreadArray(__spreadArray([], tr, true), otherNonTR, true), preferred, true);
        var updated = classifySet(target);
        if (updated.flowers.length === 0) {
            sets.splice(idx, 1);
        }
        else {
            sets[idx] = updated;
        }
    }
    return { garden: { sets: sets }, removedFlowers: removedFlowers };
}
exports.removeFromSet = removeFromSet;
/**
 * Checks if a set can be targeted by Bug (respects Solid Set immunity).
 */
function canBugTarget(set, isAutumn) {
    if (set.isDivine)
        return false;
    if (set.isSolid && !isAutumn)
        return false;
    // Bug cannot target the Triple Rainbow card directly (but can eat others in Autumn)
    return true;
}
exports.canBugTarget = canBugTarget;
/**
 * Checks if a set can be targeted by Wind steal.
 * Only Double Wind (2 cards) can steal Triple Rainbow.
 * Solid Sets are immune to Wind entirely.
 */
function canWindTarget(set, isDoubleWind) {
    if (set.isDivine)
        return false;
    if (set.isSolid)
        return false;
    if (set.containsTripleRainbow && !isDoubleWind)
        return false;
    return true;
}
exports.canWindTarget = canWindTarget;
