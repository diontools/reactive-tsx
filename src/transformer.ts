import * as ts from 'typescript'
import { fixupWhitespaceAndDecodeEntities } from './tsxUtility'
import { cloneNode } from '@wessberg/ts-clone-node'
import * as fs from 'fs'
import * as path from 'path'
import 'colors'

const ModuleName = 'reactive-tsx'
const MonoModuleName = 'reactive-tsx/mono'
const ComponentTypeName = 'Component'
const RunFunctionName = 'run'
const ChildrenPropName = 'children'
const ReactiveTypeName = 'Reactive'
const ReactiveArrayTypeName = 'ReactiveArray'
const SubscribeFunctionName = 'subscribe'
const ConditionalFunctionName = 'conditional'
const ConditionalTextFunctionName = 'conditionalText'
const MapArrayFunctionName = 'mapArray'

export interface MyPluginOptions {
}

export default function myTransformerPlugin(program: ts.Program, opts: MyPluginOptions) {
    const typeChecker = program.getTypeChecker()
    return {
        before(ctx: ts.TransformationContext) {
            return (sourceFile: ts.SourceFile) => transformSourceFile(ctx, typeChecker, sourceFile)
        }
    }
}

function transformSourceFile(ctx: ts.TransformationContext, typeChecker: ts.TypeChecker, sourceFile: ts.SourceFile) {
    console.log('transforming:', sourceFile.fileName.blue)

    let componentType: ts.Type | undefined = undefined
    let runType: ts.Type | undefined = undefined
    let reactiveType: ts.Type | undefined = undefined
    let reactiveArrayType: ts.Type | undefined = undefined
    let importStatementIndex = -1
    let removingNodes: ts.Node[] = []
    let isMono = false
    const monoNames: string[] = []

    for (let i = 0; i < sourceFile.statements.length; i++) {
        const node = sourceFile.statements[i]
        if (ts.isImportDeclaration(node)
            && ts.isStringLiteral(node.moduleSpecifier)
            && (node.moduleSpecifier.text === ModuleName || node.moduleSpecifier.text === MonoModuleName)
            && node.importClause
            && node.importClause.namedBindings
            && ts.isNamedImports(node.importClause.namedBindings)
        ) {
            isMono = node.moduleSpecifier.text === MonoModuleName

            for (const importSpecifier of node.importClause.namedBindings.elements) {
                const name = importSpecifier.propertyName?.text ?? importSpecifier.name.text
                if (name === ComponentTypeName) {
                    componentType = getInterfaceType(typeChecker, importSpecifier.name)
                    importStatementIndex = i
                    console.log('Module Imported!'.cyan)
                } else if (name === RunFunctionName) {
                    runType = typeChecker.getTypeAtLocation(importSpecifier.name)
                    importStatementIndex = i
                    removingNodes.push(importSpecifier)
                    console.log('run Imported!'.cyan, typeChecker.typeToString(runType))
                }

                if (isMono) {
                    monoNames.push(name)
                }
            }

            // get module symbol
            const moduleSymbol = typeChecker.getSymbolAtLocation(node.moduleSpecifier)
            if (!moduleSymbol) throw 'symbol is undefined.'
            if (!moduleSymbol.exports) throw 'exports is undefined.'

            // get types
            reactiveType = getTypeOfExportsByName(typeChecker, moduleSymbol.exports, ReactiveTypeName)
            reactiveArrayType = getTypeOfExportsByName(typeChecker, moduleSymbol.exports, ReactiveArrayTypeName)
        }
    }

    if (importStatementIndex < 0) {
        console.log('not contain module'.yellow)
        return sourceFile
    }

    if (!reactiveType) throw 'reactiveType is undefined.'
    if (!reactiveArrayType) throw 'reactiveArrayType is undefined.'

    const context: TransformContext = {
        sourceFile,
        typeChecker,
        ctx,
        reactiveType,
        reactiveArrayType,
    }

    function visitor(node: ts.Node): ts.VisitResult<ts.Node> {
        if (removingNodes.indexOf(node) >= 0) {
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
                    return transformRun(node)
                }
            }
        }

        return ts.visitEachChild(node, visitor, ctx)
    }

    let transformedSourceFile = ts.visitEachChild(sourceFile, visitor, ctx)

    if (isMono) {
        console.log('mono mode'.blue)

        if (context.mapArrayFuncUsed) {
            monoNames.push(MapArrayFunctionName)
        }

        if (context.conditionalFuncUsed) {
            monoNames.push(ConditionalFunctionName)
            context.subscribeFuncUsed = true // force use
        }

        if (context.conditionalTextFuncUsed) {
            monoNames.push(ConditionalTextFunctionName)
            context.subscribeFuncUsed = true // force use
        }

        if (context.subscribeFuncUsed) {
            monoNames.push(SubscribeFunctionName)
        }

        // remove import declaration
        let newStatements: ts.Statement[] = transformedSourceFile.statements.filter((s, i) => i !== importStatementIndex)

        // get main module source file
        const sourceText = fs.readFileSync(path.join(__dirname, 'index.ts')).toString()
        const mainModuleFile = ts.createSourceFile('index.ts', sourceText, ts.ScriptTarget.ES2020)

        const insertStatements: ts.Statement[] = []
        for (const statement of mainModuleFile.statements) {
            if (ts.isVariableStatement(statement)
                && (statement.modifiers?.findIndex(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? -1) >= 0) {
                for (const variableDeclaration of statement.declarationList.declarations) {
                    if (ts.isIdentifier(variableDeclaration.name)) {
                        const variableName = ts.idText(variableDeclaration.name)

                        if (monoNames.indexOf(variableName) >= 0) {
                            console.log('inlining'.yellow, variableName)

                            const newStatement = cloneNode(statement)
                            preserveMultiLine(newStatement, statement)
                            newStatement.modifiers = undefined // remove export keyword

                            insertStatements.push(newStatement)
                            break
                        }
                    }
                }
            }
        }

        // insert statements from main module
        newStatements = [...insertStatements, ...newStatements]
        //newStatements.push(...insertStatements)
        transformedSourceFile = ts.updateSourceFileNode(transformedSourceFile, newStatements)
    }

    return transformedSourceFile
}

