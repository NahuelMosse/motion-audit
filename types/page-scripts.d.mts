export declare const proxyOf: (n: any) => any;
export declare const reachability: (n: any) => {
    state: string;
    reason: string;
} | {
    reason?: undefined;
    state: string;
};
export declare const hitPoint: (n: any, points: any) => {
    x: any;
    y: any;
};
export declare const describeElement: (n: any) => string;
export declare const elementInfo: (n: any) => {
    kind: any;
    selected: boolean;
};
export declare const readTransition: (n: any) => {
    properties: string[];
    durations: string;
    easings: string[];
};
export declare const cssPath: (n: any) => string;
export declare const waitSettled: (n: any, { minMs, quietMs, capMs }: {
    capMs: any;
    minMs: any;
    quietMs: any;
}) => Promise<any>;
export declare const denyReason: (n: any, { selector, text, flags, named }: {
    flags: any;
    named: any;
    selector: any;
    text: any;
}) => string;
export declare const ungatedHoverMotion: () => {
    found: any[];
    unreadable: number;
};
export declare const hasReducedMotionRule: () => {
    found: boolean;
    unreadable: number;
};
export declare const scrollPass: ({ step, stepMs, tail, maxScrollers }: {
    maxScrollers: any;
    step: any;
    stepMs: any;
    tail: any;
}) => Promise<{
    sections: {
        section: string;
        animated: boolean;
    }[];
    loaf: any;
    keyframeLayout: string[];
    scrollers: number;
}>;
export declare const invisibleContent: () => string[];
export declare const infiniteAnimations: ({ spinnerPx }: {
    spinnerPx: any;
}) => string[];
export declare const devSignals: () => any[];
