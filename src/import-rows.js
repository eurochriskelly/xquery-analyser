import { readFileSync, createWriteStream } from "fs";

// Command-line arguments parsing
const args = process.argv.slice(2);
let fileName;
let withHeader = false;

args.forEach((arg) => {
  const [key, value] = arg.split("=");
  switch (key) {
    case "--file-name":
      fileName = value;
      break;
    case "--with-header":
      withHeader = value === "true";
      break;
    default:
      console.warn(`Unknown argument: ${key}`);
  }
});

if (!fileName) {
  console.error("Error: Please provide --file-name argument");
  process.exit(1);
}

processFile(fileName);

function processFile(file) {
  const xqyData = readFileSync(file, "utf8");
  const data = JSON.parse(xqyData);

  const filename = data.path.split("root").pop() + "/" + data.file;

  // --- Modules (one record per file) ---
  const moduleRows = [];
  if (data.namespace) {
    moduleRows.push({
      filename,
      file: data.file,
      prefix: data.namespace.prefix,
      uri: data.namespace.uri,
      filePath: data.namespace.filePath,
      numFunctions: data.totalFunctions, // Corrected from numFunctions to totalFunctions
      numLines: data.totalLines, // Corrected from numLines to totalLines
    });
  }
  outputCSV(
    moduleRows,
    [
      "filename",
      "file",
      "prefix",
      "uri",
      "filePath",
      "numFunctions",
      "numLines",
    ],
    "/tmp/xqanalyze/modules.csv",
  );

  // --- Imports (one record per import) ---
  const importRows = [];
  if (data.imports) {
    data.imports.forEach((imp) => {
      importRows.push({
        filename,
        prefix: imp.namespace.prefix,
        uri: imp.namespace.uri,
        filePath: imp.namespace.filePath,
      });
    });

    const standardLibs = [
      {
        prefix: "json",
        uri: "http://marklogic.com/xdmp/json",
        filePath: "/MarkLogic/json/json.xqy",
      },
      {
        prefix: "xdmp",
        uri: "http://marklogic.com/xdmp",
        filePath: "/MarkLogic/xdmp.xqy",
      },
    ];

    // Add standard libraries to imports if not already present
    standardLibs.forEach((lib) => {
      if (!data.imports.some((imp) => imp.namespace.uri === lib.uri)) {
        importRows.push({
          filename,
          prefix: lib.prefix,
          uri: lib.uri,
          filePath: lib.filePath,
        });
      }
    });
  }

  outputCSV(
    importRows,
    ["filename", "prefix", "uri", "filePath"],
    "/tmp/xqanalyze/imports.csv",
  );
  // --- Functions, Invocations & Parameters ---
  const funcRows = [];
  const invocRows = [];
  const paramRows = [];
  if (data.functions) {
    data.functions.forEach((func) => {
      funcRows.push({
        filename,
        file: data.file,
        name: func.name,
        line: func.line,
        private: func.private,
      });
      if (func.invocations) {
        Object.entries(func.invocations).forEach(([modUri, funcs]) => {
          let im = modUri;
          if (im.includes("root")) im = modUri.split("root").pop();
          funcs.forEach((invFunc) => {
            invocRows.push({
              filename,
              file: data.file,
              caller: func.name,
              invoked_module: im,
              invoked_function: invFunc,
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
            type: (type || "").trim().replace(/\n\)$/, ""),
          });
        });
      }
    });
  }
  outputCSV(
    funcRows,
    ["filename", "file", "name", "line", "private"],
    "/tmp/xqanalyze/functions.csv",
  );
  outputCSV(
    invocRows,
    ["filename", "file", "caller", "invoked_module", "invoked_function"],
    "/tmp/xqanalyze/invocations.csv",
  );
  outputCSV(
    paramRows,
    ["filename", "file", "function_name", "parameter", "type"],
    "/tmp/xqanalyze/parameters.csv",
  );
}

function outputCSV(rows, columns, outFile) {
  const csvStream = createWriteStream(outFile, { flags: "a" });
  if (withHeader) csvStream.write(columns.join(",") + "\n");
  rows.forEach((row) => {
    csvStream.write(columns.map((col) => row[col]).join(",") + "\n");
  });
  csvStream.end();
}
