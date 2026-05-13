import { escapeRegExp, normalizeText, sleep } from './utils.js';

const HUMAN_PATTERNS = [
  /atividade suspeita/i,
  /actividad sospechosa/i,
  /suspicious activity/i,
  /captcha/i,
  /não sou um robô/i,
  /nao sou um robo/i,
  /verifica/i,
];

const QUEUE_PATTERNS = [
  /fila/i,
  /queue/i,
  /aguarde/i,
  /sala de espera/i,
  /waiting room/i,
  /sua vez/i,
  /your turn/i,
];

const LOGIN_FORM_PATTERNS = {
  identity: /e-?mail|cpf|login/i,
  password: /senha|password/i,
  action: /entrar|acessar|fazer login|sign in/i,
};

const SOLD_OUT_PATTERNS = [
  /esgotad[oa]/i,
  /indispon[ií]vel/i,
  /sem ingressos/i,
  /sold out/i,
  /unavailable/i,
  /not available/i,
];

const CART_PATTERNS = [
  /seu carrinho/i,
  /meu carrinho/i,
  /ir para o carrinho/i,
  /checkout/i,
  /pagamento/i,
  /resumo do pedido/i,
  /finalizar compra/i,
  /pedido/i,
];

const ENTRY_BUTTONS = [
  /comprar ingressos/i,
  /selecionar ingressos/i,
  /ver ingressos/i,
  /ver disponibilidade/i,
  /comprar/i,
  /tickets/i,
];

const ENTRY_BLOCKLIST = [
  /meus ingressos/i,
  /minha conta/i,
  /entrar/i,
  /login/i,
  /cadastro/i,
];

const SELECT_BUTTONS = [
  /selecionar/i,
  /escolher/i,
  /adicionar/i,
  /comprar/i,
  /continuar/i,
  /pr[oó]ximo/i,
  /^\+$/,
];

const CART_BUTTONS = [
  /adicionar ao carrinho/i,
  /colocar no carrinho/i,
  /ir para o carrinho/i,
  /continuar/i,
  /checkout/i,
  /prosseguir/i,
  /avançar/i,
  /avancar/i,
];

const PAYMENT_BLOCKLIST = [
  /pagar/i,
  /confirmar pagamento/i,
  /finalizar pagamento/i,
  /concluir compra/i,
];

export async function detectPageState(page) {
  const text = await getBodyText(page);
  const url = page.url();

  if (looksLikeLoginStep(text, url)) {
    return { status: 'needs-human', reason: 'site pediu login para continuar' };
  }

  if (matchesAny(text, HUMAN_PATTERNS)) {
    return { status: 'needs-human', reason: 'validação humana ou bloqueio exibido' };
  }

  if (matchesAny(text, QUEUE_PATTERNS) && !matchesAny(text, CART_PATTERNS)) {
    return { status: 'queue', reason: 'site parece estar em fila/sala de espera' };
  }

  if (/cart|checkout|payment|pedido|order/i.test(url) || matchesAny(text, CART_PATTERNS)) {
    return { status: 'reserved', reason: 'página parece estar em carrinho/checkout' };
  }

  return { status: 'ready', reason: 'página carregada para monitoramento' };
}

export async function attemptAddToCart(page, botConfig) {
  await acceptCookieBanners(page);

  const state = await detectPageState(page);
  if (state.status !== 'ready') return state;

  const sectorVisible = await hasSectorText(page, botConfig.targetSector);
  if (!sectorVisible) {
    await clickEntryPoint(page);
    await page.waitForTimeout(2_000);
  }

  const sector = await findSectorContainer(page, botConfig.targetSector);
  if (!sector) {
    return {
      status: 'not-found',
      reason: `setor "${botConfig.targetSector}" ainda não apareceu na tela`,
    };
  }

  const sectorText = await sector.innerText({ timeout: botConfig.actionTimeoutMs }).catch(() => '');
  if (matchesAny(sectorText, SOLD_OUT_PATTERNS)) {
    return {
      status: 'sold-out',
      reason: `setor "${botConfig.targetSector}" encontrado, mas marcado como indisponível`,
    };
  }

  if (botConfig.dryRun || !botConfig.addToCart) {
    return {
      status: 'available-dry-run',
      reason: `setor "${botConfig.targetSector}" parece disponível, modo seguro ligado`,
    };
  }

  await selectSector(sector, page);
  await setQuantity(page, botConfig.targetQuantity);
  await clickCartProgression(page);
  await page.waitForTimeout(3_000);

  const finalState = await detectPageState(page);
  if (finalState.status === 'needs-human') return finalState;
  if (finalState.status === 'reserved') return finalState;

  return {
    status: 'clicked',
    reason: 'cliques executados; confirme no navegador se o carrinho foi aberto',
  };
}

export async function waitUntilHumanStepIsSolved(page, intervalMs) {
  while (true) {
    await sleep(intervalMs);
    const state = await detectPageState(page);
    if (state.status !== 'needs-human') return state;
  }
}

