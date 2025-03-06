import { readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';

function main() {
    const [fileName, outDir] = parseArguments();
    let content = readFile(fileName);
    content = removeComments(content);

    const { namespace, moduleType } = extractNamespace(content, fileName);
    const imports = extractImports(content, fileName) || [];
    const relevantPrefixes = collectRelevantPrefixes(namespace.prefix, imports);
    const prefixMap = {};
    prefixMap[namespace.prefix] = namespace.filePath;
    prefixMap['local'] = namespace.filePath;
    imports.forEach(imp => prefixMap[imp.namespace.prefix] = imp.namespace.filePath);

    const functions = extractFunctions(content, relevantPrefixes, prefixMap).functions;

    if (moduleType === 'main') {
        const queryBody = extractQueryBody(content);
        if (queryBody) {
            const mainFunction = createMainFunction(queryBody, relevantPrefixes, prefixMap, content);
            functions.push(mainFunction);
        }
    }

    const totalFunctions = functions.length;
    const totalLines = content.split('\n').length;

    const result = {
        totalLines,
        totalFunctions,
        moduleType,
        file: basename(fileName),
        path: dirname(fileName).replace('./ml-modules/root', ''),
        namespace,
        imports,
        functions
    };

    if (outDir) {
        const outFileName = join(outDir, fileName.replace(/\//g, '_') + '.json');
        writeFileSync(outFileName, JSON.stringify(result, null, 4));
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
        return readFileSync(fileName, 'utf8');
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
    if (namespaceMatch) {
        return {
            namespace: {
                prefix: namespaceMatch[1],
                uri: namespaceMatch[2],
                filePath: filePath.replace('./ml-modules/root', '')
            },
            moduleType: 'library'
        };
    } else {
        const path = dirname(filePath).replace('./ml-modules/root', '');
        const file = basename(filePath);
        const uri = `http://example.com${path}/${file}`;
        return {
            namespace: {
                prefix: 'local',
                uri: uri,
                filePath: filePath.replace('./ml-modules/root', '')
            },
            moduleType: 'main'
        };
    }
}

function extractImports(content, filePath) {
    const imports = [];
    const importRegex = /import\s+module\s+namespace\s+[\s\S]*?;/g;
    let importMatch;
    while ((importMatch = importRegex.exec(content)) !== null) {
        const importStatement = importMatch[0];
        const importDetailsRegex = /namespace\s+["']?([\w\-]+)["']?\s*=\s*"([^"]+)"(?:\s+at\s+"([^"]+)")?\s*;/;
        const detailsMatch = importStatement.match(importDetailsRegex);
        if (detailsMatch) {
            const usePath = detailsMatch[3] ? (detailsMatch[3].split('/').length === 1 ?
                dirname(filePath).replace('./ml-modules/root', '') + '/' + detailsMatch[3] : detailsMatch[3]) : null;
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
    const endIndices = [];
    const startRegex = /declare\s*([\s\S]*?)\s*function\s+([\w\-\.]+:[\w\-\.]*)\s*\(/g;
    let match;
    while ((match = startRegex.exec(content)) !== null) {
        const startIndex = match.index;
        const modifiersAndAnnotations = match[1];
        const name = match[2];

        const isPrivate = /\bprivate\b/.test(modifiersAndAnnotations);
        const line = content.substring(0, startIndex).split('\n').length;

        let annotationStart = startIndex;
        let prevLineIndex = content.lastIndexOf('\n', startIndex - 1);
        while (prevLineIndex >= 0) {
            const lineBefore = content.substring(prevLineIndex + 1, annotationStart).trim();
            if (lineBefore.startsWith('%')) {
                annotationStart = prevLineIndex + 1;
                prevLineIndex = content.lastIndexOf('\n', prevLineIndex - 1);
            } else {
                break;
            }
        }

        const adjustedStartIndex = annotationStart;

        const functionTextWithPositions = extractFunctionTextWithPositions(content, adjustedStartIndex);
        if (!functionTextWithPositions) continue;
        const { text: functionText, endIndex } = functionTextWithPositions;
        endIndices.push(endIndex);

        const parsedFunction = parseFunction(functionText, line, isPrivate, name, relevantPrefixes, prefixMap);
        if (parsedFunction) {
            functions.push(parsedFunction);
        }
    }
    return { functions, endIndices };
}

function extractFunctionTextWithPositions(content, startIndex) {
    let braceStart = content.indexOf('{', startIndex);
    if (braceStart === -1) return null;
    let braceCount = 1;
    let currentIndex = braceStart + 1;
    while (currentIndex < content.length && braceCount > 0) {
        const char = content[currentIndex];
        if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
        currentIndex++;
    }
    if (braceCount !== 0 || currentIndex >= content.length) return null;
    if (content.substring(currentIndex - 1, currentIndex + 1) !== '};') return null;
    const text = content.substring(startIndex, currentIndex + 1).trim();
    return { text, endIndex: currentIndex + 1 };
}

function parseFunction(functionText, lineNumber, isPrivate, fullFunctionName, relevantPrefixes, prefixMap) {
    const braceIndex = functionText.indexOf('{');
    if (braceIndex === -1) return null;

    const signature = functionText.substring(0, braceIndex).trim();
    const body = functionText.substring(braceIndex + 1, functionText.length - 2).trim();

    const signatureLines = signature.split('\n').map(line => line.trim());
    const functionLines = signatureLines.filter(line => !line.startsWith('%'));

    let paramText = '';
    let parenCount = 0;
    for (const line of functionLines) {
        if (line.includes('function') || parenCount > 0) {
            paramText += ' ' + line;
            for (const char of line) {
                if (char === '(') parenCount++;
                else if (char === ')') parenCount--;
            }
            if (parenCount === 0 && line.includes(')')) break;
        }
    }

    const openParenIndex = paramText.indexOf('(');
    if (openParenIndex === -1) return null;

    let closeParenCount = 1;
    let closeParenIndex = openParenIndex + 1;
    while (closeParenIndex < paramText.length && closeParenCount > 0) {
        const char = paramText[closeParenIndex];
        if (char === '(') closeParenCount++;
        else if (char === ')') closeParenCount--;
        closeParenIndex++;
    }
    if (closeParenCount !== 0) return null;

    const paramList = paramText.substring(openParenIndex + 1, closeParenIndex - 1).replace(/\s+/g, ' ').trim();
    const parameters = {};
    let paramCount = 0;
    if (paramList) {
        const paramLines = paramList.split(',').map(p => p.trim());
        paramLines.forEach(param => {
            if (param) {
                const paramParts = param.split(/\s+as\s+/);
                const paramName = paramParts[0].replace(/^\$/, '');
                const paramType = paramParts[1] || null;
                if (paramName) {
                    parameters[paramName] = paramType;
                    paramCount++;
                }
            }
        });
    }
    const functionName = `${fullFunctionName}#${paramCount}`;
    const invocations = extractInvocations(body, relevantPrefixes, prefixMap);
    const bodyLines = body.split('\n')
        .map(line => line.trim())
        .filter(line => !line.startsWith('(:') && line.length > 0);
    const bodySize = bodyLines.length;
    return {
        name: functionName,
        line: lineNumber,
        signature,
        body,
        invocations,
        parameters,
        private: isPrivate,
        bodySize,
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

function extractQueryBody(content) {
    const declarationRegex = /(?:import\s+module\s+namespace\s+[\s\S]*?;|\s*declare\s+(?:function|variable|option|namespace)\s+[\s\S]*?;\s*)/g;
    let match;
    let lastEnd = 0;
    let queryBody = '';

    while ((match = declarationRegex.exec(content)) !== null) {
        queryBody += content.substring(lastEnd, match.index);
        lastEnd = match.index + match[0].length;
    }
    queryBody += content.substring(lastEnd);

    return queryBody.trim();
}

function createMainFunction(queryBody, relevantPrefixes, prefixMap, content) {
    const name = 'local:MAIN#0';
    const line = 1; // Starting line for main module body; adjust if needed
    const signature = 'declare function local:MAIN#0() as item()*';
    const body = queryBody;
    const invocations = extractInvocations(body, relevantPrefixes, prefixMap);
    const parameters = {};
    const isPrivate = false;
    const bodyLines = body.split('\n')
        .map(line => line.trim())
        .filter(line => !line.startsWith('(:') && line.length > 0);
    const bodySize = bodyLines.length;

    return {
        name,
        line,
        signature,
        body,
        invocations,
        parameters,
        private: isPrivate,
        bodySize
    };
}

main();
