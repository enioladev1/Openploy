import { getAuth } from "@/server/get-auth";
import {
  getDeploymentLogsSince,
  getOrgScopedDeployment,
  isDeploymentTerminal,
} from "@/server/services/deployment-service";

const POLL_INTERVAL_MS = 700;
// Once the deployment reaches a terminal status, keep polling briefly in case
// a last few log lines are still being written, then close the stream.
const GRACE_PERIOD_AFTER_TERMINAL_MS = 3000;

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) return new Response("Unauthorized", { status: 401 });

  const { id: deploymentId } = await params;
  const deployment = await getOrgScopedDeployment(auth.organizationId, deploymentId);
  if (!deployment) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      let lastSequence = 0;
      let terminalSince: number | null = null;

      request.signal.addEventListener("abort", () => {
        closed = true;
      });

      // Replays persisted history first, then tails new lines - a client that
      // joins mid-build or reconnects after a drop sees the full log either way.
      while (!closed) {
        const newLines = await getDeploymentLogsSince(deploymentId, lastSequence);
        for (const line of newLines) {
          controller.enqueue(
            encoder.encode(
              sseEvent({ id: line.id, stream: line.stream, sequence: line.sequence, content: line.content }),
            ),
          );
          lastSequence = line.sequence;
        }

        const terminal = await isDeploymentTerminal(deploymentId);
        if (terminal) {
          terminalSince ??= Date.now();
          if (Date.now() - terminalSince > GRACE_PERIOD_AFTER_TERMINAL_MS) {
            controller.enqueue(encoder.encode(sseEvent({ done: true })));
            break;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      controller.close();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
