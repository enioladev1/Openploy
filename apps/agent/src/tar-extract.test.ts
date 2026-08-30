import * as tar from "tar-stream";
import { describe, expect, it } from "vitest";
import { extractFirstFileFromTar } from "./tar-extract";

function buildTarStream(entries: Array<{ name: string; content: string }>): NodeJS.ReadableStream {
  const pack = tar.pack();
  for (const entry of entries) {
    pack.entry({ name: entry.name }, entry.content);
  }
  pack.finalize();
  return pack;
}

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

describe("extractFirstFileFromTar", () => {
  it("extracts the single file entry's content", async () => {
    const tarball = buildTarStream([{ name: "dump.rdb", content: "REDIS0011fake-rdb-bytes" }]);
    const fileStream = await extractFirstFileFromTar(tarball);
    expect(await readAll(fileStream)).toBe("REDIS0011fake-rdb-bytes");
  });

  it("rejects an empty archive", async () => {
    const tarball = buildTarStream([]);
    await expect(extractFirstFileFromTar(tarball)).rejects.toThrow(/no file entries/);
  });
});
