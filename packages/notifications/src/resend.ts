export interface ResendConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
}

/** Resend's REST API is plain HTTP+JSON - no SDK needed for one call. */
export async function sendResendEmail(config: ResendConfig, subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      from: `${config.fromName} <${config.fromEmail}>`,
      to: [config.toEmail],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body && typeof body === "object" && "message" in body ? String(body.message) : res.statusText;
    throw new Error(`Resend API error (${res.status}): ${message}`);
  }
}
