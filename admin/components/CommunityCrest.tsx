import type { Community } from "../lib/types";

/**
 * Host unico permitido para el icono del servidor.
 *
 * `communities.icon_url` lo escribe `supabase/functions/discord-verify/index.ts`
 * armando `https://cdn.discordapp.com/icons/{guild_id}/{hash}.png`, asi que en la
 * practica siempre es este host. Se valida igual: la columna es texto y un admin
 * con acceso a la base podria dejar cualquier URL ahi. Renderizar eso tal cual
 * convierte el panel en un beacon de tracking de terceros.
 */
const ALLOWED_ICON_HOST = "cdn.discordapp.com";

function safeIconUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === ALLOWED_ICON_HOST ? url.href : null;
  } catch {
    return null;
  }
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => [...word][0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

export interface CommunityCrestProps {
  readonly community: Pick<Community, "name" | "icon_url">;
  readonly size?: "sm" | "md" | "lg";
}

/** Icono del servidor de Discord, con iniciales de fallback. */
export function CommunityCrest({ community, size = "md" }: CommunityCrestProps) {
  const src = safeIconUrl(community.icon_url);

  return (
    <span className="tla-crest" data-size={size} aria-hidden="true">
      {src ? (
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span>{initials(community.name)}</span>
      )}
    </span>
  );
}
