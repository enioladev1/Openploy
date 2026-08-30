import { PassThrough, type Readable } from "node:stream";
import * as tar from "tar-stream";

/**
 * Docker's container.getArchive() always returns a tar stream (even for a
 * single file) - this pulls out the first (and for our use, only) file
 * entry's content as its own readable stream.
 */
export function extractFirstFileFromTar(tarStream: NodeJS.ReadableStream): Promise<Readable> {
  return new Promise((resolve, reject) => {
    const extract = tar.extract();
    let resolved = false;

    extract.on("entry", (header, stream, next) => {
      if (header.type === "file" && !resolved) {
        resolved = true;
        const out = new PassThrough();
        stream.pipe(out);
        stream.on("end", next);
        resolve(out);
        return;
      }
      stream.on("end", next);
      stream.resume();
    });

    extract.on("error", (err) => {
      if (!resolved) reject(err);
    });
    extract.on("finish", () => {
      if (!resolved) reject(new Error("Tar archive contained no file entries"));
    });

    (tarStream as Readable).pipe(extract);
  });
}
