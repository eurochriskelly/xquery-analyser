const fs = require('fs');
const path = require('path');
const readline = require('readline');

// First pass to collect function names and starting lines
const findFunctions = async (fileName) => {
    const fileStream = fs.createReadStream(fileName);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const functionInfo = [];
    let lineNumber = 0;
    let inSignature = false;
    let signatureStartLine = 0;
    let functionName = "";
    let functionPrefix = "";

    for await (const line of rl) {
        lineNumber++;

        if (inSignature) {
            // Check if signature end (we encounter '{' or the start of body)
            if (line.includes('{')) {
                functionInfo.push({
                    name: functionName,
                    prefix: functionPrefix,
                    line: signatureStartLine
                });
                inSignature = false;
            }
        } else {
            // Detect function declaration
            const functionStartMatch = line.match(/declare\s+function\s+(\w+):(\w+)\s*\(/);
            if (functionStartMatch) {
                inSignature = true;
                functionName = functionStartMatch[2];
                functionPrefix = functionStartMatch[1];
                signatureStartLine = lineNumber;
            }
        }
    }

    return functionInfo;
};

// Second pass to extract full function details
const extractFunctionsDetails = async (fileName, functionInfo) => {
    const fileStream = fs.createReadStream(fileName);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let jsonOutput = {
        file: path.basename(fileName),
        namespace: {},
        functions: []
    };

    let currentFunction = null;
    let inFunction = false;
    let functionBody = [];
    let lineNumber = 0;
    let collectingSignature = false;

    const namespaceRegex = /module\s+namespace\s+(\w+)\s*=\s*["'](.+?)["'];/;
    const functionStartRegex = /declare\s+function\s+(\w+):(\w+)\s*\(([^)]*)?/;
    const functionEndRegex = /\};/;

    for await (const line of rl) {
        lineNumber++;

        // Extract the namespace
        const nsMatch = line.match(namespaceRegex);
        if (nsMatch) {
            jsonOutput.namespace = {
                prefix: nsMatch[1],
                uri: nsMatch[2]
            };
        }

        // Collect function body and signature across multiple lines
        if (inFunction) {
            functionBody.push(line);
            if (line.match(functionEndRegex)) {
                inFunction = false;
                currentFunction.body = functionBody.join("\n");
                jsonOutput.functions.push(currentFunction);
                functionBody = [];
                currentFunction = null;
            }
            continue;
        }

        // Detect function declaration using the functionInfo from the first pass
        const functionMatch = functionInfo.find(f => f.line === lineNumber);
        if (functionMatch) {
            collectingSignature = true;
            currentFunction = {
                name: functionMatch.name,
                line: lineNumber,
                signature: "",
                body: ""
            };
        }

        if (collectingSignature) {
            // Collect signature until '{' is found
            functionBody.push(line);
            currentFunction.signature += line.trim();

            if (line.includes('{')) {
                collectingSignature = false;
                inFunction = true;
            }
        }
    }

    return jsonOutput;
};

// Entry point to the script
const args = process.argv.slice(2);
const fileArg = args.find(arg => arg.startsWith('--file-name='));
if (!fileArg) {
    console.error('Usage: node extract-functions.js --file-name=example.xqy');
    process.exit(1);
}

const fileName = fileArg.split('=')[1];

// First pass to get function names and starting lines
findFunctions(fileName)
    .then(functionInfo => {
        // Second pass to get full function details
        return extractFunctionsDetails(fileName, functionInfo);
    })
    .then(result => {
        console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
        console.error('Error processing file:', error);
    });