import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { config } from './config.js';
import { getBodyText } from './ticketmaster.js';

await mkdir(config.browserProfileDir, { recursive: true });

const context = await chromium.launchPersistentContext(config.browserProfileDir, {
  headless: false,
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  viewport: { width: 1366, height: 900 },
});

const page = context.pages()[0] ?? await context.newPage();
await page.goto(config.eventUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForTimeout(5_000);

const buttons = await page.locator('button, a, [role="button"]').evaluateAll((nodes) =>
  nodes
    .map((node) => ({
      tag: node.tagName.toLowerCase(),
      text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
      aria: node.getAttribute('aria-label') || '',
      disabled: node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true',
    }))
    .filter((item) => item.text || item.aria)
    .slice(0, 120),
);

const text = await getBodyText(page);
const sectorIndex = text.toLowerCase().indexOf(config.targetSector.toLowerCase());
const sectorSnippet =
  sectorIndex >= 0 ? text.slice(Math.max(0, sectorIndex - 500), sectorIndex + 1000) : '';

console.log('\nURL atual:');
console.log(page.url());

console.log('\nBotões/links clicáveis visíveis:');
for (const item of buttons) {
  console.log(`- ${item.tag} disabled=${item.disabled} text="${item.text}" aria="${item.aria}"`);
}

console.log(`\nTrecho perto de "${config.targetSector}":`);
console.log(sectorSnippet || 'Setor não encontrado no texto renderizado.');

await context.close();
