/**
 * Reads a report.json and checks its schema version.
 * @param {string} file
 * @returns {import('./audit.mjs').Report}
 */
export declare const readReport: (file: string) => import('./audit.mjs').Report;
/**
 * One line per control present in both reports and gesture; controls are paired by label.
 * @param {import('./audit.mjs').Report} ref
 * @param {import('./audit.mjs').Report} mine
 */
export declare const compareReports: (ref: import('./audit.mjs').Report, mine: import('./audit.mjs').Report) => {
    lines: any[];
    differ: number;
    total: number;
    added: import("./audit.mjs").Finding[];
    gone: import("./audit.mjs").Finding[];
};
export declare const baselineIds: (report: any) => Set<any>;
