import * as ts from 'typescript'
import 'colors'

export default function (program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
    return ctx => sourceFile => transform(sourceFile, ctx)
}

function transform(sourceFile: ts.SourceFile, ctx: ts.TransformationContext): ts.SourceFile {
    function visit(node: ts.Node): ts.VisitResult<ts.Node> {
        // remove `export {};`
        if (ts.isExportDeclaration(node)
            && node.exportClause
            && ts.isNamedExports(node.exportClause)
            && node.exportClause.elements.length === 0) {
            console.log('remove'.yellow, getPrintted(node))
            return
        }

        return ts.visitEachChild(node, visit, ctx)
    }

    return ts.visitEachChild(sourceFile, visit, ctx)
}

function getPrintted(node: ts.Statement | ts.SourceFile) {
    const printer = ts.createPrinter()
    const file = ts.isSourceFile(node) ? node : ts.updateSourceFileNode(ts.createSourceFile('', '', ts.ScriptTarget.ES2020), [node])
    const text = printer.printFile(file)
    return text
}