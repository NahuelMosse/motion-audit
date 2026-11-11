export declare const denied: (handle: any) => any;
export declare const sparsity: (motion: any) => number;
export declare const reachablePoint: (proxy: any) => Promise<any>;
export declare const auditElement: (ctx: any, original: any, label: any, { hoverOnly }?: {
    hoverOnly?: boolean;
}) => Promise<{
    skipped: string;
    el?: undefined;
} | {
    skipped?: undefined;
    el: {
        label: any;
        kind: any;
        selected: any;
        transition: {
            properties: any;
            durations: number[];
            easings: any;
        };
        moments: {};
        long: any[];
        pressMode: string;
        hoverOnly: boolean;
    };
}>;
export declare const eligibleToggles: (page: any) => Promise<{
    eligible: any[];
    skipped: any[];
}>;
export declare const probeToggle: (ctx: any, index: any) => Promise<{
    label: any;
    dur?: undefined;
    jumps?: undefined;
    sightings?: undefined;
    coverage?: undefined;
    unsure?: undefined;
    cadence?: undefined;
    dense?: undefined;
} | {
    label: any;
    dur: number;
    jumps: any[];
    sightings: {
        label: any;
        prop: any;
        dense: boolean;
        cadence: any;
    }[];
    coverage: {
        ran: boolean;
        mark: any;
        moves: any[];
    };
    unsure: any;
    cadence: any;
    dense: boolean;
}>;
export declare const jumpSightingsOf: (moved: any) => any;
export declare const clickUnsure: (moved: any) => any;
export declare const frameCadence: (rec: any, from?: number) => {
    median: number;
    max: number;
};
export declare const recordingCadence: (rec: any) => {
    median: number;
    max: number;
};
declare const pageAttempt: (ctx: any, selector: any, interrupt: any) => {
    (trace: any): Promise<{
        missing: string;
        from?: undefined;
        loaf?: undefined;
        rec?: undefined;
    } | {
        missing?: undefined;
        from: any;
        loaf: any;
        rec: any;
    }>;
    release: () => void;
    press: () => Promise<boolean>;
};
export declare const clickMeasurer: (ctx: any, selector: any, interrupt: any, makeAttempt?: typeof pageAttempt) => {
    (retries?: number): Promise<{
        missing: string;
        from?: undefined;
        loaf?: undefined;
        rec?: undefined;
    } | {
        missing?: undefined;
        from: any;
        loaf: any;
        rec: any;
    } | {
        moved: any;
        long: any;
        unsure: any;
        cadence: {
            median: number;
            max: number;
        };
        coverage: {
            ran: boolean;
            mark: any;
            moves: any;
        };
        jumpSightings: any;
        jumps: any;
        layout: any;
        interrupt: any[];
        interruptUnsure: {
            median: number;
            max: number;
        };
        interruptSightings: {
            label: any;
            prop: any;
            dense: boolean;
            cadence: {
                median: number;
                max: number;
            };
        }[];
        mounted: any;
    }>;
    presses: () => number;
    restore: () => Promise<boolean>;
};
export declare const reducedPass: (ctx: any, targets: any) => Promise<{
    per: Map<any, any>;
    hidden: any;
    infinite: any;
}>;
export declare const contactSheet: (ctx: any, selector: any, out: any) => Promise<string>;
export {};
