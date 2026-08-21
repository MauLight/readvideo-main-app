/**
 * Models emit math with LaTeX delimiters (`\[...\]`, `\(...\)`) far more often
 * than with the dollar delimiters remark-math understands. Worse, Markdown
 * reads `\[` as an escaped bracket, so the backslash is swallowed and the
 * formula lands on the page as literal text with a stray `[` in front.
 *
 * The prompt asks for dollars, but that is a soft constraint models drift from,
 * so translate here too rather than trusting it.
 */

// Fenced blocks and inline spans are captured so split() keeps them, letting us
// transform only what falls between. A formula-looking string inside a code
// sample is code, and must survive untouched.
const CODE_SPANS = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

const DISPLAY_MATH = /\\\[([\s\S]+?)\\\]/g;
const INLINE_MATH = /\\\(([\s\S]+?)\\\)/g;

// Replacements are functions, not strings: in a replacement string `$$` means
// "a literal $", which would quietly mangle every delimiter we insert.
function toDollars(segment: string): string {
  return segment
    .replace(DISPLAY_MATH, (_match, body: string) => `$$${body.trim()}$$`)
    .replace(INLINE_MATH, (_match, body: string) => `$${body.trim()}$`);
}

/**
 * Rewrites LaTeX-delimited math to the dollar form remark-math parses, leaving
 * code blocks and inline code alone.
 *
 * Safe on partial input: an unclosed `\[` simply doesn't match and passes
 * through as-is, converting once its closing delimiter streams in.
 */
export function normalizeMath(markdown: string): string {
  return markdown
    .split(CODE_SPANS)
    .map((segment, i) => (i % 2 === 1 ? segment : toDollars(segment)))
    .join("");
}
