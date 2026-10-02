import { useState } from "react";

import type { TierlyBridge } from "../lib/bridge";
import type { Community } from "../lib/types";
import { ADMIN_VIEWS, VIEW_LABELS, type AdminView } from "../lib/types";

export interface CommunitySelectorProps {
  readonly communities: readonly Community[];
  readonly selectedGuildId: string | null;
  readonly onSelect: (guildId: string) => void;
}

export function CommunitySelector({
  communities,
  selectedGuildId,
  onSelect,
}: CommunitySelectorProps) {
  // Con una sola comunidad el selector es ruido: no hay nada que elegir.
  if (communities.length <= 1) return null;

  return (
    <label className="tla-field">
      Comunidad
      <select
        value={selectedGuildId ?? ""}
        onChange={(event) => onSelect(event.target.value)}
        aria-label="Seleccionar comunidad"
      >
        {communities.map((community) => (
          <option key={community.guild_id} value={community.guild_id}>
            {community.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface DirectoryToggleProps {
  readonly bridge: TierlyBridge;
  readonly community: Community;
  readonly onError: (message: string) => void;
  readonly onChanged: () => void;
}

/**
 * Aparecer en el directorio público es OPT-IN y lo decide el administrador.
 *
 * No escribe `communities.public_directory` directo: va por
 * `tierly_set_public_directory`, que revalida `community_admins` del lado del
 * servidor. Un update directo dependería de que la RLS esté bien, y eso es una
 * garantía más débil que una RPC `security definer` que chequea explícitamente.
 */
export function DirectoryToggle({ bridge, community, onError, onChanged }: DirectoryToggleProps) {
  const [saving, setSaving] = useState(false);

  async function handleChange(listed: boolean): Promise<void> {
    setSaving(true);
    const { error } = await bridge.supabase.rpc("tierly_set_public_directory", {
      target_guild: community.guild_id,
      listed,
    });
    setSaving(false);
    onError(error ? error.message : "");
    if (!error) onChanged();
  }

  return (
    <label
      className="tla-chip"
      title="Publica el nombre de la comunidad, los juegos agregados y los jugadores que aceptaron mostrarse."
    >
      <input
        type="checkbox"
        checked={community.public_directory === true}
        disabled={saving}
        onChange={(event) => void handleChange(event.target.checked)}
      />
      <span>Aparecer público</span>
    </label>
  );
}

export interface TabsProps {
  readonly active: AdminView;
  readonly onSelect: (view: AdminView) => void;
}

export function Tabs({ active, onSelect }: TabsProps) {
  return (
    <nav className="tla-tabs" role="tablist" aria-label="Vistas de administración">
      {ADMIN_VIEWS.map((view) => (
        <button
          key={view}
          type="button"
          role="tab"
          id={`tla-tab-${view}`}
          aria-selected={view === active}
          aria-controls={`tla-panel-${view}`}
          // Sólo el tab activo queda en el orden de tabulación: el resto se
          // recorre con las flechas, que es el patrón ARIA de tablist.
          tabIndex={view === active ? 0 : -1}
          onClick={() => onSelect(view)}
          onKeyDown={(event) => {
            const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (!delta) return;
            event.preventDefault();
            const index = ADMIN_VIEWS.indexOf(view);
            const next = ADMIN_VIEWS[(index + delta + ADMIN_VIEWS.length) % ADMIN_VIEWS.length];
            if (next) {
              onSelect(next);
              document.getElementById(`tla-tab-${next}`)?.focus();
            }
          }}
        >
          {VIEW_LABELS[view]}
        </button>
      ))}
    </nav>
  );
}
