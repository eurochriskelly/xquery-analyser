const fs = require('fs');
const path = require('path');
let offset = 0;

function main() {
    const [fileName, outDir] = parseArguments();
    let content = readFile(fileName);
    content = removeComments(content);

    const namespace = extractNamespace(content, fileName);
    const imports = extractImports(content, fileName);
    const relevantPrefixes = collectRelevantPrefixes(namespace.prefix, imports);
    const prefixMap = {};
    prefixMap[namespace.prefix] = namespace.uri;
    imports.forEach(imp => {
        prefixMap[imp.namespace.prefix] = imp.namespace.uri || imp.namespace.filePath;
    });
 
    const functions = extractFunctions(content, relevantPrefixes, prefixMap, namespace.prefix);

    const result = {
        file: path.basename(fileName),
        path: path.dirname(fileName).replace('./ml-modules/root', ''),
        namespace: namespace,
        imports: imports,
        functions: functions
    };

    if (outDir) {
        const outFileName = path.join(outDir, fileName.replace(/\//g, '_') + '.json');
        fs.writeFileSync(outFileName, JSON.stringify(result, null, 4));
    } else {
        console.log(JSON.stringify(result, null, 4));
    }
}

function parseArguments() {
    const args = process.argv.slice(2);
    const fileNameArg = args.find(arg => arg.startsWith('--file-name='));
    if (!fileNameArg) {
        console.error('Usage: node extract-functions.js --file-name=example.xqy');
        process.exit(1);
    }
    const fileName = fileNameArg.split('=')[1];
    const outDirArg = args.find(arg => arg.startsWith('--out-dir='));
    const outDir = outDirArg ? outDirArg.split('=')[1] : null;

    return [fileName, outDir];
}

function readFile(fileName) {
    try {
        const content = fs.readFileSync(fileName, 'utf8');
        return content;
    } catch (err) {
        console.error(`Error reading file ${fileName}:`, err.message);
        process.exit(1);
    }
}

function removeComments(content) {
    // XQuery comments are delimited by (: and :)
    return content.replace(/\(\:[\s\S]*?\:\)/g, '');
}

function extractNamespace(content, filePath) {
    const namespaceRegex = /module\s+namespace\s+["']?(\w+)["']?\s*=\s*"([^"]+)"\s*;/;
    const namespaceMatch = content.match(namespaceRegex);
    if (!namespaceMatch) {
        console.error('No module namespace declaration found.');
        process.exit(1);
    }
    const namespacePrefix = namespaceMatch[1];
    const namespaceURI = namespaceMatch[2];
    return {
        prefix: namespacePrefix,
        uri: namespaceURI,
        filePath: filePath.replace('./ml-modules/root', '')
    };
}

function extractImports(content, filePath) {
    const imports = [];
    const importRegex = /import\s+module\s+namespace\s+[\s\S]*?;/gm;
    let importMatch;
    while ((importMatch = importRegex.exec(content)) !== null) {
        const importStatement = importMatch[0];

        // Extract prefix, URI, and filePath from the import statement
        const importDetailsRegex = /namespace\s+["']?([\w\-]+)["']?\s*=\s*"([^"]+)"(?:\s+at\s+"([^"]+)")?\s*;/;
        const detailsMatch = importStatement.match(importDetailsRegex);
       
        if (!detailsMatch) {
            imports.push({
                namespace: {
                    prefix: null,
                    uri: null,
                    filePath: null 
                }
            });
            return
        }

        const pathParts = detailsMatch[3]?.split('/');
        const usePath = pathParts.length === 1
            ? path.dirname(filePath).replace('./ml-modules/root', '') + '/' + detailsMatch[3]
            : detailsMatch[3] || null;

        if (detailsMatch) {
            imports.push({
                namespace: {
                    prefix: detailsMatch[1],
                    uri: detailsMatch[2],
                    filePath: usePath
                }
            });
        }
    }
    return imports;
}

function collectRelevantPrefixes(namespacePrefix, imports) {
    const relevantPrefixes = new Set([namespacePrefix]);
    imports?.forEach(imp => {
        relevantPrefixes.add(imp.namespace.prefix);
    });
    return relevantPrefixes;
}

function extractFunctions(content, relevantPrefixes, prefixMap, namespacePrefix) {
    const functions = [];
    const lines = content.split("\n"); // Store lines for line number calculations

    const functionRegex = /declare function\s+([\w\-]+:\w[\w\-]*)\s*\(([^)]*)\)\s*(?:as\s+[^{]+)?\s*\{([\s\S]*?)\};/gm;
    let match;

    while ((match = functionRegex.exec(content)) !== null) {
        const fullFunctionName = match[1];  // Extracts "my:get-foo-bar"
        const paramList = match[2].trim();  // Extracts everything inside ()
        const body = match[3].trim();       // Extracts everything inside {}

        // Extract function name without the namespace prefix
        const baseFunctionName = fullFunctionName.replace(`${namespacePrefix}:`, "");

        // **Extract Parameters**
        const parameters = {};
        let paramCount = 0;
        if (paramList) {
            const paramLines = paramList.split(/\s*,\s*/);
            paramLines.forEach(param => {
                const paramParts = param.trim().split(/\s+as\s+/); // Split "name as type"
                const paramName = paramParts[0].replace(/^\$/, ''); // Remove $
                const paramType = paramParts[1] || null; // Use null if no type
                if (paramName) {
                    parameters[paramName] = paramType;
                    paramCount++;
                }
            });
        }

        // **Format function name with arity**
        const functionName = `${baseFunctionName}#${paramCount}`;

        // **Determine Correct Line Number**
        const functionStartIndex = match.index;
        const lineNumber = content.substring(0, functionStartIndex).split("\n").length;

        // **Extract Invocations**
        const invocations = extractInvocations(body, relevantPrefixes, prefixMap);

        functions.push({
            name: functionName, // Now includes parameter count
            line: lineNumber,
            signature: match[0].trim(),
            body: body,
            invocations: invocations,
            parameters: parameters
        });
    }

    return functions;
}

function extractInvocations(body, relevantPrefixes, prefixMap) {
     const invocations = {};
     const invocationRegex = /(?<!\$)\b([a-zA-Z_][\w\-\.]*)\:([a-zA-Z_][\w\-\.]*)(?:\#\d+)?(?=\s*\(|\#\d+)/g;
     let invocationMatch;
     while ((invocationMatch = invocationRegex.exec(body)) !== null) {
         const prefix = invocationMatch[1];
         const funcName = invocationMatch[2];
         const arityMatch = body.substr(invocationMatch.index).match(/#(\d+)/);
         const arity = arityMatch ? `#${arityMatch[1]}` : '';

         if (relevantPrefixes.has(prefix)) {
             const nsKey = prefixMap[prefix] || prefix;
             const fullFunctionName = funcName + arity;
             if (!invocations[nsKey]) {
                 invocations[nsKey] = new Set();
             }
             invocations[nsKey].add(fullFunctionName);
         }
     }

     // Convert invocation sets to arrays
     const invocationsObj = {};
     for (const [key, funcSet] of Object.entries(invocations)) {
         invocationsObj[key] = Array.from(funcSet);
     }
     return invocationsObj;
}

// Start the script
main();
