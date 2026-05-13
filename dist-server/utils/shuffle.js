"use strict";
// ============================================================
// FISHER-YATES SHUFFLE
// ============================================================
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
exports.uid = exports.shuffle = void 0;
/**
 * Returns a new shuffled copy of the array.
 * Does not mutate the original.
 */
function shuffle(arr) {
    var _a;
    var a = __spreadArray([], arr, true);
    for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        _a = [a[j], a[i]], a[i] = _a[0], a[j] = _a[1];
    }
    return a;
}
exports.shuffle = shuffle;
/**
 * Generate a unique short ID for cards and sets.
 */
function uid() {
    return Math.random().toString(36).slice(2, 9);
}
exports.uid = uid;
