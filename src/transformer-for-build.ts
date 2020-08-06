import * as ts from 'typescript'

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
        // remove import
        if (ts.isImportDeclaration(node)) {
            return undefined
        }

        // remove export {}
        if (ts.isExportDeclaration(node)) {
            return undefined
        }

        return node
    }

    return ts.visitEachChild(sourceFile, visitor, ctx)
}