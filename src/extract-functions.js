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
    imports.forEach(imp => prefixMap[imp.namespace.prefix] = imp.namespace.filePath);

    const functions = extractFunctions(content, relevantPrefixes, prefixMap);
    const totalFunctions = functions.length;
    const totalLines = content.split('\n').length;

    const result = {
        totalLines: totalLines,
        totalFunctions: totalFunctions,
        file: path.basename(fileName),
        path: path.dirname(fileName).replace('./ml-modules/root', ''),
        namespace: namespace,
        imports: imports,
        functions: functions
    };

    if (outDir) {
        const outFileName = path.join(outDir, fileName.replace(/\//g, '_') + '.json');
        fs.writeFileSync(outFileName, JSON.stringify(result, null, 4));
        console.log(`Output written to ${outFileName}`);
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
        return fs.readFileSync(fileName, 'utf8');
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
    return {
        prefix: namespaceMatch[1],
        uri: namespaceMatch[2],
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
            const usePath = detailsMatch[3] ? (detailsMatch[3].split('/').length === 1 ?
                path.dirname(filePath).replace('./ml-modules/root', '') + '/' + detailsMatch[3] : detailsMatch[3]) : null;
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
    imports?.forEach(imp => relevantPrefixes.add(imp.namespace.prefix));
    return relevantPrefixes;
}

function extractFunctions(content, relevantPrefixes, prefixMap) {
    const functions = [];

    // Pass 1: Find function start points
    const startRegex = /declare\s+(private\s+)?function\s+([\w\-]+:\w[\w\-]*)\s*\(/g;
    const functionStarts = [];
    let match;
    while ((match = startRegex.exec(content)) !== null) {
        functionStarts.push({
            index: match.index,
            line: content.substring(0, match.index).split('\n').length,
            private: !!match[1],
            name: match[2]
        });
    }

    // Pass 2: Parse each function
    for (const start of functionStarts) {
        const functionText = extractFunctionText(content, start.index);
        if (!functionText) continue;

        const parsedFunction = parseFunction(functionText, start.line, start.private, start.name, relevantPrefixes, prefixMap);
        if (parsedFunction) {
            functions.push(parsedFunction);
        }
    }

    return functions;
}

function extractFunctionText(content, startIndex) {
    // Find the opening brace
    let braceStart = content.indexOf('{', startIndex);
    if (braceStart === -1) return null;

    // Find matching closing brace
    let braceCount = 1;
    let currentIndex = braceStart + 1;
    while (currentIndex < content.length && braceCount > 0) {
        const char = content[currentIndex];
        if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
        currentIndex++;
    }

    if (braceCount !== 0 || currentIndex >= content.length) return null;

    // Ensure the function ends with '};'
    if (content.substring(currentIndex - 1, currentIndex + 1) !== '};') return null;

    return content.substring(startIndex, currentIndex + 1).trim();
}

function parseFunction(functionText, lineNumber, isPrivate, fullFunctionName, relevantPrefixes, prefixMap) {
    // Extract signature and body
    const braceIndex = functionText.indexOf('{');
    if (braceIndex === -1) return null;

    const signature = functionText.substring(0, braceIndex).trim();
    const body = functionText.substring(braceIndex + 1, functionText.length - 2).trim();

    // Parse parameters
    const paramMatch = signature.match(/\(([^)]*)\)/);
    const paramList = paramMatch ? paramMatch[1].trim() : '';
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
    const invocations = extractInvocations(body, relevantPrefixes, prefixMap);

    return {
        name: functionName,
        line: lineNumber,
        signature: signature,
        body: body,
        invocations: invocations,
        parameters: parameters,
        private: isPrivate
    };
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

        let openParens = 1;
        let currentIndex = parenStart + 1;
        while (currentIndex < body.length && openParens > 0) {
            const char = body[currentIndex];
            if (char === '(') openParens++;
            else if (char === ')') openParens--;
            currentIndex++;
        }

        if (openParens !== 0) continue;

        const argList = body.substring(parenStart + 1, currentIndex - 1).trim();
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
            if (!invocations[nsKey]) invocations[nsKey] = new Set();
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
