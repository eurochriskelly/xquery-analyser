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
import { runInit } from './init-worker.js';

export default async (req, res) => {
    console.log(`[${new Date().toISOString()}] Initializing analysis for basePath: ${config.basePath}`);
    try {
        const result = await runInit();
        res.send(result);
    } catch (error) {
        res.status(500).send(error);
    }
};
