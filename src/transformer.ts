import * as ts from 'typescript'
import { fixupWhitespaceAndDecodeEntities } from './tsxUtility'
import { cloneNode } from '@wessberg/ts-clone-node'
import 'colors'

const ModuleName = 'reactive-tsx'
const MonoModuleName = 'reactive-tsx/mono'
const SourceModuleName = 'reactive-tsx/src'
const ComponentTypeName = 'Component'
const RunFunctionName = 'run'
const ChildrenPropName = 'children'
const ReactiveTypeName = 'Reactive'
const ReactiveArrayTypeName = 'ReactiveArray'
const SubscribeFunctionName = 'subscribe$'
const ConditionalFunctionName = 'conditional$'
const ReplaceNodeFunctionName = 'replaceNode$'
const MapArrayFunctionName = 'mapArray$'
const CallChildrenFunctionName = 'callChildren$'
const CombineFunctionName = 'combine'
const CombineReactiveFunctionName = 'combineReactive$'
const ElementFunctionName = 'element$'
const TextFunctionName = 'text$'

export interface PluginOptions {
    host?: ts.CompilerHost
}

export default function createTransformer(program: ts.Program, opts?: PluginOptions): ts.TransformerFactory<ts.SourceFile> {
    const typeChecker = program.getTypeChecker()
    return ctx => {
        return sourceFile => transformSourceFile(ctx, typeChecker, sourceFile, opts)
    }
}

type TransformContext = {
    sourceFile: ts.SourceFile
    typeChecker: ts.TypeChecker
    ctx: ts.TransformationContext
    reactiveType: ts.Type
    reactiveArrayType: ts.Type
    combineType: ts.Type
    subscribeFuncUsed?: true
    conditionalFuncUsed?: true
    replaceNodeFuncUsed?: true
    mapArrayFuncUsed?: true
    callChildrenFuncUsed?: true
    combineReactiveFuncUsed?: true
    elementFuncUsed?: true
    textFuncUsed?: true
    nodeNumber: number

    subscribeFuncExp: ts.Expression
    conditionalFuncExp: ts.Expression
    replaceNodeFuncExp: ts.Expression
    mapArrayFuncExp: ts.Expression
    callChildrenFuncExp: ts.Expression
    combineReactiveFuncExp: ts.Expression
    elementFuncExp: ts.Expression
    textFuncExp: ts.Expression

    getMainVisitor: (unsubscribesId: ts.Identifier | undefined) => ts.Visitor
    visitMain: <T extends ts.Node>(node: T, unsubscribesId: ts.Identifier | undefined) => T
}

