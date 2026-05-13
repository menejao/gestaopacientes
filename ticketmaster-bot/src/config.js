import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const envPath = resolve(projectRoot, '.env');

loadDotEnv(envPath);

function loadDotEnv(path) {
  if (!existsSync(path)) return;

  const content = readFileSync(path, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function readString(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function readBoolean(name, fallback = false) {
  const value = readString(name, String(fallback)).toLowerCase();
  return ['1', 'true', 'yes', 'sim', 'on'].includes(value);
}

function readInteger(name, fallback) {
  const value = Number.parseInt(readString(name, String(fallback)), 10);
  return Number.isFinite(value) ? value : fallback;
}

function readIntervalMs(secondsName, millisName, fallbackMs) {
  const seconds = process.env[secondsName];
  if (seconds !== undefined && seconds !== '') {
    return readInteger(secondsName, Math.ceil(fallbackMs / 1000)) * 1000;
  }

  return readInteger(millisName, fallbackMs);
}

export const config = {
  projectRoot,
  eventUrl: readString(
    'EVENT_URL',
    'https://www.ticketmaster.com.br/event/venda-geral-bts-world-tour-arirang-30-10',
  ),
  targetSector: readString('TARGET_SECTOR', 'Arquibancada'),
  targetQuantity: readInteger('TARGET_QUANTITY', 1),
  dryRun: process.argv.includes('--dry-run') || readBoolean('DRY_RUN', true),
  addToCart: readBoolean('ADD_TO_CART', false),
  checkIntervalMs: readIntervalMs('CHECK_INTERVAL_SECONDS', 'CHECK_INTERVAL_MS', 30_000),
  queueCheckIntervalMs: readIntervalMs('QUEUE_CHECK_INTERVAL_SECONDS', 'QUEUE_CHECK_INTERVAL_MS', 60_000),
  reloadWhenIdle: readBoolean('RELOAD_WHEN_IDLE', true),
  browserProfileDir: resolve(projectRoot, readString('BROWSER_PROFILE_DIR', '.browser-profile')),
  screenshotsDir: resolve(projectRoot, 'screenshots'),
  headless: readBoolean('HEADLESS', false),
  keepBrowserOpen: readBoolean('KEEP_BROWSER_OPEN', true),
  actionTimeoutMs: readInteger('ACTION_TIMEOUT_MS', 8_000),
  slowMoMs: readInteger('SLOW_MO_MS', 120),
  notifyOnStart: readBoolean('NOTIFY_ON_START', false),
  whatsapp: {
    provider: readString('WHATSAPP_PROVIDER', 'disabled').toLowerCase(),
    to: readString('WHATSAPP_TO'),
    cloud: {
      token: readString('WHATSAPP_CLOUD_TOKEN'),
      phoneNumberId: readString('WHATSAPP_CLOUD_PHONE_NUMBER_ID'),
      apiVersion: readString('WHATSAPP_CLOUD_API_VERSION', 'v20.0'),
    },
    twilio: {
      accountSid: readString('TWILIO_ACCOUNT_SID'),
      authToken: readString('TWILIO_AUTH_TOKEN'),
      from: readString('TWILIO_FROM', 'whatsapp:+14155238886'),
    },
  },
};

export function validateConfig() {
  const errors = [];

  if (!config.eventUrl.startsWith('https://www.ticketmaster.com.br/')) {
    errors.push('EVENT_URL deve apontar para ticketmaster.com.br.');
  }

  if (config.targetQuantity !== 1) {
    errors.push('TARGET_QUANTITY deve ser 1 para este bot pessoal.');
  }

  if (config.checkIntervalMs < 30_000) {
    errors.push('CHECK_INTERVAL_SECONDS deve ser 30 ou maior para reduzir risco de bloqueio.');
  }

  if (config.queueCheckIntervalMs < 30_000) {
    errors.push('QUEUE_CHECK_INTERVAL_SECONDS deve ser 30 ou maior.');
  }

  if (config.addToCart && config.dryRun) {
    errors.push('ADD_TO_CART=true exige DRY_RUN=false.');
  }

  if (!['disabled', 'cloud', 'twilio'].includes(config.whatsapp.provider)) {
    errors.push('WHATSAPP_PROVIDER deve ser disabled, cloud ou twilio.');
  }

  if (config.whatsapp.provider !== 'disabled' && !config.whatsapp.to) {
    errors.push('WHATSAPP_TO é obrigatório quando WhatsApp está ligado.');
  }

  if (config.whatsapp.provider === 'cloud') {
    if (!config.whatsapp.cloud.token) errors.push('WHATSAPP_CLOUD_TOKEN é obrigatório.');
    if (!config.whatsapp.cloud.phoneNumberId) {
      errors.push('WHATSAPP_CLOUD_PHONE_NUMBER_ID é obrigatório.');
    }
  }

  if (config.whatsapp.provider === 'twilio') {
    if (!config.whatsapp.twilio.accountSid) errors.push('TWILIO_ACCOUNT_SID é obrigatório.');
    if (!config.whatsapp.twilio.authToken) errors.push('TWILIO_AUTH_TOKEN é obrigatório.');
    if (!config.whatsapp.twilio.from) errors.push('TWILIO_FROM é obrigatório.');
  }

  return errors;
}
