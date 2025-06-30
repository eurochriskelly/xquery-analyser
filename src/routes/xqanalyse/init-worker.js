import { exec } from 'child_process';
import { config } from '../../config.js';
import fs from 'fs';
import path from 'path';

export const runInit = (verbose = false) => {
    return new Promise((resolve, reject) => {
        const dbPath = `xqanalyse.db`; // Relative to basePath
        const tempDir = fs.mkdtempSync(path.join('/tmp', 'xqanalyze-'));
        const command = `/usr/local/bin/xqanalyze-worker --extract-all-functions "${dbPath}" "${tempDir}" && /usr/local/bin/xqanalyze-worker --import-checks "${dbPath}" "${tempDir}"`;

        exec(command, { cwd: config.basePath }, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                return reject(stderr);
            }
            resolve(stdout);
        });
    });
};
