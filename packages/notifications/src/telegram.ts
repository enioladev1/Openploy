export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/** Telegram's Bot API is plain HTTP+JSON - no SDK needed for one call. */
export async function sendTelegramMessage(config: TelegramConfig, html: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const description = body && typeof body === "object" && "description" in body ? String(body.description) : res.statusText;
    throw new Error(`Telegram API error (${res.status}): ${description}`);
  }
}