function transformSourceFile(ctx: ts.TransformationContext, typeChecker: ts.TypeChecker, sourceFile: ts.SourceFile, opts: PluginOptions | undefined) {
    console.log('transforming:', sourceFile.fileName.blue)

    // skip empty file
    if (!sourceFile.text) return sourceFile

    const importInfo = getImport(sourceFile)

    // skip no import
    if (!importInfo) return sourceFile

    const { namedImports, isMono, moduleSpecifier } = importInfo

    let componentType: ts.Type
    let runType: ts.Type
    let reactiveType: ts.Type | undefined
    let reactiveArrayType: ts.Type | undefined
    let combineType: ts.Type | undefined
    let removingNodes: ts.Node[] = []
    const monoNames: string[] = []

    if (isMono) removingNodes.push(importInfo.importDeclaration)

    for (const importSpecifier of namedImports.elements) {
        const name = importSpecifier.propertyName?.text ?? importSpecifier.name.text
        if (name === ComponentTypeName) {
            componentType = getInterfaceType(typeChecker, importSpecifier.name)
            console.log('Module Imported!'.cyan)
        } else if (name === RunFunctionName) {
            runType = typeChecker.getTypeAtLocation(importSpecifier.name)
            removingNodes.push(importSpecifier)
            console.log('run Imported!'.cyan, typeChecker.typeToString(runType))
        } else if (name === CombineFunctionName) {
            removingNodes.push(importSpecifier)
        }

        // remove import interface
        const type = typeChecker.getTypeAtLocation(importSpecifier)
        if (type.flags === ts.TypeFlags.Any) {
            removingNodes.push(importSpecifier)
        }

        if (isMono) {
            monoNames.push(name)
        }
    }

    // get module symbol
    const moduleSymbol = typeChecker.getSymbolAtLocation(moduleSpecifier)
    if (!moduleSymbol) throw 'symbol is undefined.'
    if (!moduleSymbol.exports) throw 'exports is undefined.'

    // get types
    reactiveType = getTypeOfExportsByName(typeChecker, moduleSymbol.exports, ReactiveTypeName)
    reactiveArrayType = getTypeOfExportsByName(typeChecker, moduleSymbol.exports, ReactiveArrayTypeName)
    combineType = getTypeOfExportsByName(typeChecker, moduleSymbol.exports, CombineFunctionName)

    if (!reactiveType) throw 'reactiveType is undefined.'
    if (!reactiveArrayType) throw 'reactiveArrayType is undefined.'
    if (!combineType) throw 'combineType is undefined.'

    const options = ctx.getCompilerOptions()
    const module = isMono ? ts.ModuleKind.ES2015 : (options.module || ts.ModuleKind.CommonJS)
    const isPrefixAccessModule =
        module === ts.ModuleKind.CommonJS
        || module === ts.ModuleKind.AMD
        || module === ts.ModuleKind.UMD
        || module === ts.ModuleKind.System

    const createModuleMemberAccess = (name: string) =>
        isPrefixAccessModule
            ? ts.createPropertyAccess(ts.createIdentifier('reactive_tsx_1'), name)
            : ts.createIdentifier(name)

    const context: TransformContext = {
        sourceFile,
        typeChecker,
        ctx,
        reactiveType,
        reactiveArrayType,
        combineType,
        nodeNumber: 1,

        subscribeFuncExp: createModuleMemberAccess(SubscribeFunctionName),
        conditionalFuncExp: createModuleMemberAccess(ConditionalFunctionName),
        replaceNodeFuncExp: createModuleMemberAccess(ReplaceNodeFunctionName),
        mapArrayFuncExp: createModuleMemberAccess(MapArrayFunctionName),
        callChildrenFuncExp: createModuleMemberAccess(CallChildrenFunctionName),
        combineReactiveFuncExp: createModuleMemberAccess(CombineReactiveFunctionName),
        elementFuncExp: createModuleMemberAccess(ElementFunctionName),
        textFuncExp: createModuleMemberAccess(TextFunctionName),

        getMainVisitor: undefined as any,
        visitMain: undefined as any,
    }

    context.getMainVisitor = (unsubscribesId) => {
        return function visitor(node): ts.VisitResult<ts.Node> {
            if (removingNodes.indexOf(node) >= 0) {
                console.log('remove'.yellow, node.getText())
                return undefined
            }

            // find component variable declaration
            if (componentType) {
                if (ts.isVariableDeclaration(node) && node.type && ts.isTypeReferenceNode(node.type)) {
                    const defineComponentSymbol = typeChecker.getSymbolAtLocation(node.name)
                    if (defineComponentSymbol) {
                        const referencedType = getInterfaceType(typeChecker, node.type.typeName)
                        if (referencedType === componentType) {
                            const type = typeChecker.getTypeAtLocation(node)
                            if (!type.aliasTypeArguments || !type.aliasTypeArguments.length)
                                throw 'type argument is not specified.'
                            const propType = type.aliasTypeArguments[0]
                            console.log(
                                'Define Component'.green,
                                'name:',
                                typeChecker.symbolToString(defineComponentSymbol).yellow,
                                'prop:',
                                typeChecker.typeToString(propType).cyan)

                            return transformComponent(context, node, defineComponentSymbol)
                        }
                    }
                }
            }

            // find run function calling
            if (runType) {
                if (ts.isCallExpression(node)) {
                    const callFuncType = typeChecker.getTypeAtLocation(node.expression)
                    if (callFuncType === runType) {
                        console.log('Detect run'.green, node.getText())
                        return transformRun(context, node)
                    }
                }
            }

            // combine function
            if (isCombineCall(node)) {
                return transformCombine(context, unsubscribesId, node)
            }

            // partial jsx
            if (isJex(node)) {
                return transformJsxChildren(context, [node])
            }

            return ts.visitEachChild(node, visitor, ctx)
        }
    }

    context.visitMain = (node, unsubscribesId) => ts.visitEachChild(node, context.getMainVisitor(unsubscribesId), context.ctx)

    let transformedSourceFile = context.visitMain(sourceFile, undefined)

    const requiredFuncNames: string[] = []

    if (context.combineReactiveFuncUsed) {
        requiredFuncNames.push(CombineReactiveFunctionName)
        context.subscribeFuncUsed = true // force use
    }

    if (context.mapArrayFuncUsed) {
        requiredFuncNames.push(MapArrayFunctionName)
    }

    if (context.callChildrenFuncUsed) {
        requiredFuncNames.push(CallChildrenFunctionName)
    }

    if (context.conditionalFuncUsed) {
        requiredFuncNames.push(ConditionalFunctionName)
        context.subscribeFuncUsed = true // force use
    }

    if (context.replaceNodeFuncUsed) {
        requiredFuncNames.push(ReplaceNodeFunctionName)
    }

    if (context.subscribeFuncUsed) {
        requiredFuncNames.push(SubscribeFunctionName)
    }

    if (context.elementFuncUsed) {
        requiredFuncNames.push(ElementFunctionName)
    }

    if (context.textFuncUsed) {
        requiredFuncNames.push(TextFunctionName)
    }

    if (!isMono) {
        const transformedImportInfo = getImport(transformedSourceFile)
        if (!transformedImportInfo) throw 'import not found.'

        const statements = transformedSourceFile.statements
        const newStatements: ts.Statement[] = [
            ...statements.slice(0, transformedImportInfo.statementIndex),
            ts.factory.updateImportDeclaration(
                transformedImportInfo.importDeclaration,
                transformedImportInfo.importDeclaration.decorators,
                transformedImportInfo.importDeclaration.modifiers,
                ts.factory.updateImportClause(
                    transformedImportInfo.importDeclaration.importClause!,
                    transformedImportInfo.importDeclaration.importClause!.isTypeOnly,
                    transformedImportInfo.importDeclaration.importClause!.name,
                    ts.factory.updateNamedImports(transformedImportInfo.namedImports, [
                        ...transformedImportInfo.namedImports.elements,
                        ...requiredFuncNames.map(name => ts.createImportSpecifier(undefined, ts.createIdentifier(name))),
                    ])
                ),
                transformedImportInfo.moduleSpecifier
            ),
            ...statements.slice(transformedImportInfo.statementIndex + 1),
        ]
        transformedSourceFile = ts.factory.updateSourceFile(
            transformedSourceFile,
            newStatements,
            transformedSourceFile.isDeclarationFile,
            transformedSourceFile.referencedFiles,
            transformedSourceFile.typeReferenceDirectives,
            transformedSourceFile.hasNoDefaultLib,
            transformedSourceFile.libReferenceDirectives
        )
    } else {
        console.log('mono mode'.blue)
        monoNames.push(...requiredFuncNames)

        // get main module source file
        const options = ctx.getCompilerOptions()
        const host = opts?.host || ts.createCompilerHost(options)
        const mainModule = ts.resolveModuleName(SourceModuleName, transformedSourceFile.fileName, options, host).resolvedModule
        if (!mainModule) throw 'main module not found.'
        const mainModuleFile = host.getSourceFile(mainModule.resolvedFileName, ts.ScriptTarget.ES2020)
        if (!mainModuleFile) throw 'main module not found.'

        const insertStatements: ts.Statement[] = []
        for (const statement of mainModuleFile.statements) {
            if (ts.isVariableStatement(statement)) {
                for (const variableDeclaration of statement.declarationList.declarations) {
                    if (ts.isIdentifier(variableDeclaration.name)) {
                        const variableName = ts.idText(variableDeclaration.name)

                        if (monoNames.indexOf(variableName) >= 0) {
                            console.log('inlining'.yellow, variableName)

                            const sourceStatement = cloneNode(statement)
                            preserveMultiLine(sourceStatement, statement)

                            // remove export keyword
                            const newStatement = ts.factory.updateVariableStatement(
                                statement,
                                undefined,
                                sourceStatement.declarationList
                            )

                            insertStatements.push(newStatement)
                            break
                        }
                    }
                }
            }
        }

        // insert statements from main module
        const newStatements = [...insertStatements, ...transformedSourceFile.statements]
        transformedSourceFile = ts.factory.updateSourceFile(
            transformedSourceFile,
            newStatements,
            transformedSourceFile.isDeclarationFile,
            transformedSourceFile.referencedFiles,
            transformedSourceFile.typeReferenceDirectives,
            transformedSourceFile.hasNoDefaultLib,
            transformedSourceFile.libReferenceDirectives
        )
    }

    return transformedSourceFile
}

function getImport(sourceFile: ts.SourceFile) {
    let importDeclaration: ts.ImportDeclaration | undefined
    let namedImports: ts.NamedImports | undefined
    let isMono = false
    let moduleSpecifier: ts.StringLiteral | undefined
    let statementIndex = -1

    for (let i = 0; i < sourceFile.statements.length; i++) {
        const node = sourceFile.statements[i]
        if (ts.isImportDeclaration(node)
            && ts.isStringLiteral(node.moduleSpecifier)
            && (node.moduleSpecifier.text === ModuleName || node.moduleSpecifier.text === MonoModuleName)
            && node.importClause
            && node.importClause.namedBindings
            && ts.isNamedImports(node.importClause.namedBindings)
        ) {
            if (namedImports) throw 'import should be only one.'
            namedImports = node.importClause.namedBindings
            isMono = node.moduleSpecifier.text === MonoModuleName
            moduleSpecifier = node.moduleSpecifier
            importDeclaration = node
            statementIndex = i
        }
    }

    if (!importDeclaration) return
    if (!namedImports) throw 'import not found.'
    if (!moduleSpecifier) throw 'moduleSpecifier is undefined.'

    return { importDeclaration, namedImports, isMono, moduleSpecifier, statementIndex }
}

