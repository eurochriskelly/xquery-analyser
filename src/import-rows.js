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
  const data = JSON.parse(xqyData);

  // --- Namespaces ---
  const nsRows = [];
  if (data.namespace) {
    nsRows.push({
      file: data.file,
      prefix: data.namespace.prefix,
      uri: data.namespace.uri,
      filePath: data.namespace.filePath
    });
  }
  if (data.imports) {
    data.imports.forEach(imp => {
      nsRows.push({
        file: data.file,
        prefix: imp.namespace.prefix,
        uri: imp.namespace.uri,
        filePath: imp.namespace.filePath
      });
    });
  }
  outputCSV(nsRows, ['file','prefix','uri','filePath'], 'namespaces.csv');

  // --- Functions, Invocations & Parameters ---
  const funcRows = [];
  const invocRows = [];
  const paramRows = [];
  if (data.functions) {
    data.functions.forEach(func => {
      funcRows.push({
        file: data.file,
        name: func.name,
        line: func.line,
        signature: func.signature
      });
      if (func.invocations) {
        Object.entries(func.invocations).forEach(([modUri, funcs]) => {
          funcs.forEach(invFunc => {
            invocRows.push({
              file: data.file,
              caller: func.name,
              invoked_module: modUri,
              invoked_function: invFunc
            });
          });
        });
      }
      if (func.parameters) {
        Object.entries(func.parameters).forEach(([param, type]) => {
          paramRows.push({
            file: data.file,
            function_name: func.name,
            parameter: param,
            type: type.trim().replace(/\n\)$/, '')
          });
        });
      }
    });
  }
  outputCSV(funcRows, ['file','name','line','signature'], 'functions.csv');
  outputCSV(invocRows, ['file','caller','invoked_module','invoked_function'], 'invocations.csv');
  outputCSV(paramRows, ['file','function_name','parameter','type'], 'parameters.csv');
}

function outputCSV(rows, columns, outFile) {
  const csvStream = fs.createWriteStream(outFile, { flags: 'a' });
  if (withHeader) csvStream.write(columns.join(',') + "\n");
  rows.forEach(row => {
    csvStream.write(columns.map(col => row[col]).join(',') + "\n");
  });
  csvStream.end();
}
