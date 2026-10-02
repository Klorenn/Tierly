// Home pública: servidores (Unirse + Agregar bot) + qué se está jugando (banners).
(() => {
  "use strict";

  const bridge = window.TierlyBridge;
  const root = document.querySelector("#tierly-discover");
  if (!bridge || !root) return;

  const supabase = bridge.supabase;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
  const number = (value) => new Intl.NumberFormat("es-CL").format(Number(value || 0));
  const initials = (name) => esc(String(name || "?").trim().slice(0, 2).toUpperCase());

  const LIMITS = { games: 12, players: 15, communities: 24, liveGames: 16 };
  const state = { games: [], players: [], communities: [], liveGames: [], loading: true, error: "" };
  let opened = false;

  function duration(minutes) {
    const total = Number(minutes || 0);
    if (total < 60) return `${number(total)} min`;
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    return rest === 0 ? `${number(hours)} h` : `${number(hours)} h ${rest} min`;
  }

  function durationLive(minutes) {
    const total = Number(minutes || 0);
    if (total < 60) return `${number(total)} min`;
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    return rest === 0 ? `${number(hours)}h` : `${number(hours)}h ${rest}m`;
  }

  function relativeDay(value) {
    if (!value) return "—";
    const day = new Date(value);
    if (Number.isNaN(day.getTime())) return "—";
    return day.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  }

  function crest(name, url, size) {
    if (url) return `<img class="lb-disc-crest lb-disc-crest-${size}" src="${esc(url)}" alt="" loading="lazy">`;
    return `<span class="lb-disc-crest lb-disc-crest-${size}" aria-hidden="true">${initials(name)}</span>`;
  }

  function gameBanner(game) {
    const src = game.game_banner_url || game.banner_url || game.game_icon_url;
    if (src) {
      return `<div class="lb-game-banner" style="--lb-game-banner:url('${esc(src)}')">
        <img src="${esc(src)}" alt="" loading="lazy">
      </div>`;
    }
    return `<div class="lb-game-banner lb-game-banner-fallback" aria-hidden="true">
      <span>${initials(game.game_name)}</span>
    </div>`;
  }

  function statCard(icon, value, label) {
    return `<div class="lb-disc-stat">
      <span class="lb-disc-stat-icon" aria-hidden="true"><i data-lucide="${icon}"></i></span>
      <span class="lb-disc-stat-value">${value}</span>
      <span class="lb-disc-stat-label">${label}</span>
    </div>`;
  }

  function gamesGrid() {
    if (!state.games.length) {
      return `<p class="lb-disc-empty">Todavía no hay partidas registradas en comunidades públicas.</p>`;
    }
    return `<div class="lb-game-banner-grid">${state.games.map((game, index) => `
      <article class="lb-game-card">
        ${gameBanner(game)}
        <div class="lb-game-card-body">
          <span class="lb-disc-pos lb-disc-pos-${Math.min(index + 1, 3)}">${index + 1}</span>
          <h4>${esc(game.game_name)}</h4>
          <p class="lb-disc-tile-meta"><span class="lb-disc-strong">${duration(game.total_minutes)}</span> · ${number(game.session_count)} sesiones</p>
          <p class="lb-disc-tile-meta lb-disc-muted">${number(game.community_count)} comunidades · ${relativeDay(game.last_played_day)}</p>
        </div>
      </article>`).join("")}</div>`;
  }

  function playersTable() {
    if (!state.players.length) {
      return `<p class="lb-disc-empty">Nadie eligió mostrarse en el ranking público todavía.</p>`;
    }
    const rows = state.players.map((row, index) => `<tr>
      <td class="lb-disc-col-pos"><span class="lb-disc-pos lb-disc-pos-${index + 1}">${index + 1}</span></td>
      <td><span class="lb-disc-identity">${crest(row.player_name, row.player_avatar_url, "sm")}<span class="lb-disc-name">${esc(row.player_name)}</span></span></td>
      <td class="lb-disc-muted">${esc(row.community_name)}</td>
      <td class="lb-disc-col-num"><span class="lb-disc-strong">${duration(row.total_minutes)}</span></td>
      <td class="lb-disc-col-num">${number(row.game_count)}</td>
    </tr>`).join("");
    return `<div class="lb-disc-table-wrap"><table class="lb-disc-table">
      <thead><tr>
        <th class="lb-disc-col-pos">#</th><th>Jugador</th><th>Comunidad</th>
        <th class="lb-disc-col-num">Minutos</th><th class="lb-disc-col-num">Juegos</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  function communitiesGrid() {
    if (!state.communities.length) {
      return `<p class="lb-disc-empty">Ninguna comunidad eligió aparecer en el directorio todavía.</p>`;
    }
    const botInvite = bridge.inviteUrl?.();
    return `<div class="lb-disc-grid lb-server-grid">${state.communities.map((community) => {
      const joinHref = community.invite_url || community.community_invite;
      return `<article class="lb-disc-tile lb-server-tile">
      ${crest(community.community_name, community.community_icon_url, "md")}
      <h4>${esc(community.community_name)}</h4>
      <p class="lb-disc-tile-meta">${number(community.consenting_member_count)} jugadores · ${number(community.games_tracked)} juegos</p>
      <p class="lb-disc-tile-meta lb-disc-muted">${esc(community.timezone)}</p>
      <div class="lb-server-cta">
        ${joinHref
          ? `<a class="lb-disc-btn lb-disc-btn-primary" href="${esc(joinHref)}" target="_blank" rel="noopener noreferrer">
              <i data-lucide="log-in"></i><span>Unirse</span>
            </a>`
          : `<span class="lb-disc-btn lb-disc-btn-disabled" title="Falta invite_url de esta comunidad">Unirse</span>`}
        ${botInvite
          ? `<a class="lb-disc-btn lb-disc-btn-ghost" href="${esc(botInvite)}" target="_blank" rel="noopener noreferrer">
              <i data-lucide="bot"></i><span>Agregar bot</span>
            </a>`
          : ""}
      </div>
    </article>`;
    }).join("")}</div>`;
  }

  function liveGamesGrid() {
    if (!state.liveGames.length) {
      return `<p class="lb-disc-empty">Nadie está jugando ahora mismo en servidores públicos.</p>`;
    }
    return `<div class="lb-game-banner-grid lb-live-banner-grid">${state.liveGames.map((game) => {
      const joinHref = game.invite_url;
      return `<article class="lb-game-card lb-live-tile">
        ${gameBanner(game)}
        <div class="lb-game-card-body">
          <p class="lb-live-meta"><span class="lb-live-badge">EN VIVO</span>
            <span>${number(game.player_count)} jugando · ${durationLive(game.total_minutes)}</span></p>
          <h4>${esc(game.game_name)}</h4>
          <p class="lb-disc-tile-meta">${crest(game.community_name, game.community_icon_url, "sm")}
            <span>${esc(game.community_name || "Comunidad")}</span></p>
          ${joinHref
            ? `<a class="lb-disc-btn lb-disc-btn-primary lb-join-btn" href="${esc(joinHref)}" target="_blank" rel="noopener noreferrer" data-game="${esc(game.game_name)}">
                <i data-lucide="users"></i><span>Unirse</span>
              </a>`
            : `<span class="lb-disc-btn lb-disc-btn-disabled">Sin invite</span>`}
        </div>
      </article>`;
    }).join("")}</div>`;
  }

  function render() {
    if (state.loading) {
      root.innerHTML = `<div class="lb-disc-skeleton" aria-busy="true"><span></span><span></span><span></span></div>`;
      return;
    }

    const totalMinutes = state.games.reduce((sum, game) => sum + Number(game.total_minutes || 0), 0);
    const botInvite = bridge.inviteUrl?.();

    root.innerHTML = `
      <header class="lb-disc-head lb-home-head">
        <p class="lb-disc-kicker">Tierly</p>
        <h2>Servidores y partidas en vivo</h2>
        <p class="lb-disc-sub">Entrá a una comunidad o mirá qué se está jugando ahora. La presencia de Discord no certifica victoria ni duración exacta.</p>
      </header>

      ${state.error ? `<p class="lb-disc-alert">${esc(state.error)}</p>` : ""}

      <div class="lb-disc-stats">
        ${statCard("server", number(state.communities.length), "Comunidades")}
        ${statCard("radio", number(state.liveGames.length), "En vivo")}
        ${statCard("timer", duration(totalMinutes), "Minutos (30d)")}
      </div>

      <section class="lb-disc-card lb-home-live">
        <h3 class="lb-disc-card-title">Jugando ahora</h3>
        <p class="lb-disc-note">Tocá Unirse para entrar al Discord de esa comunidad.</p>
        ${liveGamesGrid()}
      </section>

      <section class="lb-disc-card lb-home-servers">
        <h3 class="lb-disc-card-title">Servidores con Tierly</h3>
        <p class="lb-disc-note">Primario: unirte al server. Secundario: agregar el bot al tuyo.</p>
        ${communitiesGrid()}
      </section>

      ${botInvite ? `<div class="lb-disc-invite">
        <div>
          <h3>${esc(bridge.t("inviteBot"))}</h3>
          <p>${esc(bridge.t("inviteBotHint"))}</p>
        </div>
        <a class="lb-disc-btn lb-disc-btn-primary" href="${esc(botInvite)}" target="_blank" rel="noopener noreferrer">
          <i data-lucide="plus"></i><span>${esc(bridge.t("inviteBot"))}</span>
        </a>
      </div>` : ""}

      <section class="lb-disc-card">
        <h3 class="lb-disc-card-title">Juegos más jugados</h3>
        ${gamesGrid()}
      </section>

      <section class="lb-disc-card">
        <h3 class="lb-disc-card-title">Quién juega más</h3>
        <p class="lb-disc-note">Solo quienes aceptaron mostrarse, por comunidad.</p>
        ${playersTable()}
      </section>
    `;

    if (window.lucide?.createIcons) window.lucide.createIcons({ root });
  }

  async function load() {
    state.loading = true;
    state.error = "";
    render();

    const [games, players, communities, liveGames] = await Promise.all([
      supabase.from("tierly_public_top_games_view")
        .select("game_name, game_icon_url, game_banner_url, total_minutes, session_count, community_count, last_played_day")
        .order("total_minutes", { ascending: false })
        .limit(LIMITS.games),
      supabase.from("tierly_public_top_players_view")
        .select("player_name, player_avatar_url, community_name, total_minutes, game_count")
        .order("total_minutes", { ascending: false })
        .limit(LIMITS.players),
      supabase.from("tierly_public_communities_view")
        .select("community_name, community_icon_url, invite_url, timezone, consenting_member_count, games_tracked")
        .order("consenting_member_count", { ascending: false })
        .limit(LIMITS.communities),
      supabase.from("tierly_public_live_presence_view")
        .select("game_name, game_icon_url, game_banner_url, community_name, community_icon_url, player_count, total_minutes, invite_url")
        .order("player_count", { ascending: false })
        .limit(LIMITS.liveGames),
    ]);

    state.games = games.data || [];
    state.players = players.data || [];
    state.communities = communities.data || [];
    state.liveGames = liveGames.data || [];
    const failure = [games.error, players.error, communities.error, liveGames.error].find(Boolean);
    if (failure) state.error = "No pudimos cargar el descubrimiento. Reintentá en un momento.";
    state.loading = false;
    render();
  }

  window.TierlyDiscover = {
    open() {
      if (opened) return;
      opened = true;
      load();
    },
    reload: load,
  };
})();
