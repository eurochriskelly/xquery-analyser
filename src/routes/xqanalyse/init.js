import { exec } from 'child_process';
import { config } from '../../config.js';

/**
 * @swagger
 * /xqanalyse/init:
 *   put:
 *     summary: Initialize the database
 *     description: Analyzes the codebase and generates an SQLite database. This can take a minute or two.
 *     responses:
 *       200:
 *         description: Initialization successful.
 *       500:
 *         description: Error during initialization.
 */
export default (req, res) => {
    console.log(`[${new Date().toISOString()}] Initializing analysis for basePath: ${config.basePath}`);
    exec(`xqanalyze --init --base-folder="${config.basePath}"`, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).send(stderr);
        }
        res.send(stdout);
    });
};
