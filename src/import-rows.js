const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Command-line arguments parsing
const args = process.argv.slice(2);
let fileName, inputList;

let withHeader = false;

args.forEach(arg => {
  const [key, value] = arg.split('=');
  switch (key) {
    case '--file-name':
      fileName = value;
      break;
    case '--input-list':
      inputList = value;
      break;
    case '--with-header':
      withHeader = value === 'true';
      break;
    default:
      console.warn(`Unknown argument: ${key}`);
  }
});

if (!fileName || !inputList) {
  console.error('Error: Please provide --file-name and --input-list arguments');
  process.exit(1);
}

// Read the list of local modules from input list
const localModules = new Set();
const rl = readline.createInterface({
  input: fs.createReadStream(inputList),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  localModules.add(line.trim().replace('ml-modules/root', ''));
}).on('close', () => {
  processFile(fileName);
});

function processFile(file) {
  const xqyData = fs.readFileSync(file, 'utf8');
  const importRegex = /import\s+module\s+namespace\s+(\w+)\s*=\s*"([^"]+)"\s+at\s+"([^"]+)";/g;

  const csvRows = [];

  let match;
  while ((match = importRegex.exec(xqyData)) !== null) {
    const abbrev = match[1];
    const namespace = match[2];
    const modulePath = match[3];

    // Check if the module is part of the local modules
    const local = localModules.has(modulePath);

    csvRows.push({
      abbrev,
      namespace,
      path: modulePath,
      client: fileName.replace('ml-modules/root', ''),
      local: local ? 'true' : 'false'
    });
  }

  outputCSV(csvRows);
}

function outputCSV(rows) {
  const columns = ['abbrev', 'namespace', 'path', 'client', 'local'];

  // Print the header
  if (withHeader) console.log(columns.join(','));

  // Print each row
  rows.forEach(row => {
    console.log([row.abbrev, row.namespace, row.path, row.client, row.local].join(','));
  });
}
