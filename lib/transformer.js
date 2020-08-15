"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const tsxUtility_1 = require("./tsxUtility");
const ts_clone_node_1 = require("@wessberg/ts-clone-node");
require("colors");
const ModuleName = 'reactive-tsx';
const MonoModuleName = 'reactive-tsx/lib/mono';
const SourceModuleName = 'reactive-tsx/src';
const ComponentTypeName = 'Component';
const RunFunctionName = 'run';
const ChildrenPropName = 'children';
const ReactiveTypeName = 'Reactive';
const ReactiveArrayTypeName = 'ReactiveArray';
const SubscribeFunctionName = 'subscribe$';
const ConditionalFunctionName = 'conditional$';
const ReplaceNodeFunctionName = 'replaceNode$';
const MapArrayFunctionName = 'mapArray$';
const CombineFunctionName = 'combine';
const CombineReactiveFunctionName = 'combineReactive$';
function createTransformer(program, opts) {
    const typeChecker = program.getTypeChecker();
    return ctx => {
        return sourceFile => transformSourceFile(ctx, typeChecker, sourceFile, opts);
    };
}
exports.default = createTransformer;
function transformSourceFile(ctx, typeChecker, sourceFile, opts) {
    var _a, _b;
    console.log('transforming:', sourceFile.fileName.blue);
    // skip empty file
    if (!sourceFile.text)
        return sourceFile;
    const importInfo = getImport(sourceFile);
    // skip no import
    if (!importInfo)
        return sourceFile;
    const { namedImports, isMono, moduleSpecifier } = importInfo;
    let componentType;
    let runType;
    let reactiveType;
    let reactiveArrayType;
    let combineType;
    let removingNodes = [];
    const monoNames = [];
    for (const importSpecifier of namedImports.elements) {
        const name = (_b = (_a = importSpecifier.propertyName) === null || _a === void 0 ? void 0 : _a.text) !== null && _b !== void 0 ? _b : importSpecifier.name.text;
        if (name === ComponentTypeName) {
            componentType = getInterfaceType(typeChecker, importSpecifier.name);
            console.log('Module Imported!'.cyan);
        }
        else if (name === RunFunctionName) {
            runType = typeChecker.getTypeAtLocation(importSpecifier.name);
            removingNodes.push(importSpecifier);
            console.log('run Imported!'.cyan, typeChecker.typeToString(runType));
        }
        else if (name === CombineFunctionName) {
            removingNodes.push(importSpecifier);
        }
        // remove import interface
        const type = typeChecker.getTypeAtLocation(importSpecifier);
        if (type.flags === ts.TypeFlags.Any) {
            removingNodes.push(importSpecifier);
        }
        if (isMono) {
            monoNames.push(name);
        }
    }
    // get module symbol
    const moduleSymbol = typeChecker.getSymbolAtLocation(moduleSpecifier);
    if (!moduleSymbol)
        throw 'symbol is undefined.';
    if (!moduleSymbol.exports)
        throw 'exports is undefined.';
    // get types
    reactiveType = getTypeOfExportsByName(typeChecker, moduleSymbol.exports, ReactiveTypeName);
    reactiveArrayType = getTypeOfExportsByName(typeChecker, moduleSymbol.exports, ReactiveArrayTypeName);
    combineType = getTypeOfExportsByName(typeChecker, moduleSymbol.exports, CombineFunctionName);
    if (!reactiveType)
        throw 'reactiveType is undefined.';
    if (!reactiveArrayType)
        throw 'reactiveArrayType is undefined.';
    if (!combineType)
        throw 'combineType is undefined.';
    const context = {
        sourceFile,
        typeChecker,
        ctx,
        reactiveType,
        reactiveArrayType,
        combineType,
        nodeNumber: 1,
    };
    function visitor(node) {
        if (removingNodes.indexOf(node) >= 0) {
            console.log('remove'.yellow, node.getText());
            return undefined;
        }
        // find component variable declaration
        if (componentType) {
            if (ts.isVariableDeclaration(node) && node.type && ts.isTypeReferenceNode(node.type)) {
                const defineComponentSymbol = typeChecker.getSymbolAtLocation(node.name);
                if (defineComponentSymbol) {
                    const referencedType = getInterfaceType(typeChecker, node.type.typeName);
                    if (referencedType === componentType) {
                        const type = typeChecker.getTypeAtLocation(node);
                        if (!type.aliasTypeArguments || !type.aliasTypeArguments.length)
                            throw 'type argument is not specified.';
                        const propType = type.aliasTypeArguments[0];
                        console.log('Define Component'.green, 'name:', typeChecker.symbolToString(defineComponentSymbol).yellow, 'prop:', typeChecker.typeToString(propType).cyan);
                        return transformComponent(context, node, defineComponentSymbol);
                    }
                }
            }
        }
        // find run function calling
        if (runType) {
            if (ts.isCallExpression(node)) {
                const callFuncType = typeChecker.getTypeAtLocation(node.expression);
                if (callFuncType === runType) {
                    console.log('Detect run'.green, node.getText());
                    return transformRun(node);
                }
            }
        }
        if (isCombineCall(node)) {
            return transformCombine(context, undefined, node);
        }
        return ts.visitEachChild(node, visitor, ctx);
    }
    let transformedSourceFile = ts.visitEachChild(sourceFile, visitor, ctx);
    const requiredFuncNames = [];
    if (context.combineReactiveFuncUsed) {
        requiredFuncNames.push(CombineReactiveFunctionName);
        context.subscribeFuncUsed = true; // force use
    }
    if (context.mapArrayFuncUsed) {
        requiredFuncNames.push(MapArrayFunctionName);
    }
    if (context.conditionalFuncUsed) {
        requiredFuncNames.push(ConditionalFunctionName);
        context.subscribeFuncUsed = true; // force use
    }
    if (context.replaceNodeFuncUsed) {
        requiredFuncNames.push(ReplaceNodeFunctionName);
    }
    if (context.subscribeFuncUsed) {
        requiredFuncNames.push(SubscribeFunctionName);
    }
    const transformedImportInfo = getImport(transformedSourceFile);
    if (!transformedImportInfo)
        throw 'import not found.';
    if (!isMono) {
        transformedImportInfo.namedImports.elements = ts.createNodeArray([
            ...transformedImportInfo.namedImports.elements,
            ...requiredFuncNames.map(name => ts.createImportSpecifier(undefined, ts.createIdentifier(name))),
        ]);
    }
    else {
        console.log('mono mode'.blue);
        monoNames.push(...requiredFuncNames);
        // remove import declaration
        let newStatements = transformedSourceFile.statements.filter(s => s !== transformedImportInfo.importDeclaration);
        // get main module source file
        const options = ctx.getCompilerOptions();
        const host = (opts === null || opts === void 0 ? void 0 : opts.host) || ts.createCompilerHost(options);
        const mainModule = ts.resolveModuleName(SourceModuleName, transformedSourceFile.fileName, options, host).resolvedModule;
        if (!mainModule)
            throw 'main module not found.';
        const mainModuleFile = host.getSourceFile(mainModule.resolvedFileName, ts.ScriptTarget.ES2020);
        if (!mainModuleFile)
            throw 'main module not found.';
        const insertStatements = [];
        for (const statement of mainModuleFile.statements) {
            if (ts.isVariableStatement(statement)) {
                for (const variableDeclaration of statement.declarationList.declarations) {
                    if (ts.isIdentifier(variableDeclaration.name)) {
                        const variableName = ts.idText(variableDeclaration.name);
                        if (monoNames.indexOf(variableName) >= 0) {
                            console.log('inlining'.yellow, variableName);
                            const newStatement = ts_clone_node_1.cloneNode(statement);
                            preserveMultiLine(newStatement, statement);
                            newStatement.modifiers = undefined; // remove export keyword
                            insertStatements.push(newStatement);
                            break;
                        }
                    }
                }
            }
        }
        // insert statements from main module
        newStatements = [...insertStatements, ...newStatements];
        //newStatements.push(...insertStatements)
        transformedSourceFile = ts.updateSourceFileNode(transformedSourceFile, newStatements);
    }
    return transformedSourceFile;
}
function getImport(sourceFile) {
    let importDeclaration;
    let namedImports;
    let isMono = false;
    let moduleSpecifier;
    for (let i = 0; i < sourceFile.statements.length; i++) {
        const node = sourceFile.statements[i];
        if (ts.isImportDeclaration(node)
            && ts.isStringLiteral(node.moduleSpecifier)
            && (node.moduleSpecifier.text === ModuleName || node.moduleSpecifier.text === MonoModuleName)
            && node.importClause
            && node.importClause.namedBindings
            && ts.isNamedImports(node.importClause.namedBindings)) {
            if (namedImports)
                throw 'import should be only one.';
            namedImports = node.importClause.namedBindings;
            isMono = node.moduleSpecifier.text === MonoModuleName;
            moduleSpecifier = node.moduleSpecifier;
            importDeclaration = node;
        }
    }
    if (!importDeclaration)
        return;
    if (!namedImports)
        throw 'import not found.';
    if (!moduleSpecifier)
        throw 'moduleSpecifier is undefined.';
    return { importDeclaration, namedImports, isMono, moduleSpecifier };
}
function getTypeOfExportsByName(typeChecker, exports, typeName) {
    const symbol = exports.get(ts.escapeLeadingUnderscores(typeName));
    if (!symbol)
        throw typeName + ' symbol is not found.';
    return typeChecker.getDeclaredTypeOfSymbol(symbol);
}
function transformRun(node) {
    const nodeExp = node.arguments[0];
    const componentExp = node.arguments[1];
    const propExp = node.arguments[2];
    // node = nodeExp
    const nodeId = ts.createIdentifier('node');
    const nodeVariable = ts.createVariableDeclaration(nodeId, undefined, nodeExp);
    // unsubscribes = []
    const unsubscribesId = ts.createIdentifier('unsubscribes');
    const unsubscribesVariable = ts.createVariableDeclaration(unsubscribesId, undefined, ts.createArrayLiteral());
    // child = component(unsubscribes, props)
    const childId = ts.createIdentifier('child');
    const childVariable = ts.createVariableDeclaration(childId, undefined, ts.createCall(componentExp, undefined, [unsubscribesId, propExp]));
    // return () => { ... }
    const xId = ts.createIdentifier("x");
    const returnDispose = (ts.createReturn(ts.createArrowFunction(undefined, undefined, [], undefined, undefined, ts.createBlock([
        // node.removeChild(child)
        ts.createExpressionStatement(ts.createCall(ts.createPropertyAccess(nodeId, 'removeChild'), undefined, [childId])),
        // unsubscribes.forEach(x => x())
        ts.createExpressionStatement(ts.createCall(ts.createPropertyAccess(unsubscribesId, 'forEach'), undefined, [ts.createArrowFunction(undefined, undefined, [createSimpleParameter(xId)], undefined, ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.createCall(xId, undefined, undefined))]))
    ], true))));
    const statements = [
        // const node / unsubscribe / child
        createConstVariableStatement([nodeVariable]),
        createConstVariableStatement([unsubscribesVariable]),
        createConstVariableStatement([childVariable]),
        // node.appendChild(child)
        ts.createStatement(ts.createCall(ts.createPropertyAccess(nodeId, 'appendChild'), undefined, [childId])),
        // return
        returnDispose,
    ];
    // (() => {statements})()
    return ts.createCall(ts.createParen(ts.createArrowFunction(undefined, undefined, [], undefined, undefined, ts.createBlock(statements, true))), undefined, undefined);
}
function createConstVariableStatement(declarations) {
    return ts.createVariableStatement(undefined, ts.createVariableDeclarationList(declarations, ts.NodeFlags.Const));
}
function transformComponent(context, node, defineComponentSymbol) {
    const newNode = ts.getMutableClone(node);
    if (!newNode.initializer)
        throw 'initializer not found.';
    if (!ts.isArrowFunction(newNode.initializer))
        throw 'initializer is not arrow function.';
    // component function
    const arrowFunction = newNode.initializer = ts.getMutableClone(newNode.initializer);
    // unsubscribes identifier for new parameter
    const unsubscribesId = ts.createIdentifier("unsubscribes");
    const peeledNode = peelParentheses(arrowFunction.body);
    if (isJex(peeledNode)) {
        arrowFunction.body = ts.createBlock(jsxToStatements(transformJsx(context, unsubscribesId, peeledNode)), true);
    }
    else if (ts.isBlock(peeledNode)) {
        arrowFunction.body = transformComponentBody(context, unsubscribesId, peeledNode);
    }
    else {
        throw 'not supported node: ' + ts.SyntaxKind[arrowFunction.body.kind];
    }
    // add unsubscribes to first parameter: (unsubscribes, props) => ...
    // Note: Modify parameters after JSX transformation in order to refer to the type by TypeChecker during JSX transformation.
    const unsubscribesParameter = createSimpleParameter(unsubscribesId);
    arrowFunction.parameters = ts.createNodeArray([unsubscribesParameter, ...arrowFunction.parameters]);
    return newNode;
}
function peelParentheses(node) {
    return ts.isParenthesizedExpression(node) ? peelParentheses(node.expression) : node;
}
function transformComponentBody(context, unsubscribesId, body) {
    const newBody = ts.getMutableClone(body);
    const newStatements = [];
    for (const statement of newBody.statements) {
        if (ts.isReturnStatement(statement)) {
            if (!statement.expression)
                throw 'returns expression not found.';
            const peeledNode = peelParentheses(statement.expression);
            if (!isJex(peeledNode))
                throw 'returns expression is not jsx.';
            newStatements.push(...jsxToStatements(transformJsx(context, unsubscribesId, peeledNode)));
        }
        else {
            function visitor(node) {
                // combine function
                if (isCombineCall(node)) {
                    return transformCombine(context, unsubscribesId, node);
                }
                return ts.visitEachChild(node, visitor, context.ctx);
            }
            newStatements.push(ts.visitEachChild(statement, visitor, context.ctx));
        }
    }
    newBody.statements = ts.createNodeArray(newStatements);
    return newBody;
}
function isCombineCall(node) {
    return ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === CombineFunctionName;
}
function transformCombine(context, unsubscribesId, node) {
    context.combineReactiveFuncUsed = true;
    const expression = node.arguments[0];
    const reactives = getAllReactives(context, expression);
    // combineReactive(unsubscribes, [reactives], () => expression)
    return ts.createCall(ts.createIdentifier(CombineReactiveFunctionName), undefined, [
        unsubscribesId !== null && unsubscribesId !== void 0 ? unsubscribesId : ts.createIdentifier('undefined'),
        ts.createArrayLiteral(reactives),
        ts.createArrowFunction(undefined, undefined, [], undefined, undefined, expression),
    ]);
}
function preserveMultiLine(node, sourceNode) {
    // skip auto parenthesis
    if (ts.isParenthesizedExpression(node) && !ts.isParenthesizedExpression(sourceNode)) {
        node = node.expression;
    }
    if (sourceNode.multiLine) {
        node.multiLine = sourceNode.multiLine;
    }
    const children = [];
    node.forEachChild(child => { children.push(child); });
    const sourceChildren = [];
    sourceNode.forEachChild(child => { sourceChildren.push(child); });
    for (let i = 0; i < children.length; i++) {
        preserveMultiLine(children[i], sourceChildren[i]);
    }
}
function testJsxExpression(node, sourceFile, typeChecker, ctx) {
    const testVisitor = node => {
        if (ts.isJsxExpression(node) && node.expression) {
            const line = ts.getLineAndCharacterOfPosition(sourceFile, node.expression.pos);
            const expType = typeChecker.getTypeAtLocation(node.expression);
            console.log('test expType'.red, typeChecker.typeToString(expType), node.expression.getText(), line);
            return node;
        }
        return ts.visitEachChild(node, testVisitor, ctx);
    };
    console.log('---------------- jsx expression test start -----------------'.red);
    ts.visitEachChild(node, testVisitor, ctx);
    console.log('---------------- jsx expression test end -------------------'.red);
}
// document.createElement, document.createTextNode
const documentId = ts.createIdentifier('document');
const createElementMethod = ts.createPropertyAccess(documentId, 'createElement');
const createTextNodeMethod = ts.createPropertyAccess(documentId, 'createTextNode');
function isJex(node) {
    return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);
}
function jsxToStatements(jsx) {
    if (!jsx)
        return [];
    if (Array.isArray(jsx))
        return jsx;
    if (isExpression(jsx))
        return [ts.createStatement(jsx)];
    return [jsx];
}
function transformJsx(context, unsubscribesId, node, onUpdateId) {
    if (ts.isJsxElement(node)) {
        return transformJsxOpeningLike(context, unsubscribesId, node.openingElement, undefined, onUpdateId, node.children);
    }
    else {
        return transformJsxOpeningLike(context, unsubscribesId, node, undefined, onUpdateId);
    }
}
function transformJsxChild(context, unsubscribesId, node, parentNodeId) {
    if (ts.isJsxElement(node)) {
        return transformJsxOpeningLike(context, unsubscribesId, node.openingElement, parentNodeId, undefined, node.children);
    }
    else if (ts.isJsxSelfClosingElement(node)) {
        return transformJsxOpeningLike(context, unsubscribesId, node, parentNodeId, undefined);
    }
    else if (ts.isJsxText(node)) {
        if (!parentNodeId)
            throw 'parentNodeId is undefined.';
        return transformJsxText(node, parentNodeId);
    }
    else if (ts.isJsxExpression(node)) {
        if (!unsubscribesId)
            throw 'unsubscribesId is undefined.';
        if (!parentNodeId)
            throw 'parentNodeId is undefined.';
        return transformJsxExpression(context, unsubscribesId, node, parentNodeId);
    }
    else if (ts.isJsxFragment(node)) {
        // not supported
    }
    throw 'not supported jsx type: ' + ts.SyntaxKind[node.kind] + ' node: ' + node.getText();
}
// <foo/> or <foo>
function transformJsxOpeningLike(context, unsubscribesId, jsxNode, parentNodeId, onUpdateId, children) {
    // <tagName> or <TagNameExp>
    const tagNameExp = getTagNameExpression(jsxNode);
    // for child component
    if (!ts.isStringLiteral(tagNameExp)) {
        // Component()
        const componentCall = createChildComponentCallExpression(context, unsubscribesId, jsxNode, children, tagNameExp);
        if (onUpdateId) {
            // onUpdate(Component())
            return ts.createCall(onUpdateId, undefined, [componentCall]);
        }
        else if (parentNodeId) {
            // parentNode.appendChild(Component())
            return ts.createCall(ts.createPropertyAccess(parentNodeId, 'appendChild'), undefined, [componentCall]);
        }
        else {
            // Component()
            return componentCall;
        }
    }
    const newStatements = [];
    // const element1 = document.createElement('tagName')
    const elementId = ts.createIdentifier(tagNameExp.text + context.nodeNumber++);
    newStatements.push(ts.createVariableStatement(undefined, ts.createVariableDeclarationList([ts.createVariableDeclaration(elementId, undefined, ts.createCall(createElementMethod, undefined, [tagNameExp]))], ts.NodeFlags.Const)));
    // attribute properties assign
    for (const attribute of jsxNode.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute)) {
            throw 'jsx spread attribute is not supported yet.';
        }
        const attrName = ts.idText(attribute.name);
        const expression = transformJsxAttributeInitializer(attribute.initializer);
        //console.log('attribute'.red, attrName, expression.getText())
        // root['attrName'] = expression
        const assign = ts.createAssignment(ts.createElementAccess(elementId, ts.createStringLiteral(attrName)), expression);
        const reactives = getAllReactives(context, expression);
        if (reactives.length === 0) {
            // assign
            newStatements.push(ts.createStatement(assign));
        }
        else if (reactives.length === 1) {
            // unsubscribes.push(reactive.subscribe(() => assign))
            newStatements.push(ts.createStatement(ts.createCall(ts.createPropertyAccess(unsubscribesId, 'push'), undefined, [ts.createCall(ts.createPropertyAccess(reactives[0], 'subscribe'), undefined, [ts.createArrowFunction(undefined, undefined, [], undefined, undefined, assign)])])));
        }
        else {
            // subscribe$(unsubscribes, [reactives], () => assign)
            newStatements.push(ts.createStatement(ts.createCall(ts.createIdentifier(SubscribeFunctionName), undefined, [
                unsubscribesId,
                ts.createArrayLiteral(reactives),
                ts.createArrowFunction(undefined, undefined, [], undefined, undefined, assign),
            ])));
        }
    }
    if (children) {
        const childStatements = [];
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            childStatements.push(...jsxToStatements(transformJsxChild(context, unsubscribesId, child, elementId)));
        }
        // wrap block for children
        if (childStatements.length > 0) {
            newStatements.push(ts.createBlock(childStatements, true));
        }
    }
    if (onUpdateId) {
        // onUpdate(elementId)
        newStatements.push(ts.createStatement(ts.createCall(onUpdateId, undefined, [elementId])));
    }
    else if (parentNodeId) {
        // parentNode.appendChild(elementId)
        newStatements.push(ts.createStatement(ts.createCall(ts.createPropertyAccess(parentNodeId, 'appendChild'), undefined, [elementId])));
    }
    else {
        // return element1
        newStatements.push(ts.createReturn(elementId));
    }
    return newStatements;
}
function createChildComponentCallExpression(context, unsubscribesId, jsxNode, children, tagNameExp) {
    // create { props }
    const props = [];
    for (const attribute of jsxNode.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute)) {
            // ...expression
            props.push(ts.createSpreadAssignment(attribute.expression));
        }
        else {
            const attrName = ts.idText(attribute.name);
            const expression = transformJsxAttributeInitializer(attribute.initializer);
            //console.log('attribute'.red, attrName, expression.getText())
            // attrName: expression
            props.push(ts.createPropertyAssignment(attrName, expression));
        }
    }
    // add children prop
    if (children) {
        const childParentNodeId = ts.createIdentifier('parentNode');
        const childUnsubscribesId = ts.createIdentifier('unsubscribes');
        const childStatements = [];
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            childStatements.push(...jsxToStatements(transformJsxChild(context, unsubscribesId, child, childParentNodeId)));
        }
        if (childStatements.length > 0) {
            // children: (node, unsucribes) => {...}
            props.push(ts.createPropertyAssignment(ts.createIdentifier("children"), ts.createArrowFunction(undefined, undefined, [
                createSimpleParameter(childParentNodeId),
                createSimpleParameter(childUnsubscribesId)
            ], undefined, ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.createBlock(childStatements, true))));
        }
    }
    // call child component
    // Component(unsubscribes, { props })
    return ts.createCall(tagNameExp, undefined, [
        unsubscribesId,
        ts.createObjectLiteral(props, true) // { props }
    ]);
}
function getTagNameExpression(jsxNode) {
    const tagName = jsxNode.tagName;
    if (!ts.isIdentifier(tagName))
        return tagName;
    const name = ts.idText(tagName);
    if (name.length <= 0)
        throw 'name is empty. node: ' + jsxNode.getText();
    // If the first letter is small, it's an HTML tag.
    const isHtmlTag = 'a' <= name[0] && name[0] <= 'z';
    return isHtmlTag ? ts.createStringLiteral(ts.idText(tagName)) : tagName;
}
// "foo"
function transformJsxText(jsxText, parentNodeId) {
    const stringLiteral = createFixedStringLiteral(jsxText.text);
    if (!stringLiteral)
        return undefined; // skip
    // parentNode.appendChild(document.createTextNode('text'))
    return ts.createCall(ts.createPropertyAccess(parentNodeId, 'appendChild'), undefined, [ts.createCall(createTextNodeMethod, undefined, [stringLiteral])]);
}
// {foo}
function transformJsxExpression(context, unsubscribesId, jsxExpression, parentNodeId) {
    if (!jsxExpression.expression)
        return [];
    // props.children
    if (ts.isPropertyAccessExpression(jsxExpression.expression)
        && jsxExpression.expression.name.text === ChildrenPropName) {
        const expType = context.typeChecker.getTypeAtLocation(jsxExpression.expression);
        console.log('children'.gray, context.typeChecker.typeToString(expType), jsxExpression.expression.getText());
        // props.children && props.chidren(parentNode, unsubscribes)
        return ts.createLogicalAnd(jsxExpression.expression, ts.createCall(jsxExpression.expression, undefined, [parentNodeId, unsubscribesId]));
    }
    // conditional
    if (isConditionalable(jsxExpression.expression)) {
        return createConditionalStatements(context, unsubscribesId, jsxExpression.expression, parentNodeId);
    }
    // jsx
    if (isJex(jsxExpression.expression)) {
        return transformJsxChild(context, unsubscribesId, jsxExpression.expression, parentNodeId);
    }
    // array mapping
    if (ts.isCallExpression(jsxExpression.expression) && ts.isPropertyAccessExpression(jsxExpression.expression.expression)) {
        const mapAccess = jsxExpression.expression.expression;
        const reactiveArrayExp = mapAccess.expression;
        const objType = context.typeChecker.getTypeAtLocation(reactiveArrayExp);
        if (isAssignable(context.typeChecker, context.reactiveArrayType, objType)) {
            const selectExp = jsxExpression.expression.arguments[0];
            if (!ts.isArrowFunction(selectExp))
                throw 'select parameter is not arrow function.';
            const peeledNode = peelParentheses(selectExp.body);
            if (!isJex(peeledNode))
                throw 'select must returns JSX.';
            const childUnsubscribesId = ts.createIdentifier('unsubscribes');
            const body = jsxToBody(transformJsx(context, childUnsubscribesId, peeledNode));
            if (!body)
                throw 'body is undefined.';
            const unsubscribesParameter = createSimpleParameter(childUnsubscribesId);
            const itemParameter = selectExp.parameters[0];
            const indexParameter = selectExp.parameters[1];
            const parameters = [unsubscribesParameter];
            if (itemParameter)
                parameters.push(itemParameter);
            if (indexParameter)
                parameters.push(indexParameter);
            const createExp = ts.createArrowFunction(undefined, undefined, parameters, undefined, undefined, body);
            context.mapArrayFuncUsed = true;
            // mapArray(reactiveArray, (item, index, unsubscribes) => Node)
            return ts.createCall(ts.createIdentifier(MapArrayFunctionName), undefined, [parentNodeId, reactiveArrayExp, createExp]);
        }
    }
    // subscribe reactives
    const reactives = getAllReactives(context, jsxExpression.expression);
    if (reactives.length > 0) {
        console.log('reactives'.gray, reactives.map(r => r.getText()), jsxExpression.expression.getText());
        return createReactiveText(context, unsubscribesId, jsxExpression.expression, reactives, parentNodeId);
    }
    // parentNode.appendChild(document.createTextNode('expression'))
    console.log('EXPRESSION TEXT'.red, jsxExpression.getText());
    return ts.createCall(ts.createPropertyAccess(parentNodeId, 'appendChild'), undefined, [ts.createCall(createTextNodeMethod, undefined, [jsxExpression.expression])]);
}
// is node can conditional()
function isConditionalable(node) {
    // && binary expression
    if (ts.isBinaryExpression(node)
        && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        return true;
    }
    // conditonExp ? trueExp : falseExp
    if (ts.isConditionalExpression(node)) {
        return true;
    }
    return false;
}
// conditional()
function createConditionalStatements(context, unsubscribesId, exp, parentNodeId) {
    const statements = [];
    // let currentNode1 = document.createTextEelement('')
    const currentNodeId = ts.createIdentifier('currentNode' + context.nodeNumber++);
    statements.push(ts.createVariableStatement(undefined, ts.createVariableDeclarationList([
        ts.createVariableDeclaration(currentNodeId, undefined, ts.createCall(createTextNodeMethod, undefined, [ts.createStringLiteral('')]))
    ], ts.NodeFlags.Let)));
    // parentNode.appendChild(currentNode)
    statements.push(ts.createStatement(ts.createCall(ts.createPropertyAccess(parentNodeId, 'appendChild'), undefined, [currentNodeId])));
    context.replaceNodeFuncUsed = true;
    // node => currentNode = replaceNode$(node, currentNode, parentNode)
    const nodeId = ts.createIdentifier('node');
    const nodeParameter = createSimpleParameter(nodeId);
    const onUpdate = ts.createArrowFunction(undefined, undefined, [nodeParameter], undefined, undefined, ts.createAssignment(currentNodeId, ts.createCall(ts.createIdentifier(ReplaceNodeFunctionName), undefined, [nodeId, currentNodeId, parentNodeId])));
    statements.push(ts.createStatement(createCallConditionalInternal(context, unsubscribesId, exp, parentNodeId, onUpdate)));
    return statements;
}
function createCallConditionalInternal(context, unsubscribesId, exp, parentNodeId, onUpdate, nestCount) {
    nestCount = nestCount || 1;
    let nestSpace = '';
    for (let i = 0; i < nestCount; i++)
        nestSpace += '    ';
    let conditionExp;
    let trueExp;
    let falseExp;
    if (ts.isConditionalExpression(exp)) {
        conditionExp = exp.condition;
        trueExp = exp.whenTrue;
        falseExp = exp.whenFalse;
    }
    else {
        conditionExp = exp.left;
        trueExp = exp.right;
    }
    const reactivesInCondition = getAllReactives(context, conditionExp);
    const reactivesInTrue = trueExp ? getAllReactives(context, trueExp, true) : [];
    const reactivesInFalse = falseExp ? getAllReactives(context, falseExp, true) : [];
    // console.log('reactives in condition'.gray, reactivesInCondition.map(r => r.getText()), conditionExp.getText())
    // console.log('reactives in true'.gray, reactivesInTrue.map(r => r.getText()), trueExp.getText())
    // console.log('reactives in false'.gray, reactivesInFalse.map(r => r.getText()), falseExp && falseExp.getText())
    // for onUpdate parameter of NodeCreator
    const onUpdateId = ts.createIdentifier('onUpdate');
    const onUpdateParameter = createSimpleParameter(onUpdateId);
    context.conditionalFuncUsed = true;
    // for unsubscribes parameter of NodeCreator
    const childUnsubscribesId = ts.createIdentifier('unsubscribes');
    const childUnsubscribesParameter = createSimpleParameter(childUnsubscribesId);
    const trueBody = !trueExp
        ? undefined
        : isJex(trueExp)
            ? jsxToBody(transformJsx(context, childUnsubscribesId, trueExp, onUpdateId))
            : isConditionalable(trueExp)
                ? createCallConditionalInternal(context, childUnsubscribesId, trueExp, undefined, onUpdateId, nestCount + 1)
                : createUpdateText(context, onUpdateId, trueExp);
    const falseBody = !falseExp
        ? undefined
        : isJex(falseExp)
            ? jsxToBody(transformJsx(context, childUnsubscribesId, falseExp, onUpdateId))
            : isConditionalable(falseExp)
                ? createCallConditionalInternal(context, childUnsubscribesId, falseExp, undefined, onUpdateId, nestCount + 1)
                : createUpdateText(context, onUpdateId, falseExp);
    // conditional(unsubscribes, [reactives], () => condition, [reactives], (unsubscribes) => Node, [reactives], (unsubscribes) => Node, (node) => void)
    const callConditional = ts.createCall(ts.createIdentifier(ConditionalFunctionName), undefined, [
        unsubscribesId,
        addComment(`\n${nestSpace}condition`, ts.createArrayLiteral(reactivesInCondition)),
        ts.createArrowFunction(undefined, undefined, [], undefined, undefined, conditionExp),
        addComment(`\n${nestSpace}whenTrue `, reactivesInTrue.length !== 0 ? ts.createArrayLiteral(reactivesInTrue) : ts.createIdentifier('undefined')),
        trueBody ? ts.createArrowFunction(undefined, undefined, [childUnsubscribesParameter, onUpdateParameter], undefined, undefined, trueBody) : ts.createIdentifier('undefined'),
        addComment(`\n${nestSpace}whenFalse`, reactivesInFalse.length !== 0 ? ts.createArrayLiteral(reactivesInFalse) : ts.createIdentifier('undefined')),
        falseBody ? ts.createArrowFunction(undefined, undefined, [childUnsubscribesParameter, onUpdateParameter], undefined, undefined, falseBody) : ts.createIdentifier('undefined'),
        addComment(`\n${nestSpace}onUpdate `, ts.getMutableClone(onUpdate)),
    ]);
    return callConditional;
}
function addComment(comment, node) {
    return ts.addSyntheticLeadingComment(node, ts.SyntaxKind.MultiLineCommentTrivia, comment, false);
}
function jsxToBody(jsx) {
    return !Array.isArray(jsx) && ts.isCallExpression(jsx) ? jsx : ts.createBlock(jsxToStatements(jsx), true);
}
function isExpression(node) {
    switch (node.kind) {
        case ts.SyntaxKind.CallExpression:
        case ts.SyntaxKind.BinaryExpression:
            return true;
        default:
            return false;
    }
}
function createUpdateText(context, onUpdateId, expression) {
    // onUpdate(text) or onUpdate(expression || '')
    return ts.createCall(onUpdateId, undefined, [ts.isStringLiteral(expression) ? expression : ts.createLogicalOr(expression, ts.createStringLiteral(''))]);
}
function createReactiveText(context, unsubscribesId, expression, reactives, parentNodeId) {
    // simple text
    if (reactives.length === 0) {
        // document.createTextNode(expression || '')
        const textNode = ts.createCall(createTextNodeMethod, undefined, [ts.createLogicalOr(expression, ts.createStringLiteral(''))]);
        if (parentNodeId) {
            // parentNode.appendChild(textNode)
            return ts.createCall(ts.createPropertyAccess(parentNodeId, 'appendChild'), undefined, [textNode]);
        }
        else {
            // textNode
            return textNode;
        }
    }
    const statements = [];
    // const text1 = document.createTextNode('')
    const textNodeId = ts.createIdentifier('text' + context.nodeNumber++);
    statements.push(ts.createVariableStatement(undefined, ts.createVariableDeclarationList([ts.createVariableDeclaration(textNodeId, undefined, ts.createCall(createTextNodeMethod, undefined, [ts.createStringLiteral('')]))], ts.NodeFlags.Const)));
    // () => textNode.nodeValue = expression
    const actionArrowFunction = ts.createArrowFunction(undefined, undefined, [], undefined, undefined, ts.createAssignment(ts.createPropertyAccess(textNodeId, 'nodeValue'), expression));
    // single subscribe
    if (reactives.length === 1) {
        // unsubscribes.push(reactive.subscribe(() => textNode.nodeValue = expression))
        statements.push(ts.createStatement(ts.createCall(ts.createPropertyAccess(unsubscribesId, 'push'), undefined, [ts.createCall(ts.createPropertyAccess(reactives[0], 'subscribe'), undefined, [actionArrowFunction])])));
    }
    else {
        // subscribe(unsubscribes, [reactives], () => textNode.nodeValue = expression)
        statements.push(ts.createStatement(ts.createCall(ts.createIdentifier(SubscribeFunctionName), undefined, [unsubscribesId, ts.createArrayLiteral(reactives), actionArrowFunction])));
        context.subscribeFuncUsed = true;
    }
    if (parentNodeId) {
        // parentNode.appendChild(textNode)
        statements.push(ts.createStatement(ts.createCall(ts.createPropertyAccess(parentNodeId, 'appendChild'), undefined, [textNodeId])));
    }
    else {
        // return textNode
        statements.push(ts.createReturn(textNodeId));
    }
    return statements;
}
function createReactiveTextBlock(context, unsubscribesId, expression, reactives, parentNodeId) {
    const text = createReactiveText(context, unsubscribesId, expression, reactives, parentNodeId);
    return Array.isArray(text) ? ts.createBlock(text, true) : text;
}
function createFixedStringLiteral(text) {
    const fixed = tsxUtility_1.fixupWhitespaceAndDecodeEntities(text);
    return fixed ? ts.createStringLiteral(fixed) : undefined;
}
function getAllReactives(context, node, skipConditionalable, buffer) {
    if (!buffer)
        buffer = [];
    //console.log('searchReactive'.gray, node.getText())
    // skip arrow function
    if (ts.isArrowFunction(node)) {
        return buffer;
    }
    // skip jsx
    if (isJex(node)) {
        return buffer;
    }
    // skip conditionalable
    if (skipConditionalable && isConditionalable(node)) {
        return buffer;
    }
    const type = context.typeChecker.getTypeAtLocation(node);
    if (isAssignable(context.typeChecker, context.reactiveType, type)) {
        buffer.push(node);
    }
    else {
        node.forEachChild(child => { getAllReactives(context, child, skipConditionalable, buffer); });
    }
    return buffer;
}
function isAssignable(typeChecker, type, assignType) {
    if (type === assignType)
        return true;
    if (assignType.aliasSymbol) {
        const alias = typeChecker.getDeclaredTypeOfSymbol(assignType.aliasSymbol);
        if (type === alias)
            return true;
    }
    return false;
}
// <foo bar> <foo bar="x"> <foo bar={...}>
function transformJsxAttributeInitializer(initializer) {
    if (!initializer) {
        return ts.createTrue();
    }
    else if (ts.isStringLiteral(initializer)) {
        return initializer;
    }
    else if (ts.isJsxExpression(initializer)) {
        const exp = initializer.expression;
        if (!exp)
            throw 'expression is not set.';
        return exp;
    }
    throw 'unknown attribute initializer';
}
function getInterfaceType(typeChecker, node) {
    const symbol = typeChecker.getSymbolAtLocation(node);
    if (!symbol)
        throw node.getText() + ' symbol is undefined.';
    return typeChecker.getDeclaredTypeOfSymbol(symbol);
}
function createSimpleParameter(id) {
    return ts.createParameter(undefined, undefined, undefined, id);
}
function debugPrint(node) {
    const printer = ts.createPrinter();
    const file = ts.isSourceFile(node) ? node : ts.updateSourceFileNode(ts.createSourceFile('', '', ts.ScriptTarget.ES2020), [node]);
    const text = printer.printFile(file);
    console.log(text);
}
function printNodeTree(node, nest) {
    if (!nest)
        nest = 0;
    let space = '';
    for (let i = 0; i < nest; i++)
        space += ' ';
    console.log(space, ts.SyntaxKind[node.kind]);
    node.forEachChild(child => printNodeTree(child, (nest !== null && nest !== void 0 ? nest : 0) + 1));
}
