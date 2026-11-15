/** Message-scoped, text-only Office preview; no embedded HTML, images, macros or external resources. */
export type OfficePreview =
  | { kind: "docx"; blocks: OfficeBlock[] }
  | { kind: "xlsx"; sheets: OfficeSheet[] }
  | { kind: "pptx"; slides: OfficeSlide[] };

export interface OfficeRun { text: string; bold?: boolean; italic?: boolean }
export type OfficeBlock =
  | { type: "paragraph"; runs: OfficeRun[] }
  | { type: "heading"; level: number; runs: OfficeRun[] }
  | { type: "listItem"; level: number; ordered: boolean; runs: OfficeRun[] }
  | { type: "table"; rows: OfficeBlock[][][] };
export interface OfficeSheet {
  name: string;
  /** Rectangular values from A1, including empty cells, bounded to 500 rows and 50 columns. */
  rows: string[][];
  truncated: boolean;
}
export interface OfficeSlide { title: string; paragraphs: string[] }
export type OfficePreviewErrorCode = "office_corrupt" | "office_unsupported" | "office_too_large";
