import sqlite3 from 'sqlite3';
import { config } from '../../config.js';

/**
 * @swagger
 * /xqanalyse/stack:
 *   get:
 *     summary: Get a filtered list of functions and invocations for a specific call stack.
 *     parameters:
 *       - in: query
 *         name: module
 *         schema:
 *           type: string
 *         required: true
 *         description: The module identifier (logical path), as returned by the /functions endpoint.
 *         example: /opera/opera/lib/besluit.xqy
 *       - in: query
 *         name: function
 *         schema:
 *           type: string
 *         required: true
 *         description: The function identifier, with the hash URL-encoded (e.g., "local:my-function%232").
 *         example: local:opslaan-besluit%233
 *     responses:
 *       200:
 *         description: A JSON object containing the filtered functions and invocations for the requested call stack.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CallStackData'
 *       400:
 *         description: Missing or invalid parameters.
 *       404:
 *         description: The specified function or module could not be found.
 *       500:
 *         description: Error querying the database.
 */
export default async (req, res) => {
    console.log(`[${new Date().toISOString()}] Getting stack for basePath: ${config.basePath}`);
    const db = new sqlite3.Database(`${config.basePath}/xqanalyse.db`, sqlite3.OPEN_READONLY);
    const { module: moduleIdentifier, function: funcIdentifier } = req.query;

    if (!moduleIdentifier || !funcIdentifier) {
        db.close();
        return res.status(400).json({ error: 'Missing module or function parameter.' });
    }

    try {
        const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // --- Pre-load lookup maps (efficient for path resolution) ---
        const allModules = await dbAll('SELECT * FROM xqy_modules');
        const modulesByFilename = new Map(allModules.map(r => [r.filename, r]));
        const modulesByPrefix = new Map();
        allModules.forEach(r => {
            if (r.prefix) {
                modulesByPrefix.set(r.prefix, r.filename);
            }
        });

        const allImports = await dbAll('SELECT * FROM xqy_imports');
        const importsMap = new Map();
        allImports.forEach(row => {
            if (!importsMap.has(row.filename)) {
                importsMap.set(row.filename, new Map());
            }
            importsMap.get(row.filename).set(row.prefix, row.filePath);
        });

        // --- Iterative Call Stack Traversal ---
        const stackFunctions = new Map();
        const stackInvocations = new Set();
        const queue = [{ filePath: moduleIdentifier, internalName: funcIdentifier }];
        const visited = new Set();

        while (queue.length > 0) {
            const { filePath, internalName } = queue.shift();
            const visitedKey = `${filePath}@${internalName}`;

            if (visited.has(visitedKey)) {
                continue;
            }
            visited.add(visitedKey);

            // 1. Get Function Details
            const [baseName] = internalName.split('#');
            // The function name in the DB might have an arity or not, so check for both.
            const funcRows = await dbAll('SELECT * FROM extended_xqy_functions WHERE filename = ? AND (name = ? OR name = ?)', [filePath, baseName, internalName]);
            
            if (funcRows.length === 0) {
                console.warn(`[stack.js] Function ${internalName} in module ${filePath} not found in DB.`);
                continue;
            }
            const f = funcRows[0];

            // The function_name in parameters might have an arity or not.
            const params = await dbAll('SELECT * FROM xqy_parameters WHERE filename = ? AND (function_name = ? OR function_name = ?)', [filePath, baseName, internalName]);
            const functionParameters = params.map(p => ({ name: p.parameter, type: p.type }));
            const arity = functionParameters.length;
            const actualInternalName = `${baseName}#${arity}`;

            // For the root function, validate that the requested arity was correct.
            if (stackFunctions.size === 0 && actualInternalName !== funcIdentifier) {
                return res.status(404).json({ 
                    error: `Function '${funcIdentifier}' in module '${moduleIdentifier}' not found. Did you mean '${actualInternalName}'?`
                });
            }

            const functionObject = {
                filePath: f.filename,
                name: baseName,
                arity: arity,
                line: f.line ? parseInt(f.line, 10) : null,
                private: f.private === 1,
                loc: f.loc ? parseInt(f.loc, 10) : null,
                numInvocations: f.numInvocations ? parseInt(f.numInvocations, 10) : 0,
                invertedLoc: f.invertedLoc,
                parameters: functionParameters,
                internal_name: actualInternalName
            };
            stackFunctions.set(visitedKey, functionObject);

            // 2. Get Invocations for this function
            const childrenInvocations = await dbAll('SELECT * FROM xqy_invocations WHERE filename = ? AND caller = ?', [filePath, actualInternalName]);

            for (const inv of childrenInvocations) {
                // 3. Resolve invoked module path
                let invokedModuleFilename = null;
                const currentModule = modulesByFilename.get(inv.filename);
                if (inv.invoked_module === null) { // local:
                    invokedModuleFilename = inv.filename;
                } else if (modulesByFilename.has(inv.invoked_module)) { // full path
                    invokedModuleFilename = inv.invoked_module;
                } else if (currentModule && currentModule.prefix === inv.invoked_module) { // own prefix
                    invokedModuleFilename = inv.filename;
                } else { // imported prefix or global prefix
                    const importMap = importsMap.get(inv.filename);
                    if (importMap && importMap.has(inv.invoked_module)) {
                        invokedModuleFilename = importMap.get(inv.invoked_module);
                    } else if (modulesByPrefix.has(inv.invoked_module)) {
                        invokedModuleFilename = modulesByPrefix.get(inv.invoked_module);
                    } else {
                        invokedModuleFilename = inv.invoked_module;
                        console.warn(`[stack.js] Could not resolve prefix '${inv.invoked_module}'. Assuming it is a filepath for an invocation in '${inv.filename}'`);
                    }
                }

                if (invokedModuleFilename) {
                    // 4. Determine invoked function's arity to build its internal_name
                    const invokedParams = await dbAll('SELECT parameter FROM xqy_parameters WHERE filename = ? AND function_name = ?', [invokedModuleFilename, inv.invoked_function]);
                    const invokedArity = invokedParams.length;
                    const invokedInternalName = `${inv.invoked_function}#${invokedArity}`;

                    stackInvocations.add({
                        callerInternalName: inv.caller,
                        invokedInternalName: invokedInternalName
                    });

                    queue.push({ filePath: invokedModuleFilename, internalName: invokedInternalName });
                }
            }
        }

        // --- Final Formatting ---
        const finalFunctions = Array.from(stackFunctions.values()).map(f => {
            const { internal_name, ...rest } = f;
            return rest;
        });

        const finalInvocations = Array.from(stackInvocations).map(inv => {
            const [callerName, callerArityStr] = inv.callerInternalName.split('#');
            const [invokedName, invokedArityStr] = inv.invokedInternalName.split('#');
            
            const callerFunc = [...stackFunctions.values()].find(f => f.internal_name === inv.callerInternalName);
            const invokedFunc = [...stackFunctions.values()].find(f => f.internal_name === inv.invokedInternalName);

            return {
                callerFilePath: callerFunc ? callerFunc.filePath : null,
                callerName: callerName,
                callerArity: parseInt(callerArityStr, 10),
                invokedFilePath: invokedFunc ? invokedFunc.filePath : null,
                invokedName: invokedName,
                invokedArity: parseInt(invokedArityStr, 10)
            };
        });

        res.json({
            functions: finalFunctions,
            invocations: finalInvocations.filter(inv => inv.callerFilePath && inv.invokedFilePath) // Filter out incomplete invocations
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        db.close();
    }
};
