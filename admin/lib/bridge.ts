import type { SupabaseClient } from "@supabase/supabase-js";

// `app.js` (vanilla) crea el unico cliente de Supabase del sitio y lo publica en
// `window.TierlyBridge`. La isla lo REUSA: instanciar un segundo cliente levanta
// dos GoTrue sobre el mismo localStorage y se pelean por el refresh del token.
//
// `@supabase/supabase-js` es devDependency a proposito: aca solo entra como
// `import type`, que TypeScript borra al compilar. En runtime no se bundlea nada.
export interface TierlyBridge {
  readonly supabase: SupabaseClient;
  readonly supabaseConfig: { url: string; anonKey: string };
  t(key: string): string;
  session(): unknown;
  player(): unknown;
  syncState(): unknown;
  switchView(view: string): void;
  readonly inviteUrl: string;
}

declare global {
  interface Window {
    TierlyBridge?: TierlyBridge;
    TierlyAdmin?: { open(): void };
    lucide?: { createIcons(): void };
  }
}

export function getBridge(): TierlyBridge | null {
  return window.TierlyBridge ?? null;
}

/**
 * Evento con el que `app.js` le pide a la isla que recargue. No se expone un
 * `reload()` directo en `window` porque la funcion vive dentro de un hook de
 * React: el listener es lo que sobrevive a los remontajes.
 */
export const ADMIN_OPEN_EVENT = "tirly:admin-open";
