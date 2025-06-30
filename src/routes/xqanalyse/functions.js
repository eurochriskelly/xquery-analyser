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
 *         description: One or more modules to filter by. If not provided, all functions are returned.
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
 *                   path:
 *                     type: string
 *                   namespace:
 *                     type: string
 *                   name:
 *                     type: string
 *                   parameters:
 *                     type: string
 *       500:
 *         description: Error querying the database.
 */
export default (req, res) => {
    console.log(`[${new Date().toISOString()}] Getting functions for basePath: ${config.basePath}`);
    const db = new sqlite3.Database(`${config.basePath}/xqanalyse.db`);
    let modules = req.query.module;

    let query;
    let params = [];

    if (modules) {
        if (!Array.isArray(modules)) {
            modules = [modules];
        }
        const placeholders = modules.map(() => '?').join(',');
        query = `
            SELECT
                m.filename as module,
                m.filePath as path,
                m.uri as namespace,
                f.name,
                GROUP_CONCAT(p.parameter) as parameters
            FROM xqy_functions f
            LEFT JOIN xqy_modules m ON f.filename = m.filename
            LEFT JOIN xqy_parameters p ON f.name = p.function_name AND f.filename = p.filename
            WHERE f.filename IN (${placeholders})
            GROUP BY f.filename, f.name
        `;
        params = modules;
    } else {
        query = `
            SELECT
                m.filename as module,
                m.filePath as path,
                m.uri as namespace,
                f.name,
                GROUP_CONCAT(p.parameter) as parameters
            FROM xqy_functions f
            LEFT JOIN xqy_modules m ON f.filename = m.filename
            LEFT JOIN xqy_parameters p ON f.name = p.function_name AND f.filename = p.filename
            GROUP BY f.filename, f.name
        `;
    }

    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).send(err.message);
        }
        res.json(rows);
    });

    db.close();
};
