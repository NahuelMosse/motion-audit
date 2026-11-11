export declare class AuditError extends Error {
}
export declare const TRACER_CONFIG: {
    cols: string[];
    skip: string[];
    subtreeCap: number;
    pageCap: number;
    mountCap: number;
    minSize: number;
};
export declare const snapshot: (h: any, props: any) => any;
export declare const diff: (a: any, b: any) => string[];
export declare const shot: (page: any, box: any) => Promise<any>;
export declare const toMs: (list: any) => number[];
export declare const traced: (page: any, root: any, action: any) => Promise<{
    rec: any;
    motion: any;
    long: any;
}>;
export declare const setUnattributedLimit: (page: any, ms: any) => WeakMap<object, any>;
export declare const unattributedLimit: (page: any) => any;
export declare const auxPage: (context: any, { session }?: {
    session?: boolean;
}) => Promise<any>;
export declare const idleFrameNoise: (page: any, ms?: number) => Promise<number>;
export declare const calibrateFrames: (context: any) => Promise<number>;
export declare const longFramesBetween: (loaf: any, from: any, to?: number, unattributedMs?: number) => any;
export declare const longWindows: (loaf: any, from: any, unattributedMs?: number) => any;
export declare const describeLong: (long: any) => {
    frames: any;
    culprit: string;
};
export declare const createPseudoStates: (context: any, page: any) => Promise<{
    force(handle: any, states: any, ancestors?: {}): Promise<{
        id: any;
        states: any;
    }[]>;
    clear(ids: any): Promise<void>;
    detach: () => any;
    session: any;
}>;
declare const sameDocument: (a: any, b: any) => boolean;
export declare const sameLocation: typeof sameDocument;
/**
 * @param {any} page
 * @param {string} url
 * @param {{ waitFor?: string, allowRedirect?: boolean }} [options]
 */
export declare const load: (page: any, url: string, { waitFor, allowRedirect }?: {
    waitFor?: string;
    allowRedirect?: boolean;
}) => Promise<{
    landed: any;
    redirected: boolean;
    loadedAt: number;
}>;
export declare const createPixelComparer: (context: any) => Promise<{
    stats: (a: any, b: any, tolerance?: number) => any;
    differ(a: any, b: any): Promise<boolean>;
    close: () => any;
}>;
export {};
