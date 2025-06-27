import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';

inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

const argv = yargs(hideBin(process.argv))
  .option('db', { describe: 'SQLite database file', demandOption: true, type: 'string' })
  .option('module', { describe: 'Starting module filename', type: 'string' })
  .option('function', { describe: 'Starting function with arity', type: 'string' })
  .option('interactive', { describe: 'Run in interactive mode', type: 'boolean', default: false })
  .check((argv) => {
    if (!argv.interactive && (!argv.module || !argv.function)) {
      throw new Error('Must provide --module and --function unless --interactive is used');
    }
    return true;
  })
  .argv;

// Connect to the database
console.log(`[build-stack.js] Database path received: ${argv.db}`);
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
const modulesMap = new Map();
const filenamesSet = new Set();
const importsMap = new Map();
const nodeMap = new Map();
const functionCallCounts = new Map();

// Function to extract base filename without path or extension
function getBaseFilename(filename) {
  return path.basename(filename, '.xqy');
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

// Interactive selection of module and function
async function selectModuleAndFunction() {
  // Get list of modules
  const modules = await dbAll('SELECT DISTINCT filename FROM xqy_modules ORDER BY filename', []);
  const moduleChoices = modules.map(row => row.filename);

  const { module } = await inquirer.prompt({
    type: 'autocomplete',
    name: 'module',
    message: 'Select a module (type to filter, arrow keys to navigate):',
    source: async (answersSoFar, input) => {
      input = input || '';
      return moduleChoices.filter(choice => choice.toLowerCase().includes(input.toLowerCase()));
    }
  });

  const selectedModule = module;

  // Get list of functions for the selected module
  const functions = await dbAll(
    'SELECT name, loc, invertedLoc FROM extended_xqy_functions WHERE filename = ? ORDER BY name',
    [selectedModule]
  );
  // Return objects with properties: name, loc, invertedLoc
  const functionChoices = functions.map(row => ({ name: row.name, loc: row.loc, invertedLoc: row.invertedLoc }));

  const { func } = await inquirer.prompt({
    type: 'autocomplete',
    name: 'func',
    message: 'Select a function (type to filter, arrow keys to navigate):',
    source: async (answersSoFar, input) => {
      input = input || '';
      return functionChoices.filter(choice => choice.name.toLowerCase().includes(input.toLowerCase()));
    }
  });

  return { module: selectedModule, function: func };
}

async function buildCallStack(selectedModule, selectedFunction) {
  await loadData();

  const queue = [];
  let idCounter = 0;
  const nodes = new Map();
  const edges = [];

  // Add starting node
  const startId = ++idCounter;
  const startBaseName = getBaseFilename(selectedModule);

  // Support both interactive (object) and non-interactive (string) selectedFunction
  let localFuncName, loc, invertedLoc;
  if (typeof selectedFunction === 'object') {
    localFuncName = selectedFunction.name;
    loc = selectedFunction.loc;
    invertedLoc = selectedFunction.invertedLoc;
  } else {
    const parts = selectedFunction.split(':');
    localFuncName = parts.length > 1 ? parts[1] : selectedFunction;
    loc = null;
    invertedLoc = null;
  }
  const prefix = modulesMap.get(selectedModule) || '';
  const qualifiedFunction = prefix ? `${prefix}:${localFuncName}` : localFuncName;
  const startLabel = `${startBaseName}/${localFuncName}`;

  queue.push({
    filename: selectedModule,
    function: qualifiedFunction,
    level: 0,
    id: startId,
    calling_id: null,
    isCycle: false
  });
  nodes.set(startId, {
    label: startLabel,
    level: 0,
    function: qualifiedFunction,
    filename: selectedModule,
    loc: loc,
    invertedLoc: invertedLoc
  });
  nodeMap.set(startId, { filename: selectedModule, function: qualifiedFunction, calling_id: null });
  functionCallCounts.set(qualifiedFunction, (functionCallCounts.get(qualifiedFunction) || 0) + 1);

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
          functionCallCounts.set(calledFunction, (functionCallCounts.get(calledFunction) || 0) + 1);
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
        functionCallCounts.set(calledFunction, (functionCallCounts.get(calledFunction) || 0) + 1);
      }
    } catch (err) {
      console.error(`Error querying invocations for ${current.function}:`, err.message);
    }
  }

  // Calculate max level and add reverse_level and call_count to nodes
  let maxLevel = 0;
  nodes.forEach(node => {
    if (node.level > maxLevel) {
      maxLevel = node.level;
    }
  });

  nodes.forEach(node => {
    node.reverse_level = maxLevel - node.level;
    node.call_count = functionCallCounts.get(node.function);
  });

  // Generate GML content
  let gmlContent = 'graph [\n  directed 1\n';
  nodes.forEach((node, id) => {
    gmlContent += `  node [\n`;
    gmlContent += `    id ${id}\n`;
    gmlContent += `    label "${node.label.replace(/"/g, '\\"')}"\n`;
    gmlContent += `    level ${node.level}\n`;
    gmlContent += `    reverse_level ${node.reverse_level}\n`;
    gmlContent += `    loc ${node.loc}\n`;
    gmlContent += `    inverted_loc ${node.invertedLoc}\n`;
    gmlContent += `    call_count ${node.call_count}\n`;
    gmlContent += `    function "${node.function.replace(/"/g, '\\"')}"\n`;
    gmlContent += `    filename "${node.filename.replace(/"/g, '\\"')}"\n`;
    gmlContent += `  ]\n`;
  });
  edges.forEach(edge => {
    gmlContent += `  edge [\n    source ${edge.source}\n    target ${edge.target}\n  ]\n`;
  });
  gmlContent += ']\n';

  fs.writeFileSync('output.gml', gmlContent);
  console.log('Generated output.gml');
  db.close();
}

// Main execution
async function main() {
  let module = argv.module;
  let func = argv.function;

  if (argv.interactive) {
    const selections = await selectModuleAndFunction();
    module = selections.module;
    func = selections.function;
  }

  await buildCallStack(module, func);
}

main().catch(err => {
  console.error('Error:', err);
  db.close();
});
