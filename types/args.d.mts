export declare class UsageError extends Error {
}
export declare const USAGE = "motion-audit <url|file> [options]\nmotion-audit compare <ref.json> <mine.json>\n\n  --only <selector>       audit only elements matching it (repeatable)\n  --max <n>               audit at most n controls (default 40)\n  --cpu <rate>            throttle the CPU (4 is a mid-range phone)\n  --interact              also press and toggle controls for real (denylist applies); default is observe-only\n  --click <selector>      record 1.5 s after a real click on it\n  --interrupt             with --click: click again half-way\n  --frames [<selector>]   write a contact sheet of its hover and press (repeatable); without a selector, of the --click target\n  --entrances             report sections that appear without an entrance (info)\n  --config <file>         config file (default ./motion-audit.config.json)\n  --baseline <report>     ignore findings already present in an earlier report.json\n  --storage-state <file>  Playwright storage state (logged-in session)\n  --wait-for <selector>   wait for it before auditing (hydration)\n  --allow-redirect        audit the page the URL redirects to (a login page is never audited)\n  --min-coverage <0-1>    exit 2 when audited/candidates is lower (candidates include controls beyond --max)\n  --out <dir>             report and contact sheets (default: a temp directory)\n  --strict                warnings fail too\n  --json                  print the report as JSON (schemaVersion 1)\n  --help                  this text\n\nWithout <url|file> the APP_URL environment variable is used. A page on the internet that answers a bot wall or an\nerror page (status 400 or more, a challenge title or text) is not audited.\n\nExit: 0 clean, 1 findings, 2 could not run or audited nothing.";
export declare const parseArgs: (argv: any) => {
    opts: {
        only: any[];
        frames: any[];
    };
    positional: any[];
};
