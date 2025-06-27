import { config } from '../../config.js';

/**
 * @swagger
 * /xqanalyse/base:
 *   put:
 *     summary: Set the base folder for analysis
 *     parameters:
 *       - in: query
 *         name: folder
 *         schema:
 *           type: string
 *         required: true
 *         description: The absolute path to the folder to operate on.
 *     responses:
 *       200:
 *         description: Base path set successfully.
 *       400:
 *         description: Missing folder parameter.
 */
export default (req, res) => {
    const folder = req.query.folder;
    if (!folder) {
        return res.status(400).send('Missing folder parameter');
    }
    config.basePath = folder;
    console.log(`[${new Date().toISOString()}] Base path set to: ${config.basePath}`);
    res.send(`Base path set to ${config.basePath}`);
};
