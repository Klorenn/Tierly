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

  const LIMITS = { games: 12, players: 15, communities: 24, liveGames: 16, events: 8 };
  const state = { games: [], players: [], communities: [], liveGames: [], events: [], loading: true, error: "" };
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

  function gamesSpotlight() {
    if (!state.games.length) {
      return `<p class="lb-disc-empty">Todavía no hay partidas registradas en comunidades públicas.</p>`;
    }
    const [top, ...rest] = state.games;
    const banner = top.game_banner_url || top.banner_url || top.game_icon_url;
    const hero = `<article class="lb-games-hero"${banner ? ` style="--lb-hero-banner:url('${esc(banner)}')"` : ""}>
      ${banner ? `<img class="lb-games-hero-img" src="${esc(banner)}" alt="" loading="eager">` : ""}
      <div class="lb-games-hero-shade"></div>
      <div class="lb-games-hero-copy">
        <span class="lb-games-hero-badge">#1 · Más jugado</span>
        <h3>${esc(top.game_name)}</h3>
        <p><strong>${duration(top.total_minutes)}</strong> · ${number(top.session_count)} sesiones · ${number(top.community_count)} comunidades</p>
        <p class="lb-games-hero-hint">Últimos 30 días en servers públicos — acá nace la próxima noche.</p>
        <button type="button" class="lb-disc-btn lb-disc-btn-light" data-game-open="${esc(top.game_name)}">Ver servers</button>
      </div>
    </article>`;

    const rail = rest.length
      ? `<div class="lb-games-rail" role="list">${rest.slice(0, 7).map((game, index) => {
          const src = game.game_banner_url || game.banner_url || game.game_icon_url;
          return `<button type="button" class="lb-games-rail-card" role="listitem" data-game-open="${esc(game.game_name)}">
            <div class="lb-games-rail-media">
              ${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<span class="lb-game-banner-fallback">${initials(game.game_name)}</span>`}
              <span class="lb-games-rail-rank">${index + 2}</span>
            </div>
            <div class="lb-games-rail-body">
              <h4>${esc(game.game_name)}</h4>
              <p>${duration(game.total_minutes)} · ${number(game.session_count)} ses.</p>
            </div>
          </button>`;
        }).join("")}</div>`
      : "";

    return `${hero}${rail}`;
  }

  function gameModalServers(rows) {
    if (!rows.length) {
      return `<p class="lb-disc-empty">Ningún server público jugó esto en los últimos 30 días.</p>`;
    }
    return `<ul class="lb-game-modal-list">${rows.map((row) => {
      const join = row.invite_url
        ? `<a class="lb-disc-btn lb-disc-btn-ghost lb-game-modal-join" href="${esc(row.invite_url)}" target="_blank" rel="noopener noreferrer">Unirse</a>`
        : "";
      return `<li class="lb-game-modal-row">
        ${crest(row.community_name, row.community_icon_url, "sm")}
        <div class="lb-game-modal-row-copy">
          <strong>${esc(row.community_name || "Comunidad")}</strong>
          <span>${duration(row.total_minutes)} · ${number(row.session_count)} ses. · últ. ${relativeDay(row.last_played_day)}</span>
        </div>
        ${join}
      </li>`;
    }).join("")}</ul>`;
  }

  function gameModalPlayers(rows) {
    if (!rows.length) {
      return `<p class="lb-disc-empty">Nadie eligió mostrarse todavía para este juego. Presence ≠ ranking público.</p>`;
    }
    return `<ul class="lb-game-modal-list">${rows.map((row) => {
      const avatar = row.player_avatar_url
        ? `<img class="lb-game-modal-avatar" src="${esc(row.player_avatar_url)}" alt="" loading="lazy">`
        : `<span class="lb-game-modal-avatar lb-game-modal-avatar-fallback" aria-hidden="true">${initials(row.player_name)}</span>`;
      return `<li class="lb-game-modal-row">
        ${avatar}
        <div class="lb-game-modal-row-copy">
          <strong>${esc(row.player_name)}</strong>
          <span>${esc(row.community_name || "Comunidad")} · ${duration(row.total_minutes)} · ${number(row.session_count)} ses.</span>
        </div>
      </li>`;
    }).join("")}</ul>`;
  }

  function gameModalLive(rows) {
    if (!rows.length) return "";
    return `<section class="lb-game-modal-section">
      <h3>En vivo ahora</h3>
      <ul class="lb-game-modal-list">${rows.map((row) => {
        const join = row.invite_url
          ? `<a class="lb-disc-btn lb-disc-btn-primary lb-game-modal-join" href="${esc(row.invite_url)}" target="_blank" rel="noopener noreferrer">Unirse</a>`
          : "";
        return `<li class="lb-game-modal-row">
          ${crest(row.community_name, row.community_icon_url, "sm")}
          <div class="lb-game-modal-row-copy">
            <strong>${esc(row.community_name || "Comunidad")}</strong>
            <span>${number(row.player_count)} jugando · ${durationLive(row.total_minutes)}</span>
          </div>
          ${join}
        </li>`;
      }).join("")}</ul>
    </section>`;
  }

  async function openGameModal(gameName) {
    const modal = document.querySelector("#lb-game-modal");
    const body = document.querySelector("#lb-game-modal-body");
    const title = document.querySelector("#lb-game-modal-title");
    if (!modal || !body || !title || !gameName) return;

    const game = state.games.find((row) => row.game_name === gameName) || { game_name: gameName };
    const banner = game.game_banner_url || game.banner_url || game.game_icon_url;
    title.textContent = game.game_name || gameName;
    body.innerHTML = `<div class="lb-game-modal-loading" aria-busy="true">Cargando servers y jugadores…</div>`;
    if (!modal.open) modal.showModal();

    const liveNow = state.liveGames.filter((row) => row.game_name === gameName);
    const [communitiesRes, playersRes] = await Promise.all([
      supabase.from("tierly_public_game_communities_view")
        .select("game_name, community_name, community_icon_url, invite_url, total_minutes, session_count, last_played_day")
        .eq("game_name", gameName)
        .order("total_minutes", { ascending: false })
        .limit(24),
      supabase.from("tierly_public_game_players_view")
        .select("game_name, community_name, community_icon_url, player_name, player_avatar_url, total_minutes, session_count, last_session_at")
        .eq("game_name", gameName)
        .order("total_minutes", { ascending: false })
        .limit(20),
    ]);

    if (title.textContent !== (game.game_name || gameName)) return;

    const communities = communitiesRes.data || [];
    const players = playersRes.data || [];
    const fetchError = communitiesRes.error || playersRes.error;

    body.innerHTML = `
      ${banner ? `<div class="lb-game-modal-banner" style="--lb-hero-banner:url('${esc(banner)}')">
        <img src="${esc(banner)}" alt="" loading="lazy">
      </div>` : ""}
      <p class="lb-game-modal-meta">
        ${duration(game.total_minutes || 0)} · ${number(game.session_count || 0)} sesiones · ${number(game.community_count || communities.length)} servers · últimos 30 días
      </p>
      ${fetchError ? `<p class="lb-disc-alert">No pudimos cargar el detalle. Reintentá en un momento.</p>` : ""}
      ${gameModalLive(liveNow)}
      <section class="lb-game-modal-section">
        <h3>En qué server se juega</h3>
        <p class="lb-disc-note">Comunidades del directorio público con presencia en este juego.</p>
        ${gameModalServers(communities)}
      </section>
      <section class="lb-game-modal-section">
        <h3>Quién juega</h3>
        <p class="lb-disc-note">Solo quienes aceptaron mostrarse, por comunidad. No mide skill.</p>
        ${gameModalPlayers(players)}
      </section>
    `;
    if (window.lucide?.createIcons) window.lucide.createIcons({ root: body });
  }

  function bindGameModal() {
    const modal = document.querySelector("#lb-game-modal");
    if (!modal || modal.dataset.bound === "1") return;
    modal.dataset.bound = "1";
    modal.querySelector("#lb-game-modal-close")?.addEventListener("click", () => modal.close());
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.close();
    });
  }

  function eventsGrid() {
    if (!state.events.length) {
      return `<p class="lb-disc-empty">No hay eventos públicos próximos. Los eventos salen de lo que la comunidad ya juega.</p>`;
    }
    return `<div class="lb-event-catalog-grid">${state.events.map((event) => {
      const when = event.starts_at
        ? new Date(event.starts_at).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })
        : relativeDay(event.event_date);
      const join = event.invite_url
        ? `<a class="lb-disc-btn lb-disc-btn-ghost" href="${esc(event.invite_url)}" target="_blank" rel="noopener noreferrer">Unirse al server</a>`
        : "";
      return `<article class="lb-event-card">
        <div class="lb-event-card-media">
          ${event.banner_url
            ? `<img src="${esc(event.banner_url)}" alt="" loading="lazy">`
            : `<div class="lb-game-banner-fallback">${initials(event.community_name)}</div>`}
          <span class="lb-event-badge">${esc(event.status === "live" ? "EN VIVO" : "PRÓXIMO")}</span>
        </div>
        <div class="lb-event-card-body">
          <p class="lb-event-community">${esc(event.community_name || "")}</p>
          <h4>${esc(event.event_name)}</h4>
          <p class="lb-event-when">${esc(when)}</p>
          ${event.description ? `<p class="lb-event-desc">${esc(event.description)}</p>` : ""}
          <p class="lb-event-meta">${number(event.registration_count)} inscritos</p>
          <div class="lb-server-cta">
            <button type="button" class="lb-disc-btn lb-disc-btn-primary" data-view="bracket">Ver eventos</button>
            ${join}
          </div>
        </div>
      </article>`;
    }).join("")}</div>`;
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
        <button type="button" class="lb-game-card-open" data-game-open="${esc(game.game_name)}" aria-label="Ver ${esc(game.game_name)}">
          ${gameBanner(game)}
        </button>
        <div class="lb-game-card-body">
          <p class="lb-live-meta"><span class="lb-live-badge">EN VIVO</span>
            <span>${number(game.player_count)} jugando · ${durationLive(game.total_minutes)}</span></p>
          <button type="button" class="lb-game-card-title-btn" data-game-open="${esc(game.game_name)}">
            <h4>${esc(game.game_name)}</h4>
          </button>
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
        <h2>Jugá con tu comunidad</h2>
        <p class="lb-disc-sub">Lo más jugado manda. Eventos y servers abajo.</p>
      </header>

      ${state.error ? `<p class="lb-disc-alert">${esc(state.error)}</p>` : ""}

      <section class="lb-games-spotlight" aria-labelledby="lb-games-spotlight-title">
        <div class="lb-games-spotlight-head">
          <h3 id="lb-games-spotlight-title">Juegos más jugados</h3>
          <p>Presencia pública · 30 días · no mide skill</p>
        </div>
        ${gamesSpotlight()}
      </section>

      <div class="lb-disc-stats">
        ${statCard("gamepad-2", number(state.games.length), "Juegos")}
        ${statCard("calendar-days", number(state.events.length), "Eventos")}
        ${statCard("server", number(state.communities.length), "Servers")}
      </div>

      <section class="lb-disc-card lb-home-live">
        <h3 class="lb-disc-card-title">Jugando ahora</h3>
        <p class="lb-disc-note">${state.liveGames.length ? "Tocá Unirse para entrar al Discord de esa comunidad." : "Nadie en vivo con presencia pública; mirá lo más jugado arriba."}</p>
        ${liveGamesGrid()}
      </section>

      <section class="lb-disc-card">
        <h3 class="lb-disc-card-title">Próximos eventos</h3>
        <p class="lb-disc-note">Eventos de comunidades listadas, anclados a lo que ya se juega.</p>
        ${eventsGrid()}
      </section>

      <section class="lb-disc-card lb-home-servers">
        <h3 class="lb-disc-card-title">Servidores</h3>
        <p class="lb-disc-note">Unirse al Discord · o agregar el bot al tuyo.</p>
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
        <h3 class="lb-disc-card-title">Quién juega más</h3>
        <p class="lb-disc-note">Solo quienes aceptaron mostrarse, por comunidad.</p>
        ${playersTable()}
      </section>
    `;

    root.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => bridge.switchView?.(btn.dataset.view));
    });
    root.querySelectorAll("[data-game-open]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        openGameModal(btn.dataset.gameOpen);
      });
    });
    bindGameModal();
    if (window.lucide?.createIcons) window.lucide.createIcons({ root });
  }

  async function load() {
    state.loading = true;
    state.error = "";
    render();

    const [games, players, communities, liveGames, events] = await Promise.all([
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
      supabase.from("tierly_community_events_public_view")
        .select("event_id, event_name, event_date, starts_at, status, description, banner_url, community_name, invite_url, registration_count")
        .order("starts_at", { ascending: true })
        .limit(LIMITS.events),
    ]);

    state.games = games.data || [];
    state.players = players.data || [];
    state.communities = communities.data || [];
    state.liveGames = liveGames.data || [];
    state.events = events.data || [];
    const failure = [games.error, players.error, communities.error, liveGames.error, events.error].find(Boolean);
    if (failure) state.error = "No pudimos cargar el descubrimiento. Reintentá en un momento.";
    state.loading = false;
    render();
  }

  function open() {
    // Si el boot de app.js corrió antes de que este módulo existiera, open()
    // se perdió: reintentamos cuando el módulo termina de cargar.
    if (opened) {
      if (!root.innerHTML.trim()) load();
      return;
    }
    opened = true;
    load();
  }

  window.TierlyDiscover = { open, reload: load };

  const discoverView = document.querySelector("section.lb-view[data-view='discover']");
  if (discoverView && !discoverView.hidden) open();
})();
