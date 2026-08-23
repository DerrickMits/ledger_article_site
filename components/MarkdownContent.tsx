"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import Mermaid from "./Mermaid";
import CanvaEmbed from "./CanvaEmbed";
import { HeadingItem } from "@/lib/articles";
import { useTextSelection } from "@/hooks/useTextSelection";
import QuoteSharePopover from "./QuoteSharePopover";
import { GlossaryTermsHydrator } from "./GlossaryTerm";
import rehypeGlossaryTerm from "@/lib/rehype-glossary-term";

/**
 * Context to provide server-generated heading slugs to child components.
 */
const HeadingSlugsContext = React.createContext<Map<string, string>>(new Map());

/**
 * Context to provide section read times to child components.
 */
const SectionReadTimeContext = React.createContext<Map<string, number>>(new Map());

/**
 * Extract text content from a React node (handles nested elements)
 */
function extractTextFromNode(node: React.ReactNode): string {
  if (typeof node === "string") {
    return node;
  }
  if (typeof node === "number") {
    return String(node);
  }
  if (React.isValidElement(node)) {
    const props = node.props as any;
    const children = props.children;
    return React.Children.toArray(children).reduce(
      (acc: string, child) => acc + extractTextFromNode(child),
      ""
    );
  }
  if (Array.isArray(node)) {
    return node.reduce((acc: string, child) => acc + extractTextFromNode(child), "");
  }
  return "";
}

/**
 * Generate a URL-safe slug from heading text.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Props for MarkdownContent component
 */
interface MarkdownContentProps {
  content: string;
  headings?: HeadingItem[];
}

/**
 * Markdown renderer wired into the warm `article-prose` styles defined in
 * globals.css. Disables raw HTML to keep content safe. Detects ```mermaid
 * fenced code blocks and renders them as SVG diagrams via <Mermaid>.
 */
export default function MarkdownContent({ content, headings = [] }: MarkdownContentProps) {
  // Create a map of heading texts to their server-generated slugs
  const headingSlugMap = React.useMemo(() => {
    const map = new Map<string, string>();
    headings.forEach((heading) => {
      map.set(heading.text, heading.slug);
    });
    return map;
  }, [headings]);

  // Create a map of heading texts to their read times
  const readTimeMap = React.useMemo(() => {
    const map = new Map<string, number>();
    headings.forEach((heading) => {
      if (heading.readTime) {
        map.set(heading.text, heading.readTime);
      }
    });
    return map;
  }, [headings]);

  // Ref for the article content container — used to scope selection detection
  const proseRef = React.useRef<HTMLDivElement>(null);

  const { selection, isVisible, dismiss } = useTextSelection({
    containerRef: proseRef,
  });

  const currentUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <HeadingSlugsContext.Provider value={headingSlugMap}>
        <SectionReadTimeContext.Provider value={readTimeMap}>
          <div ref={proseRef} className="article-prose">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex, rehypeGlossaryTerm]}
              components={components}
            >
              {content}
            </ReactMarkdown>
          </div>

          {/* Floating shareable-quote popover, rendered via portal to avoid overflow clipping */}
          {isVisible && selection && (
            <QuoteSharePopover
              selectedText={selection.selectedText}
              rect={selection.boundingRect}
              currentUrl={currentUrl}
              onDismiss={dismiss}
            />
          )}

          {/* Glossary term tooltips — hydrate spans rendered by the rehype plugin */}
          <GlossaryTermsHydrator proseRef={proseRef} />
        </SectionReadTimeContext.Provider>
      </HeadingSlugsContext.Provider>
    </React.Suspense>
  );
}

/**
 * Props for heading renderers from react-markdown
 */
interface HeadingProps {
  node?: any;
  children?: React.ReactNode;
  level?: number;
  [key: string]: any;
}

/**
 * H2 heading renderer with optional read time badge
 */
function Heading2({ children, ...props }: HeadingProps) {
  const slugMap = React.useContext(HeadingSlugsContext);
  const readTimeMap = React.useContext(SectionReadTimeContext);
  
  const headingText = extractTextFromNode(children).trim();
  const slug = slugMap.get(headingText) || slugify(headingText);
  const readTime = readTimeMap.get(headingText);
  
  return (
    <h2
      id={slug}
      data-heading-id={slug}
      style={{ scrollMarginTop: "80px" }}
      {...props}
    >
      <span>{children}</span>
      {readTime && (
        <span className="ml-2 text-xs text-warm-500 dark:text-warm-400 opacity-80">
          {'·'} {readTime} min read
        </span>
      )}
    </h2>
  );
}

/**
 * H3 heading renderer with optional read time badge
 */
function Heading3({ children, ...props }: HeadingProps) {
  const slugMap = React.useContext(HeadingSlugsContext);
  const readTimeMap = React.useContext(SectionReadTimeContext);
  
  const headingText = extractTextFromNode(children).trim();
  const slug = slugMap.get(headingText) || slugify(headingText);
  const readTime = readTimeMap.get(headingText);
  
  return (
    <h3
      id={slug}
      data-heading-id={slug}
      style={{ scrollMarginTop: "80px" }}
      {...props}
    >
      <span>{children}</span>
      {readTime && (
        <span className="ml-2 text-xs text-warm-500 dark:text-warm-400 opacity-80">
          {'·'} {readTime} min
        </span>
      )}
    </h3>
  );
}

/**
 * Anchor component - defined as a function with proper typing for react-markdown
 */
function AnchoredLink({ node, children, ...props }: { node?: any } & React.ComponentProps<"a">) {
  delete (props as Record<string, unknown>).node;
  void node;
  
  const href = typeof props.href === "string" ? props.href : "";
  const isExternal = href.startsWith("http") || href.startsWith("mailto");
  
  return (
    <a
      {...props}
      {...(isExternal
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    >
      {children}
    </a>
  );
}

/**
 * Custom `code` handler. Maps a fenced ```mermaid block to <Mermaid>,
 * leaves inline + other-fenced code blocks untouched.
 */
function CodeBlock({ className, children, ...props }: { className?: string; children?: React.ReactNode } & React.ComponentProps<"code">) {
  const lang = /language-(\w+)/.exec(className || "")?.[1];

  if (lang === "mermaid") {
    return <Mermaid chart={String(children)} />;
  }

  if (lang === "canva") {
    return <CanvaEmbed designId={String(children).trim()} />;
  }

  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

/**
 * Custom `pre` handler so we don't render an orphan <pre> around <Mermaid> or
 * <CanvaEmbed>. react-markdown wraps any fenced-code-block component output in
 * a <pre>; if the only child is one of our custom-rendered components, unwrap
 * it so we don't get <pre>-style typography and scrollbars around the output.
 */
function PreBlock({ children }: { children?: React.ReactNode }) {
  const childArray = React.Children.toArray(children);
  const childType = (childArray[0] as { type?: { name?: string } })?.type;
  const childName = typeof childType === "function" ? childType.name : undefined;

  const isCustomOnly =
    childArray.length === 1 &&
    typeof childArray[0] === "object" &&
    "props" in (childArray[0] as object) &&
    (childName === "Mermaid" || childName === "CanvaEmbed");

  if (isCustomOnly) {
    return <>{children}</>;
  }

  return <pre>{children}</pre>;
}

/**
 * Components object for react-markdown
 */
const components = {
  a: AnchoredLink,
  code: CodeBlock,
  pre: PreBlock,
  h2: Heading2,
  h3: Heading3,
};