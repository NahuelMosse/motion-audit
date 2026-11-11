export declare const undecidedOf: (el: any, later: any) => any[];
export declare const clickRows: (label: any, first: any, unconfirmed: any, reruns: any) => any[];
export declare const clickRerun: (measure: any, reruns: any) => () => Promise<any>;
export declare const confirmToggle: (r: any, again: any) => any;
export declare const toggleRow: (r: any) => {
    kind: string;
    check: string;
    element: any;
    key: string;
    detail: string;
    cadence: any;
};
