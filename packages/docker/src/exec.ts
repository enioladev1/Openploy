import { spawn } from "node:child_process";

export type LogLineHandler = (line: string) => void;

export function runCommand(command: string, args: string[], onLine: LogLineHandler, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // Node kills the child (default SIGTERM) the moment signal aborts - the
    // resulting 'error'/'close' is generically treated as "canceled" by the
    // caller re-checking the deployment's own status, not by inspecting this
    // rejection's shape.
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], signal });

    let stderrBuffer = "";
    const forward = (chunk: Buffer, capture: boolean) => {
      const text = chunk.toString("utf8");
      if (capture) stderrBuffer += text;
      for (const line of text.split("\n")) {
        if (line.length > 0) onLine(line);
      }
    };

    child.stdout.on("data", (chunk: Buffer) => forward(chunk, false));
    child.stderr.on("data", (chunk: Buffer) => forward(chunk, true));

    child.on("error", reject);
    child.on("close", (code) => {
      if (signal?.aborted) {
        reject(new Error("Canceled"));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderrBuffer.slice(-2000)}`));
      }
    });
  });
}
