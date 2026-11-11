export declare const coverageOf: (moved: any, { ran, mark, moment }?: {
    mark?: any;
    moment?: string;
    ran?: boolean;
}) => {
    ran: boolean;
    mark: any;
    moves: any;
};
export declare const NO_COVERAGE: {
    ran: boolean;
    mark: any;
    moves: any[];
};
export declare const mergeCoverage: (a: any, b: any) => {
    ran: any;
    mark: any;
    moves: any[];
};
export declare const sameMotion: (a: any, b: any) => boolean;
export declare const canSee: (coverage: any, sighting: any, { mark }?: {
    mark?: boolean;
}) => boolean;
export declare const isDense: (cadence: any) => boolean;
export declare const undecidedSightings: (sightings: any, reruns: any, opts?: {}) => any;
export declare const unconfirmedVerdict: (sightings: any, reruns: any, opts?: {}) => any;
export declare const undecidedReason: (cause: any, runs: any) => string;
export declare const measuredFor: (cssProp: any) => string[];
