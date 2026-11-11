import type { Page } from 'playwright';
export type Level = 'error' | 'warning' | 'info';
export type Finding = {
    /**
     * stable `kind:hash` fingerprint
     */
    id: string;
    level: Level;
    /**
     * one of `kindNames()`
     */
    kind: string;
    /**
     * the check an `inconclusive` row could not decide
     */
    check?: string;
    /**
     * label of the control or section
     */
    element: string;
    detail: string;
    /**
     * sampling intervals (ms) of an `inconclusive` row
     */
    cadence?: {
        median: number;
        max: number;
    };
};
export type Coverage = {
    /**
     * controls found, including those beyond `max`
     */
    candidates: number;
    audited: number;
    errored: number;
    max: number;
    /**
     * controls that appeared after the audit counted them
     */
    late?: number;
    /**
     * checks the frames were too sparse to decide
     */
    inconclusive?: number;
    /**
     * skipped controls by reason
     */
    skipped: Record<string, {
        count: number;
        examples: string[];
    }>;
    toggles: {
        candidates: number;
        probed: number;
        skipped: Record<string, number>;
    };
};
export type AuditOptions = {
    /**
     * audit only controls matching these selectors
     */
    only?: string[];
    /**
     * audit at most this many controls
     */
    max?: number;
    /**
     * CPU throttling rate (4 is a mid-range phone)
     */
    cpu?: number;
    /**
     * selector of a control to click for real and record
     */
    click?: string;
    /**
     * with `click`: click again half-way
     */
    interrupt?: boolean;
    /**
     * also press and toggle controls for real
     */
    interact?: boolean;
    /**
     * selectors to write a contact sheet for
     */
    frames?: string[];
    /**
     * report sections that appear without an entrance
     */
    entrances?: boolean;
    /**
     * path of a config file, or a config object
     */
    config?: string | object;
    /**
     * a report.json path, or finding ids to ignore
     */
    baseline?: string | Iterable<string>;
    /**
     * Playwright storage state (a logged-in session); ignored when a page is passed
     */
    storageState?: string;
    /**
     * selector to wait for before auditing
     */
    waitFor?: string;
    /**
     * audit the page the URL redirects to
     */
    allowRedirect?: boolean;
    /**
     * directory for the report and contact sheets (default: a temp directory)
     */
    out?: string;
    /**
     * with a page: the URL to reload, when the page's own is not it
     */
    url?: string;
};
export type Report = {
    /**
     * 1
     */
    schemaVersion: number;
    url: string;
    finalUrl: string;
    cpu: number;
    /**
     * 'observe-only' or 'interact'
     */
    mode: string;
    /**
     * whether the browser reports Long Animation Frames
     */
    loafSupported: boolean;
    /**
     * development-build signals found on the page
     */
    devServer: string[];
    /**
     * stylesheets that could not be read
     */
    cssUnreadable: number;
    coverage: Coverage;
    notes: string[];
    /**
     * per control: label, kind, transition and the measured moments
     */
    elements: any[];
    sections: {
        section: string;
        animated: boolean;
    }[];
    toggles: any[];
    /**
     * result of `options.click`, or null
     */
    click: any;
    /**
     * paths of the contact sheets
     */
    sheets: string[];
    findings: Finding[];
    /**
     * findings already in the baseline
     */
    baselined: Finding[];
    /**
     * findings dropped by a config ignore
     */
    suppressed: (Finding & {
        reason: string;
    })[];
    /**
     * directory the report was written to
     */
    out: string;
};
/** @import { Page } from 'playwright' */
/**
 * @typedef {'error' | 'warning' | 'info'} Level
 *
 * @typedef {object} Finding
 * @property {string} id stable `kind:hash` fingerprint
 * @property {Level} level
 * @property {string} kind one of `kindNames()`
 * @property {string} [check] the check an `inconclusive` row could not decide
 * @property {string} element label of the control or section
 * @property {string} detail
 * @property {{ median: number, max: number }} [cadence] sampling intervals (ms) of an `inconclusive` row
 *
 * @typedef {object} Coverage
 * @property {number} candidates controls found, including those beyond `max`
 * @property {number} audited
 * @property {number} errored
 * @property {number} max
 * @property {number} [late] controls that appeared after the audit counted them
 * @property {number} [inconclusive] checks the frames were too sparse to decide
 * @property {Record<string, { count: number, examples: string[] }>} skipped skipped controls by reason
 * @property {{ candidates: number, probed: number, skipped: Record<string, number> }} toggles
 *
 * @typedef {object} AuditOptions
 * @property {string[]} [only] audit only controls matching these selectors
 * @property {number} [max] audit at most this many controls
 * @property {number} [cpu] CPU throttling rate (4 is a mid-range phone)
 * @property {string} [click] selector of a control to click for real and record
 * @property {boolean} [interrupt] with `click`: click again half-way
 * @property {boolean} [interact] also press and toggle controls for real
 * @property {string[]} [frames] selectors to write a contact sheet for
 * @property {boolean} [entrances] report sections that appear without an entrance
 * @property {string | object} [config] path of a config file, or a config object
 * @property {string | Iterable<string>} [baseline] a report.json path, or finding ids to ignore
 * @property {string} [storageState] Playwright storage state (a logged-in session); ignored when a page is passed
 * @property {string} [waitFor] selector to wait for before auditing
 * @property {boolean} [allowRedirect] audit the page the URL redirects to
 * @property {string} [out] directory for the report and contact sheets (default: a temp directory)
 * @property {string} [url] with a page: the URL to reload, when the page's own is not it
 *
 * @typedef {object} Report
 * @property {number} schemaVersion 1
 * @property {string} url
 * @property {string} finalUrl
 * @property {number} cpu
 * @property {string} mode 'observe-only' or 'interact'
 * @property {boolean} loafSupported whether the browser reports Long Animation Frames
 * @property {string[]} devServer development-build signals found on the page
 * @property {number} cssUnreadable stylesheets that could not be read
 * @property {Coverage} coverage
 * @property {string[]} notes
 * @property {any[]} elements per control: label, kind, transition and the measured moments
 * @property {{ section: string, animated: boolean }[]} sections
 * @property {any[]} toggles
 * @property {any} click result of `options.click`, or null
 * @property {string[]} sheets paths of the contact sheets
 * @property {Finding[]} findings
 * @property {Finding[]} baselined findings already in the baseline
 * @property {(Finding & { reason: string })[]} suppressed findings dropped by a config ignore
 * @property {string} out directory the report was written to
 */
/**
 * Audits the motion of a page: hover, press and focus feedback, transitions, scroll, long frames and reduced motion.
 * @param {string | Page} pageOrUrl a URL, or a Playwright page that has already been navigated
 * @param {AuditOptions} [o]
 * @returns {Promise<Report>}
 */
export declare const audit: (pageOrUrl: string | Page, o?: AuditOptions) => Promise<Report>;
/**
 * 0 clean, 1 findings that fail, 2 the audit did not cover enough to mean anything.
 * @param {Report} report
 * @param {{ strict?: boolean, minCoverage?: number }} [options] `strict`: warnings fail too; `minCoverage`: 0 to 1, audited / candidates
 * @returns {0 | 1 | 2}
 */
export declare const exitCode: (report: Report, { strict, minCoverage }?: {
    strict?: boolean;
    minCoverage?: number;
}) => 0 | 1 | 2;
