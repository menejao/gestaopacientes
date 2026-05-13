import { tenantKey } from "./tenant";

export function readLS(key, def) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def; } catch { return def; }
}
export function writeLS(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (err) {
    if (import.meta.env.DEV) console.warn("[writeLS]", err?.message);
  }
}

export const SESSION_KEY           = tenantKey("session");
export const UI_STATE_KEY          = tenantKey("ui");
export const AGENDA_KEY            = tenantKey("agenda_v1");
export const RECEPTION_KEY         = tenantKey("reception_v1");
export const QUEUE_KEY             = tenantKey("queue_v1");
export const REFERRALS_KEY         = tenantKey("referrals_v1");
export const NOTIFS_KEY            = tenantKey("notifs_v1");
export const COOKIE_SESSION_TOKEN  = "__cookie_session__";

export function readSession() {
  return null;
}
export function readUiState() {
  try { const r = localStorage.getItem(UI_STATE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