function getTypeOfExportsByName(typeChecker: ts.TypeChecker, exports: ts.SymbolTable, typeName: string) {
    const symbol = exports.get(ts.escapeLeadingUnderscores(typeName))
    if (!symbol) throw typeName + ' symbol is not found.'
    return typeChecker.getDeclaredTypeOfSymbol(symbol)
}

function transformRun(context: TransformContext, node: ts.CallExpression) {
    const nodeExp = node.arguments[0]
    const componentExp = node.arguments[1]
    const propExp = context.visitMain(node.arguments[2], undefined)

    // node = nodeExp
    const nodeId = ts.createIdentifier('node')
    const nodeVariable = ts.createVariableDeclaration(nodeId, undefined, nodeExp)

    // unsubscribes = []
    const unsubscribesId = ts.createIdentifier('unsubscribes')
    const unsubscribesVariable = ts.createVariableDeclaration(unsubscribesId, undefined, ts.createArrayLiteral())

    // child = component(unsubscribes, props)
    const childId = ts.createIdentifier('child')
    const childVariable = ts.createVariableDeclaration(childId, undefined, ts.createCall(componentExp, undefined, [unsubscribesId, propExp]))

    // return () => { ... }
    const xId = ts.createIdentifier("x")
    const returnDispose = (ts.createReturn(ts.createArrowFunction(
        undefined, undefined, [], undefined, undefined,
        ts.createBlock([
            // node.removeChild(child)
            ts.createExpressionStatement(
                ts.createCall(
                    ts.createPropertyAccess(nodeId, 'removeChild'),
                    undefined,
                    [childId]
                )
            ),

            // unsubscribes.forEach(x => x())
            ts.createExpressionStatement(
                ts.createCall(
                    ts.createPropertyAccess(unsubscribesId, 'forEach'),
                    undefined,
                    [ts.createArrowFunction(
                        undefined,
                        undefined,
                        [createSimpleParameter(xId)],
                        undefined,
                        ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                        ts.createCall(
                            xId,
                            undefined,
                            undefined
                        )
                    )]
                )
            )
        ], true)
    )))

    const statements = [
        // const node / unsubscribe / child
        createConstVariableStatement([nodeVariable]),
        createConstVariableStatement([unsubscribesVariable]),
        createConstVariableStatement([childVariable]),
        // node.appendChild(child)
        ts.createStatement(ts.createCall(
            ts.createPropertyAccess(nodeId, 'appendChild'),
            undefined,
            [childId]
        )),
        // return
        returnDispose,
    ]

    // (() => {statements})()
    return ts.createCall(
        ts.createParen(
            ts.createArrowFunction(undefined, undefined, [], undefined, undefined, ts.createBlock(statements, true))
        ),
        undefined,
        undefined
    )
}

function createConstVariableStatement(declarations: ts.VariableDeclaration[]) {
    return ts.createVariableStatement(undefined, ts.createVariableDeclarationList(
        declarations,
        ts.NodeFlags.Const
    ))
}

function transformComponent(context: TransformContext, node: ts.VariableDeclaration, defineComponentSymbol: ts.Symbol) {
    if (!node.initializer)
        throw 'initializer not found.'
    if (!ts.isArrowFunction(node.initializer))
        throw 'initializer is not arrow function.'

    // component function
    const arrowFunction = node.initializer

    // unsubscribes identifier for new parameter
    const unsubscribesId = ts.createIdentifier("unsubscribes")

    let newBody: ts.ConciseBody

    const peeledNode = peelParentheses(arrowFunction.body)
    if (isJex(peeledNode)) {
        newBody = ts.createBlock(
            jsxToStatements(transformJsx(context, unsubscribesId, peeledNode)),
            true
        )
    }
    else if (ts.isBlock(peeledNode)) {
        newBody = transformComponentBody(context, unsubscribesId, peeledNode)
    }
    else {
        throw 'not supported node: ' + ts.SyntaxKind[arrowFunction.body.kind]
    }

    // add unsubscribes to first parameter: (unsubscribes, props) => ...
    // Note: Modify parameters after JSX transformation in order to refer to the type by TypeChecker during JSX transformation.
    const unsubscribesParameter = createSimpleParameter(unsubscribesId)
    const newParameters = [unsubscribesParameter, ...arrowFunction.parameters]

    return ts.factory.updateVariableDeclaration(
        node,
        node.name,
        node.exclamationToken,
        node.type,
        ts.updateArrowFunction(
            arrowFunction,
            arrowFunction.modifiers,
            arrowFunction.typeParameters,
            newParameters,
            arrowFunction.type,
            newBody
        )
    )
}

function peelParentheses(node: ts.Node): ts.Node {
    return ts.isParenthesizedExpression(node) ? peelParentheses(node.expression) : node
}

function transformComponentBody(context: TransformContext, unsubscribesId: ts.Identifier, body: ts.Block): ts.ConciseBody {
    const newStatements: ts.Statement[] = []

    for (const statement of body.statements) {
        if (ts.isReturnStatement(statement)) {
            if (!statement.expression)
                throw 'returns expression not found.'

            const peeledNode = peelParentheses(statement.expression)
            if (!isJex(peeledNode))
                throw 'returns expression is not jsx.'

            newStatements.push(...jsxToStatements(transformJsx(context, unsubscribesId, peeledNode)))
        } else {
            newStatements.push(context.visitMain(statement, unsubscribesId))
        }
    }

    return ts.factory.updateBlock(body, newStatements)
}

function isCombineCall(node: ts.Node): node is ts.CallExpression {
    return ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === CombineFunctionName
}

function transformCombine(context: TransformContext, unsubscribesId: ts.Identifier | undefined, node: ts.CallExpression) {
    context.combineReactiveFuncUsed = true
    const expression = node.arguments[0]
    const reactives = getAllReactives(context, expression)

    // combineReactive(unsubscribes, [reactives], () => expression)
    return ts.createCall(
        context.combineReactiveFuncExp,
        undefined,
        [
            unsubscribesId ?? ts.createIdentifier('undefined'),
            ts.createArrayLiteral(reactives),
            ts.createArrowFunction(undefined, undefined, [], undefined, undefined, expression),
        ]
    )
}

function preserveMultiLine(node: ts.Node, sourceNode: ts.Node) {
    // skip auto parenthesis
    if (ts.isParenthesizedExpression(node) && !ts.isParenthesizedExpression(sourceNode)) {
        node = node.expression
    }

    if ((sourceNode as any).multiLine) {
        (node as any).multiLine = (sourceNode as any).multiLine
    }

    const children: ts.Node[] = []
    node.forEachChild(child => { children.push(child) })

    const sourceChildren: ts.Node[] = []
    sourceNode.forEachChild(child => { sourceChildren.push(child) })

    for (let i = 0; i < children.length; i++) {
        preserveMultiLine(children[i], sourceChildren[i])
    }
}

