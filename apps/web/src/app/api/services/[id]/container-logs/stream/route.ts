import { getAuth } from "@/server/get-auth";
import { getOrgScopedCurrentDeploymentId, getRuntimeLogsSince } from "@/server/services/deployment-service";

const POLL_INTERVAL_MS = 700;
// Container logs are inherently open-ended (the container may run for days) -
// this isn't a "wait for completion" stream like the build-log one, so instead
// of closing on any particular status, the connection is just capped and the
// client reconnects with its own last-seen sequence, picking up where it left off.
const MAX_SESSION_MS = 10 * 60 * 1000;

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) return new Response("Unauthorized", { status: 401 });

  const { id: serviceId } = await params;
  const deploymentId = await getOrgScopedCurrentDeploymentId(auth.organizationId, serviceId);
  if (!deploymentId) return new Response("No active deployment for this service yet", { status: 404 });

  const url = new URL(request.url);
  let lastSequence = Number(url.searchParams.get("since") ?? "0");
  if (!Number.isFinite(lastSequence) || lastSequence < 0) lastSequence = 0;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const deadline = Date.now() + MAX_SESSION_MS;

      request.signal.addEventListener("abort", () => {
        closed = true;
      });

      while (!closed && Date.now() < deadline) {
        const newLines = await getRuntimeLogsSince(deploymentId, lastSequence);
        for (const line of newLines) {
          controller.enqueue(encoder.encode(sseEvent({ id: line.id, sequence: line.sequence, content: line.content })));
          lastSequence = line.sequence;
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
