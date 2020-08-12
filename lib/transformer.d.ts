import * as ts from 'typescript';
import 'colors';
export interface PluginOptions {
}
export default function createTransformer(program: ts.Program, opts?: PluginOptions): ts.TransformerFactory<ts.SourceFile>;
