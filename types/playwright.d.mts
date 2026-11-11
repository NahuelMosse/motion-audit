export declare const versionAtLeast: (version: any, min?: number[]) => boolean;
export declare const loadPlaywright: (env?: NodeJS.ProcessEnv, cwd?: string) => {
    chromium: any;
    version: any;
    from: string;
};
