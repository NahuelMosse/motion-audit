/**
 * Position steps in the window after `markT`. `durationMs` is the measured duration of the motion
 * (estimated from the series when absent). `small` is for micro-interactions (hover, a second click
 * on a trigger): steps are judged against the property's epsilon and 20 % of its range instead of
 * the absolute 24 px / 0.4 opacity of a toggle's panel.
 * `longFrames`: [[startMs, durationMs]] of the long frames of the recording. A step in a frame that
 * overlaps one is the long frame (the page's animation clock kept running while its thread was
 * blocked), reported as `long-frame`; only an Animation object that restarted is still a jump there.
 * @param {any} rec a recording from the page tracer
 * @param {number} markT time of the interruption (ms)
 * @param {{ durationMs?: number, small?: boolean, longFrames?: number[][] }} [options]
 */
export declare const interruptionJumps: (rec: any, markT: number, { durationMs, small, longFrames }?: {
    durationMs?: number;
    small?: boolean;
    longFrames?: number[][];
}) => any[];
export declare const markCadence: (rec: any, markT: any) => {
    median: number;
    max: number;
};
export declare const restartUnfollowed: (rec: any, markT: any) => {
    median: number;
    max: number;
};
