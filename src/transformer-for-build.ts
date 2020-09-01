import * as ts from 'typescript'
import * as fs from 'fs'
import * as path from 'path'

const version = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json')).toString()).version as string

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
    function visitor(node: ts.Node) {
        // remove import ./mono
        if (ts.isImportDeclaration(node)
            && ts.isStringLiteral(node.moduleSpecifier)
            && node.moduleSpecifier.text === '../mono') {
            return undefined
        }

        // remove export {}
        if (ts.isExportDeclaration(node)) {
            return undefined
        }

        // replace version
        if (ts.isVariableStatement(node)
            && node.modifiers
            && node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword
            && node.declarationList.declarations.length === 1) {
            const decl = node.declarationList.declarations[0]
            if (ts.isIdentifier(decl.name)
                && decl.name.text === 'version') {
                return ts.factory.updateVariableStatement(
                    node,
                    node.modifiers,
                    ts.factory.updateVariableDeclarationList(
                        node.declarationList,
                        [ts.factory.updateVariableDeclaration(
                            decl,
                            decl.name,
                            decl.exclamationToken,
                            decl.type,
                            ts.factory.createStringLiteral(version)
                        )]
                    )
                )
            }
        }

        return node
    }

    return ts.visitEachChild(sourceFile, visitor, ctx)
}