export async function getBodyText(page) {
  return page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
}

async function acceptCookieBanners(page) {
  const buttons = [
    /aceitar/i,
    /accept/i,
    /ok/i,
    /concordo/i,
    /permitir todos/i,
  ];

  for (const pattern of buttons) {
    const clicked = await clickButtonByName(page, pattern, { optional: true });
    if (clicked) {
      await page.waitForTimeout(700);
      return true;
    }
  }

  return false;
}

async function clickEntryPoint(page) {
  for (const pattern of ENTRY_BUTTONS) {
    const clicked = await clickButtonByName(page, pattern, {
      optional: true,
      blocklist: ENTRY_BLOCKLIST,
    });
    if (clicked) return true;
  }

  return false;
}

async function hasSectorText(page, sectorName) {
  const pattern = new RegExp(escapeRegExp(sectorName), 'i');
  return page.getByText(pattern).first().isVisible({ timeout: 2_000 }).catch(() => false);
}

async function findSectorContainer(page, sectorName) {
  const pattern = new RegExp(escapeRegExp(sectorName), 'i');
  const textNode = page.getByText(pattern).first();
  const visible = await textNode.isVisible({ timeout: 4_000 }).catch(() => false);
  if (!visible) return null;

  const ancestorSelectors = [
    'xpath=ancestor::tr[1]',
    'xpath=ancestor::*[@role="row"][1]',
    'xpath=ancestor::li[1]',
    'xpath=ancestor::article[1]',
    'xpath=ancestor::section[1]',
    'xpath=ancestor::div[1]',
    'xpath=ancestor::div[2]',
    'xpath=ancestor::div[3]',
  ];

  for (const selector of ancestorSelectors) {
    const candidate = textNode.locator(selector).first();
    const candidateText = await candidate.innerText({ timeout: 2_000 }).catch(() => '');
    if (normalizeText(candidateText).includes(normalizeText(sectorName))) return candidate;
  }

  return textNode;
}

async function selectSector(sector, page) {
  for (const pattern of SELECT_BUTTONS) {
    const clickedInside = await clickButtonByName(sector, pattern, { optional: true });
    if (clickedInside) return true;
  }

  await sector.click({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(1_000);
  return true;
}

async function setQuantity(page, quantity) {
  if (quantity !== 1) {
    throw new Error('Este bot foi travado para selecionar apenas 1 ingresso.');
  }

  const numericInputs = await page
    .locator('input[type="number"], input[aria-label*="quant"], input[name*="quant"]')
    .all();

  for (const input of numericInputs) {
    const visible = await input.isVisible().catch(() => false);
    const enabled = await input.isEnabled().catch(() => false);
    if (!visible || !enabled) continue;

    await input.fill('1').catch(() => undefined);
    const value = await input.inputValue().catch(() => '');
    if (value === '1') return true;
  }

  const selects = await page.locator('select').all();
  for (const select of selects) {
    const visible = await select.isVisible().catch(() => false);
    if (!visible) continue;

    const selected = await select.selectOption({ label: '1' }).catch(() => null);
    if (selected) return true;

    const selectedByValue = await select.selectOption('1').catch(() => null);
    if (selectedByValue) return true;
  }

  const plusClicked = await clickButtonByName(page, /^\+$/, { optional: true });
  if (plusClicked) await page.waitForTimeout(700);
  return plusClicked;
}

async function clickCartProgression(page) {
  for (const pattern of CART_BUTTONS) {
    const clicked = await clickButtonByName(page, pattern, {
      optional: true,
      blocklist: PAYMENT_BLOCKLIST,
    });
    if (clicked) {
      await page.waitForTimeout(1_500);
      return true;
    }
  }

  return false;
}

async function clickButtonByName(scope, pattern, options = {}) {
  const { optional = false, blocklist = [] } = options;
  const locators = [
    scope.getByRole('button', { name: pattern }).first(),
    scope.getByRole('link', { name: pattern }).first(),
    scope.locator('button, a, [role="button"]').filter({ hasText: pattern }).first(),
  ];

  for (const locator of locators) {
    const text = await locator.innerText({ timeout: 1_000 }).catch(() => '');
    if (blocklist.some((blocked) => blocked.test(text))) continue;

    const visible = await locator.isVisible({ timeout: 1_000 }).catch(() => false);
    const enabled = await locator.isEnabled({ timeout: 1_000 }).catch(() => false);
    if (!visible || !enabled) continue;

    await locator.click({ timeout: 5_000 });
    return true;
  }

  if (!optional) throw new Error(`Botão não encontrado: ${pattern}`);
  return false;
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function looksLikeLoginStep(text, url) {
  const urlSuggestsLogin = /login|signin|account|entrar|minha-conta/i.test(url);
  const textSuggestsLogin =
    LOGIN_FORM_PATTERNS.identity.test(text) &&
    LOGIN_FORM_PATTERNS.password.test(text) &&
    LOGIN_FORM_PATTERNS.action.test(text);

  return urlSuggestsLogin && textSuggestsLogin;
}
