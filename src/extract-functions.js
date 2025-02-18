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

    const functions = extractFunctions(content, relevantPrefixes, namespace.prefix);

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
        const importDetailsRegex = /namespace\s+["']?(\w+)["']?\s*=\s*"([^"]+)"(?:\s+at\s+"([^"]+)")?\s*;/;
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

function extractInvocations(body, relevantPrefixes, namespace) {
    const invocations = {};
    const invocationRegex = /(?<!\$)\b([a-zA-Z_][\w\-\.]*)\:([a-zA-Z_][\w\-\.]*)(?:\#\d+)?(?=\s*\(|\#\d+)/g;
    let invocationMatch;

    while ((invocationMatch = invocationRegex.exec(body)) !== null) {
        const prefix = invocationMatch[1];  // Extracts "my"
        const funcName = invocationMatch[2]; // Extracts "get-foo-bar"
        const arityMatch = body.substr(invocationMatch.index).match(/#(\d+)/);
        const arity = arityMatch ? `#${arityMatch[1]}` : '';

        // Lookup the full namespace URI using the prefix
        let namespaceURI = namespace.uri; // Default to the module's own namespace
        relevantPrefixes.forEach(imp => {
            if (imp.prefix === prefix) {
                namespaceURI = imp.uri; // Use imported namespace if matched
            }
        });

        // Store the invocation under the full namespace
        if (!invocations[namespaceURI]) {
            invocations[namespaceURI] = new Set();
        }
        invocations[namespaceURI].add(funcName + arity);
    }

    // Convert sets to arrays
    const invocationsObj = {};
    for (const [ns, funcSet] of Object.entries(invocations)) {
        invocationsObj[ns] = Array.from(funcSet);
    }

    return invocationsObj;
}


function extractInvocations(body, relevantPrefixes) {
    const invocations = {};
    const invocationRegex = /(?<!\$)\b([a-zA-Z_][\w\-\.]*)\:([a-zA-Z_][\w\-\.]*)(?:\#\d+)?(?=\s*\(|\#\d+)/g;
    let invocationMatch;
    while ((invocationMatch = invocationRegex.exec(body)) !== null) {
        const prefix = invocationMatch[1];
        const funcName = invocationMatch[2];
        const arityMatch = body.substr(invocationMatch.index).match(/#(\d+)/);
        const arity = arityMatch ? `#${arityMatch[1]}` : '';

        // Only include relevant prefixes
        if (relevantPrefixes.has(prefix)) {
            const fullFunctionName = funcName + arity;
            if (!invocations[prefix]) {
                invocations[prefix] = new Set();
            }
            invocations[prefix].add(fullFunctionName);
        }
    }

    // Convert invocation sets to arrays
    const invocationsObj = {};
    for (const [prefix, funcSet] of Object.entries(invocations)) {
        invocationsObj[prefix] = Array.from(funcSet);
    }

    return invocationsObj;
}

// Start the script
main();
