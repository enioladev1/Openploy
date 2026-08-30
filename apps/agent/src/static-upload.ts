import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";

// Generous for a static site bundle, bounded against a decompression-bomb zip
// (a tiny compressed file that expands to gigabytes) rather than trusting the
// archive's own claimed sizes.
const MAX_ENTRY_COUNT = 20_000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;

/**
 * Extracts a zip buffer into destDir, never trusting entry names: rejects any
 * entry whose resolved path would escape destDir ("zip-slip", e.g. a
 * "../../etc/cron.d/x" entry name) rather than silently sanitizing it.
 */
export async function extractZipToDirectory(zipBuffer: Buffer, destDir: string): Promise<void> {
  const entries = unzipSync(new Uint8Array(zipBuffer));
  const names = Object.keys(entries);
  if (names.length === 0) throw new Error("Zip file is empty");
  if (names.length > MAX_ENTRY_COUNT) throw new Error(`Zip file has too many entries (max ${MAX_ENTRY_COUNT})`);

  const resolvedDest = path.resolve(destDir);
  let totalBytes = 0;

  for (const name of names) {
    if (name.endsWith("/")) continue; // directory entry - created implicitly via the file writes below

    const data = entries[name]!;
    totalBytes += data.byteLength;
    if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error(`Zip file is too large when extracted (max ${MAX_TOTAL_UNCOMPRESSED_BYTES / 1024 / 1024}MB)`);
    }

    const targetPath = path.resolve(resolvedDest, name);
    if (targetPath !== resolvedDest && !targetPath.startsWith(resolvedDest + path.sep)) {
      throw new Error(`Refusing to extract unsafe zip entry: "${name}"`);
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, data);
  }
}
