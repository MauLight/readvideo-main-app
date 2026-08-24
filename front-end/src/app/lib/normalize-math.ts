/**
 * Models emit math in forms remark-math doesn't recognise, and Markdown then
 * mangles what's left:
 *
 *  - `\[...\]` / `\(...\)` instead of dollars. Markdown reads `\[` as an
 *    escaped bracket, swallowing the backslash and printing the formula as
 *    text behind a stray `[`.
 *  - bare `\begin{bmatrix}...\end{bmatrix}` with no delimiters at all. That
 *    parses as no math node whatsoever, so it never reaches KaTeX, and the
 *    `\\` row separators collapse to `\` on the way to the page.
 *
 * The prompt asks for dollars, but that's a soft constraint models drift from,
 * so translate here too rather than trusting it.
 */

// Regions to leave alone, captured so split() keeps them: code, plus math that
// already carries delimiters. Anything formula-shaped inside a code sample is
// code, and anything already delimited must not be wrapped twice.
const PROTECTED =
  /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g;

const DISPLAY_MATH = /\\\[([\s\S]+?)\\\]/g;
const INLINE_MATH = /\\\(([\s\S]+?)\\\)/g;
// The environments models reach for unprompted: bmatrix, pmatrix, align, cases.
// The backreference keeps the closing name matched to the opening one.
const ENVIRONMENT = /\\begin\{([a-z*]+)\}[\s\S]*?\\end\{\1\}/gi;

// Replacements are functions, not strings: in a replacement string `$$` means
// "a literal $", which would quietly mangle every delimiter we insert.
function bracketsToDollars(segment: string): string {
  return segment
    .replace(DISPLAY_MATH, (_match, body: string) => `$$${body.trim()}$$`)
    .replace(INLINE_MATH, (_match, body: string) => `$${body.trim()}$`);
}

// Blank lines around the fences are what make remark-math read this as a block
// `math` node rather than inline — a matrix set inline is unreadable.
function wrapEnvironments(segment: string): string {
  return segment.replace(ENVIRONMENT, (match) => `\n\n$$\n${match.trim()}\n$$\n\n`);
}

/** Applies `transform` only outside code and already-delimited math. */
function outsideProtected(
  markdown: string,
  transform: (segment: string) => string
): string {
  return markdown
    .split(PROTECTED)
    .map((segment, i) => (i % 2 === 1 ? segment : transform(segment)))
    .join("");
}

/**
 * Rewrites the delimiter forms remark-math misses into dollars, leaving code
 * and existing math untouched.
 *
 * Two passes, deliberately: the first turns `\[...\]` into `$$...$$`, and the
 * second must re-split so those new fences count as protected — otherwise an
 * environment inside one would get wrapped a second time.
 *
 * Safe on partial input: an unclosed `\[` or `\begin{}` simply doesn't match
 * and passes through, converting once the closing token streams in.
 */
export function normalizeMath(markdown: string): string {
  const withDollars = outsideProtected(markdown, bracketsToDollars);
  return outsideProtected(withDollars, wrapEnvironments);
}