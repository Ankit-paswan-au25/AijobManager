import * as cheerio from "cheerio";

export const loadHtml = (html) => cheerio.load(html);

/** Collapses whitespace (incl. non-breaking and zero-width spaces). */
export const clean = (text) =>
  String(text ?? "")
    .replace(/[\u00a0\u200b-\u200d\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Non-empty, whitespace-normalized text nodes inside `el`, in document order. */
export function textNodesOf($, el) {
  const out = [];
  const walk = (node) => {
    if (node.type === "text") {
      const t = clean(node.data);
      if (t) out.push(t);
    } else if (node.type === "tag" && !["script", "style"].includes(node.name)) {
      node.children?.forEach(walk);
    }
  };
  $(el).each((_, e) => walk(e));
  return out;
}

/**
 * Flattens the document into an ordered list of tokens:
 *   { kind: "link", href, text, nodes }  for every <a>: `nodes` are its text nodes in order
 *                                 (card links often wrap the whole card); not descended into otherwise
 *   { kind: "text", text }        for every other text node
 */
export function tokenize($) {
  const tokens = [];
  const walk = (node) => {
    if (node.type === "text") {
      const t = clean(node.data);
      if (t) tokens.push({ kind: "text", text: t });
    } else if (node.type === "tag") {
      if (["script", "style", "head"].includes(node.name)) return;
      if (node.name === "a") {
        const nodes = textNodesOf($, node);
        tokens.push({ kind: "link", href: node.attribs?.href ?? "", text: clean(nodes.join(" ")), nodes });
        return;
      }
      node.children?.forEach(walk);
    }
  };
  $.root().each((_, root) => root.children?.forEach(walk));
  return tokens;
}
