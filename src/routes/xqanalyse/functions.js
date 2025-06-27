import sqlite3 from 'sqlite3';
import { config } from '../../config.js';

/**
 * @swagger
 * /xqanalyse/functions:
 *   get:
 *     summary: Get a list of functions
 *     parameters:
 *       - in: query
 *         name: module
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         style: form
 *         explode: true
 *         description: One or more modules to filter by.
 *     responses:
 *       200:
 *         description: A list of functions.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   module:
 *                     type: string
 *                   name:
 *                     type: string
 *       500:
 *         description: Error querying the database.
 */
export default (req, res) => {
    console.log(`[${new Date().toISOString()}] Getting functions for basePath: ${config.basePath}`);
    const db = new sqlite3.Database(`${config.basePath}/xqanalyse.db`);
    let modules = req.query.module;

    if (!modules) {
        return res.status(400).send('Missing module parameter');
    }

    if (!Array.isArray(modules)) {
        modules = [modules];
    }

    const placeholders = modules.map(() => '?').join(',');
    const query = `
        SELECT filename as module, name FROM xqy_functions
        WHERE filename IN (${placeholders})
    `;

    db.all(query, modules, (err, rows) => {
        if (err) {
            return res.status(500).send(err.message);
        }
        res.json(rows);
    });

    db.close();
};