function testJsxExpression(node: ts.Node, sourceFile: ts.SourceFile, typeChecker: ts.TypeChecker, ctx: ts.TransformationContext) {
    const testVisitor: ts.Visitor = node => {
        if (ts.isJsxExpression(node) && node.expression) {
            const line = ts.getLineAndCharacterOfPosition(sourceFile, node.expression.pos)
            const expType = typeChecker.getTypeAtLocation(node.expression)
            console.log('test expType'.red, typeChecker.typeToString(expType), node.expression.getText(), line)
            return node
        }
        return ts.visitEachChild(node, testVisitor, ctx)
    }

    console.log('---------------- jsx expression test start -----------------'.red)
    ts.visitEachChild(node, testVisitor, ctx)
    console.log('---------------- jsx expression test end -------------------'.red)
}

function isJex(node: ts.Node): node is ts.JsxElement | ts.JsxSelfClosingElement {
    return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)
}

type TransformedJsx = ts.Expression | ts.Statement | ts.Statement[] | undefined

function jsxToStatements(jsx: TransformedJsx): ts.Statement[] {
    if (!jsx) return []
    if (Array.isArray(jsx)) return jsx
    if (isExpression(jsx)) return [ts.createStatement(jsx)]
    return [jsx]
}

function transformJsx(context: TransformContext, unsubscribesId: ts.Identifier, node: ts.JsxElement | ts.JsxSelfClosingElement, onUpdateId?: ts.Identifier) {
    if (ts.isJsxElement(node)) {
        return transformJsxOpeningLike(context, unsubscribesId, node.openingElement, undefined, onUpdateId, node.children)
    } else {
        return transformJsxOpeningLike(context, unsubscribesId, node, undefined, onUpdateId)
    }
}

function transformJsxChild(context: TransformContext, unsubscribesId: ts.Identifier, node: ts.JsxChild, parentNodeId: ts.Identifier): TransformedJsx {
    if (ts.isJsxElement(node)) {
        return transformJsxOpeningLike(context, unsubscribesId, node.openingElement, parentNodeId, undefined, node.children)
    } else if (ts.isJsxSelfClosingElement(node)) {
        return transformJsxOpeningLike(context, unsubscribesId, node, parentNodeId, undefined)
    } else if (ts.isJsxText(node)) {
        if (!parentNodeId) throw 'parentNodeId is undefined.'
        return transformJsxText(context, node, parentNodeId)
    } else if (ts.isJsxExpression(node)) {
        if (!unsubscribesId) throw 'unsubscribesId is undefined.'
        if (!parentNodeId) throw 'parentNodeId is undefined.'
        return transformJsxExpression(context, unsubscribesId, node, parentNodeId)
    } else if (ts.isJsxFragment(node)) {
        // not supported
    }

    throw 'not supported jsx type: ' + ts.SyntaxKind[node.kind] + ' node: ' + node.getText()
}

// <foo/> or <foo>
function transformJsxOpeningLike(context: TransformContext, unsubscribesId: ts.Identifier, jsxNode: ts.JsxOpeningLikeElement, parentNodeId: ts.Identifier | undefined, onUpdateId: ts.Identifier | undefined, children?: readonly ts.JsxChild[]) {
    // <tagName> or <TagNameExp>
    const tagNameExp = getTagNameExpression(jsxNode)

    // for child component
    if (!ts.isStringLiteral(tagNameExp)) {
        // Component()
        const componentCall = createChildComponentCallExpression(
            context,
            unsubscribesId,
            jsxNode,
            children,
            tagNameExp
        )

        if (onUpdateId) {
            // onUpdate(Component())
            return ts.createCall(
                onUpdateId,
                undefined,
                [componentCall]
            )
        } else if (parentNodeId) {
            // parentNode.appendChild(Component())
            return ts.createCall(
                ts.createPropertyAccess(parentNodeId, 'appendChild'),
                undefined,
                [componentCall]
            )
        } else {
            // Component()
            return componentCall
        }
    }

    const newStatements: ts.Statement[] = []

    context.elementFuncUsed = true

    // const element1 = element$('tagName')
    const elementId = ts.createIdentifier(tagNameExp.text + context.nodeNumber++)
    newStatements.push(ts.createVariableStatement(
        undefined,
        ts.createVariableDeclarationList(
            [ts.createVariableDeclaration(
                elementId,
                undefined,
                ts.createCall(context.elementFuncExp, undefined, [tagNameExp])
            )],
            ts.NodeFlags.Const
        )
    ))

    let onCreateEventExpression: ts.Expression | undefined
    let onDestroyEventExpression: ts.Expression | undefined

    // attribute properties assign
    if (jsxNode.attributes.properties.length > 0) {
        const htmlType = getHtmlElementType(context, jsxNode)

        for (const attribute of jsxNode.attributes.properties) {
            if (ts.isJsxSpreadAttribute(attribute)) {
                throw 'jsx spread attribute of element is not supported.'
            }

            let attrName = ts.idText(attribute.name)
            let expression = transformJsxAttributeInitializer(attribute.initializer)
            //console.log('attribute'.red, attrName, expression.getText())

            // lifecycle event
            if (attrName === 'onCreate') {
                onCreateEventExpression = expression
                continue
            } else if (attrName === 'onDestroy') {
                onDestroyEventExpression = expression
                continue
            }

            // style attribute
            if (attrName === 'style') {
                createStyleStatements(context, unsubscribesId, elementId, expression, newStatements)
                continue
            }

            // transform class attribute
            if (attrName === 'class') {
                attrName = 'className'
                expression = transformClassAttributeExpression(expression)
            }

            // check property existence of html element
            const htmlElementProperty = htmlType && context.typeChecker.getPropertyOfType(htmlType, attrName)

            newStatements.push(
                createElementPropertyUpdateStatement(
                    context,
                    unsubscribesId,
                    elementId,
                    ts.createStringLiteral(attrName),
                    expression,
                    htmlElementProperty === undefined
                )
            )
        }
    }

    if (children) {
        const childStatements: ts.Statement[] = []
        for (let i = 0; i < children.length; i++) {
            const child = children[i]
            childStatements.push(...jsxToStatements(transformJsxChild(context, unsubscribesId, child, elementId)))
        }

        // wrap block for children
        if (childStatements.length > 0) {
            newStatements.push(ts.createBlock(childStatements, true))
        }
    }

    if (onCreateEventExpression) {
        // onCreateExp(element)
        newStatements.push(ts.createStatement(ts.createCall(
            onCreateEventExpression,
            undefined,
            [elementId]
        )))
    }

    if (onDestroyEventExpression) {
        // unsubscribes.push(() => onDestroyExp(element))
        newStatements.push(ts.createStatement(ts.createCall(
            ts.createPropertyAccess(unsubscribesId, 'push'),
            undefined,
            [ts.createArrowFunction(
                undefined,
                undefined,
                [],
                undefined,
                undefined,
                ts.createCall(onDestroyEventExpression, undefined, [elementId])
            )]
        )))
    }

    if (onUpdateId) {
        // onUpdate(elementId)
        newStatements.push(ts.createStatement(ts.createCall(
            onUpdateId,
            undefined,
            [elementId]
        )))
    } else if (parentNodeId) {
        // parentNode.appendChild(elementId)
        newStatements.push(ts.createStatement(ts.createCall(
            ts.createPropertyAccess(parentNodeId, 'appendChild'),
            undefined,
            [elementId]
        )))
    } else {
        // return element1
        newStatements.push(ts.createReturn(elementId))
    }

    return newStatements
}

