const yargs = require('yargs');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path'); // Add path module for filename parsing

// Parse command-line arguments
const argv = yargs
  .option('db', { describe: 'SQLite database file', demandOption: true, type: 'string' })
  .option('module', { describe: 'Starting module filename', demandOption: true, type: 'string' })
  .option('function', { describe: 'Starting function with arity', demandOption: true, type: 'string' })
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
const modulesMap = new Map(); // filename -> prefix
const filenamesSet = new Set();
const importsMap = new Map(); // filename -> Map(prefix -> filePath)
const nodeMap = new Map(); // id -> { filename, function, calling_id }

// Function to extract base filename without path or extension
function getBaseFilename(filename) {
  return path.basename(filename, '.xqy'); // e.g., '/opera/opera/lib/path.xqy' -> 'path'
}

// Load module and import data
async function loadData() {
  const moduleRows = await dbAll('SELECT filename, prefix FROM xqy_modules', []);
  moduleRows.forEach(row => {
    modulesMap.set(row.filename, row.prefix);
    filenamesSet.add(row.filename);
  });

  const importRows = await dbAll('SELECT filename, prefix, filePath FROM xqy_imports', []);
  importRows.forEach(row => {
    if (!importsMap.has(row.filename)) {
      importsMap.set(row.filename, new Map());
    }
    importsMap.get(row.filename).set(row.prefix, row.filePath);
  });
}

// Check for cycles in the ancestor chain
function isInAncestorChain(id, targetFilename, targetFunction) {
  let currentId = id;
  while (currentId !== null) {
    const node = nodeMap.get(currentId);
    if (node.filename === targetFilename && node.function === targetFunction) {
      return true;
    }
    currentId = node.calling_id;
  }
  return false;
}

async function buildCallStack() {
  await loadData();

  const queue = [];
  let idCounter = 0;
  const nodes = new Map(); // id -> { label, level, function, filename } (no one_over_level yet)
  const edges = [];

  // Add starting node
  const startId = ++idCounter;
  const startBaseName = getBaseFilename(argv.module);
  const startLabel = `${startBaseName}/${argv.function.split(':')[1]}`;
  queue.push({
    filename: argv.module,
    function: argv.function,
    level: 0,
    id: startId,
    calling_id: null,
    isCycle: false
  });
  nodes.set(startId, {
    label: startLabel,
    level: 0,
    function: argv.function,
    filename: argv.module
  });
  nodeMap.set(startId, { filename: argv.module, function: argv.function, calling_id: null });

  // Process the call stack
  while (queue.length > 0) {
    const current = queue.shift();

    if (current.calling_id) {
      edges.push({ source: current.calling_id, target: current.id });
    }

    if (current.isCycle) {
      continue;
    }

    try {
      const invocations = await dbAll(
        'SELECT invoked_module, invoked_function FROM xqy_invocations WHERE filename = ? AND caller = ?',
        [current.filename, current.function]
      );

      for (const invocation of invocations) {
        const M = invocation.invoked_module;
        const F = invocation.invoked_function;
        const A = current.filename;
        const C = modulesMap.get(A);

        let B;
        let assumedPrefix = false;
        if (filenamesSet.has(M)) {
          B = M;
        } else if (M === C) {
          B = A;
        } else {
          const importMap = importsMap.get(A);
          if (importMap && importMap.has(M)) {
            B = importMap.get(M);
          } else {
            B = M;
            assumedPrefix = true;
            console.warn(`Assumed invoked_module ${M} as a filepath for ${A}`);
          }
        }

        const P_B = assumedPrefix ? modulesMap.get(A) || 'unknown' : modulesMap.get(B);
        if (!P_B) {
          console.warn(`No prefix found for module ${B}, using 'unknown'`);
          const calledFunction = `unknown:${F}`;
          const newId = ++idCounter;
          const newBaseName = getBaseFilename(B);
          const newLabel = `${newBaseName}/${F}`;
          queue.push({
            filename: B,
            function: calledFunction,
            level: current.level + 1,
            id: newId,
            calling_id: current.id,
            isCycle: isInAncestorChain(current.id, B, calledFunction)
          });
          nodes.set(newId, {
            label: newLabel,
            level: current.level + 1,
            function: calledFunction,
            filename: B
          });
          nodeMap.set(newId, { filename: B, function: calledFunction, calling_id: current.id });
          continue;
        }

        const calledFunction = `${P_B}:${F}`;
        const isCycle = isInAncestorChain(current.id, B, calledFunction);
        const newId = ++idCounter;
        const newBaseName = getBaseFilename(B);
        const newLabel = `${newBaseName}/${F}`;
        queue.push({
          filename: B,
          function: calledFunction,
          level: current.level + 1,
          id: newId,
          calling_id: current.id,
          isCycle: isCycle
        });
        nodes.set(newId, {
          label: newLabel,
          level: current.level + 1,
          function: calledFunction,
          filename: B
        });
        nodeMap.set(newId, { filename: B, function: calledFunction, calling_id: current.id });
      }
    } catch (err) {
      console.error(`Error querying invocations for ${current.function}:`, err.message);
    }
  }

  // Calculate max level
  let maxLevel = 0;
  nodes.forEach(node => {
    if (node.level > maxLevel) {
      maxLevel = node.level;
    }
  });

  // Add reverse_level to all nodes
  nodes.forEach(node => {
    node.reverse_level = maxLevel - node.level;
  });

  // Generate GML content
  let gmlContent = 'graph [\n  directed 1\n';

  // Add nodes with reverse_level instead of one_over_level
  nodes.forEach((node, id) => {
    gmlContent += `  node [\n`;
    gmlContent += `    id ${id}\n`;
    gmlContent += `    label "${node.label.replace(/"/g, '\\"')}"\n`;
    gmlContent += `    level ${node.level}\n`;
    gmlContent += `    reverse_level ${node.reverse_level}\n`;
    gmlContent += `    function "${node.function.replace(/"/g, '\\"')}"\n`;
    gmlContent += `    filename "${node.filename.replace(/"/g, '\\"')}"\n`;
    gmlContent += `  ]\n`;
  });

  // Add edges
  edges.forEach(edge => {
    gmlContent += `  edge [\n    source ${edge.source}\n    target ${edge.target}\n  ]\n`;
  });

  gmlContent += ']\n';

  // Write to output.gml
  fs.writeFileSync('output.gml', gmlContent);
  console.log('Generated output.gml');
  db.close();
}

buildCallStack().catch(err => {
  console.error('Error in buildCallStack:', err);
  db.close();
});
