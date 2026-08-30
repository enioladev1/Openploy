import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractZipToDirectory } from "./static-upload";

describe("extractZipToDirectory", () => {
  let destDir: string;

  beforeEach(async () => {
    destDir = await mkdtemp(path.join(tmpdir(), "static-upload-test-"));
  });

  afterEach(async () => {
    await rm(destDir, { recursive: true, force: true });
  });

  it("extracts every file entry to the destination directory, preserving nested paths", async () => {
    const zip = Buffer.from(
      zipSync({
        "index.html": strToU8("<h1>hello</h1>"),
        "assets/style.css": strToU8("body { color: red; }"),
      }),
    );

    await extractZipToDirectory(zip, destDir);

    expect(await readFile(path.join(destDir, "index.html"), "utf8")).toBe("<h1>hello</h1>");
    expect(await readFile(path.join(destDir, "assets/style.css"), "utf8")).toBe("body { color: red; }");
  });

  it("rejects a zip-slip entry that would escape the destination directory", async () => {
    const zip = Buffer.from(
      zipSync({
        "../../etc/evil.txt": strToU8("pwned"),
      }),
    );

    await expect(extractZipToDirectory(zip, destDir)).rejects.toThrow(/unsafe zip entry/);

    // Nothing should have been written outside destDir as a side effect of the attempt.
    expect(await readdir(destDir)).toEqual([]);
  });

  it("rejects an empty zip", async () => {
    const zip = Buffer.from(zipSync({}));
    await expect(extractZipToDirectory(zip, destDir)).rejects.toThrow(/empty/);
  });
});
