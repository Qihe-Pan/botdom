import { inflateRawSync } from "node:zlib";
import type { OfficePreviewErrorCode } from "../shared/office-preview.ts";

export const OFFICE_MAX_BYTES = 25 * 1024 * 1024;
export const OFFICE_MAX_EXPANDED_BYTES = 64 * 1024 * 1024;
export const OFFICE_MAX_ENTRIES = 4096;

export function officeError(code: OfficePreviewErrorCode, message: string): Error & { code: OfficePreviewErrorCode; status: number } {
  return Object.assign(new Error(message), { code, status: code === "office_too_large" ? 413 : code === "office_unsupported" ? 415 : 422 });
}
export function corrupt(message: string): never { throw officeError("office_corrupt", `Damaged Office file: ${message}`); }
const tooLarge = (message: string): never => { throw officeError("office_too_large", message); };
const unsupported = (message: string): never => { throw officeError("office_unsupported", message); };

const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function officeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function readOfficeZip(input: Buffer): Map<string, Buffer> {
  if (input.length > OFFICE_MAX_BYTES) tooLarge("Office files must be at most 25 MiB.");
  let end = -1;
  for (let at = input.length - 22; at >= Math.max(0, input.length - 65557); at--) {
    if (input.readUInt32LE(at) === 0x06054b50 && at + 22 + input.readUInt16LE(at + 20) === input.length) { end = at; break; }
  }
  if (end < 0) corrupt("ZIP central directory is missing.");
  const count = input.readUInt16LE(end + 10);
  const centralSize = input.readUInt32LE(end + 12);
  const centralStart = input.readUInt32LE(end + 16);
  if (input.readUInt16LE(end + 4) || input.readUInt16LE(end + 6) || input.readUInt16LE(end + 8) !== count) unsupported("Multi-disk ZIP files are unsupported.");
  if (count === 0xffff || centralSize === 0xffffffff || centralStart === 0xffffffff) unsupported("ZIP64 Office files are unsupported.");
  if (count > OFFICE_MAX_ENTRIES) tooLarge(`Office ZIP has more than ${OFFICE_MAX_ENTRIES} entries.`);
  if (centralStart + centralSize !== end) corrupt("Invalid central directory bounds.");
  const files = new Map<string, Buffer>();
  const ranges: Array<[number, number]> = [];
  let at = centralStart;
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (at + 46 > end || input.readUInt32LE(at) !== 0x02014b50) corrupt("Invalid central directory entry.");
    const flags = input.readUInt16LE(at + 8);
    const method = input.readUInt16LE(at + 10);
    const crc = input.readUInt32LE(at + 16);
    const compressed = input.readUInt32LE(at + 20);
    const size = input.readUInt32LE(at + 24);
    const nameSize = input.readUInt16LE(at + 28);
    const extraSize = input.readUInt16LE(at + 30);
    const commentSize = input.readUInt16LE(at + 32);
    const offset = input.readUInt32LE(at + 42);
    if (flags & ~0x080e || flags & 1 || input.readUInt16LE(at + 34)) unsupported("Encrypted or unsupported ZIP entries cannot be previewed.");
    if (method !== 0 && method !== 8) unsupported("Only stored and deflated ZIP entries are supported.");
    if (compressed === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) unsupported("ZIP64 Office entries are unsupported.");
    if (at + 46 + nameSize + extraSize + commentSize > end) corrupt("Truncated central directory.");
    const rawName = input.subarray(at + 46, at + 46 + nameSize);
    let name: string;
    try { name = new TextDecoder("utf-8", { fatal: true }).decode(rawName); } catch { corrupt("Invalid entry name encoding."); }
    if (!name || name.includes("\0") || name.includes("\\") || name.startsWith("/") || name.split("/").some(part => part === ".." || part === ".") || files.has(name)) corrupt("Unsafe or duplicate ZIP entry name.");
    if (offset + 30 > centralStart || input.readUInt32LE(offset) !== 0x04034b50) corrupt("Invalid local entry header.");
    const localNameSize = input.readUInt16LE(offset + 26);
    const dataStart = offset + 30 + localNameSize + input.readUInt16LE(offset + 28);
    if (dataStart + compressed > centralStart || input.readUInt16LE(offset + 8) !== method || input.readUInt16LE(offset + 6) !== flags || !input.subarray(offset + 30, offset + 30 + localNameSize).equals(rawName)) corrupt("ZIP local entry disagrees with central directory.");
    ranges.push([offset, dataStart + compressed]);
    if (size > OFFICE_MAX_EXPANDED_BYTES - total) tooLarge("Office ZIP expands beyond 64 MiB.");
    const packed = input.subarray(dataStart, dataStart + compressed);
    let bytes: Buffer;
    if (method === 0) bytes = packed;
    else {
      try { bytes = inflateRawSync(packed, { maxOutputLength: Math.min(size + 1, OFFICE_MAX_EXPANDED_BYTES - total + 1) }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") tooLarge("Office ZIP entry expands beyond its declared limit.");
        corrupt("Invalid deflated ZIP entry.");
      }
    }
    total += bytes.length;
    if (total > OFFICE_MAX_EXPANDED_BYTES) tooLarge("Office ZIP expands beyond 64 MiB.");
    if (bytes.length !== size || officeCrc32(bytes) !== crc) corrupt("ZIP entry size or checksum is invalid.");
    files.set(name, bytes);
    at += 46 + nameSize + extraSize + commentSize;
  }
  if (at !== end) corrupt("Central directory size is invalid.");
  ranges.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) if (ranges[i]![0] < ranges[i - 1]![1]) corrupt("Overlapping ZIP entries.");
  return files;
}
