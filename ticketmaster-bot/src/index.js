import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { config, validateConfig } from './config.js';
import { attemptAddToCart, waitUntilHumanStepIsSolved } from './ticketmaster.js';
import { notifyWhatsApp } from './whatsapp.js';
import { nowForLog, sleep, withJitter } from './utils.js';

let context;

async function main() {
  const errors = validateConfig();
  if (errors.length > 0) {
    console.error('Configuração inválida:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  await mkdir(config.browserProfileDir, { recursive: true });
  await mkdir(config.screenshotsDir, { recursive: true });

  context = await chromium.launchPersistentContext(config.browserProfileDir, {
    headless: config.headless,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1366, height: 900 },
    slowMo: config.slowMoMs,
  });

  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(config.actionTimeoutMs);

  page.on('dialog', async (dialog) => {
    console.log(`[${nowForLog()}] Diálogo do site: ${dialog.message()}`);
    await dialog.dismiss().catch(() => undefined);
  });

  console.log(`[${nowForLog()}] Abrindo evento: ${config.eventUrl}`);
  await page.goto(config.eventUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  if (config.notifyOnStart) {
    await notifyWhatsApp(`Bot iniciado para ${config.targetSector}: ${config.eventUrl}`);
  }

  let lastStatus = '';
  let humanNoticeSent = false;
  let dryRunNoticeSent = false;

  while (true) {
    const result = await attemptAddToCart(page, config);
    const statusLine = `${result.status}: ${result.reason}`;

    if (statusLine !== lastStatus) {
      console.log(`[${nowForLog()}] ${statusLine}`);
      lastStatus = statusLine;
    }

    if (result.status === 'reserved' || result.status === 'clicked') {
      const screenshot = await saveScreenshot(page, result.status);
      await notifyWhatsApp(
        [
          'Ingresso possivelmente reservado no carrinho.',
          `Setor: ${config.targetSector}`,
          `Quantidade: ${config.targetQuantity}`,
          `Status: ${result.reason}`,
          `Link: ${page.url()}`,
          screenshot ? `Screenshot local: ${screenshot}` : '',
        ].filter(Boolean).join('\n'),
      );

      console.log(`[${nowForLog()}] Navegador mantido aberto para finalizar a compra.`);
      if (config.keepBrowserOpen) await keepOpen();
      break;
    }

    if (result.status === 'available-dry-run') {
      if (!dryRunNoticeSent) {
        dryRunNoticeSent = true;
        await notifyWhatsApp(
          [
            'Arquibancada parece disponível, mas o bot está em modo seguro.',
            'Para tentar carrinho: DRY_RUN=false e ADD_TO_CART=true.',
            `Link: ${page.url()}`,
          ].join('\n'),
        );
      }
      await sleep(withJitter(config.checkIntervalMs));
      continue;
    }

    if (result.status === 'needs-human') {
      if (!humanNoticeSent) {
        humanNoticeSent = true;
        await notifyWhatsApp(
          [
            'A Ticketmaster pediu uma ação humana no navegador aberto.',
            'Resolva login/CAPTCHA/validação normalmente. O bot vai aguardar sem burlar nada.',
            `Link: ${page.url()}`,
          ].join('\n'),
        );
      }
      await waitUntilHumanStepIsSolved(page, config.queueCheckIntervalMs);
      continue;
    }

    if (result.status === 'queue') {
      await sleep(withJitter(config.queueCheckIntervalMs));
      continue;
    }

    humanNoticeSent = false;
    dryRunNoticeSent = false;
    await sleep(withJitter(config.checkIntervalMs));

    if (config.reloadWhenIdle) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((error) => {
        console.warn(`[${nowForLog()}] Reload falhou: ${error.message}`);
      });
    }
  }
}

async function saveScreenshot(page, status) {
  const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${status}.png`;
  const path = join(config.screenshotsDir, fileName);
  await page.screenshot({ path, fullPage: true }).catch(() => null);
  return path;
}

async function keepOpen() {
  while (true) await sleep(60_000);
}

process.on('SIGINT', async () => {
  console.log(`\n[${nowForLog()}] Encerrando...`);
  await context?.close().catch(() => undefined);
  process.exit(0);
});

main().catch(async (error) => {
  console.error(`[${nowForLog()}] Erro fatal:`, error);
  await notifyWhatsApp(`Bot parou com erro: ${error.message}`).catch(() => undefined);
  await context?.close().catch(() => undefined);
  process.exit(1);
});
