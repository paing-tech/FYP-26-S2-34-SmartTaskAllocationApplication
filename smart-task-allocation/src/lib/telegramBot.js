async function telegramFetch(botToken, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.description || `Telegram ${method} failed.`);
  }
  return data.result;
}

export async function getBotInfo(botToken) {
  return telegramFetch(botToken, "getMe");
}

export async function setWebhook(botToken, webhookUrl) {
  return telegramFetch(botToken, "setWebhook", { url: webhookUrl });
}

export async function deleteWebhook(botToken) {
  return telegramFetch(botToken, "deleteWebhook");
}

export async function sendTelegramMessage(botToken, chatId, text) {
  return telegramFetch(botToken, "sendMessage", { chat_id: chatId, text });
}
