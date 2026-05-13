import { config } from './config.js';

export async function notifyWhatsApp(message) {
  const provider = config.whatsapp.provider;

  if (provider === 'disabled') {
    console.log(`[whatsapp:disabled] ${message}`);
    return { sent: false, provider };
  }

  if (provider === 'cloud') return sendWithCloudApi(message);
  if (provider === 'twilio') return sendWithTwilio(message);

  throw new Error(`Provedor de WhatsApp inválido: ${provider}`);
}

async function sendWithCloudApi(message) {
  const { token, phoneNumberId, apiVersion } = config.whatsapp.cloud;
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: config.whatsapp.to,
      type: 'text',
      text: {
        preview_url: true,
        body: message,
      },
    }),
  });

  return parseProviderResponse(response, 'cloud');
}

async function sendWithTwilio(message) {
  const { accountSid, authToken, from } = config.whatsapp.twilio;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const form = new URLSearchParams({
    From: from,
    To: config.whatsapp.to,
    Body: message,
  });

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });

  return parseProviderResponse(response, 'twilio');
}

async function parseProviderResponse(response, provider) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Falha no WhatsApp (${provider}): ${response.status} ${text}`);
  }

  console.log(`[whatsapp:${provider}] mensagem enviada`);
  return { sent: true, provider, response: safeJson(text) };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
