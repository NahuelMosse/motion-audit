export declare const round: (x: any, d?: number) => number;
export declare const median: (a: any) => any;
export declare const COLS: string[];
export declare const PROP_OF: {
    left: string;
    top: string;
    width: string;
    height: string;
    opacity: string;
    tx: string;
    ty: string;
    sx: string;
    sy: string;
    rot: string;
    ow: string;
    oh: string;
};
export declare const EPS: {
    left: number;
    top: number;
    width: number;
    height: number;
    translateX: number;
    translateY: number;
    scaleX: number;
    scaleY: number;
    rotate: number;
    opacity: number;
    layoutWidth: number;
    layoutHeight: number;
};
export declare const unwrap: (v: any) => any;
/**
 * Duration, curve shape, overshoot and jumps of one property sampled over time; null when it did not move.
 * @param {number[]} t sample times (ms)
 * @param {number[]} v sampled values
 * @param {number} eps smallest change that counts as movement
 * @param {number[]} [cuts] indices where the series joins two nodes
 * @param {number[][]} [longFrames] `[startMs, durationMs]` of the recording's long frames
 * @param {number[]} [reads] times the values were read at, when they differ from `t`
 */
export declare const analyzeSeries: (t: number[], v: number[], eps: number, cuts?: number[], longFrames?: number[][], reads?: number[]) => {
    from: number;
    to: number;
    startT: number;
    firstT: number;
    durationMs: number;
    samples: number;
    easeInTie: boolean;
    cadence: {
        median: number;
        max: number;
    };
    overshootPct: number;
    shape: any;
    settled: boolean;
    jumps: any;
    unresolved: number;
};
export declare const animatedMove: (m: any) => boolean;
export declare const analyzeElement: (el: any, longFrames?: any[]) => {
    label: any;
    root: any;
    moves: any[];
};
export declare const joinRemounts: (elems: any) => any;
/**
 * The moves of every element a tracer recording followed.
 * `longFrames`: [[startMs, durationMs]] of the recording's long frames: jumps they explain are not reported.
 * @param {{ elems?: any[] } | null | undefined} rec a recording from the page tracer
 * @param {{ longFrames?: number[][] }} [options]
 */
export declare const analyzeRecording: (rec: {
    elems?: any[];
} | null | undefined, { longFrames }?: {
    longFrames?: number[][];
}) => any;
/**
 * 'ease-in' when the curve starts slower than it ends; 'linear'; otherwise 'ok'.
 * @param {string} e a CSS easing function
 * @returns {'linear' | 'ease-in' | 'ok'}
 */
export declare const easingKind: (e: string) => 'linear' | 'ease-in' | 'ok';
