import type { Root, Element, ElementContent } from "hast";

/**
 * rehype plugin: converts <Term term="key">label</Term> into
 * <span data-glossary-term="key" data-glossary-label="label">label</span>
 * so the GlossaryTermsHydrator client component can attach tooltips to them.
 */
export default function rehypeGlossaryTerm() {
  return (tree: Root) => {
    if (!tree.children) return;

    for (let i = tree.children.length - 1; i >= 0; i--) {
      walk(tree.children[i]);
    }
  };

  function walk(node: any): void {
    if (typeof node !== "object" || node.type !== "element") return;

    if (node.tagName === "Term") {
      const termAttr = node.properties?.term ?? node.properties?.id;
      const termKey = typeof termAttr === "string" ? termAttr : "";

      // Resolve label from children text content
      let label = termKey;
      if (node.children && node.children.length > 0 && typeof node.children[0] === "object" && node.children[0].type === "text") {
        label = node.children[0].value;
      }

      const replacement: Element = {
        type: "element",
        tagName: "span",
        properties: {
          "data-glossary-term": termKey,
          "data-glossary-label": label,
        } as Element["properties"],
        children: (node.children ?? []) as ElementContent[],
      };

      replaceInParent(node, replacement);
      return;
    }

    if (node.children) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        walk(node.children[i]);
      }
    }
  }
}

/**
 * Replace oldNode with newNode inside its parent's children array.
 */
function replaceInParent(oldNode: Element, newNode: Element): void {
  const parent = (oldNode as any).data?.parent as Root | Element | undefined;
  if (!parent?.children) return;

  const idx = parent.children.indexOf(oldNode);
  if (idx !== -1) {
    parent.children[idx] = newNode;
  }
}