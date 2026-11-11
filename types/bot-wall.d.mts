/** Whether `url` is an http(s) page outside this machine. */
export declare const isExternal: (url: any) => boolean;
/**
 * The reason an answer is a bot wall or an error page, or null when it looks like the site.
 * @param {{ status: number, html: string }} answer
 * @returns {string | null}
 */
export declare const wallReason: ({ status, html }: {
    status: number;
    html: string;
}) => string | null;
/**
 * Asks `url` for its page and returns the reason it is a bot wall or an error page, or null (also when it is not an
 * external page, or does not answer: the audit then reports its own error).
 * @param {string} url
 * @param {{ fetch?: typeof fetch }} [deps]
 * @returns {Promise<string | null>}
 */
export declare const httpWall: (url: string, { fetch: get }?: {
    fetch?: typeof fetch;
}) => Promise<string | null>;
export declare const wallMessage: (url: any, reason: any) => string;
