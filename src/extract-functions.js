const fs = require('fs');
const path = require('path');

function main() {
    const [fileName, outDir] = parseArguments();
    let content = readFile(fileName);
    content = removeComments(content);

    const namespace = extractNamespace(content, fileName);
    const imports = extractImports(content, fileName) || [];
    const relevantPrefixes = collectRelevantPrefixes(namespace.prefix, imports);
    const prefixMap = {};
    prefixMap[namespace.prefix] = namespace.filePath;
    prefixMap['local'] = namespace.filePath;
    imports.forEach(imp => {
        prefixMap[imp.namespace.prefix] = imp.namespace.filePath;
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
        const importDetailsRegex = /namespace\s+["']?([\w\-]+)["']?\s*=\s*"([^"]+)"(?:\s+at\s+"([^"]+)")?\s*;/;
        const detailsMatch = importStatement.match(importDetailsRegex);
        if (detailsMatch) {
            const pathParts = detailsMatch[3]?.split('/');
            const usePath = pathParts && pathParts.length === 1
                ? path.dirname(filePath).replace('./ml-modules/root', '') + '/' + detailsMatch[3]
                : detailsMatch[3] || null;
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
    const relevantPrefixes = new Set([namespacePrefix, 'local']);
    imports?.forEach(imp => {
        relevantPrefixes.add(imp.namespace.prefix);
    });
    return relevantPrefixes;
}

function extractFunctions(content, relevantPrefixes, prefixMap, namespacePrefix) {
    const functions = [];
    const lines = content.split("\n");

    const functionRegex = /(?:%[\w\-]+(?::[\w\-]+)?\s*)*declare(\s+private)?\s+function\s+([\w\-]+:\w[\w\-]*)\s*\(([^)]*)\)\s*(?:as\s+[^{]+)?\s*\{([\s\S]*?)\};/gm;
    let match;

    while ((match = functionRegex.exec(content)) !== null) {
        const privateKeyword = match[1];
        const fullFunctionName = match[2];
        const paramList = match[3].trim();
        const body = match[4].trim();

        const isPrivate = privateKeyword ? true : false;

        const parameters = {};
        let paramCount = 0;
        if (paramList) {
            const paramLines = paramList.split(/\s*,\s*/);
            paramLines.forEach(param => {
                const paramParts = param.trim().split(/\s+as\s+/);
                const paramName = paramParts[0].replace(/^\$/, '');
                const paramType = paramParts[1] || null;
                if (paramName) {
                    parameters[paramName] = paramType;
                    paramCount++;
                }
            });
        }

        const functionName = `${fullFunctionName}#${paramCount}`;

        const functionStartIndex = match.index;
        const lineNumber = content.substring(0, functionStartIndex).split("\n").length;

        const invocations = extractInvocations(body, relevantPrefixes, prefixMap);

        functions.push({
            name: functionName,
            line: lineNumber,
            signature: match[0].trim(),
            body: body,
            invocations: invocations,
            parameters: parameters,
            private: isPrivate
        });
    }

    return functions;
}

function extractInvocations(body, relevantPrefixes, prefixMap) {
    const invocations = {};
    const invocationRegex = /(?<!\$)\b([a-zA-Z_][\w\-\.]*)\:([a-zA-Z_][\w\-\.]*)(?:\#\d+)?\s*\(/g;
    let invocationMatch;

    while ((invocationMatch = invocationRegex.exec(body)) !== null) {
        const prefix = invocationMatch[1];
        const funcName = invocationMatch[2];
        const startIndex = invocationMatch.index;
        const parenStart = body.indexOf('(', startIndex);

        // Find the matching closing parenthesis and extract the argument list
        let openParens = 1;
        let currentIndex = parenStart + 1;
        while (currentIndex < body.length && openParens > 0) {
            const char = body[currentIndex];
            if (char === '(') openParens++;
            else if (char === ')') openParens--;
            currentIndex++;
        }

        if (openParens !== 0) {
            // Unmatched parentheses, skip this invocation
            continue;
        }

        const argList = body.substring(parenStart + 1, currentIndex - 1).trim();

        // Count top-level commas to determine arity
        let argCount = 0;
        let nestedLevel = 0;
        for (let i = 0; i < argList.length; i++) {
            const char = argList[i];
            if (char === '(' || char === '[' || char === '{') nestedLevel++;
            else if (char === ')' || char === ']' || char === '}') nestedLevel--;
            else if (char === ',' && nestedLevel === 0) argCount++;
        }
        argCount = argList.length > 0 ? argCount + 1 : 0;

        if (relevantPrefixes.has(prefix)) {
            const nsKey = prefixMap[prefix] || prefix;
            const fullFunctionName = `${funcName}#${argCount}`;
            if (!invocations[nsKey]) {
                invocations[nsKey] = new Set();
            }
            invocations[nsKey].add(fullFunctionName);
        }
    }

    const invocationsObj = {};
    for (const [key, funcSet] of Object.entries(invocations)) {
        invocationsObj[key] = Array.from(funcSet);
    }
    return invocationsObj;
}

main();
