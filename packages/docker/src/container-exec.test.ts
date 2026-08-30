import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  containers: [] as Array<{ Id: string }>,
  exitCode: 0 as number | undefined,
  rawStream: null as PassThrough | null,
};

vi.mock("./client", () => ({
  getDockerClient: () => ({
    listContainers: vi.fn(async () => state.containers),
    getContainer: () => ({
      exec: vi.fn(async () => ({
        start: vi.fn(async () => state.rawStream),
        inspect: vi.fn(async () => ({ ExitCode: state.exitCode })),
      })),
    }),
    modem: {
      // Mirrors the real docker-modem: forwards 'data' only, never ends the
      // target streams - the exact behaviour execInContainerStream compensates for.
      demuxStream: (source: PassThrough, stdout: PassThrough) => {
        source.on("data", (chunk: Buffer) => stdout.write(chunk));
      },
    },
  }),
}));

const { execInContainerStream, execInContainer } = await import("./container-exec");

describe("execInContainerStream", () => {
  beforeEach(() => {
    state.containers = [{ Id: "container-1" }];
    state.exitCode = 0;
    state.rawStream = new PassThrough();
  });

  it("throws when the service has no running container", async () => {
    state.containers = [];
    await expect(execInContainerStream("db-1", { cmd: ["true"] })).rejects.toThrow(/No running container found/);
  });

  // The deadlock this guards against: demuxStream never ends stdout, so an S3
  // upload consuming it waited forever for an EOF that never arrived.
  it("ends stdout when the command's stream ends, so consumers see EOF", async () => {
    const { stdout, waitForExit } = await execInContainerStream("db-1", { cmd: ["pg_dump"] });

    const collected = new Promise<string>((resolve) => {
      const chunks: Buffer[] = [];
      stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      stdout.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });

    state.rawStream!.write("dump-data");
    state.rawStream!.end();

    await expect(collected).resolves.toBe("dump-data");
    await expect(waitForExit()).resolves.toBeUndefined();
  });

  it("still settles when waitForExit is called after the stream already ended", async () => {
    const { stdout, waitForExit } = await execInContainerStream("db-1", { cmd: ["pg_dump"] });
    stdout.resume();

    state.rawStream!.write("x");
    state.rawStream!.end();
    await new Promise((resolve) => setImmediate(resolve));

    await expect(waitForExit()).resolves.toBeUndefined();
  });

  it("surfaces a non-zero exit code with the captured stderr", async () => {
    state.exitCode = 1;
    const { stdout, waitForExit } = await execInContainerStream("db-1", { cmd: ["pg_dump"] });
    stdout.resume();

    state.rawStream!.end();

    await expect(waitForExit()).rejects.toThrow(/exited with code 1/);
  });
});

describe("execInContainer", () => {
  beforeEach(() => {
    state.containers = [{ Id: "container-1" }];
    state.exitCode = 0;
    state.rawStream = new PassThrough();
  });

  it("buffers stdout and returns it as a string", async () => {
    const promise = execInContainer("db-1", { cmd: ["redis-cli", "INFO"] });
    await new Promise((resolve) => setImmediate(resolve));

    state.rawStream!.write("rdb_bgsave_in_progress:0");
    state.rawStream!.end();

    await expect(promise).resolves.toBe("rdb_bgsave_in_progress:0");
  });
});