function getHtmlElementType(context: TransformContext, jsxNode: ts.JsxOpeningLikeElement): ts.Type | undefined {
    const symbol = context.typeChecker.getSymbolAtLocation(jsxNode.tagName)
    if (symbol) {
        const jsxType = context.typeChecker.getTypeOfSymbolAtLocation(symbol, jsxNode.tagName)
        const tagSymbol = jsxType.aliasSymbol
        if (tagSymbol) {
            if (tagSymbol.name === 'DetailedHTMLProps') {
                if (!jsxType.aliasTypeArguments || jsxType.aliasTypeArguments.length < 2) throw 'not specified HTML Element Type of ' + tagSymbol.name
                const htmlType = jsxType.aliasTypeArguments[1]
                return htmlType
            }
        }
    }

    return undefined
}

function createChildComponentCallExpression(context: TransformContext, unsubscribesId: ts.Identifier, jsxNode: ts.JsxOpeningLikeElement, children: readonly ts.JsxChild[] | undefined, tagNameExp: ts.JsxTagNameExpression) {
    // create { props }
    const props: ts.ObjectLiteralElementLike[] = []
    for (const attribute of jsxNode.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute)) {
            // ...expression
            props.push(ts.createSpreadAssignment(attribute.expression))
        } else {
            const attrName = ts.idText(attribute.name)
            const expression = transformJsxAttributeInitializer(attribute.initializer)
            //console.log('attribute'.red, attrName, expression.getText())
            // attrName: expression
            props.push(ts.createPropertyAssignment(attrName, expression))
        }
    }

    // add children prop
    if (children && children.length > 0) {
        // children: (node, unsucribes) => {...}
        props.push(ts.createPropertyAssignment(
            ts.createIdentifier(ChildrenPropName),
            transformJsxChildren(context, children)
        ))
    }

    // call child component
    // Component(unsubscribes, { props })
    return ts.createCall(
        tagNameExp,
        undefined,
        [
            unsubscribesId,
            ts.createObjectLiteral(props, true) // { props }
        ]
    )
}

function transformJsxChildren(context: TransformContext, children: readonly ts.JsxChild[]) {
    const childParentNodeId = ts.createIdentifier('parentNode')
    const childUnsubscribesId = ts.createIdentifier('unsubscribes')

    const childStatements: ts.Statement[] = []
    for (let i = 0; i < children.length; i++) {
        const child = children[i]
        childStatements.push(...jsxToStatements(transformJsxChild(context, childUnsubscribesId, child, childParentNodeId)))
    }

    // (node, unsucribes) => {...}
    return ts.createArrowFunction(
        undefined,
        undefined,
        [
            createSimpleParameter(childParentNodeId),
            createSimpleParameter(childUnsubscribesId)
        ],
        undefined,
        ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        ts.createBlock(
            childStatements,
            true
        )
    )
}

function getTagNameExpression(jsxNode: ts.JsxOpeningLikeElement): ts.StringLiteral | ts.JsxTagNameExpression {
    const tagName = jsxNode.tagName
    if (!ts.isIdentifier(tagName)) return tagName

    const name = ts.idText(tagName)
    if (name.length <= 0)
        throw 'name is empty. node: ' + jsxNode.getText()

    // If the first letter is small, it's an HTML tag.
    const isHtmlTag = 'a' <= name[0] && name[0] <= 'z'
    return isHtmlTag ? ts.createStringLiteral(ts.idText(tagName)) : tagName
}

function createElementPropertyUpdateStatement(context: TransformContext, unsubscribesId: ts.Identifier, elementExp: ts.Expression, attrExp: ts.Expression, expression: ts.Expression, useSetAttribute: boolean) {

    const assign =
        useSetAttribute
            // elementExp.setAttribute(attrExp, expression)
            ? ts.createCall(
                ts.createPropertyAccess(elementExp, 'setAttribute'),
                undefined,
                [attrExp, expression])
            // elementExp[attrExp] = expression
            : ts.createAssignment(
                ts.createElementAccess(elementExp, attrExp),
                expression
            )

    const reactives = getAllReactives(context, expression)
    if (reactives.length === 0) {
        // assign
        return ts.createStatement(assign)
    }
    else if (reactives.length === 1) {
        // unsubscribes.push(reactive.subscribe(() => assign))
        return ts.createStatement(
            ts.createCall(
                ts.createPropertyAccess(unsubscribesId, 'push'),
                undefined,
                [ts.createCall(
                    ts.createPropertyAccess(reactives[0], 'subscribe'),
                    undefined,
                    [ts.createArrowFunction(undefined, undefined, [], undefined, undefined, assign)]
                )]
            )
        )
    } else {
        // subscribe$(unsubscribes, [reactives], () => assign)
        return ts.createStatement(
            ts.createCall(
                context.subscribeFuncExp,
                undefined,
                [
                    unsubscribesId,
                    ts.createArrayLiteral(reactives),
                    ts.createArrowFunction(undefined, undefined, [], undefined, undefined, assign),
                ]
            )
        )
    }
}

function createStyleStatements(context: TransformContext, unsubscribesId: ts.Identifier, elementId: ts.Identifier, expression: ts.Expression, statements: ts.Statement[]) {
    if (!ts.isObjectLiteralExpression(expression)) throw 'style must specify an object literal.'

    const styleAccess = ts.createPropertyAccess(elementId, 'style')

    for (const prop of expression.properties) {
        if (ts.isPropertyAssignment(prop)) {
            const name =
                ts.isLiteralExpression(prop.name)
                    ? ts.createStringLiteral(prop.name.text)
                    : ts.isComputedPropertyName(prop.name)
                        ? prop.name.expression
                        : ts.createStringLiteral(ts.idText(prop.name))

            // element.style[name] = initializer
            statements.push(
                createElementPropertyUpdateStatement(
                    context,
                    unsubscribesId,
                    styleAccess,
                    name,
                    prop.initializer,
                    false
                )
            )
        } else {
            throw 'not supported style attribute child type: ' + ts.SyntaxKind[prop.kind]
        }
    }
}

function transformClassAttributeExpression(expression: ts.Expression): ts.Expression {
    const buffer: ts.Expression[] = []

    if (ts.isArrayLiteralExpression(expression)) {
        // (string | {})[]
        for (const element of expression.elements) {
            transformClassAttributeChildExpression(element, buffer)
        }
    } else {
        // string | {}
        transformClassAttributeChildExpression(expression, buffer)
    }

    // combine expressions by +
    let concat: ts.Expression = buffer[0]
    for (let i = 1; i < buffer.length; i++) {
        concat = ts.createAdd(concat, buffer[i])
    }

    return concat
}

