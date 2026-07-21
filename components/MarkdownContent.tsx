"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown renderer wired into the warm `article-prose` styles
 * defined in globals.css. Disables raw HTML to keep content safe.
 */
export default function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="article-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Open external anchor links safely; keep internal links client-side.
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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
