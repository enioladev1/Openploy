import { getOrgScopedService } from "@openploy/db";
import { getAuth } from "@/server/get-auth";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { uploadStaticBundle } from "@/server/services/static-upload-service";

// Needs real Node APIs (Buffer) for the zip bytes - not edge-runtime safe.
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) return new Response("Unauthorized", { status: 401 });

  const { id: serviceId } = await params;
  const service = await getOrgScopedService(db, auth.organizationId, serviceId);
  if (!service || service.type !== "application") {
    return new Response("Service not found", { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response("Expected multipart/form-data", { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await uploadStaticBundle(serviceId, file.name, buffer);
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof ValidationError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