function transformClassAttributeChildExpression(expression: ts.Expression, buffer: ts.Expression[]) {
    if (ts.isStringLiteral(expression)) {
        buffer.push(
            ts.createStringLiteral(
                fixClassNameText(expression.text, buffer.length === 0)
            )
        )
    } else if (ts.isObjectLiteralExpression(expression)) {
        for (const prop of expression.properties) {
            if (ts.isPropertyAssignment(prop)) {
                // (initializer ? ' ' + name : '')
                buffer.push(transformClassAttributeChildObjectName(prop, buffer.length === 0))
            } else {
                throw 'not supported class attribute object property type: ' + ts.SyntaxKind[prop.kind]
            }
        }
    } else {
        throw 'not supported class attribute child type: ' + ts.SyntaxKind[expression.kind]
    }
}

function fixClassNameText(text: string, isFirst: boolean): string {
    // add space to 2nd or later string
    text = text.trim()
    return isFirst ? text : ' ' + text
}

function transformClassAttributeChildObjectName(prop: ts.PropertyAssignment, isFirst: boolean) {
    let nameExp: ts.Expression
    if (ts.isLiteralExpression(prop.name)) {
        // ' literal'
        nameExp = ts.createStringLiteral(fixClassNameText(prop.name.text, isFirst))
    } else if (ts.isComputedPropertyName(prop.name)) {
        // ' ' + expression
        nameExp = ts.createAdd(ts.createStringLiteral(' '), prop.name.expression)
    } else {
        // ' name'
        nameExp = ts.createStringLiteral(fixClassNameText(ts.idText(prop.name), isFirst))
    }

    // initializer ? nameExp : ''
    return ts.createConditional(
        prop.initializer,
        nameExp,
        ts.createStringLiteral('')
    )
}

// "foo"
function transformJsxText(context: TransformContext, jsxText: ts.JsxText, parentNodeId: ts.Identifier) {
    context.textFuncUsed = true

    const stringLiteral = createFixedStringLiteral(jsxText.text)
    if (!stringLiteral) return undefined // skip

    // parentNode.appendChild(text$('text'))
    return ts.createCall(
        ts.createPropertyAccess(parentNodeId, 'appendChild'),
        undefined,
        [ts.createCall(context.textFuncExp, undefined, [stringLiteral])]
    )
}

// {foo}
function transformJsxExpression(context: TransformContext, unsubscribesId: ts.Identifier, jsxExpression: ts.JsxExpression, parentNodeId: ts.Identifier) {
    if (!jsxExpression.expression) return []

    // conditional
    if (isConditionalable(jsxExpression.expression)) {
        return createConditionalStatements(context, unsubscribesId, jsxExpression.expression, parentNodeId)
    }

    // jsx
    if (isJex(jsxExpression.expression)) {
        return transformJsxChild(context, unsubscribesId, jsxExpression.expression, parentNodeId)
    }

    // array mapping
    if (ts.isCallExpression(jsxExpression.expression) && ts.isPropertyAccessExpression(jsxExpression.expression.expression)) {
        const mapAccess = jsxExpression.expression.expression
        const reactiveArrayExp = mapAccess.expression
        const objType = context.typeChecker.getTypeAtLocation(reactiveArrayExp)
        if (isAssignable(context.typeChecker, context.reactiveArrayType, objType)) {
            const selectExp = jsxExpression.expression.arguments[0]
            if (!ts.isArrowFunction(selectExp)) throw 'select parameter is not arrow function.'

            const peeledNode = peelParentheses(selectExp.body)
            if (!isJex(peeledNode)) throw 'select must returns JSX.'

            const childUnsubscribesId = ts.createIdentifier('unsubscribes')

            const body = jsxToBody(transformJsx(context, childUnsubscribesId, peeledNode))
            if (!body) throw 'body is undefined.'

            const unsubscribesParameter = createSimpleParameter(childUnsubscribesId)
            const itemParameter = selectExp.parameters[0]
            const indexParameter = selectExp.parameters[1]

            const parameters: ts.ParameterDeclaration[] = [unsubscribesParameter]
            if (itemParameter) parameters.push(itemParameter)
            if (indexParameter) parameters.push(indexParameter)

            const createExp = ts.createArrowFunction(
                undefined,
                undefined,
                parameters,
                undefined,
                undefined,
                body
            )

            context.mapArrayFuncUsed = true

            // mapArray(reactiveArray, (item, index, unsubscribes) => Node)
            return ts.createCall(
                context.mapArrayFuncExp,
                undefined,
                [parentNodeId, reactiveArrayExp, createExp]
            )
        }
    }

    // subscribe reactives
    const reactives = getAllReactives(context, jsxExpression.expression)
    if (reactives.length > 0) {
        console.log('reactives'.gray, reactives.map(r => r.getText()), jsxExpression.expression.getText())
        return createReactiveText(context, unsubscribesId, jsxExpression.expression, reactives, parentNodeId)
    }

    // children render
    const jsxElementInfo = isJsxElementType(context, jsxExpression.expression)
    if (jsxElementInfo) {
        if (jsxElementInfo.isArray) {
            context.callChildrenFuncUsed = true

            // callChildren$(children, parentNode, unsubscribes)
            return ts.createCall(
                context.callChildrenFuncExp,
                undefined,
                [context.visitMain(jsxExpression.expression, unsubscribesId), parentNodeId, unsubscribesId]
            )
        }

        // chidren(parentNode, unsubscribes)
        const childrenCall = ts.createCall(
            jsxExpression.expression,
            undefined,
            [parentNodeId, unsubscribesId]
        )

        if (jsxElementInfo.isNullable) {
            // children && chidren(...)
            return ts.createLogicalAnd(
                jsxExpression.expression,
                childrenCall
            )
        }

        // children(...)
        return childrenCall
    }

    context.textFuncUsed = true

    // parentNode.appendChild(text$('expression'))
    console.log('EXPRESSION TEXT'.red, jsxExpression.getText())
    return ts.createCall(
        ts.createPropertyAccess(parentNodeId, 'appendChild'),
        undefined,
        [ts.createCall(context.textFuncExp, undefined, [jsxExpression.expression])]
    )
}

function isJsxElementType(context: TransformContext, node: ts.Node): { isNullable: boolean, isArray: boolean } | undefined {
    const expType = context.typeChecker.getTypeAtLocation(node)
    //console.log('children'.gray, context.typeChecker.typeToString(expType), node.getText())

    let isNullable = false
    let isElement = false
    let isArray = false

    if (isElementSymbol(expType.symbol)) {
        isElement = true
    } else if (expType.isUnion()) {
        for (const t of expType.types) {
            if (isElementSymbol(t.symbol)) {
                isElement = true
            } else if ((t.flags & ts.TypeFlags.Undefined) !== 0) {
                isNullable = true
            }
        }
    } else if (
        expType.symbol
        && expType.symbol.name === 'Array'
        && isElementSymbol(context.typeChecker.getTypeArguments(expType as ts.TypeReference)[0].symbol)) {
        isArray = true
        isElement = true
    }

    return isElement ? { isNullable, isArray } : undefined
}

