import sqlite3 from 'sqlite3';
import { config } from '../../config.js';

/**
 * @swagger
 * /xqanalyse/modules:
 *   get:
 *     summary: Get a list of top-level modules
 *     parameters:
 *       - in: query
 *         name: match
 *         schema:
 *           type: string
 *         description: A string to filter modules by.
 *     responses:
 *       200:
 *         description: A list of modules.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *       500:
 *         description: Error querying the database.
 */
export default (req, res) => {
    console.log(`[${new Date().toISOString()}] Getting modules for basePath: ${config.basePath}`);
    const db = new sqlite3.Database(`${config.basePath}/xqanalyse.db`);
    const match = req.query.match || '';
    const query = `
        SELECT DISTINCT filename FROM xqy_modules
        WHERE filename LIKE ?
    `;

    db.all(query, [`%${match}%`], (err, rows) => {
        if (err) {
            return res.status(500).send(err.message);
        }
        res.json(rows.map(row => row.filename));
    });

    db.close();
};
