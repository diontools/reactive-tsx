/**
 * JSX trims whitespace at the end and beginning of lines, except that the
 * start/end of a tag is considered a start/end of a line only if that line is
 * on the same line as the closing tag. See examples in
 * tests/cases/conformance/jsx/tsxReactEmitWhitespace.tsx
 * See also https://www.w3.org/TR/html4/struct/text.html#h-9.1 and https://www.w3.org/TR/CSS2/text.html#white-space-model
 *
 * An equivalent algorithm would be:
 * - If there is only one line, return it.
 * - If there is only whitespace (but multiple lines), return `undefined`.
 * - Split the text into lines.
 * - 'trimRight' the first line, 'trimLeft' the last line, 'trim' middle lines.
 * - Decode entities on each line (individually).
 * - Remove empty lines and join the rest with " ".
 */
export declare function fixupWhitespaceAndDecodeEntities(text: string): string | undefined;
