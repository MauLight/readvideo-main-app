/**
 * Models emit math in forms that don't survive the Markdown → KaTeX pipeline:
 *
 *  - `\[...\]` / `\(...\)` instead of dollars. Markdown reads `\[` as an
 *    escaped bracket, swallowing the backslash and printing the formula as
 *    text behind a stray `[`.
 *  - bare `\begin{bmatrix}...\end{bmatrix}` with no delimiters. That parses as
 *    no math node at all, so it never reaches KaTeX, and the `\\` row
 *    separators collapse to `\` on the way to the page.
 *  - `$$...$$` written on a single line. remark-math reads that as *inline*
 *    math, and rehype-katex renders inline math with `displayMode: false` —
 *    where `align`, `align*` and friends are a hard KaTeX error. The failure
 *    surfaces as red source text on the page.
 *
 * The prompt asks for the right forms, but that's a soft constraint models
 * drift from, so normalise here too rather than trusting it.
 */

// Code is the only thing left strictly alone: a formula-shaped string inside a
// code sample is code. Math is deliberately *not* protected — existing `$$`
// spans are exactly what needs re-fencing.
const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

const BRACKET_DISPLAY = /\\\[([\s\S]+?)\\\]/g;
const BRACKET_INLINE = /\\\(([\s\S]+?)\\\)/g;
// The environments models reach for unprompted: bmatrix, pmatrix, align, cases.
// The backreference keeps the closing name matched to the opening one.
const ENVIRONMENT = /\\begin\{([a-z*]+)\}[\s\S]*?\\end\{\1\}/gi;
const BLOCK_MATH = /\$\$([\s\S]+?)\$\$/g;
// Same pattern, capturing the delimiters so split() keeps them.
const BLOCK_MATH_SPLIT = /(\$\$[\s\S]+?\$\$)/g;
const EXTRA_BLANK_LINES = /\n{3,}/g;

/** Fences on their own lines — the difference between block and inline math. */
function asBlock(body: string): string {
  return `\n\n$$\n${body.trim()}\n$$\n\n`;
}

/** Applies `transform` everywhere except inside code. */
function outsideCode(
  markdown: string,
  transform: (segment: string) => string
): string {
  return markdown
    .split(CODE)
    .map((segment, i) => (i % 2 === 1 ? segment : transform(segment)))
    .join("");
}

// Replacements are functions, not strings: in a replacement string `$$` means
// "a literal $", which would quietly mangle every delimiter inserted here.
function toDollars(segment: string): string {
  return segment
    .replace(BRACKET_DISPLAY, (_match, body: string) => `$$${body.trim()}$$`)
    .replace(BRACKET_INLINE, (_match, body: string) => `$${body.trim()}$`);
}

/** Wraps environments that carry no delimiters of their own. */
function wrapBareEnvironments(segment: string): string {
  return segment.replace(ENVIRONMENT, (match) => asBlock(match));
}

/** Re-fences every `$$` span so it lands as block math, not inline. */
function reFenceBlockMath(segment: string): string {
  return segment.replace(BLOCK_MATH, (_match, body: string) => asBlock(body));
}

/**
 * Rewrites the delimiter forms remark-math misses, and puts every `$$` span
 * into the block form KaTeX needs for display-only environments.
 *
 * The order matters. Brackets become dollars first; bare environments are then
 * wrapped, skipping anything already inside a `$$` span so it isn't wrapped
 * twice; finally every `$$` span — pre-existing or just created — is re-fenced
 * onto its own lines.
 *
 * Safe on partial input: an unclosed `\[`, `\begin{}` or `$$` simply doesn't
 * match and passes through, converting once its closing token streams in.
 */
export function normalizeMath(markdown: string): string {
  const withDollars = outsideCode(markdown, toDollars);

  // Skip environments already inside a `$$` span; reFenceBlockMath handles those.
  const wrapped = outsideCode(withDollars, (segment) =>
    segment
      .split(BLOCK_MATH_SPLIT)
      .map((part, i) => (i % 2 === 1 ? part : wrapBareEnvironments(part)))
      .join("")
  );

  return outsideCode(wrapped, reFenceBlockMath).replace(
    EXTRA_BLANK_LINES,
    "\n\n"
  );
}