function getTypeOfExportsByName(typeChecker: ts.TypeChecker, exports: ts.SymbolTable, typeName: string) {
    const symbol = exports.get(ts.escapeLeadingUnderscores(typeName))
    if (!symbol) throw typeName + ' symbol is not found.'
    return typeChecker.getDeclaredTypeOfSymbol(symbol)    
}

function transformRun(node: ts.CallExpression) {
    const nodeExp = node.arguments[0]
    const componentExp = node.arguments[1]
    const propExp = node.arguments[2]

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
        // const node, unsubscribe, child
        ts.createVariableStatement(undefined, ts.createVariableDeclarationList(
            [nodeVariable, unsubscribesVariable, childVariable],
            ts.NodeFlags.Const
        )),
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

function transformComponent(context: TransformContext, node: ts.VariableDeclaration, defineComponentSymbol: ts.Symbol) {
    const newNode = ts.getMutableClone(node)

    if (!newNode.initializer)
        throw 'initializer not found.'
    if (!ts.isArrowFunction(newNode.initializer))
        throw 'initializer is not arrow function.'

    // component function
    const arrowFunction = newNode.initializer = ts.getMutableClone(newNode.initializer)

    // unsubscribes identifier for new parameter
    const unsubscribesId = ts.createIdentifier("unsubscribes")

    if (isJex(arrowFunction.body)) {
        arrowFunction.body = ts.createBlock(
            jsxToStatements(transformJsx(context, unsubscribesId, arrowFunction.body, undefined, 1)),
            true
        )
    }
    else if (ts.isBlock(arrowFunction.body)) {
        const body = arrowFunction.body = ts.getMutableClone(arrowFunction.body)

        const returnIndex = body.statements.findIndex(statement => ts.isReturnStatement(statement))
        if (returnIndex < 0)
            throw 'return statement not found.'

        const returnStatement = body.statements[returnIndex] as ts.ReturnStatement
        if (!returnStatement.expression)
            throw 'returns expression not found.'
        if (!isJex(returnStatement.expression))
            throw 'returns expression is not jsx.'

        body.statements = ts.createNodeArray([
            ...body.statements.slice(0, returnIndex),
            ...jsxToStatements(transformJsx(context, unsubscribesId, returnStatement.expression, undefined, 1)),
            ...body.statements.slice(returnIndex + 1)
        ])
    }
    else {
        throw 'not supported node: ' + ts.SyntaxKind[arrowFunction.body.kind]
    }

    // add unsubscribes to first parameter: (unsubscribes, props) => ...
    // Note: Modify parameters after JSX transformation in order to refer to the type by TypeChecker during JSX transformation.
    const unsubscribesParameter = createSimpleParameter(unsubscribesId)
    arrowFunction.parameters = ts.createNodeArray([unsubscribesParameter, ...arrowFunction.parameters])

    return newNode
}

function preserveMultiLine(node: ts.Node, sourceNode: ts.Node) {
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

// document.createElement, document.createTextNode
const documentId = ts.createIdentifier('document')
const createElementMethod = ts.createPropertyAccess(documentId, 'createElement')
const createTextNodeMethod = ts.createPropertyAccess(documentId, 'createTextNode')

function isJex(node: ts.Node): node is ts.JsxChild {
    return ts.isJsxElement(node)
        || ts.isJsxSelfClosingElement(node)
        || ts.isJsxText(node)
        || ts.isJsxExpression(node)
        || ts.isJsxFragment(node)
}

type TransformContext = {
    sourceFile: ts.SourceFile
    typeChecker: ts.TypeChecker
    ctx: ts.TransformationContext
    reactiveType: ts.Type
    reactiveArrayType: ts.Type
    subscribeFuncUsed?: true
    conditionalFuncUsed?: true
    conditionalTextFuncUsed?: true
    mapArrayFuncUsed?: true
}

type TransformedJsx = ts.CallExpression | ts.Statement | ts.Statement[] | undefined

function jsxToStatements(jsx: TransformedJsx): ts.Statement[] {
    if (!jsx) return []
    if (Array.isArray(jsx)) return jsx
    if (ts.isCallExpression(jsx)) return [ts.createStatement(jsx)]
    return [jsx]
}

function transformJsx(context: TransformContext, unsubscribesId: ts.Identifier, node: ts.JsxChild, parentNodeId: ts.Identifier | undefined, nodeNumber: number): TransformedJsx {
    if (ts.isJsxElement(node)) {
        return transformJsxOpeningLike(context, unsubscribesId, node.openingElement, parentNodeId, nodeNumber, node.children)
    } else if (ts.isJsxSelfClosingElement(node)) {
        return transformJsxOpeningLike(context, unsubscribesId, node, parentNodeId, nodeNumber)
    } else if (ts.isJsxText(node)) {
        if (!parentNodeId) throw 'parentNodeId is undefined.'
        return transformJsxText(node, parentNodeId)
    } else if (ts.isJsxExpression(node)) {
        if (!unsubscribesId) throw 'unsubscribesId is undefined.'
        if (!parentNodeId) throw 'parentNodeId is undefined.'
        return transformJsxExpression(context, unsubscribesId, node, parentNodeId, nodeNumber)
    } else if (ts.isJsxFragment(node)) {
        // not supported
    }

    throw 'not supported jsx type: ' + ts.SyntaxKind[node.kind] + ' node: ' + node.getText()
}

// <foo/> or <foo>
function transformJsxOpeningLike(context: TransformContext, unsubscribesId: ts.Identifier, jsxNode: ts.JsxOpeningLikeElement, parentNodeId: ts.Identifier | undefined, nodeNumber: number, children?: readonly ts.JsxChild[]): TransformedJsx {
    // <tagName> or <TagNameExp>
    const tagNameExp = getTagNameExpression(jsxNode)

    // for child component
    if (!ts.isStringLiteral(tagNameExp)) {
        // root.appendChild(Component(unsubscribes, ...))
        return createChildComponentCallExpression(
            context,
            unsubscribesId,
            jsxNode,
            parentNodeId,
            nodeNumber,
            children,
            tagNameExp
        )
    }

    const newStatements: ts.Statement[] = []

    // const element1 = document.createElement('tagName')
    const elementId = ts.createIdentifier(tagNameExp.text + nodeNumber)
    newStatements.push(ts.createVariableStatement(
        undefined,
        ts.createVariableDeclarationList(
            [ts.createVariableDeclaration(
                elementId,
                undefined,
                ts.createCall(createElementMethod, undefined, [tagNameExp])
            )],
            ts.NodeFlags.Const
        )
    ))

    // attribute properties assign
    for (const attribute of jsxNode.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute)) {
            throw 'jsx spread attribute is not supported yet.'
        }

        const attrName = ts.idText(attribute.name)
        const expression = transformJsxAttributeInitializer(attribute.initializer)
        //console.log('attribute'.red, attrName, expression.getText())

        // root['attrName'] = expression
        newStatements.push(ts.createStatement(
            ts.createAssignment(
                ts.createElementAccess(elementId, ts.createStringLiteral(attrName)),
                expression
            )
        ))
    }

    if (children) {
        const childStatements: ts.Statement[] = []
        for (let i = 0; i < children.length; i++) {
            const child = children[i]
            childStatements.push(...jsxToStatements(transformJsx(context, unsubscribesId, child, elementId, nodeNumber + 1 + i)))
        }

        // wrap block for children
        if (childStatements.length > 0) {
            newStatements.push(ts.createBlock(childStatements, true))
        }
    }

    if (parentNodeId) {
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

function createChildComponentCallExpression(context: TransformContext, unsubscribesId: ts.Identifier, jsxNode: ts.JsxOpeningLikeElement, parentNodeId: ts.Identifier | undefined, nodeNumber: number, children: readonly ts.JsxChild[] | undefined, tagNameExp: ts.JsxTagNameExpression) {
    // create { props }
    const props: ts.ObjectLiteralElementLike[] = []
    for (const attribute of jsxNode.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute)) {
            throw 'jsx spread attribute is not supported yet.'
        }

        const attrName = ts.idText(attribute.name)
        const expression = transformJsxAttributeInitializer(attribute.initializer)
        //console.log('attribute'.red, attrName, expression.getText())
        // attrName: expression
        props.push(ts.createPropertyAssignment(attrName, expression))
    }

    // add children prop
    if (children) {
        const childParentNodeId = ts.createIdentifier('parentNode')
        const childUnsubscribesId = ts.createIdentifier('unsubscribes')

        const childStatements: ts.Statement[] = []
        for (let i = 0; i < children.length; i++) {
            const child = children[i]
            childStatements.push(...jsxToStatements(transformJsx(context, unsubscribesId, child, childParentNodeId, nodeNumber + 1 + i)))
        }

        if (childStatements.length > 0) {
            // children: (node, unsucribes) => {...}
            props.push(ts.createPropertyAssignment(
                ts.createIdentifier("children"),
                ts.createArrowFunction(
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
            ))
        }
    }

    // call child component
    // Component(unsubscribes, { props })
    const callChild = ts.createCall(
        tagNameExp,
        undefined,
        [
            unsubscribesId,
            ts.createObjectLiteral(props, true) // { props }
        ]
    )

    if (!parentNodeId) {
        return callChild
    }

    // parentNode.appendChild(exp)
    return ts.createCall(
        ts.createPropertyAccess(parentNodeId, 'appendChild'),
        undefined,
        [callChild]
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

// "foo"
function transformJsxText(jsxText: ts.JsxText, parentNodeId: ts.Identifier) {
    const stringLiteral = createFixedStringLiteral(jsxText.text)
    if (!stringLiteral) return undefined // skip

    // parentNode.appendChild(document.createTextNode('text'))
    return ts.createCall(
        ts.createPropertyAccess(parentNodeId, 'appendChild'),
        undefined,
        [ts.createCall(createTextNodeMethod, undefined, [stringLiteral])]
    )
}

// {foo}
function transformJsxExpression(context: TransformContext, unsubscribesId: ts.Identifier, jsxExpression: ts.JsxExpression, parentNodeId: ts.Identifier, nodeNumber: number): TransformedJsx {
    if (!jsxExpression.expression) return []

    // props.children
    if (ts.isPropertyAccessExpression(jsxExpression.expression)
        && jsxExpression.expression.name.text === ChildrenPropName) {
        const expType = context.typeChecker.getTypeAtLocation(jsxExpression.expression)
        console.log('children'.gray, context.typeChecker.typeToString(expType), jsxExpression.expression.getText())
        return ts.createStatement(
            // props.children && props.chidren(parentNode, unsubscribes)
            ts.createLogicalAnd(
                jsxExpression.expression,
                ts.createCall(
                    jsxExpression.expression,
                    undefined,
                    [parentNodeId, unsubscribesId]
                )
            )
        )
    }

    // && binary expression
    if (ts.isBinaryExpression(jsxExpression.expression)
        && jsxExpression.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        const leftExp = jsxExpression.expression.left
        const rightExp = jsxExpression.expression.right

        return createCallConditional(context, unsubscribesId, leftExp, rightExp, undefined, parentNodeId, nodeNumber)
    }

    // conditonExp ? trueExp : falseExp
    if (ts.isConditionalExpression(jsxExpression.expression)) {
        const conditionExp = jsxExpression.expression.condition
        const trueExp = jsxExpression.expression.whenTrue
        const falseExp = jsxExpression.expression.whenFalse

        return createCallConditional(context, unsubscribesId, conditionExp, trueExp, falseExp, parentNodeId, nodeNumber)
    }

    // jsx
    if (isJex(jsxExpression.expression)) {
        return transformJsx(context, unsubscribesId, jsxExpression.expression, parentNodeId, nodeNumber)
    }

    // array mapping
    if (ts.isCallExpression(jsxExpression.expression) && ts.isPropertyAccessExpression(jsxExpression.expression.expression)) {
        const mapAccess = jsxExpression.expression.expression
        const reactiveArrayExp = mapAccess.expression
        const objType = context.typeChecker.getTypeAtLocation(reactiveArrayExp)
        if (isAssignable(context.typeChecker, context.reactiveArrayType, objType)) {
            const selectExp = jsxExpression.expression.arguments[0]
            if (!ts.isArrowFunction(selectExp)) throw 'select parameter is not arrow function.'
            if (!isJex(selectExp.body)) throw 'select must returns JSX.'

            const childUnsubscribesId = ts.createIdentifier('unsubscribes')

            const body = transformJsxToBody(context, childUnsubscribesId, selectExp.body, undefined, nodeNumber)
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
                ts.createIdentifier(MapArrayFunctionName),
                undefined,
                [parentNodeId, reactiveArrayExp, createExp]
            )
        }
    }

    // subscribe reactives
    const reactives = getAllReactives(context, jsxExpression.expression)
    if (reactives.length > 0) {
        console.log('reactives'.gray, reactives.map(r => r.getText()), jsxExpression.expression.getText())
        return createReactiveText(context, unsubscribesId, jsxExpression.expression, reactives, parentNodeId, nodeNumber)
    }

    // parentNode.appendChild(document.createTextNode('expression'))
    console.log('EXPRESSION TEXT'.red, jsxExpression.getText())
    return ts.createStatement(
        ts.createCall(
            ts.createPropertyAccess(parentNodeId, 'appendChild'),
            undefined,
            [ts.createCall(createTextNodeMethod, undefined, [jsxExpression.expression])]
        )
    )
}

// conditional() or conditionalText()
function createCallConditional(context: TransformContext, unsubscribesId: ts.Identifier, conditionExp: ts.Expression, trueExp: ts.Expression, falseExp: ts.Expression | undefined, parentNodeId: ts.Identifier, nodeNumber: number) {
    const reactivesInCondition = getAllReactives(context, conditionExp)
    const reactivesInTrue = getAllReactives(context, trueExp)
    const reactivesInFalse = falseExp ? getAllReactives(context, falseExp) : []

    const isFalseJsx = falseExp ? isJex(falseExp) : false

    // simple text has not reactive
    if (!isJex(trueExp) && !isFalseJsx && reactivesInTrue.length === 0 && reactivesInFalse.length === 0) {
        context.conditionalTextFuncUsed = true

        // conditionalText(parentNode, unsubscribes, [reactives], () => condition, expression, '')
        return ts.createCall(
            ts.createIdentifier(ConditionalTextFunctionName),
            undefined,
            [
                parentNodeId,
                unsubscribesId,
                ts.createArrayLiteral(reactivesInCondition),
                ts.createArrowFunction(undefined, undefined, [], undefined, undefined, conditionExp),
                trueExp,
                falseExp ? falseExp : ts.createStringLiteral(''),
            ]
        )
    }

    context.conditionalFuncUsed = true

    // for unsubscribes parameter of NodeCreator on conditional
    const childUnsubscribesId = ts.createIdentifier('unsubscribes')
    const childUnsubscribesParameter = createSimpleParameter(childUnsubscribesId)

    const trueBlock =
        isJex(trueExp)
            ? transformJsxToBody(context, childUnsubscribesId, trueExp, undefined, nodeNumber)
            : createReactiveTextBlock(context, childUnsubscribesId, trueExp, reactivesInTrue, undefined, nodeNumber)

    const falseBlock =
        !falseExp
            ? undefined
            : isJex(falseExp)
                ? transformJsxToBody(context, childUnsubscribesId, falseExp, undefined, nodeNumber)
                : createReactiveTextBlock(context, childUnsubscribesId, falseExp, reactivesInTrue, undefined, nodeNumber)

    // conditional(parentNode, unsubscribes, [reactives], () => condition, (unsubscribes) => Node, (unsubscribes) => Node)
    return ts.createCall(
        ts.createIdentifier(ConditionalFunctionName),
        undefined,
        [
            parentNodeId,
            unsubscribesId,
            ts.createArrayLiteral(reactivesInCondition),
            ts.createArrowFunction(undefined, undefined, [], undefined, undefined, conditionExp),
            trueBlock ? ts.createArrowFunction(undefined, undefined, [childUnsubscribesParameter], undefined, undefined, trueBlock) : ts.createIdentifier('undefined'),
            falseBlock ? ts.createArrowFunction(undefined, undefined, [childUnsubscribesParameter], undefined, undefined, falseBlock) : ts.createIdentifier('undefined')
        ]
    )
}

function transformJsxToBody(context: TransformContext, unsubscribesId: ts.Identifier, node: ts.JsxChild, parentNodeId: ts.Identifier | undefined, nodeNumber: number) {
    const jsx = transformJsx(context, unsubscribesId, node, parentNodeId, nodeNumber)
    return !jsx ? undefined : !Array.isArray(jsx) && ts.isCallExpression(jsx) ? jsx : ts.createBlock(jsxToStatements(jsx), true)
}

function createReactiveText(context: TransformContext, unsubscribesId: ts.Identifier, expression: ts.Expression, reactives: ts.Expression[], parentNodeId: ts.Identifier | undefined, nodeNumber: number) {
    // simple text
    if (reactives.length === 0) {
        // document.createTextNode(expression || '')
        const textNode = ts.createCall(
            createTextNodeMethod,
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

    // const text1 = document.createTextNode('')
    const textNodeId = ts.createIdentifier('text' + nodeNumber)
    statements.push(ts.createVariableStatement(
        undefined,
        ts.createVariableDeclarationList(
            [ts.createVariableDeclaration(
                textNodeId,
                undefined,
                ts.createCall(createTextNodeMethod, undefined, [ts.createStringLiteral('')])
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
        // subscribe(() => textNode.nodeValue = expression, unsubscribes, [reactives])
        statements.push(ts.createStatement(ts.createCall(
            ts.createIdentifier(SubscribeFunctionName),
            undefined,
            [actionArrowFunction, unsubscribesId, ts.createArrayLiteral(reactives)]
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

function createReactiveTextBlock(context: TransformContext, unsubscribesId: ts.Identifier, expression: ts.Expression, reactives: ts.Expression[], parentNodeId: ts.Identifier | undefined, nodeNumber: number) {
    const text = createReactiveText(context, unsubscribesId, expression, reactives, parentNodeId, nodeNumber)
    return Array.isArray(text) ? ts.createBlock(text, true) : text
}

function createFixedStringLiteral(text: string) {
    const fixed = fixupWhitespaceAndDecodeEntities(text);
    return fixed ? ts.createStringLiteral(fixed) : undefined
}

function getAllReactives(context: TransformContext, node: ts.Node, buffer?: ts.Expression[]): ts.Expression[] {
    if (!buffer) buffer = []

    //console.log('searchReactive'.gray, node.getText())

    const type = context.typeChecker.getTypeAtLocation(node)
    if (isAssignable(context.typeChecker, context.reactiveType, type)) {
        buffer.push(node as ts.Expression)
    } else {
        node.forEachChild(child => { getAllReactives(context, child, buffer) })
    }

    return buffer
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