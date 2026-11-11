export declare const LEVELS: string[];
/** @type {Record<string, { level: 'error' | 'warning' | 'info', source: 'frames' | 'pixels' | 'css' | 'events', user: string }>} */
export declare const KINDS: Record<string, {
    level: 'error' | 'warning' | 'info';
    source: 'frames' | 'pixels' | 'css' | 'events';
    user: string;
}>;
/** @returns {string[]} every finding kind a report can carry */
export declare const kindNames: () => string[];
