export declare const CONFIG_FILE = "motion-audit.config.json";
export declare class ConfigError extends Error {
}
export type Config = {
    /**
     * accepted duration range `[min, max]` (ms) per gesture
     */
    bands: Record<string, number[]>;
    tokens: {
        durations: number[];
    };
    /**
     * level per finding kind
     */
    severity: Record<string, string>;
    ignore: {
        id?: string;
        kind?: string;
        element?: string;
        reason: string;
    }[];
};
/**
 * @typedef {object} Config a validated config file
 * @property {Record<string, number[]>} bands accepted duration range `[min, max]` (ms) per gesture
 * @property {{ durations: number[] }} tokens
 * @property {Record<string, string>} severity level per finding kind
 * @property {{ id?: string, kind?: string, element?: string, reason: string }[]} ignore
 */
/**
 * Fingerprint of a finding: stable across runs because it uses the element's label and the
 * moment/property that identifies the finding, never DOM indices or measured numbers.
 * An `inconclusive` row carries the `check` it could not decide and the hash of that check's own finding.
 * @param {{ kind: string, check?: string, element: string, key?: string }} f
 * @returns {string} `kind:hash`
 */
export declare const fingerprint: (f: {
    kind: string;
    check?: string;
    element: string;
    key?: string;
}) => string;
/**
 * Everything that loosens the audit (bands, tokens, a lowered severity, an ignore) needs a reason.
 * @param {any} raw the parsed config
 * @param {string} [source] named in the error messages
 * @returns {Config}
 * @throws {ConfigError}
 */
export declare const validateConfig: (raw: any, source?: string) => Config;
/**
 * Reads and validates a config file; without `path`, `motion-audit.config.json` in `cwd` when it exists.
 * @param {string} [path]
 * @param {string} [cwd]
 * @returns {Config}
 * @throws {ConfigError}
 */
export declare const loadConfig: (path?: string, cwd?: string) => Config;
export declare const finalize: (raw: any, config: any, { devServer }?: {
    devServer?: boolean;
}) => {
    findings: any[];
    suppressed: any[];
};
