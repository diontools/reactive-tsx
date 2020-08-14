import * as ts from 'typescript';
import 'colors';
export interface PluginOptions {
    host?: ts.CompilerHost;
}
export default function createTransformer(program: ts.Program, opts?: PluginOptions): ts.TransformerFactory<ts.SourceFile>;
