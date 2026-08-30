import { getAuth } from "@/server/get-auth";
import { ValidationError } from "@/server/errors";
import { deleteAvatar, getAvatar, uploadAvatar } from "@/server/services/avatar-service";

// Needs real Node APIs (Buffer) for the image bytes - not edge-runtime safe.
export const runtime = "nodejs";

/** Any authenticated user can view any other user's avatar - same visibility as the Users list itself (single-org-per-instance model, see auth-service.ts). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) return new Response("Unauthorized", { status: 401 });

  const { id: userId } = await params;
  const avatar = await getAvatar(userId);
  if (!avatar) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(avatar.imageData), {
    headers: { "content-type": avatar.contentType, "cache-control": "private, max-age=300" },
  });
}

function requireSelf(auth: { userId: string }, userId: string): Response | null {
  // A user can only ever set/remove their own avatar, never another user's -
  // same IDOR rule as profile.ts's update/changePassword (userId always from
  // ctx.auth, never trusted from the client-supplied route param).
  if (auth.userId !== userId) return new Response("Forbidden", { status: 403 });
  return null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) return new Response("Unauthorized", { status: 401 });

  const { id: userId } = await params;
  const forbidden = requireSelf(auth, userId);
  if (forbidden) return forbidden;

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
    await uploadAvatar(userId, buffer);
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof ValidationError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) return new Response("Unauthorized", { status: 401 });

  const { id: userId } = await params;
  const forbidden = requireSelf(auth, userId);
  if (forbidden) return forbidden;

  await deleteAvatar(userId);
  return Response.json({ success: true });
}
