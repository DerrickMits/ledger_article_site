"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Mermaid from "./Mermaid";

/**
 * Custom `code` handler. Maps a fenced ```mermaid block to <Mermaid>,
 * leaves inline + other-fenced code blocks untouched.
 */
function CodeBlock({
  className,
  children,
  ...props
}: {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}) {
  const lang = /language-(\w+)/.exec(className || "")?.[1];

  if (lang === "mermaid") {
    return <Mermaid chart={String(children)} />;
  }

  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

/**
 * Custom `pre` handler so we don't render an orphan <pre> around <Mermaid>.
 * If the only child is a mermaid-produced <figure>, pass it through directly.
 */
function PreBlock({
  children,
}: {
  children?: React.ReactNode;
}) {
  // react-markdown wraps our <Mermaid> in a <pre>; detect that case and unwrap.
  const childArray = React.Children.toArray(children);
  const isMermaidOnly =
    childArray.length === 1 &&
    typeof childArray[0] === "object" &&
    "props" in (childArray[0] as object) &&
    // Mermaid renders a <figure>, so we check for it via displayName-style heuristic.
    (childArray[0] as { type?: { name?: string } }).type?.name === "Mermaid";

  if (isMermaidOnly) {
    return <>{children}</>;
  }

  return <pre>{children}</pre>;
}

/**
 * Markdown renderer wired into the warm `article-prose` styles defined in
 * globals.css. Disables raw HTML to keep content safe. Detects ```mermaid
 * fenced code blocks and renders them as SVG diagrams via <Mermaid>.
 */
export default function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="article-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => {
            delete (props as Record<string, unknown>).node;
            void node;
            const href = typeof props.href === "string" ? props.href : "";
            const isExternal =
              href.startsWith("http") || href.startsWith("mailto");
            return (
              <a
                {...props}
                {...(isExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              />
            );
          },
          code: CodeBlock as React.ComponentType<React.ComponentProps<"code">>,
          pre: PreBlock as React.ComponentType<React.ComponentProps<"pre">>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}