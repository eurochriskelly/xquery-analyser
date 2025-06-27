import { exec } from 'child_process';
import { config } from '../../config.js';

/**
 * @swagger
 * /xqanalyse/analyse:
 *   put:
 *     summary: Analyse a function
 *     description: Generates a call stack graph for a specific function in a module.
 *     parameters:
 *       - in: query
 *         name: module
 *         schema:
 *           type: string
 *         required: true
 *         description: The module to analyze.
 *       - in: query
 *         name: function
 *         schema:
 *           type: string
 *         required: true
 *         description: The function to analyze.
 *     responses:
 *       200:
 *         description: Analysis successful.
 *       400:
 *         description: Missing module or function parameter.
 *       500:
 *         description: Error during analysis.
 */
export default (req, res) => {
    console.log(`[${new Date().toISOString()}] Analyzing function for basePath: ${config.basePath}`);
    const { module, function: func } = req.query;
    if (!module || !func) {
        return res.status(400).send('Missing module or function parameter');
    }
    exec(`cd ${config.basePath} && xqanalyze --module ${module} --function ${func}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).send(stderr);
        }
        res.send(stdout);
    });
};
