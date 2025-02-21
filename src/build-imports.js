import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

// Parse command-line arguments
const argv = yargs(hideBin(process.argv))
  .option('db', { describe: 'SQLite database file', demandOption: true, type: 'string' })
  .option('remove-isolated', { describe: 'Remove modules with no edges', type: 'boolean', default: false })
  .argv;

// Connect to the database
const db = new sqlite3.Database(argv.db, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
    process.exit(1);
  }
});

// Promisify db.all for async/await
const dbAll = (sql, params) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

// Initialize data structures
const modulesMap = new Map(); // filename -> { prefix, numFunctions, numLines }
const importsMap = new Map(); // filename -> Map(prefix -> filePath)
const filenamesSet = new Set();
const edgeMap = new Map(); // `${sourceFilename}:${targetFilename}:${function}` -> invocation count
const connectedModules = new Set(); // Track modules with edges

// Special handling for MarkLogic libraries
const MARKLOGIC_LIBRARY = 'MarkLogic-Library';

// Load module and import data
async function loadData() {
  // Load modules
  const moduleRows = await dbAll('SELECT filename, prefix, numFunctions, numLines FROM xqy_modules', []);
  moduleRows.forEach(row => {
    if (!row.filename) {
      console.warn('Skipping module row with missing filename:', row);
      return;
    }
    const moduleData = {
      prefix: row.prefix || 'unknown',
      numFunctions: row.numFunctions !== null && row.numFunctions !== undefined ? row.numFunctions : 0,
      numLines: row.numLines !== null && row.numLines !== undefined ? row.numLines : 0
    };
    modulesMap.set(row.filename, moduleData);
    filenamesSet.add(row.filename);
  });

  // Add a generic MarkLogic library node
  modulesMap.set(MARKLOGIC_LIBRARY, {
    prefix: 'ml',
    numFunctions: 0,
    numLines: 0
  });
  filenamesSet.add(MARKLOGIC_LIBRARY);

  // Load imports
  const importRows = await dbAll('SELECT filename, prefix, filePath FROM xqy_imports', []);
  importRows.forEach(row => {
    if (!row.filename) {
      console.warn('Skipping import row with missing filename:', row);
      return;
    }
    if (!importsMap.has(row.filename)) {
      importsMap.set(row.filename, new Map());
    }
    importsMap.get(row.filename).set(row.prefix || 'unknown', row.filePath || '');
  });
}

// Resolve relative paths
function resolveRelativePath(sourceFilename, relativePath) {
  const sourceDir = path.dirname(sourceFilename);
  return path.resolve(sourceDir, relativePath).replace(/\\/g, '/');
}

