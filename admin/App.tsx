import { useState, type ReactNode } from "react";

import type { TierlyBridge } from "./lib/bridge";
import { useAdminData } from "./lib/useAdminData";
import { type AdminView, VIEW_LABELS } from "./lib/types";
import { Gate } from "./components/Gate";
import { CommunitySelector, DirectoryToggle, Tabs } from "./components/Shell";
import { EventsSection } from "./sections/EventsSection";
import { GamesSection } from "./sections/GamesSection";
import { PlayersSection } from "./sections/PlayersSection";
import { SuggestionsSection } from "./sections/SuggestionsSection";
import { TrendsSection } from "./sections/TrendsSection";

export interface AppProps {
  readonly bridge: TierlyBridge;
}

export function App({ bridge }: AppProps) {
  const admin = useAdminData(bridge);
  const [view, setView] = useState<AdminView>("events");

  if (admin.auth === "checking") {
    return (
      <div className="tla">
        <p className="tla-note" role="status">
          Comprobando acceso…
        </p>
      </div>
    );
  }

  if (admin.auth === "anonymous") {
    return (
      <Gate title="Administración e insights">
        <p className="tla-note">
          Iniciá sesión con Discord para comprobar el acceso de administrador.
        </p>
        <button
          type="button"
          className="tla-btn"
          onClick={() =>
            void bridge.supabase.auth.signInWithOAuth({
              provider: "discord",
              options: { redirectTo: `${window.location.origin}/tierly?admin=1` },
            })
          }
        >
          Iniciar sesión con Discord
        </button>
        <p className="tla-note">Se te redirigirá de vuelta al panel tras autorizar.</p>
      </Gate>
    );
  }

  if (admin.needsOnboarding) {
    return (
      <Gate title="Primer comunidad">
        <p className="tla-note">
          Esta cuenta no administra ninguna comunidad todavía. Para habilitar el panel:
        </p>
        <ul className="tla-note" style={{ paddingLeft: 18, lineHeight: 1.9 }}>
          <li>Invitá el bot de TIRLY al servidor de Discord.</li>
          <li>
            Agregá tu cuenta a <code>community_admins</code> en Supabase.
          </li>
          <li>Recargá el panel.</li>
        </ul>
      </Gate>
    );
  }

  const community =
    admin.data.communities.find((item) => item.guild_id === admin.selectedGuildId) ?? null;

  const sections: Record<AdminView, ReactNode> = {
    events: <EventsSection bridge={bridge} admin={admin} />,
    games: <GamesSection admin={admin} />,
    players: <PlayersSection admin={admin} />,
    trends: <TrendsSection admin={admin} />,
    suggestions: <SuggestionsSection bridge={bridge} admin={admin} />,
  };

  return (
    <div className="tla">
      <header className="tla-head">
        <div>
          <p className="tla-kicker">Panel de comunidad</p>
          <h1>{community?.name ?? "Administración"}</h1>
        </div>
        <div className="tla-head-actions">
          <CommunitySelector
            communities={admin.data.communities}
            selectedGuildId={admin.selectedGuildId}
            onSelect={admin.selectCommunity}
          />
          {admin.data.isAdmin && community && (
            <DirectoryToggle
              bridge={bridge}
              community={community}
              onError={admin.setMessage}
              onChanged={() => void admin.reload()}
            />
          )}
          <button
            type="button"
            className="tla-btn tla-btn-ghost"
            disabled={admin.loading}
            aria-busy={admin.loading}
            onClick={() => void admin.reload()}
          >
            {admin.loading ? "Cargando…" : "Actualizar"}
          </button>
        </div>
      </header>

      {admin.message && (
        <p className="tla-alert" role="alert">
          {admin.message}
        </p>
      )}

      <Tabs active={view} onSelect={setView} />

      <section
        id={`tla-panel-${view}`}
        role="tabpanel"
        aria-labelledby={`tla-tab-${view}`}
        className="tla-section"
      >
        <h2>{VIEW_LABELS[view]}</h2>
        {sections[view]}
      </section>
    </div>
  );
}