function isElementSymbol(symbol: ts.Symbol) {
    return symbol && symbol.name === 'Element'
}

// is node can conditional()
function isConditionalable(node: ts.Node): node is ts.ConditionalExpression | ts.BinaryExpression {
    // && binary expression
    if (ts.isBinaryExpression(node)
        && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        return true
    }

    // conditonExp ? trueExp : falseExp
    if (ts.isConditionalExpression(node)) {
        return true
    }

    return false
}

// conditional()
function createConditionalStatements(context: TransformContext, unsubscribesId: ts.Identifier, exp: ts.ConditionalExpression | ts.BinaryExpression, parentNodeId: ts.Identifier): ts.Statement[] {
    const statements: ts.Statement[] = []

    context.textFuncUsed = true

    // let currentNode1 = text$('')
    const currentNodeId = ts.createIdentifier('currentNode' + context.nodeNumber++)
    statements.push(ts.createVariableStatement(
        undefined,
        ts.createVariableDeclarationList([
            ts.createVariableDeclaration(
                currentNodeId,
                undefined,
                ts.createCall(context.textFuncExp, undefined, [ts.createStringLiteral('')])
            )
        ], ts.NodeFlags.Let)
    ))

    // parentNode.appendChild(currentNode)
    statements.push(ts.createStatement(ts.createCall(
        ts.createPropertyAccess(parentNodeId, 'appendChild'),
        undefined,
        [currentNodeId]
    )))

    context.replaceNodeFuncUsed = true

    // node => currentNode = replaceNode$(node, currentNode, parentNode)
    const nodeId = ts.createIdentifier('node')
    const nodeParameter = createSimpleParameter(nodeId)
    const onUpdate = ts.createArrowFunction(undefined, undefined, [nodeParameter], undefined, undefined,
        ts.createAssignment(
            currentNodeId,
            ts.createCall(
                context.replaceNodeFuncExp,
                undefined,
                [nodeId, currentNodeId, parentNodeId]
            )
        )
    )

    statements.push(ts.createStatement(
        createCallConditionalInternal(
            context,
            unsubscribesId,
            exp,
            parentNodeId,
            onUpdate,
        )
    ))

    return statements
}

function createCallConditionalInternal(context: TransformContext, unsubscribesId: ts.Identifier, exp: ts.ConditionalExpression | ts.BinaryExpression, parentNodeId: ts.Identifier | undefined, onUpdate: ts.Identifier | ts.ArrowFunction, nestCount?: number) {
    nestCount = nestCount || 1
    let nestSpace = ''
    for (let i = 0; i < nestCount; i++) nestSpace += '    '

    let conditionExp: ts.Expression
    let trueExp: ts.Expression | undefined
    let falseExp: ts.Expression | undefined

    if (ts.isConditionalExpression(exp)) {
        conditionExp = exp.condition
        trueExp = exp.whenTrue
        falseExp = exp.whenFalse
    } else {
        conditionExp = exp.left
        trueExp = exp.right
    }

    const reactivesInCondition = getAllReactives(context, conditionExp)
    const reactivesInTrue = trueExp ? getAllReactives(context, trueExp, true) : []
    const reactivesInFalse = falseExp ? getAllReactives(context, falseExp, true) : []
    // console.log('reactives in condition'.gray, reactivesInCondition.map(r => r.getText()), conditionExp.getText())
    // console.log('reactives in true'.gray, reactivesInTrue.map(r => r.getText()), trueExp.getText())
    // console.log('reactives in false'.gray, reactivesInFalse.map(r => r.getText()), falseExp && falseExp.getText())

    // for onUpdate parameter of NodeCreator
    const onUpdateId = ts.createIdentifier('onUpdate')
    const onUpdateParameter = createSimpleParameter(onUpdateId)

    context.conditionalFuncUsed = true

    // for unsubscribes parameter of NodeCreator
    const childUnsubscribesId = ts.createIdentifier('unsubscribes')
    const childUnsubscribesParameter = createSimpleParameter(childUnsubscribesId)

    const trueBody =
        !trueExp
            ? undefined
            : isJex(trueExp)
                ? jsxToBody(transformJsx(context, childUnsubscribesId, trueExp, onUpdateId))
                : isConditionalable(trueExp)
                    ? createCallConditionalInternal(context, childUnsubscribesId, trueExp, undefined, onUpdateId, nestCount + 1)
                    : createUpdateText(context, onUpdateId, trueExp)

    const falseBody =
        !falseExp
            ? undefined
            : isJex(falseExp)
                ? jsxToBody(transformJsx(context, childUnsubscribesId, falseExp, onUpdateId))
                : isConditionalable(falseExp)
                    ? createCallConditionalInternal(context, childUnsubscribesId, falseExp, undefined, onUpdateId, nestCount + 1)
                    : createUpdateText(context, onUpdateId, falseExp)

    // conditional(unsubscribes, [reactives], () => condition, [reactives], (unsubscribes) => Node, [reactives], (unsubscribes) => Node, (node) => void)
    const callConditional = ts.createCall(
        context.conditionalFuncExp,
        undefined,
        [
            unsubscribesId,
            addComment(`\n${nestSpace}condition`, ts.createArrayLiteral(reactivesInCondition)),
            ts.createArrowFunction(undefined, undefined, [], undefined, undefined, conditionExp),
            addComment(`\n${nestSpace}whenTrue `, reactivesInTrue.length !== 0 ? ts.createArrayLiteral(reactivesInTrue) : ts.createIdentifier('undefined')),
            trueBody ? ts.createArrowFunction(undefined, undefined, [childUnsubscribesParameter, onUpdateParameter], undefined, undefined, trueBody) : ts.createIdentifier('undefined'),
            addComment(`\n${nestSpace}whenFalse`, reactivesInFalse.length !== 0 ? ts.createArrayLiteral(reactivesInFalse) : ts.createIdentifier('undefined')),
            falseBody ? ts.createArrowFunction(undefined, undefined, [childUnsubscribesParameter, onUpdateParameter], undefined, undefined, falseBody) : ts.createIdentifier('undefined'),
            addComment(`\n${nestSpace}onUpdate `, ts.getMutableClone(onUpdate)),
        ]
    )

    return callConditional
}

function addComment<T extends ts.Node>(comment: string, node: T): T {
    return ts.addSyntheticLeadingComment(node, ts.SyntaxKind.MultiLineCommentTrivia, comment, false)
}

function jsxToBody(jsx: ts.CallExpression | ts.Statement[]) {
    return !Array.isArray(jsx) && ts.isCallExpression(jsx) ? jsx : ts.createBlock(jsxToStatements(jsx), true)
}

