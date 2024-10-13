const fs = require('fs');
const path = require('path');
let offset = 0;

function main() {
    const fileName = parseArguments();
    let content = readFile(fileName);
    content = removeComments(content);

    const namespace = extractNamespace(content, fileName);
    const imports = extractImports(content, fileName);
    const relevantPrefixes = collectRelevantPrefixes(namespace.prefix, imports);

    const functions = extractFunctions(content, relevantPrefixes, namespace.prefix);

    const result = {
        file: path.basename(fileName),
        namespace: namespace,
        imports: imports,
        functions: functions
    };

    console.log(JSON.stringify(result, null, 4));
}

function parseArguments() {
    const args = process.argv.slice(2);
    const fileNameArg = args.find(arg => arg.startsWith('--file-name='));
    if (!fileNameArg) {
        console.error('Usage: node extract-functions.js --file-name=example.xqy');
        process.exit(1);
    }
    const fileName = fileNameArg.split('=')[1];
    return fileName;
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

        const pathParts = detailsMatch[3].split('/');
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
    imports.forEach(imp => {
        relevantPrefixes.add(imp.namespace.prefix);
    });
    return relevantPrefixes;
}

function extractFunctions(content, relevantPrefixes, namespacePrefix) {
    const functions = [];

    // Step 2: Consider content starting from the first declare function statement
    const declareFunctionIndex = content.indexOf('declare function');
    if (declareFunctionIndex === -1) {
        console.error('No functions found in the file.');
        process.exit(1);
    }

    // Content to be processed (starting from the first declare function)
    content = content.substring(declareFunctionIndex);

    const functionRegex = /declare function\s+[\s\S]*?\{[\s\S]*?\};/gm;
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
        const functionText = match[0];

        // Extract the function signature and body
        const signatureMatch = functionText.match(/declare function\s+([\s\S]*?)\s*\{/);
        const signature = signatureMatch ? signatureMatch[1].trim() : '';

        const bodyMatch = functionText.match(/\{([\s\S]*?)\};/s);
        const body = bodyMatch ? bodyMatch[1].trim() : '';

        // Extract function name
        const nameMatch = signature.match(new RegExp(`${namespacePrefix}:(\\w+)`));
        const functionName = nameMatch ? nameMatch[1] : '';

        // Calculate line number (approximate)
        const linesBeforeFunction = content.substring(0, match.index).split('\n').length;

        // Extract invocations from the function body
        const invocations = extractInvocations(body, relevantPrefixes);

        functions.push({
            name: functionName,
            line: offset + linesBeforeFunction,
            signature: signature,
            body: body,
            invocations: invocations
        });

        // Remove the function from content
        content = content.substring(match.index + match[0].length);
        offset += match.index + match[0].length;
        // Reset the regex lastIndex to start from the beginning of the updated content
        functionRegex.lastIndex = 0;
    }

    return functions;
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