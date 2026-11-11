/**
 * { tx, ty, sx, sy, rot } from the computed `transform`, `translate`, `scale` and `rotate` values.
 * @param {{ transform?: string, translate?: string, scale?: string, rotate?: string }} snap
 */
export declare const transformState: (snap: {
    transform?: string;
    translate?: string;
    scale?: string;
    rotate?: string;
}) => {
    tx: number;
    ty: number;
    sx: number;
    sy: number;
    rot: number;
};
/**
 * What a press still does under reduced motion beyond a small scale change.
 * @param {{ transform?: string, translate?: string, scale?: string, rotate?: string }} rest computed styles at rest
 * @param {{ transform?: string, translate?: string, scale?: string, rotate?: string }} pressed computed styles while pressed
 * @returns {string} empty when nothing moves more than that
 */
export declare const reducedMoves: (rest: {
    transform?: string;
    translate?: string;
    scale?: string;
    rotate?: string;
}, pressed: {
    transform?: string;
    translate?: string;
    scale?: string;
    rotate?: string;
}) => string;
/**
 * Any transform left after release.
 * @param {{ transform?: string, translate?: string, scale?: string, rotate?: string }} rest computed styles at rest
 * @param {{ transform?: string, translate?: string, scale?: string, rotate?: string }} released computed styles after the release
 * @returns {string} empty when nothing is left
 */
export declare const reducedResidue: (rest: {
    transform?: string;
    translate?: string;
    scale?: string;
    rotate?: string;
}, released: {
    transform?: string;
    translate?: string;
    scale?: string;
    rotate?: string;
}) => string;
