import { config } from '../../config.js';

/**
 * @swagger
 * /xqanalyse/status:
 *   get:
 *     summary: Get the current status of the server
 *     responses:
 *       200:
 *         description: The current server status.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 basePath:
 *                   type: string
 */
export default (req, res) => {
    res.json({
        basePath: config.basePath
    });
};