function isExpression(node: ts.Node): node is ts.Expression {
    switch (node.kind) {
        case ts.SyntaxKind.CallExpression:
        case ts.SyntaxKind.BinaryExpression:
            return true
        default:
            return false
    }
}

function createUpdateText(context: TransformContext, onUpdateId: ts.Identifier, expression: ts.Expression) {
    // onUpdate(text) or onUpdate(expression || '')
    return ts.createCall(
        onUpdateId,
        undefined,
        [ts.isStringLiteral(expression) ? expression : ts.createLogicalOr(expression, ts.createStringLiteral(''))]
    )
}

function createReactiveText(context: TransformContext, unsubscribesId: ts.Identifier, expression: ts.Expression, reactives: ts.Expression[], parentNodeId: ts.Identifier | undefined) {
    // simple text
    if (reactives.length === 0) {
        context.textFuncUsed = true

        // text$(expression || '')
        const textNode = ts.createCall(
            context.textFuncExp,
            undefined,
            [ts.createLogicalOr(expression, ts.createStringLiteral(''))]
        )

        if (parentNodeId) {
            // parentNode.appendChild(textNode)
            return ts.createCall(
                ts.createPropertyAccess(parentNodeId, 'appendChild'),
                undefined,
                [textNode]
            )
        } else {
            // textNode
            return textNode
        }
    }

    const statements: ts.Statement[] = []

    context.textFuncUsed = true

    // const text1 = text$('')
    const textNodeId = ts.createIdentifier('text' + context.nodeNumber++)
    statements.push(ts.createVariableStatement(
        undefined,
        ts.createVariableDeclarationList(
            [ts.createVariableDeclaration(
                textNodeId,
                undefined,
                ts.createCall(context.textFuncExp, undefined, [ts.createStringLiteral('')])
            )],
            ts.NodeFlags.Const
        )
    ))

    // () => textNode.nodeValue = expression
    const actionArrowFunction = ts.createArrowFunction(
        undefined,
        undefined,
        [],
        undefined,
        undefined,
        ts.createAssignment(
            ts.createPropertyAccess(textNodeId, 'nodeValue'),
            expression
        )
    )

    // single subscribe
    if (reactives.length === 1) {
        // unsubscribes.push(reactive.subscribe(() => textNode.nodeValue = expression))
        statements.push(ts.createStatement(ts.createCall(
            ts.createPropertyAccess(unsubscribesId, 'push'),
            undefined,
            [ts.createCall(
                ts.createPropertyAccess(reactives[0], 'subscribe'),
                undefined,
                [actionArrowFunction]
            )]
        )))
    }
    else {
        // subscribe(unsubscribes, [reactives], () => textNode.nodeValue = expression)
        statements.push(ts.createStatement(ts.createCall(
            context.subscribeFuncExp,
            undefined,
            [unsubscribesId, ts.createArrayLiteral(reactives), actionArrowFunction]
        )))

        context.subscribeFuncUsed = true
    }

    if (parentNodeId) {
        // parentNode.appendChild(textNode)
        statements.push(ts.createStatement(ts.createCall(
            ts.createPropertyAccess(parentNodeId, 'appendChild'),
            undefined,
            [textNodeId]
        )))
    } else {
        // return textNode
        statements.push(ts.createReturn(textNodeId))
    }

    return statements
}

function createReactiveTextBlock(context: TransformContext, unsubscribesId: ts.Identifier, expression: ts.Expression, reactives: ts.Expression[], parentNodeId: ts.Identifier | undefined) {
    const text = createReactiveText(context, unsubscribesId, expression, reactives, parentNodeId)
    return Array.isArray(text) ? ts.createBlock(text, true) : text
}

function createFixedStringLiteral(text: string) {
    const fixed = fixupWhitespaceAndDecodeEntities(text);
    return fixed ? ts.createStringLiteral(fixed) : undefined
}

type ReactivesSearchBuffer = { exp: ts.Expression, text: string }[]

function getAllReactives(context: TransformContext, node: ts.Node, skipConditionalable?: boolean): ts.Expression[] {
    const buffer: ReactivesSearchBuffer = []
    getAllReactivesInternal(context, node, skipConditionalable || false, buffer)
    return buffer.map(x => x.exp)
}

function getAllReactivesInternal(context: TransformContext, node: ts.Node, skipConditionalable: boolean, buffer: ReactivesSearchBuffer) {
    //console.log('searchReactive'.gray, node.getText())

    // skip arrow function
    if (ts.isArrowFunction(node)) {
        return
    }

    // skip jsx
    if (isJex(node)) {
        return
    }

    // skip conditionalable
    if (skipConditionalable && isConditionalable(node)) {
        return
    }

    const type = context.typeChecker.getTypeAtLocation(node)
    if (isAssignable(context.typeChecker, context.reactiveType, type)) {
        const text = node.getText()
        if (buffer.findIndex(v => v.text === text) < 0) {
            buffer.push({ exp: node as ts.Expression, text })
        }
    } else {
        node.forEachChild(child => getAllReactivesInternal(context, child, skipConditionalable, buffer))
    }
}

function isAssignable(typeChecker: ts.TypeChecker, type: ts.Type, assignType: ts.Type) {
    if (type === assignType) return true
    if (assignType.aliasSymbol) {
        const alias = typeChecker.getDeclaredTypeOfSymbol(assignType.aliasSymbol)
        if (type === alias) return true
    }
    return false
}

// <foo bar> <foo bar="x"> <foo bar={...}>
function transformJsxAttributeInitializer(initializer: ts.StringLiteral | ts.JsxExpression | undefined): ts.Expression {
    if (!initializer) {
        return ts.createTrue()
    } else if (ts.isStringLiteral(initializer)) {
        return initializer
    } else if (ts.isJsxExpression(initializer)) {
        const exp = initializer.expression
        if (!exp) throw 'expression is not set.'
        return exp
    }

    throw 'unknown attribute initializer'
}

function getInterfaceType(typeChecker: ts.TypeChecker, node: ts.Node) {
    const symbol = typeChecker.getSymbolAtLocation(node)
    if (!symbol) throw node.getText() + ' symbol is undefined.'
    return typeChecker.getDeclaredTypeOfSymbol(symbol)
}

function createSimpleParameter(id: ts.Identifier) {
    return ts.createParameter(
        undefined,
        undefined,
        undefined,
        id,
    )
}

function debugPrint(node: ts.Statement | ts.SourceFile) {
    const printer = ts.createPrinter()
    const file = ts.isSourceFile(node) ? node : ts.updateSourceFileNode(ts.createSourceFile('', '', ts.ScriptTarget.ES2020), [node])
    const text = printer.printFile(file)
    console.log(text)
}

function printNodeTree(node: ts.Node, nest?: number) {
    if (!nest) nest = 0
    let space = ''
    for (let i = 0; i < nest; i++) space += ' '
    console.log(space, ts.SyntaxKind[node.kind])
    node.forEachChild(child => printNodeTree(child, (nest ?? 0) + 1))
}