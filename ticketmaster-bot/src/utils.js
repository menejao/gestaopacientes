export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function withJitter(ms, percent = 0.25) {
  const spread = ms * percent;
  return Math.round(ms - spread + Math.random() * spread * 2);
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function nowForLog() {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date());
}

export function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
