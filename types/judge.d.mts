export declare const transitionOf: (tr: any, prop: any) => {
    duration: any;
    easing: any;
};
/**
 * Findings for one audited element: [{ kind, element, detail, key, level? }]. `key` identifies the
 * finding inside its element and kind (moment, property) so fingerprints survive changed numbers.
 * @param {any} el one element of a report's `elements`
 * @param {{ bands?: Record<string, number[]>, tokens?: { durations?: number[] } }} [policy] duration bands per gesture and duration tokens, as `loadConfig` returns them
 */
export declare const judgeElement: (el: any, policy?: {
    bands?: Record<string, number[]>;
    tokens?: {
        durations?: number[];
    };
}) => any[];
/**
 * Same kind of control, same moment, different declared durations: no single motion grammar.
 * @param {any[]} elements the `elements` of a report
 * @param {{ tokens?: { durations?: number[] } }} [policy]
 */
export declare const inconsistencies: (elements: any[], policy?: {
    tokens?: {
        durations?: number[];
    };
}) => any[];
