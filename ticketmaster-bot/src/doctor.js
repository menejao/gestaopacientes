import { config, validateConfig } from './config.js';
import { notifyWhatsApp } from './whatsapp.js';

const errors = validateConfig();

console.log('Configuração carregada:');
console.log(`- Evento: ${config.eventUrl}`);
console.log(`- Setor: ${config.targetSector}`);
console.log(`- Quantidade: ${config.targetQuantity}`);
console.log(`- Verificação fora da fila: ${Math.round(config.checkIntervalMs / 1000)}s`);
console.log(`- Verificação na fila: ${Math.round(config.queueCheckIntervalMs / 1000)}s`);
console.log(`- Dry run: ${config.dryRun}`);
console.log(`- Add to cart: ${config.addToCart}`);
console.log(`- WhatsApp: ${config.whatsapp.provider}`);

if (errors.length > 0) {
  console.log('\nProblemas encontrados:');
  for (const error of errors) console.log(`- ${error}`);
  process.exit(1);
}

console.log('\nConfiguração básica OK.');

if (process.argv.includes('--send-test')) {
  await notifyWhatsApp('Teste do bot Ticketmaster: WhatsApp configurado corretamente.');
}
