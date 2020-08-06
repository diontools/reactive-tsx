import * as ts from 'typescript';
import 'colors';
export interface MyPluginOptions {
}
export default function myTransformerPlugin(program: ts.Program, opts: MyPluginOptions): {
    before(ctx: ts.TransformationContext): (sourceFile: ts.SourceFile) => ts.SourceFile;
};