// Escape special characters for GML
function escapeGmlString(str) {
  if (str === null || str === undefined) return '';
  return str.replace(/"/g, '\\"');
}

// Build the module dependency graph
async function buildModuleGraph() {
  await loadData();

  // Fetch all invocations
  const invocations = await dbAll('SELECT filename, caller, invoked_module, invoked_function FROM xqy_invocations', []);

  // Process each invocation
  for (const inv of invocations) {
    const sourceFilename = inv.filename;
    let M = inv.invoked_module;
    const F = inv.invoked_function;
    const C = modulesMap.get(sourceFilename)?.prefix;

    if (!sourceFilename || !modulesMap.has(sourceFilename)) {
      console.warn(`Skipping invocation due to invalid source module ${sourceFilename}`);
      continue;
    }
    if (!C) {
      console.warn(`No prefix found for source module ${sourceFilename}`);
      continue;
    }

    // Resolve the target module filename (B)
    let targetFilename;
    if (M && M.startsWith('/MarkLogic/')) {
      targetFilename = MARKLOGIC_LIBRARY;
    } else if (M && filenamesSet.has(M)) {
      targetFilename = M;
    } else if (M === C) {
      targetFilename = sourceFilename;
    } else if (M && (M.startsWith('./') || M.startsWith('../'))) {
      targetFilename = resolveRelativePath(sourceFilename, M);
      if (!filenamesSet.has(targetFilename)) {
        console.warn(`Resolved relative path ${targetFilename} not found in xqy_modules for ${sourceFilename}`);
        continue;
      }
    } else if (M) {
      const importMap = importsMap.get(sourceFilename);
      if (importMap && importMap.has(M)) {
        targetFilename = importMap.get(M);
      } else {
        console.warn(`Cannot resolve invoked_module ${M} for ${sourceFilename}`);
        continue;
      }
    } else {
      console.warn(`Invalid invoked_module for ${sourceFilename}:`, inv);
      continue;
    }

    if (!modulesMap.has(targetFilename)) {
      console.warn(`Target module ${targetFilename} not found in xqy_modules`);
      continue;
    }

    // Track connected modules
    connectedModules.add(sourceFilename);
    connectedModules.add(targetFilename);

    // Construct the full function name for the edge label
    const targetPrefix = modulesMap.get(targetFilename).prefix;
    const calledFunction = `${targetPrefix}:${F}`;

    // Create a unique key for the edge
    const edgeKey = `${sourceFilename}:${targetFilename}:${calledFunction}`;

    // Increment invocation count
    edgeMap.set(edgeKey, (edgeMap.get(edgeKey) || 0) + 1);
  }

  // Log connected modules for debugging
  console.log('Connected modules:', Array.from(connectedModules));

  // Filter nodes based on --remove-isolated
  const nodesToInclude = new Map();
  modulesMap.forEach((module, filename) => {
    if (!module || typeof module !== 'object' || !module.prefix || module.numFunctions === undefined || module.numLines === undefined) {
      console.warn(`Skipping invalid module data for ${filename}:`, module);
      return;
    }
    if (!argv.removeIsolated || connectedModules.has(filename)) {
      nodesToInclude.set(filename, module);
    }
  });

  // Assign unique IDs to included modules
  const moduleIds = new Map();
  let idCounter = 1;
  nodesToInclude.forEach((_, filename) => {
    moduleIds.set(filename, idCounter++);
  });

  // Generate GML content
  let gmlContent = 'graph [\n  directed 1\n';

  // Add nodes (modules)
  nodesToInclude.forEach((module, filename) => {
    const nodeId = moduleIds.get(filename);
    const label = `${filename}#${module.numFunctions}`;
    gmlContent += `  node [\n`;
    gmlContent += `    id ${nodeId}\n`;
    gmlContent += `    label "${escapeGmlString(label)}"\n`;
    gmlContent += `    numFunctions ${module.numFunctions}\n`;
    gmlContent += `    numLines ${module.numLines}\n`;
    gmlContent += `    filename "${escapeGmlString(filename)}"\n`;
    gmlContent += `  ]\n`;
  });

  // Add edges (module-to-module calls)
  edgeMap.forEach((numInvocations, edgeKey) => {
    const [sourceFilename, targetFilename, ...functionParts] = edgeKey.split(':');
    const calledFunction = functionParts.join(':');
    const sourceId = moduleIds.get(sourceFilename);
    const targetId = moduleIds.get(targetFilename);
    const functionName = calledFunction.split(':')[1] || calledFunction;

    if (!sourceId || !targetId) {
      console.warn(`Skipping edge due to missing module ID: ${edgeKey}`);
      return;
    }

    gmlContent += `  edge [\n`;
    gmlContent += `    source ${sourceId}\n`;
    gmlContent += `    target ${targetId}\n`;
    gmlContent += `    label "${escapeGmlString(functionName)}"\n`;
    gmlContent += `    numInvocations ${numInvocations}\n`;
    gmlContent += `  ]\n`;
  });

  gmlContent += ']\n';

  // Write to imports.gml
  fs.writeFileSync('imports.gml', gmlContent);
  console.log('Generated imports.gml');
  db.close();
}

// Main execution
async function main() {
  await buildModuleGraph();
}

main().catch(err => {
  console.error('Error:', err);
  db.close();
});
