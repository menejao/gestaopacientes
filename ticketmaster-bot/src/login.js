import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { config } from './config.js';
import { nowForLog, sleep } from './utils.js';

await mkdir(config.browserProfileDir, { recursive: true });

const context = await chromium.launchPersistentContext(config.browserProfileDir, {
  headless: false,
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  viewport: { width: 1366, height: 900 },
});

const page = context.pages()[0] ?? await context.newPage();
console.log(`[${nowForLog()}] Abrindo Ticketmaster para login manual.`);
console.log('Faça login, resolva validações se aparecerem e depois feche este terminal.');

await page.goto(config.eventUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

process.on('SIGINT', async () => {
  await context.close();
  process.exit(0);
});

while (true) await sleep(60_000);
