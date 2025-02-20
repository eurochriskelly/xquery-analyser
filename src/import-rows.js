const fs = require('fs');

// Command-line arguments parsing
const args = process.argv.slice(2);
let fileName;
let withHeader = false;

args.forEach(arg => {
  const [key, value] = arg.split('=');
  switch (key) {
    case '--file-name':
      fileName = value;
      break;
    case '--with-header':
      withHeader = value === 'true';
      break;
    default:
      console.warn(`Unknown argument: ${key}`);
  }
});

if (!fileName) {
  console.error('Error: Please provide --file-name argument');
  process.exit(1);
}

processFile(fileName);

function processFile(file) {
  const xqyData = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(xqyData);

  const filename = data.path.split('root').pop() + '/' +  data.file;
  // --- Namespaces ---
  const nsRows = [];
  if (data.namespace) {
    nsRows.push({
      filename,
      file: data.file,
      prefix: data.namespace.prefix,
      uri: data.namespace.uri,
      filePath: data.namespace.filePath
    });
  }
  if (data.imports) {
    data.imports.forEach(imp => {
      nsRows.push({
        filename,
        file: data.file,
        prefix: imp.namespace.prefix,
        uri: imp.namespace.uri,
        filePath: imp.namespace.filePath
      });
    });
  }
  outputCSV(nsRows, ['filename', 'file','prefix','uri','filePath'], '/tmp/xqanalyze/namespaces.csv');

  // --- Functions, Invocations & Parameters ---
  const funcRows = [];
  const invocRows = [];
  const paramRows = [];
  if (data.functions) {
    data.functions.forEach(func => {
      funcRows.push({
        filename, 
        file: data.file,
        name: func.name,
        line: func.line,
      });
      if (func.invocations) {
        Object.entries(func.invocations).forEach(([modUri, funcs]) => {
          funcs.forEach(invFunc => {
            invocRows.push({
              filename,
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
            filename,
            file: data.file,
            function_name: func.name,
            parameter: param,
            type: (type||'').trim().replace(/\n\)$/, '')
          });
        });
      }
    });
  }
  outputCSV(funcRows, ['filename', 'file','name','line'], '/tmp/xqanalyze/functions.csv');
  outputCSV(invocRows, ['filename', 'file','caller','invoked_module','invoked_function'], '/tmp/xqanalyze/invocations.csv');
  outputCSV(paramRows, ['filename', 'file','function_name','parameter','type'], '/tmp/xqanalyze/parameters.csv');
}

function outputCSV(rows, columns, outFile) {
  const csvStream = fs.createWriteStream(outFile, { flags: 'a' });
  if (withHeader) csvStream.write(columns.join(',') + "\n");
  rows.forEach(row => {
    csvStream.write(columns.map(col => row[col]).join(',') + "\n");
  });
  csvStream.end();
}
