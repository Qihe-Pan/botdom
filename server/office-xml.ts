import { corrupt, officeError } from "./office-zip.ts";

export interface OfficeXml { name: string; attributes: Record<string, string>; children: Array<OfficeXml | string> }
const local = (name: string) => name.split(":").at(-1)!;
function entities(text: string): string {
  return text.replace(/&([^;]*);/g, (_, entity: string) => {
    const known: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (Object.hasOwn(known, entity)) return known[entity]!;
    if (/^#(?:[0-9]+|x[0-9a-f]+)$/i.test(entity)) {
      const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff))) return String.fromCodePoint(code);
    }
    return corrupt("Unsupported XML entity.");
  });
}
export function parseOfficeXml(bytes: Buffer): OfficeXml {
  let xml: string;
  try { xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return corrupt("XML must be valid UTF-8."); }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) corrupt("XML declarations and external entities are forbidden.");
  const root: OfficeXml = { name: "", attributes: {}, children: [] };
  const stack = [root];
  const qualified: string[] = [];
  const tokens = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z_][\w.:-]*(?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"]*"|'[^']*'))*\s*\/?>|[^<]+/gy;
  let at = 0;
  let nodes = 0;
  while (at < xml.length) {
    tokens.lastIndex = at;
    const match = tokens.exec(xml);
    if (!match) corrupt("Malformed XML.");
    const token = match[0]; at = tokens.lastIndex;
    if (++nodes > 250_000 || stack.length > 128) throw officeError("office_too_large", "Office XML is too complex to preview.");
    if (token.startsWith("<!--") || token.startsWith("<?")) continue;
    if (token.startsWith("<![CDATA[")) { stack.at(-1)!.children.push(token.slice(9, -3)); continue; }
    if (!token.startsWith("<")) {
      if (token.replace(/&[^;]*;/g, "").includes("&")) corrupt("Malformed XML entity.");
      if (stack.length === 1 && token.trim()) corrupt("Text outside XML root.");
      stack.at(-1)!.children.push(entities(token)); continue;
    }
    const name = /^<\/?([^\s/>]+)/.exec(token)![1]!;
    if (token.startsWith("</")) {
      if (qualified.pop() !== name || stack.length === 1 || !/^<\/[^\s>]+\s*>$/.test(token)) corrupt("Unbalanced XML element.");
      stack.pop(); continue;
    }
    const node: OfficeXml = { name: local(name), attributes: {}, children: [] };
    const attributeNames = new Set<string>();
    for (const attr of token.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const value = attr[2] ?? attr[3]!;
      if (value.includes("<") || value.replace(/&[^;]*;/g, "").includes("&")) corrupt("Malformed XML attribute.");
      const key = attr[1]!;
      if (attributeNames.has(key)) corrupt("Duplicate XML attribute.");
      attributeNames.add(key);
      const decoded = entities(value);
      node.attributes[key] = decoded;
      if (key.includes(":")) node.attributes[local(key)] = decoded;
    }
    stack.at(-1)!.children.push(node);
    if (!token.endsWith("/>")) { stack.push(node); qualified.push(name); }
  }
  const roots = children(root);
  if (stack.length !== 1 || roots.length !== 1) corrupt("XML must have one balanced root.");
  return roots[0]!;
}
export const children = (node: OfficeXml, name?: string): OfficeXml[] => node.children.filter((child): child is OfficeXml => typeof child !== "string" && (!name || child.name === name));
export const child = (node: OfficeXml | undefined, name: string): OfficeXml | undefined => node && children(node, name)[0];
export function descendants(node: OfficeXml, name: string): OfficeXml[] {
  return children(node).flatMap(item => [...(item.name === name ? [item] : []), ...descendants(item, name)]);
}
export function xmlText(node: OfficeXml | undefined): string { return node ? node.children.map(item => typeof item === "string" ? item : xmlText(item)).join("") : ""; }
