import { posix } from "node:path";
import type { OfficeBlock, OfficePreview, OfficeRun, OfficeSheet, OfficeSlide } from "../shared/office-preview.ts";
import { child, children, descendants, parseOfficeXml, xmlText, type OfficeXml } from "./office-xml.ts";
import { corrupt, officeError, readOfficeZip } from "./office-zip.ts";

type Archive = ReturnType<typeof readOfficeZip>;
const relationshipId = (node: OfficeXml) => Object.entries(node.attributes).find(([name]) => name.endsWith(":id"))?.[1] ?? node.attributes.id;
const MAX_PREVIEW_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_PREVIEW_CELLS = 1_000_000;
function textBudget(): (value: string) => void {
  let bytes = 0;
  return value => {
    bytes += Buffer.byteLength(value);
    if (bytes > MAX_PREVIEW_TEXT_BYTES) throw officeError("office_too_large", "Office preview text exceeds 8 MiB.");
  };
}
function xml(files: Archive, name: string): OfficeXml {
  const data = files.get(name);
  if (!data) corrupt(`Required part ${name} is missing.`);
  return parseOfficeXml(data);
}
function optionalXml(files: Archive, name: string): OfficeXml | undefined { return files.has(name) ? xml(files, name) : undefined; }
function relationships(files: Archive, part: string): Map<string, string> {
  const root = optionalXml(files, posix.join(posix.dirname(part), "_rels", `${posix.basename(part)}.rels`));
  const result = new Map<string, string>();
  if (!root) return result;
  for (const rel of children(root, "Relationship")) {
    if (rel.attributes.TargetMode === "External") continue;
    const target = rel.attributes.Target;
    const id = rel.attributes.Id;
    if (!id || !target || result.has(id)) corrupt("Invalid part relationship.");
    let decoded: string;
    try { decoded = decodeURIComponent(target); } catch { return corrupt("Invalid relationship target."); }
    if (decoded.includes("\\") || decoded.includes("\0") || /[?#:]/.test(decoded)) corrupt("Unsafe relationship target.");
    const path = posix.normalize(decoded.startsWith("/") ? decoded.slice(1) : posix.join(posix.dirname(part), decoded));
    if (path === ".." || path.startsWith("../") || path.startsWith("/")) corrupt("Relationship escapes the archive.");
    result.set(id, path);
  }
  return result;
}
const enabled = (node: OfficeXml | undefined) => Boolean(node && !["0", "false", "off"].includes(node.attributes.val ?? "1"));
function runs(paragraph: OfficeXml): OfficeRun[] {
  return descendants(paragraph, "r").map(run => {
    const properties = child(run, "rPr");
    const text = run.children.map(item => {
      if (typeof item === "string") return "";
      if (item.name === "t") return xmlText(item);
      return item.name === "tab" ? "\t" : item.name === "br" || item.name === "cr" ? "\n" : "";
    }).join("");
    return { text, ...(enabled(child(properties, "b")) ? { bold: true } : {}), ...(enabled(child(properties, "i")) ? { italic: true } : {}) };
  }).filter(run => run.text !== "");
}
function docx(files: Archive): OfficePreview {
  const document = xml(files, "word/document.xml");
  if (document.name !== "document") corrupt("Invalid DOCX document part.");
  const body = child(document, "body");
  if (!body) corrupt("DOCX body is missing.");
  const styles = optionalXml(files, "word/styles.xml");
  const headingLevels = new Map<string, number>();
  if (styles) for (const style of children(styles, "style")) {
    const name = child(style, "name")?.attributes.val ?? style.attributes.styleId ?? "";
    const heading = /heading\s*([1-9])/i.exec(name);
    const outline = child(child(style, "pPr"), "outlineLvl")?.attributes.val;
    if (heading || outline !== undefined) headingLevels.set(style.attributes.styleId ?? "", heading ? Number(heading[1]) : Math.min(9, Number(outline) + 1));
  }
  const numbering = optionalXml(files, "word/numbering.xml");
  const formats = new Map<string, string>();
  const abstractIds = new Map<string, string>();
  if (numbering) {
    for (const abstract of children(numbering, "abstractNum")) for (const level of children(abstract, "lvl")) {
      formats.set(`${abstract.attributes.abstractNumId}:${level.attributes.ilvl}`, child(level, "numFmt")?.attributes.val ?? "bullet");
    }
    for (const num of children(numbering, "num")) abstractIds.set(num.attributes.numId ?? "", child(num, "abstractNumId")?.attributes.val ?? "");
  }
  function blocks(parent: OfficeXml): OfficeBlock[] {
    return children(parent).flatMap((node): OfficeBlock[] => {
      if (node.name === "tbl") return [{ type: "table", rows: children(node, "tr").map(row => children(row, "tc").map(cell => blocks(cell))) }];
      if (node.name !== "p") return ["sdt", "sdtContent", "customXml"].includes(node.name) ? blocks(node) : [];
      const properties = child(node, "pPr");
      const style = child(properties, "pStyle")?.attributes.val ?? "";
      const outline = child(properties, "outlineLvl")?.attributes.val;
      const level = headingLevels.get(style) ?? (/^Heading([1-9])$/i.exec(style)?.[1] ? Number(style.slice(7)) : outline !== undefined ? Math.min(9, Number(outline) + 1) : undefined);
      const textRuns = runs(node);
      if (level !== undefined && Number.isFinite(level)) return [{ type: "heading", level, runs: textRuns }];
      const num = child(properties, "numPr");
      if (num && child(num, "numId")?.attributes.val !== "0") {
        const indent = Number(child(num, "ilvl")?.attributes.val ?? 0);
        const id = child(num, "numId")?.attributes.val ?? "";
        const format = formats.get(`${abstractIds.get(id)}:${indent}`) ?? "bullet";
        return [{ type: "listItem", level: Number.isFinite(indent) ? Math.max(0, Math.min(8, indent)) : 0, ordered: format !== "bullet" && format !== "none", runs: textRuns }];
      }
      return [{ type: "paragraph", runs: textRuns }];
    });
  }
  return { kind: "docx", blocks: blocks(body) };
}
function columnIndex(letters: string): number {
  let result = 0;
  for (const letter of letters.toUpperCase()) { result = result * 26 + letter.charCodeAt(0) - 64; if (result > 16384) return result; }
  return result - 1;
}
function cellPosition(reference: string): [number, number] {
  const match = /^([A-Z]{1,4})([1-9][0-9]{0,9})$/i.exec(reference);
  if (!match) return corrupt("Invalid spreadsheet cell reference.");
  return [Number(match[2]) - 1, columnIndex(match[1]!)];
}
function xlsx(files: Archive): OfficePreview {
  const workbook = xml(files, "xl/workbook.xml");
  if (workbook.name !== "workbook") corrupt("Invalid XLSX workbook part.");
  const rels = relationships(files, "xl/workbook.xml");
  const shared = optionalXml(files, "xl/sharedStrings.xml");
  const strings = shared ? children(shared, "si").map(item => descendants(item, "t").map(xmlText).join("")) : [];
  const list = child(workbook, "sheets");
  if (!list) corrupt("XLSX worksheets are missing.");
  const consumeText = textBudget();
  let totalCells = 0;
  const sheets: OfficeSheet[] = children(list, "sheet").map(sheet => {
    consumeText(sheet.attributes.name ?? "");
    const target = rels.get(relationshipId(sheet) ?? "");
    if (!target) corrupt("Worksheet relationship is missing or external.");
    const root = xml(files, target);
    if (root.name !== "worksheet") corrupt("Unsupported worksheet part.");
    const cells = new Map<string, string>();
    let height = 0; let width = 0; let truncated = false;
    const dimension = child(root, "dimension")?.attributes.ref;
    if (dimension) {
      const [row, col] = cellPosition(dimension.split(":").at(-1)!);
      height = Math.min(row + 1, 500); width = Math.min(col + 1, 50);
      truncated = row >= 500 || col >= 50;
    }
    let implicitRow = 0;
    for (const row of children(child(root, "sheetData") ?? root, "row")) {
      const rowIndex = row.attributes.r === undefined ? implicitRow : Number(row.attributes.r) - 1;
      if (!Number.isSafeInteger(rowIndex) || rowIndex < 0) corrupt("Invalid worksheet row.");
      implicitRow = rowIndex + 1;
      if (rowIndex >= 500) truncated = true;
      let implicitColumn = 0;
      for (const cell of children(row, "c")) {
        const [r, c] = cell.attributes.r ? cellPosition(cell.attributes.r) : [rowIndex, implicitColumn];
        if (r !== rowIndex) corrupt("Worksheet cell and row disagree.");
        implicitColumn = c + 1;
        if (r >= 500 || c >= 50) { truncated = true; continue; }
        height = Math.max(height, r + 1); width = Math.max(width, c + 1);
        const raw = xmlText(child(cell, "v"));
        let value = raw;
        if (cell.attributes.t === "s") {
          if (!/^\d+$/.test(raw) || strings[Number(raw)] === undefined) corrupt("Invalid shared string index.");
          value = strings[Number(raw)]!;
        } else if (cell.attributes.t === "inlineStr") value = descendants(cell, "t").map(xmlText).join("");
        consumeText(value);
        cells.set(`${r}:${c}`, value);
      }
    }
    totalCells += height * width;
    if (totalCells > MAX_PREVIEW_CELLS) throw officeError("office_too_large", "Office preview exceeds one million cells across worksheets.");
    return { name: sheet.attributes.name ?? "", rows: Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => cells.get(`${r}:${c}`) ?? "")), truncated };
  });
  return { kind: "xlsx", sheets };
}
function pptx(files: Archive): OfficePreview {
  const presentation = xml(files, "ppt/presentation.xml");
  if (presentation.name !== "presentation") corrupt("Invalid PPTX presentation part.");
  const rels = relationships(files, "ppt/presentation.xml");
  const consumeText = textBudget();
  const slides: OfficeSlide[] = children(child(presentation, "sldIdLst") ?? presentation, "sldId").map(slide => {
    const target = rels.get(relationshipId(slide) ?? "");
    if (!target) corrupt("Slide relationship is missing or external.");
    const root = xml(files, target);
    if (root.name !== "sld") corrupt("Invalid slide part.");
    let title = "";
    const paragraphs: string[] = [];
    const tree = child(child(root, "cSld"), "spTree");
    if (!tree) corrupt("Slide shape tree is missing.");
    function visit(node: OfficeXml): void {
      if (node.name === "sp" || node.name === "graphicFrame") {
        const texts = descendants(node, "p").map(p => p.children.map(item => typeof item === "string" ? "" : item.name === "br" ? "\n" : descendants(item, "t").map(xmlText).join("")).join("")).filter(text => text.trim());
        for (const text of texts) consumeText(text);
        const placeholder = descendants(node, "ph")[0]?.attributes.type;
        if (!title && (placeholder === "title" || placeholder === "ctrTitle")) title = texts.join("\n");
        else paragraphs.push(...texts);
        return;
      }
      for (const item of children(node)) visit(item);
    }
    visit(tree);
    return { title, paragraphs };
  });
  return { kind: "pptx", slides };
}
export function previewOfficeFile(bytes: Buffer, name: string): OfficePreview {
  const extension = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase();
  if (extension !== "docx" && extension !== "xlsx" && extension !== "pptx") throw officeError("office_unsupported", "Only DOCX, XLSX and PPTX can be previewed.");
  const files = readOfficeZip(bytes);
  const preview = extension === "docx" ? docx(files) : extension === "xlsx" ? xlsx(files) : pptx(files);
  const consumeText = textBudget();
  function consumeBlock(block: OfficeBlock): void {
    if (block.type === "table") for (const row of block.rows) for (const cell of row) for (const item of cell) consumeBlock(item);
    else for (const run of block.runs) consumeText(run.text);
  }
  if (preview.kind === "docx") for (const block of preview.blocks) consumeBlock(block);
  if (preview.kind === "pptx") for (const slide of preview.slides) { consumeText(slide.title); for (const paragraph of slide.paragraphs) consumeText(paragraph); }
  return preview;
}
