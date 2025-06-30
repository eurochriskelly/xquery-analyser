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

        // 1. Fetch all data from the database
        const rawFunctions = await dbAll('SELECT * FROM extended_xqy_functions');
        const allInvocations = await dbAll('SELECT * FROM xqy_invocations');
        const allModules = await dbAll('SELECT * FROM xqy_modules');
        const allImports = await dbAll('SELECT * FROM xqy_imports');
        const allParameters = await dbAll('SELECT * FROM xqy_parameters');

        // 2. Process and enrich the data in the application
        const modulesByFilename = new Map(allModules.map(r => [r.filename, r]));
        const importsMap = new Map();
        allImports.forEach(row => {
            if (!importsMap.has(row.filename)) {
                importsMap.set(row.filename, new Map());
            }
            importsMap.get(row.filename).set(row.prefix, row.filePath);
        });

        const allFunctions = rawFunctions.map(f => {
            const baseName = f.name.split('#')[0];
            const parameters = allParameters.filter(p => p.filename === f.filename && p.function_name.split('#')[0] === baseName);
            const arity = parameters.length;
            const module = modulesByFilename.get(f.filename);
            return {
                ...f,
                file: f.filename, // Use the function's own filename as the logical path
                baseName: baseName, // Original name without arity
                name: `${baseName}#${arity}`, // Fully qualified name with arity
                arity: arity,
                parameters: parameters
            };
        });


        // 3. Find the root function
        const rootFunction = allFunctions.find(f =>
            f.file === moduleIdentifier && f.name === funcIdentifier
        );

        if (!rootFunction) {
            const functionsInModule = allFunctions
                .filter(f => f.file === moduleIdentifier)
                .map(f => f.name);
            
            const message = `Function '${funcIdentifier}' in module '${moduleIdentifier}' not found.`;

            if (functionsInModule.length > 0) {
                return res.status(404).json({ 
                    error: message,
                    available_functions: functionsInModule
                });
            } else {
                return res.status(404).json({ error: `${message} The module was not found or contains no functions.` });
            }
        }

        // 4. Build the filtered call stack using a robust traversal algorithm
        const getCallStack = (rootFunc) => {
            const stackFunctions = new Map();
            const stackInvocations = new Set();
            const queue = [rootFunc];
            const visited = new Set([rootFunc.name]);

            while (queue.length > 0) {
                const currentFunc = queue.shift();
                stackFunctions.set(currentFunc.name, currentFunc);
                console.log(`Processing function: ${currentFunc.name} from module ${currentFunc.filename}`);

                const childrenInvocations = allInvocations.filter(inv =>
                    inv.caller === currentFunc.baseName && inv.filename === currentFunc.filename
                );
                console.log(`  Found ${childrenInvocations.length} invocations from ${currentFunc.name}`);

                for (const inv of childrenInvocations) {
                    stackInvocations.add(inv);
                    console.log(`    Processing invocation: ${inv.caller} calls ${inv.invoked_function} in module ${inv.invoked_module}`);

                    let invokedModuleFilename = null;

                    if (inv.invoked_module === null) { // Call within the same module
                        invokedModuleFilename = inv.filename;
                        console.log(`      Resolved invokedModuleFilename (same module): ${invokedModuleFilename}`);
                    } else if (modulesByFilename.has(inv.invoked_module)) { // invoked_module is already a filename
                        invokedModuleFilename = inv.invoked_module;
                        console.log(`      Resolved invokedModuleFilename (direct filename): ${invokedModuleFilename}`);
                    } else { // invoked_module is a prefix, need to resolve via imports
                        const importMap = importsMap.get(inv.filename); // Imports for the calling module
                        if (importMap && importMap.has(inv.invoked_module)) {
                            const importedFilePath = importMap.get(inv.invoked_module);
                            const importedModule = allModules.find(m => m.filePath === importedFilePath);
                            if (importedModule) {
                                invokedModuleFilename = importedModule.filename;
                                console.log(`      Resolved invokedModuleFilename (via import prefix): ${invokedModuleFilename}`);
                            } else {
                                console.log(`      Could not find imported module for filePath: ${importedFilePath}`);
                            }
                        } else {
                            console.log(`      Could not find import map for module ${inv.filename} or prefix ${inv.invoked_module}`);
                        }
                    }

                    if (invokedModuleFilename) {
                        const childFuncs = allFunctions.filter(f =>
                            f.filename === invokedModuleFilename && f.baseName === inv.invoked_function
                        );
                        console.log(`      Found ${childFuncs.length} potential child functions for ${inv.invoked_function} in ${invokedModuleFilename}`);

                        for (const childFunc of childFuncs) {
                            if (!visited.has(childFunc.name)) {
                                visited.add(childFunc.name);
                                queue.push(childFunc);
                                console.log(`        Adding child function to queue: ${childFunc.name}`);
                            } else {
                                console.log(`        Child function already visited: ${childFunc.name}`);
                            }
                        }
                    } else {
                        console.log(`      Skipping invocation due to unresolved invokedModuleFilename for ${inv.invoked_function}`);
                    }
                }
            }

            return {
                functions: Array.from(stackFunctions.values()),
                invocations: Array.from(stackInvocations)
            };
        };

        const callStack = getCallStack(rootFunction);

        const finalFunctions = callStack.functions.map(f => {
            const { baseName, arity, ...rest } = f;
            return { ...rest, name: baseName };
        });

        res.json({
            functions: finalFunctions,
            invocations: callStack.invocations
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        db.close();
    }
};
