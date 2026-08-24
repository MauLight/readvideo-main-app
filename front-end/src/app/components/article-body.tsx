"use client";

import { Ref, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // tables, task lists, strikethrough
import remarkMath from "remark-math"; // parses $...$ and $$...$$
import rehypeKatex from "rehype-katex"; // renders the parsed math
import "katex/dist/katex.min.css"; // required, or formulas render unstyled
import { normalizeMath } from "../lib/normalize-math";

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

// Basic element styles so Markdown is readable without the Typography plugin.
const markdownComponents = {
  h1: (props: React.ComponentProps<"h1">) => (
    <h1
      className="text-header font-semibold text-[#1d1c1b] dark:text-text"
      {...props}
    />
  ),
  h2: (props: React.ComponentProps<"h2">) => (
    <h2
      className="text-subheader font-semibold text-[#1d1c1b] dark:text-text mt-2"
      {...props}
    />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <h3
      className="text-regular font-semibold text-[#1d1c1b] dark:text-text mt-2"
      {...props}
    />
  ),
  p: (props: React.ComponentProps<"p">) => (
    <p className="text-[#2d2c2b] dark:text-[#edeceb]" {...props} />
  ),
  ul: (props: React.ComponentProps<"ul">) => (
    <ul className="list-disc pl-6 flex flex-col gap-y-1" {...props} />
  ),
  ol: (props: React.ComponentProps<"ol">) => (
    <ol className="list-decimal pl-6 flex flex-col gap-y-1" {...props} />
  ),
  a: (props: React.ComponentProps<"a">) => (
    <a className="text-[#337fc5] underline" {...props} />
  ),
  strong: (props: React.ComponentProps<"strong">) => (
    <strong
      className="font-semibold text-[#1d1c1b] dark:text-text"
      {...props}
    />
  ),
  // Fenced blocks arrive as <pre><code>; inline code keeps its own styling.
  pre: (props: React.ComponentProps<"pre">) => (
    <pre
      className="overflow-x-auto rounded-lg border border-border bg-[#141414] p-4 text-[0.85rem]"
      {...props}
    />
  ),
  code: (props: React.ComponentProps<"code">) => (
    <code
      className="rounded bg-[#141414] px-1 py-0.5 font-mono text-[0.85rem] text-[#1d1c1b] dark:text-text"
      {...props}
    />
  ),
  // Tables come from remark-gfm; keep wide ones scrollable, not page-breaking.
  table: (props: React.ComponentProps<"table">) => (
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse text-left text-[0.9rem]"
        {...props}
      />
    </div>
  ),
  th: (props: React.ComponentProps<"th">) => (
    <th
      className="border border-border px-3 py-1.5 font-semibold text-[#1d1c1b] dark:text-text"
      {...props}
    />
  ),
  td: (props: React.ComponentProps<"td">) => (
    <td className="border border-border px-3 py-1.5" {...props} />
  ),
  blockquote: (props: React.ComponentProps<"blockquote">) => (
    <blockquote className="border-l-2 border-border pl-4 italic" {...props} />
  ),
};

// Widths vary so the placeholder reads as prose rather than a block.
const SKELETON_LINES = ["w-full", "w-11/12", "w-full", "w-4/5"];

/** Stand-in for a chapter whose text hasn't started arriving yet. */
function Skeleton() {
  return (
    <div className="flex flex-col gap-y-3 animate-pulse" aria-hidden>
      <div className="h-6 w-2/5 rounded bg-[#1f1f1f]" />
      {SKELETON_LINES.map((width, i) => (
        <div key={i} className={`h-3.5 ${width} rounded bg-[#191919]`} />
      ))}
    </div>
  );
}

interface ArticleBodyProps {
  markdown: string;
  /** Extra classes for spacing — the caller owns where this sits on the page. */
  className?: string;
  ref?: Ref<HTMLElement>;
}

/**
 * One rendered article. Deliberately shell-free: no scroll container, no print
 * button, no status gating — so a playlist can stack several of these inside a
 * single shell.
 */
export default function ArticleBody({
  markdown,
  className = "",
  ref,
}: ArticleBodyProps) {
  // Runs on every streamed chunk, so keep it off the render path when the
  // text hasn't moved.
  const source = useMemo(() => normalizeMath(markdown), [markdown]);

  return (
    <article
      ref={ref}
      className={`flex flex-col gap-y-4 font-body leading-relaxed ${className}`}
    >
      {markdown ? (
        <ReactMarkdown
          components={markdownComponents}
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
        >
          {source}
        </ReactMarkdown>
      ) : (
        <Skeleton />
      )}
    </article>
  );
}
