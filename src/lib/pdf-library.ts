export interface PdfPage {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; transform?: number[] }): { promise: Promise<void>; cancel(): void };
  cleanup(): void;
}
export interface PdfDocument { numPages: number; getPage(number: number): Promise<PdfPage> }
export interface PdfLoading { promise: Promise<PdfDocument>; destroy(): Promise<void> }
export interface PdfLibrary {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(options: { data: Uint8Array; cMapUrl: string; cMapPacked: boolean; standardFontDataUrl: string; wasmUrl: string; isEvalSupported: boolean; useSystemFonts: boolean }): PdfLoading;
}

let library: Promise<PdfLibrary> | undefined;
export function loadPdfLibrary(): Promise<PdfLibrary> {
  return library ??= import("../vendor/pdfjs/pdf.mjs").then((loaded: PdfLibrary) => {
    loaded.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.mjs";
    return loaded;
  }).catch(error => { library = undefined; throw error; });
}

export async function openPdf(bytes: Uint8Array): Promise<PdfLoading> {
  const pdf = await loadPdfLibrary();
  return pdf.getDocument({ data: bytes, cMapUrl: "/vendor/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/vendor/pdfjs/standard_fonts/", wasmUrl: "/vendor/pdfjs/wasm/", isEvalSupported: false, useSystemFonts: false });
}
