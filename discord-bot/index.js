import { Client, GatewayIntentBits, ChannelType, ActivityType } from "discord.js";
import { createClient } from "@supabase/supabase-js";
import { rankForPoints } from "../tierly/ranks.mjs";
import { playingGames, presenceDelta } from "./presence-delta.mjs";
import { createSessionStore } from "./session-store.mjs";

const {
  DISCORD_BOT_TOKEN: DISCORD_BOT_TOKEN_ENV,
  DISCORD_TOKEN,
  DISCORD_GUILD_ID,
  WELCOME_CHANNEL_ID,
  ANNOUNCE_CHANNEL_ID,
  SUPABASE_URL: SUPABASE_URL_ENV,
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

const DISCORD_BOT_TOKEN = DISCORD_BOT_TOKEN_ENV || DISCORD_TOKEN;
const SUPABASE_URL = SUPABASE_URL_ENV || NEXT_PUBLIC_SUPABASE_URL;

if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
  throw new Error("Faltan DISCORD_BOT_TOKEN o DISCORD_GUILD_ID en las variables de entorno");
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

const WELCOME_CHANNEL_NAME = "bienvenida-tierly";
const ANNOUNCE_CHANNEL_NAME = "anuncios-tierly";
const LEADERBOARD_URL = "https://www.tirly.xyz";
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const CONSENT_VERSION = "1";
const BOT_CONNECTED_AT = new Date().toISOString();

// ─── Slash commands ──────────────────────────────────────────────────────
const TIERLY_COMMANDS = [
  {
    name: "tierly",
    description: "Comandos de TIRLY",
    options: [
      {
        name: "set",
        description: "Configurar canales",
        type: 1, // SUB_COMMAND
        options: [
          {
            name: "welcome-channel",
            description: "Canal de bienvenida",
            type: 7, // CHANNEL
            channel_types: [0], // GUILD_TEXT
            required: true,
          },
          {
            name: "announce-channel",
            description: "Canal de anuncios",
            type: 7,
            channel_types: [0],
            required: false,
          },
        ],
      },
      {
        name: "config",
        description: "Ver configuración actual",
        type: 1,
      },
      {
        name: "sync",
        description: "Sincronizar miembros del server (admin)",
        type: 1,
      },
      {
        name: "event",
        description: "Gestionar eventos comunitarios",
        type: 2, // SUB_COMMAND_GROUP
        options: [
          {
            name: "create",
            description: "Crear evento (admin)",
            type: 1,
            options: [
              { name: "name", description: "Nombre del evento", type: 3, required: true },
              { name: "game", description: "Juego", type: 3, required: true },
              { name: "starts_at", description: "Inicio ISO-8601 (UTC), ej. 2026-10-10T20:00:00Z", type: 3, required: true },
              { name: "format", description: "Formato (elimination|heats)", type: 3, required: false },
              { name: "max_players", description: "Cupo máximo", type: 4, required: false },
              { name: "description", description: "Descripción", type: 3, required: false },
            ],
          },
          {
            name: "list",
            description: "Listar eventos programados",
            type: 1,
          },
          {
            name: "join",
            description: "Inscribirse a un evento",
            type: 1,
            options: [
              { name: "event_id", description: "ID del evento", type: 3, required: true },
            ],
          },
        ],
      },
      {
        name: "profile",
        description: "Ver tu perfil (XP, tier, stamps, racha)",
        type: 1,
        options: [
          { name: "user", description: "Usuario a consultar (opcional)", type: 6, required: false },
        ],
      },
      {
        name: "leaderboard",
        description: "Ver top 10 del server",
        type: 1,
      },
      {
        name: "live",
        description: "Ver quién está jugando ahora",
        type: 1,
      },
      {
        name: "help",
        description: "Mostrar ayuda de comandos",
        type: 1,
      },
    ],
  },
];

async function registerCommands() {
  try {
    // Registrar solo en el guild para propagación instantánea
    const guild = client.guilds.cache.get(DISCORD_GUILD_ID);
    if (guild) {
      await guild.commands.set(TIERLY_COMMANDS);
      console.log("Slash commands registrados en guild");
    } else {
      await client.application.commands.set(TIERLY_COMMANDS);
      console.log("Slash commands registrados globalmente");
    }
  } catch (error) {
    console.error("Error registrando slash commands:", error.message);
  }
}

function isAdminMember(member) {
  return member.permissions.has("Administrator") || member.permissions.has("ManageGuild");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
});

const sessions = supabase ? createSessionStore(supabase) : null;
const activeSessions = new Map();

async function recordBotHealth(action, errorCode = null) {
  if (!supabase) return;
  const result = action === "error"
    ? await supabase.rpc("tierly_bot_health_error", { p_error_code: errorCode || "unknown" })
    : await supabase.rpc("tierly_bot_health_heartbeat", { p_connected_at: action === "connected" ? BOT_CONNECTED_AT : null });
  if (result.error) console.error("No se pudo registrar el estado operativo de TIRLY.");
}

function sessionKey(userId, gameName) {
  return `${userId}:${gameName}`;
}

async function handleTierlyCommand(message) {
  const parts = message.content.trim().toLowerCase().split(/\s+/);
  if (parts[0] !== "!tierly") return false;
  if (!["presencia", "borrar", "voy"].includes(parts[1])) return false;
  if (!sessions) {
    await message.channel.send("El servicio de consentimiento no está disponible en este momento.");
    return true;
  }

  try {
    if (parts[1] === "presencia" && parts[2] === "si") {
      await sessions.acceptMemberConsent(DISCORD_GUILD_ID, message.author.id, CONSENT_VERSION);
      await message.channel.send("Consentimiento de presencia activado. TIRLY podrá registrar las sesiones de juego.");
    } else if (parts[1] === "presencia" && parts[2] === "no") {
      await sessions.declineMemberConsent(DISCORD_GUILD_ID, message.author.id);
      for (const [key, sessionId] of activeSessions) {
        if (key.startsWith(`${message.author.id}:`)) activeSessions.delete(key);
      }
      await message.channel.send("Consentimiento de presencia retirado. Las sesiones abiertas se cerraron y no se registrarán nuevas sesiones.");
    } else if (parts[1] === "voy" && parts.length === 2) {
      await handleAttendanceCommand(message);
    } else if (parts[1] === "borrar" && parts.length === 2) {
      await sessions.requestMemberDeletion(DISCORD_GUILD_ID, message.author.id);
      for (const [key, sessionId] of activeSessions) {
        if (key.startsWith(`${message.author.id}:`)) activeSessions.delete(key);
      }
      await message.channel.send("Se solicitó el borrado de tus datos de TIRLY y se cerraron tus sesiones.");
    } else {
      await message.channel.send("Usa: `!tierly voy`, `!tierly presencia si`, `!tierly presencia no` o `!tierly borrar`.");
    }
  } catch (error) {
    await recordBotHealth("error", "consent_update");
    console.error("No se pudo actualizar el consentimiento de TIRLY.");
    await message.channel.send("No se pudo actualizar el consentimiento. Inténtalo nuevamente más tarde.");
  }
  return true;
}

/**
 * `!tierly voy` — anota la asistencia de quien lo ejecuta al evento abierto.
 *
 * Es el punto de entrada de alguien que no tiene idea de que es TIRLY: queda
 * registrado sin cuenta, el administrador confirma, y la estampa espera colgada
 * de su `discord_id`. Cuando reclama la cuenta con Discord, el upsert de
 * `discord-verify` le pone el `auth_user_id` a esa misma fila y las estampas ya
 * son suyas: no hay backfill que correr.
 */
async function handleAttendanceCommand(message) {
  const guildId = message.guild.id;
  const eventId = await sessions.openEvent(guildId);
  if (!eventId) {
    await message.channel.send("No hay ningún evento de TIRLY abierto en este momento.");
    return;
  }

  const { displayName, avatarUrl } = memberIdentity(message.member);
  await sessions.recordAttendance({
    guildId,
    eventId,
    discordUserId: message.author.id,
    displayName,
    avatarUrl,
  });

  await message.channel.send(
    `Listo, ${message.member}: quedaste anotado en el evento. ` +
      `Reclamá tu cuenta en ${LEADERBOARD_URL} para quedarte con la estampa y ver tu historial.`,
  );
}

function memberIdentity(member) {
  const user = member?.user;
  const avatarHash = user?.avatar;
  return {
    displayName: user?.globalName || user?.username || member?.displayName || "Jugador",
    avatarUrl: avatarHash
      ? `https://cdn.discordapp.com/avatars/${member.id}/${avatarHash}.${avatarHash.startsWith("a_") ? "gif" : "png"}`
      : null,
  };
}

async function handlePresenceUpdate(oldPresence, newPresence) {
  if (!sessions) return;
  const guildId = newPresence?.guild?.id || oldPresence?.guild?.id;
  if (guildId !== DISCORD_GUILD_ID) return;
  if (newPresence?.member?.user?.bot) return;
  const settings = await sessions.getCommunitySettings(guildId);
  if (settings?.presence_enabled === false) return;

  const userId = newPresence?.userId || oldPresence?.userId;
  if (!userId) return;
  const { started, stopped } = presenceDelta(oldPresence, newPresence);

  for (const gameName of started) {
    try {
      const gameId = await sessions.resolveGame(gameName);
      const identity = memberIdentity(newPresence.member);
      const session = await sessions.openSession({
        guildId: DISCORD_GUILD_ID,
        communityName: newPresence.guild?.name,
        discordUserId: userId,
        gameId,
        ...identity,
      });
      if (session?.id) activeSessions.set(sessionKey(userId, gameName), session.id);
    } catch (error) {
      await recordBotHealth("error", "presence_open");
      console.error("No se pudo abrir la sesion de presence.");
    }
  }
  for (const gameName of stopped) {
    try {
      const key = sessionKey(userId, gameName);
      const sessionId = activeSessions.get(key);
      if (!sessionId) continue;
      await sessions.closeSession(sessionId, undefined, "normal");
      activeSessions.delete(key);
    } catch (error) {
      await recordBotHealth("error", "presence_close");
      console.error("No se pudo cerrar la sesion de presence.");
    }
  }
}

async function reconcilePresence(guild) {
  const settings = await sessions.getCommunitySettings(DISCORD_GUILD_ID);
  if (settings?.presence_enabled === false) return;
  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    for (const gameName of playingGames(member.presence)) {
      const gameId = await sessions.resolveGame(gameName);
      const identity = memberIdentity(member);
      const session = await sessions.openSession({
        guildId: DISCORD_GUILD_ID,
        discordUserId: member.id,
        gameId,
        ...identity,
      });
      if (session?.id) activeSessions.set(sessionKey(member.id, gameName), session.id);
    }
  }
}

async function runPresenceHeartbeat() {
  const heartbeatAt = new Date().toISOString();
  for (const sessionId of activeSessions.values()) {
    try {
      await sessions.heartbeatSession(sessionId, heartbeatAt);
    } catch (error) {
      await recordBotHealth("error", "presence_heartbeat");
      console.error("No se pudo actualizar un heartbeat.");
    }
  }
  try {
    const settings = await sessions.getCommunitySettings(DISCORD_GUILD_ID);
    const staleHours = Number(settings?.stale_session_hours) || 12;
    await sessions.closeStaleSessions({
      guildId: DISCORD_GUILD_ID,
      before: new Date(Date.now() - staleHours * 60 * 60 * 1000).toISOString(),
      endedAt: heartbeatAt,
    });
  } catch (error) {
    await recordBotHealth("error", "stale_sessions");
    console.error("No se pudo cerrar sesiones obsoletas.");
  }
}

async function getWelcomeChannel(guild) {
  const { data } = await supabase.from("communities")
    .select("welcome_channel_id")
    .eq("guild_id", DISCORD_GUILD_ID).maybeSingle();

  const channelId = data?.welcome_channel_id || WELCOME_CHANNEL_ID;
  if (channelId) {
    const configured = await guild.channels.fetch(channelId).catch(() => null);
    if (configured) return configured;
  }
  const existing = guild.channels.cache.find(
    (c) => c.name === WELCOME_CHANNEL_NAME && c.type === ChannelType.GuildText,
  );
  if (existing) return existing;
  return guild.channels.create({
    name: WELCOME_CHANNEL_NAME,
    type: ChannelType.GuildText,
    topic: "TIRLY saluda por acá 🐈‍⬛ — bot de verificación del leaderboard gaming de TIRLY.",
  });
}

async function getAnnounceChannel(guild) {
  const { data } = await supabase.from("communities")
    .select("announce_channel_id")
    .eq("guild_id", DISCORD_GUILD_ID).maybeSingle();

  const channelId = data?.announce_channel_id || ANNOUNCE_CHANNEL_ID;
  if (channelId) {
    const configured = await guild.channels.fetch(channelId).catch(() => null);
    if (configured) return configured;
  }
  const existing = guild.channels.cache.find(
    (c) => c.name === ANNOUNCE_CHANNEL_NAME && c.type === ChannelType.GuildText,
  );
  if (existing) return existing;
  return guild.channels.create({
    name: ANNOUNCE_CHANNEL_NAME,
    type: ChannelType.GuildText,
    topic: "TIRLY gaming leaderboard updates 🐈‍⬛ — new events and rank-ups.",
  });
}

// Anuncia eventos nuevos y subidas de rango una sola vez cada uno. Corre cada
// POLL_INTERVAL_MS porque el bot no tiene forma de enterarse en tiempo real de
// cambios hechos desde el panel admin (no hay webhook/trigger hacia acá).
async function announceNewEvents(channel) {
  const { data: events, error: eventsError } = await supabase
    .from("gaming_events")
    .select("id, name, event_date")
    .order("event_date", { ascending: false })
    .limit(50);
  if (eventsError || !events) return;

  const { data: notified, error: notifiedError } = await supabase
    .from("gaming_bot_notifications")
    .select("ref_id")
    .eq("kind", "event");
  if (notifiedError) return;
  const notifiedIds = new Set((notified || []).map((n) => n.ref_id));

  // Primer arranque de este feature: no hay nada anunciado todavía. Sembramos
  // los eventos existentes como "ya anunciados" en vez de spamear el historial.
  if (notifiedIds.size === 0 && events.length > 0) {
    await supabase.from("gaming_bot_notifications").insert(
      events.map((e) => ({ kind: "event", ref_id: e.id })),
    );
    return;
  }

  for (const event of events) {
    if (notifiedIds.has(event.id)) continue;
    await channel.send(
      `🐈‍⬛ New event: **${event.name}**${event.event_date ? ` — ${event.event_date}` : ""}\n${LEADERBOARD_URL}`,
    );
    await supabase.from("gaming_bot_notifications").insert({ kind: "event", ref_id: event.id });
  }
}

async function announceRankUps(channel) {
  const { data: ranking, error: rankingError } = await supabase
    .from("leaderboard_public_view")
    .select("player_id, total_points, discord_member")
    .eq("discord_member", true);
  if (rankingError || !ranking) return;

  const playerIds = ranking.map((r) => r.player_id);
  if (!playerIds.length) return;

  const { data: players, error: playersError } = await supabase
    .from("gaming_players")
    .select("id, discord_id, last_notified_rank_min")
    .in("id", playerIds);
  if (playersError || !players) return;
  const playerById = new Map(players.map((p) => [p.id, p]));

  for (const row of ranking) {
    const player = playerById.get(row.player_id);
    if (!player?.discord_id) continue;
    const rank = rankForPoints(row.total_points || 0);

    // Primera vez que vemos a este jugador: guardamos el rango actual como
    // línea de base, sin anunciar (si no, todos "suben de rango" el día 1).
    if (player.last_notified_rank_min === null) {
      await supabase.from("gaming_players").update({ last_notified_rank_min: rank.min }).eq("id", player.id);
      continue;
    }

    if (rank.min <= player.last_notified_rank_min) continue; // igual o bajó (ej. reset de temporada) — no se anuncia
    const label = `${rank.tierId} ${rank.division}`;
    await channel.send(`🎉 <@${player.discord_id}> ranked up to **${label}**! ${LEADERBOARD_URL}`);
    await supabase.from("gaming_players").update({ last_notified_rank_min: rank.min }).eq("id", player.id);
  }
}

async function runNotificationPoll(guild) {
  if (!supabase) return;
  const channel = await getAnnounceChannel(guild);
  await deliverEventReminders(channel);
  await announceNewEvents(channel);
  await announceRankUps(channel);
}

async function deliverEventReminders(channel) {
  const now = new Date().toISOString();
  const { data: reminders, error } = await supabase
    .from("tierly_event_notifications")
    .select("id, event_id, reminder_minutes, scheduled_for, gaming_events(name, starts_at, timezone)")
    .eq("guild_id", DISCORD_GUILD_ID)
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(25);
  if (error || !reminders) return;

  for (const reminder of reminders) {
    const event = reminder.gaming_events;
    if (!event) continue;
    const { data: claimed, error: claimError } = await supabase
      .from("tierly_event_notifications")
      .update({ status: "sent", sent_at: now })
      .eq("id", reminder.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) continue;
    await channel.send(
      `⏰ Recordatorio: **${event.name}** comienza en ${reminder.reminder_minutes} minutos (${event.timezone || "UTC"}).\n${LEADERBOARD_URL}`,
    );
  }
}

async function syncMembership(member) {
  if (!supabase) return;
  const avatarHash = member.user.avatar;
  const avatarUrl = avatarHash
    ? `https://cdn.discordapp.com/avatars/${member.id}/${avatarHash}.${avatarHash.startsWith("a_") ? "gif" : "png"}`
    : null;
  const { error } = await supabase.from("gaming_players").upsert(
    {
      discord_id: member.id,
      display_name: member.user.globalName || member.user.username,
      avatar_url: avatarUrl,
      discord_member: true,
      discord_verified_at: new Date().toISOString(),
    },
    { onConflict: "discord_id" },
  );
  if (error) console.error("No se pudo sincronizar gaming_players:", error.message);
}

client.once("ready", async () => {
  console.log(`TIRLY conectado como ${client.user.tag}`);
  
  // Debug: listen to all raw gateway events
  client.ws.on('INTERACTION_CREATE', (data) => {
    console.log('>>> RAW INTERACTION_CREATE:', JSON.stringify(data).slice(0, 200));
  });
  
  // Debug: listen to all gateway events
  client.ws.on('any', (eventName, data) => {
    if (eventName.includes('INTERACTION')) {
      console.log('>>> RAW EVENT:', eventName);
    }
  });
  
  // Debug: log all gateway events
  client.ws.on('debug', (info) => {
    if (info.includes('INTERACTION')) {
      console.log('>>> DEBUG:', info);
    }
  });
  
  await recordBotHealth("connected");
  await registerCommands();
  client.user.setPresence({
    activities: [{ name: "el ranking gaming de TIRLY", type: ActivityType.Watching }],
    status: "online",
  });

  const guild = await client.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
  if (!guild) {
    console.error(`ERROR: Bot no está en el guild ${DISCORD_GUILD_ID}. Revisa DISCORD_GUILD_ID en .env y que el bot esté en el server.`);
    return;
  }
  console.log(`Guild encontrado: ${guild.name} (${guild.id})`);
  
  const channel = await getWelcomeChannel(guild);
  await channel
    .send(`🐈‍⬛ **TIRLY está en línea.** Ya puedo verificar membresías para el leaderboard → ${LEADERBOARD_URL}`)
    .catch((err) => console.error("No se pudo postear saludo de arranque:", err.message));

  if (supabase) {
    await runNotificationPoll(guild).catch((err) => console.error("Fallo el poll de notificaciones:", err.message));
    setInterval(() => {
      runNotificationPoll(guild).catch((err) => console.error("Fallo el poll de notificaciones:", err.message));
    }, POLL_INTERVAL_MS);
  }

  if (sessions) {
    await sessions.ensureCommunity({ guildId: DISCORD_GUILD_ID, name: guild.name })
      .catch((err) => console.error("Fallo el bootstrap de la comunidad:", err.message));
    await sessions.reconcileOpenSessions({ guildId: DISCORD_GUILD_ID, reason: "crash" })
      .catch((err) => console.error("Fallo la reconciliacion inicial:", err.message));
    await reconcilePresence(guild)
      .catch((err) => console.error("Fallo la reconciliacion de presence:", err.message));
    setInterval(() => {
      recordBotHealth("heartbeat").catch(() => {});
      runPresenceHeartbeat().catch((err) => console.error("Fallo el heartbeat de presence:", err.message));
    }, HEARTBEAT_INTERVAL_MS);
  }
});

client.on("presenceUpdate", (oldPresence, newPresence) => {
  handlePresenceUpdate(oldPresence, newPresence)
    .catch((err) => {
      recordBotHealth("error", "presence_update").catch(() => {});
      console.error("Fallo al registrar sesion de presence:", err.message);
    });
});

client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== DISCORD_GUILD_ID) return;
  const channel = await getWelcomeChannel(member.guild);
  await channel
    .send(`🐈‍⬛ ¡Bienvenido/a, ${member}! Sumate al leaderboard gaming de TIRLY → ${LEADERBOARD_URL}`)
    .catch((err) => console.error("No se pudo postear bienvenida:", err.message));
  await syncMembership(member);
});

// Comando manual para gente que ya era miembro del server antes de que el bot
// arrancara — guildMemberAdd no dispara retroactivamente para esos casos.
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.guild?.id !== DISCORD_GUILD_ID) return;
  if (await handleTierlyCommand(message)) return;
  if (message.content.trim().toLowerCase() !== "!bienvenida") return;

  await message.channel
    .send(`🐈‍⬛ ¡Bienvenido/a, ${message.member}! Sumate al leaderboard gaming de TIRLY → ${LEADERBOARD_URL}`)
    .catch((err) => console.error("No se pudo postear bienvenida:", err.message));
  await syncMembership(message.member);
});

console.log('>>> Registering interactionCreate handler');
client.on("interactionCreate", async (interaction) => {
  console.log('>>> INTERACTION RECEIVED:', interaction.id, interaction.commandName, interaction.isChatInputCommand());
  if (!interaction.isChatInputCommand()) {
    console.log('>>> Not a chat input command, type:', interaction.type);
    return;
  }
  console.log('>>> Command:', interaction.commandName, 'guild:', interaction.guildId, 'expected:', DISCORD_GUILD_ID);
  if (interaction.commandName !== "tierly") {
    console.log('>>> Not a tierly command, skipping');
    return;
  }
  console.log('>>> Tierly command, guild:', interaction.guildId, 'expected:', DISCORD_GUILD_ID);
  if (interaction.guildId !== DISCORD_GUILD_ID) {
    return interaction.reply({ content: "Este comando solo funciona en el server configurado.", ephemeral: true });
  }

  const member = interaction.member;
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand(false);

  if (group === "event") {
    const eventSub = sub;

    if (eventSub === "create") {
      if (!isAdminMember(member)) {
        return interaction.reply({ content: "Solo administradores pueden crear eventos.", ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      try {
        const name = interaction.options.getString("name");
        const game = interaction.options.getString("game");
        const startsAt = interaction.options.getString("starts_at");
        const format = interaction.options.getString("format") || "elimination";
        const maxPlayers = interaction.options.getInteger("max_players");
        const description = interaction.options.getString("description");

        // Verificar que el juego existe o crearlo
        let gameId;
        const { data: existingGame } = await supabase
          .from("games")
          .select("id")
          .eq("canonical_name", game.toLowerCase())
          .maybeSingle();

        if (existingGame) {
          gameId = existingGame.id;
        } else {
          const { data: newGame, error: gameError } = await supabase
            .from("games")
            .insert({ display_name: game, canonical_name: game.toLowerCase() })
            .select("id")
            .single();
          if (gameError) throw gameError;
          gameId = newGame.id;
        }

        // Obtener community_id (guild_id)
        const { data: community } = await supabase
          .from("communities")
          .select("id")
          .eq("guild_id", DISCORD_GUILD_ID)
          .maybeSingle();

        if (!community) {
          return interaction.editReply({ content: "Comunidad no configurada. Usa /tierly set welcome-channel primero.", ephemeral: true });
        }

        const { error } = await supabase
          .from("gaming_events")
          .insert({
            community_id: community.id,
            name,
            game_id: gameId,
            starts_at: startsAt,
            format,
            max_players: maxPlayers,
            description,
            status: "scheduled",
          })
          .select("id")
          .single();

        if (error) throw error;

        await interaction.editReply({ content: `✅ Evento creado: **${name}** (${game}) — <t:${Math.floor(new Date(startsAt).getTime()/1000)}:F>\n${LEADERBOARD_URL}/tierly/events`, ephemeral: true });
      } catch (err) {
        console.error('Event create error:', err);
        await interaction.editReply({ content: `❌ Error: ${err.message}`, ephemeral: true });
      }
      return;
    }

    if (eventSub === "list") {
      await interaction.deferReply({ ephemeral: true });
      try {
        const { data: events, error } = await supabase
          .from("gaming_events")
          .select("id, name, game_id, starts_at, status, gaming_matches(status)")
          .eq("community_id", (await supabase.from("communities").select("id").eq("guild_id", DISCORD_GUILD_ID).maybeSingle()).data?.id)
          .eq("status", "scheduled")
          .order("starts_at", { ascending: true })
          .limit(10);

        if (error) throw error;
        if (!events?.length) {
          return interaction.editReply({ content: "No hay eventos programados.", ephemeral: true });
        }

        const lines = events.map(e => {
          const gameName = e.game_id; // TODO: join con games
          const status = e.status;
          const time = `<t:${Math.floor(new Date(e.starts_at).getTime()/1000)}:F>`;
          return `• **${e.name}** (${gameName}) — ${time} — ${status}\n  id: \`${e.id}\``;
        });
        await interaction.editReply({ content: `**Eventos programados:**\n${lines.join("\n")}`, ephemeral: true });
      } catch (err) {
        console.error('Event list error:', err);
        await interaction.editReply({ content: `❌ Error: ${err.message}`, ephemeral: true });
      }
      return;
    }

    if (eventSub === "join") {
      await interaction.deferReply({ ephemeral: true });
      try {
        const eventId = interaction.options.getString("event_id");
        const { data: membership } = await supabase
          .from("gaming_players")
          .select("id")
          .eq("discord_id", interaction.user.id)
          .maybeSingle();

        if (!membership) {
          return interaction.editReply({ content: "No estás sincronizado. Usa /tierly sync primero.", ephemeral: true });
        }

        const { error } = await supabase
          .from("tierly_event_attendance")
          .upsert({
            event_id: eventId,
            player_id: membership.id,
          }, { onConflict: "event_id,player_id" });

        if (error) throw error;
        await interaction.editReply({ content: "✅ Inscrito al evento. ¡Nos vemos ahí!", ephemeral: true });
      } catch (err) {
        console.error('Event join error:', err);
        await interaction.editReply({ content: `❌ Error: ${err.message}`, ephemeral: true });
      }
      return;
    }

    return interaction.reply({ content: `Subcomando de evento desconocido: ${eventSub}`, ephemeral: true });
  }

  if (sub === "set") {
    if (!isAdminMember(member)) {
      return interaction.reply({ content: "Solo administradores o usuarios con permiso 'Gestionar servidor'.", ephemeral: true });
    }
    const welcomeChannel = interaction.options.getChannel("welcome-channel");
    const announceChannel = interaction.options.getChannel("announce-channel");

    const { error } = await supabase.from("communities").upsert({
      guild_id: DISCORD_GUILD_ID,
      welcome_channel_id: welcomeChannel?.id || null,
      announce_channel_id: announceChannel?.id || null,
    }, { onConflict: "guild_id" });

    if (error) {
      console.error("Error guardando config:", error.message);
      return interaction.reply({ content: "No se pudo guardar la configuración.", ephemeral: true });
    }

    const parts = [`✅ Configurado:`];
    if (welcomeChannel) parts.push(`• Bienvenida: ${welcomeChannel}`);
    if (announceChannel) parts.push(`• Anuncios: ${announceChannel}`);
    if (!welcomeChannel && !announceChannel) parts.push("• (sin cambios)");

    await interaction.reply({ content: parts.join("\n"), ephemeral: true });
    return;
  }

  if (sub === "config") {
    try {
      const { data, error } = await supabase.from("communities")
        .select("welcome_channel_id, announce_channel_id")
        .eq("guild_id", DISCORD_GUILD_ID).maybeSingle();

      if (error) {
        return interaction.reply({ content: "No se pudo leer la configuración.", ephemeral: true });
      }

      const welcome = data?.welcome_channel_id ? `<#${data.welcome_channel_id}>` : "auto (bienvenida-tierly)";
      const announce = data?.announce_channel_id ? `<#${data.announce_channel_id}>` : "auto (anuncios-tierly)";

      await interaction.reply({ content: `**Config actual:**\n• Bienvenida: ${welcome}\n• Anuncios: ${announce}`, ephemeral: true });
    } catch (err) {
      console.error('Config error:', err);
      await interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
    }
    return;
  }

  if (sub === "sync") {
    if (!isAdminMember(member)) {
      return interaction.reply({ content: "Solo administradores o usuarios con permiso 'Gestionar servidor'.", ephemeral: true });
    }
    // Respuesta inmediata
    await interaction.reply({ content: "⏳ Sincronizando miembros en background...", ephemeral: true });
    
    // Trabajo en background (sin await en el reply)
    (async () => {
      try {
        const guild = interaction.guild;
        await guild.members.fetch();
        
        const rows = [];
        for (const member of guild.members.cache.values()) {
          if (member.user.bot) continue;
          const avatarHash = member.user.avatar;
          let avatarUrl = null;
          if (avatarHash) {
            const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
            avatarUrl = `https://cdn.discordapp.com/avatars/${member.id}/${avatarHash}.${ext}`;
          }
          rows.push({
            discord_id: member.id,
            display_name: member.user.globalName || member.user.username,
            avatar_url: avatarUrl,
            discord_member: true,
            discord_verified_at: new Date().toISOString(),
          });
        }
        
        let count = 0;
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await supabase.from('gaming_players').upsert(chunk, { onConflict: 'discord_id' });
          if (!error) count += chunk.length;
          else console.error('Sync chunk error:', error.message);
        }
        
        // Follow-up message
        await interaction.followUp({ content: `✅ Sincronizados ${count} miembros en gaming_players.`, ephemeral: true });
      } catch (err) {
        console.error('Sync error:', err);
        await interaction.followUp({ content: `❌ Error: ${err.message}`, ephemeral: true });
      }
    })();
    return;
  }
  if (sub === "profile") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const { data: player } = await supabase
        .from("gaming_players")
        .select("id, display_name, total_points, username, avatar_url, banner, banner_fit, bio, twitter_handle, telegram_handle, discord_handle, instagram_handle, stellar_passport_name")
        .eq("discord_id", targetUser.id)
        .maybeSingle();

      if (!player) {
        return interaction.editReply({ content: "Usuario no encontrado. Usa /tierly sync primero.", ephemeral: true });
      }

      const { data: score } = await supabase
        .from("gaming_scores")
        .select("total_points")
        .eq("player_id", player.id)
        .maybeSingle();

      const points = score?.total_points || 0;
      const tier = rankForPoints(points);
      const next = nextRankForPoints(points);
      const progress = next
        ? `${next.min - points} pts para ${next.tierId} ${next.division}`
        : "Máximo rango alcanzado";

      const { data: stamps } = await supabase
        .from("tierly_xp_ledger")
        .select("stamps, event_id, created_at")
        .eq("player_id", player.id)
        .eq("stamps", 1)
        .order("created_at", { ascending: false });

      const stampCount = stamps?.length || 0;

      const embed = {
        title: `${player.display_name || targetUser.username}#${targetUser.discriminator}`,
        description: `**${tier.tierId} ${tier.division}** — ${points} pts\n${progress}`,
        thumbnail: { url: player.avatar_url || targetUser.displayAvatarURL() },
        fields: [
          { name: "🏆 Estampas", value: stampCount.toString(), inline: true },
          { name: "⭐ XP Total", value: points.toString(), inline: true },
        ],
        color: 0x159C83,
      };

      if (player.bio) embed.fields.push({ name: "Bio", value: player.bio.slice(0, 200) });
      if (player.stellar_passport_name) embed.fields.push({ name: "Stellar Passport", value: player.stellar_passport_name, inline: true });

      await interaction.editReply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error('Profile error:', err);
      await interaction.editReply({ content: `❌ Error: ${err.message}`, ephemeral: true });
    }
    return;
  }

  if (sub === "leaderboard") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const { data: top } = await supabase
        .from("leaderboard_public_view")
        .select("player_id, display_name, avatar_url, total_points")
        .order("total_points", { ascending: false })
        .limit(10);

      if (!top?.length) {
        return interaction.editReply({ content: "No hay jugadores en el ranking.", ephemeral: true });
      }

      const lines = top.map((p, i) => {
        const tier = rankForPoints(p.total_points || 0);
        return `${i + 1}. **${p.display_name || "—"}** — ${p.total_points} pts (${tier.tierId} ${tier.division})`;
      });

      await interaction.editReply({ content: `**🏆 Top 10 — ${interaction.guild.name}**\n${lines.join("\n")}`, ephemeral: true });
    } catch (err) {
      console.error('Leaderboard error:', err);
      await interaction.editReply({ content: `❌ Error: ${err.message}`, ephemeral: true });
    }
    return;
  }

  if (sub === "live") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const { data: live } = await supabase
        .from("tierly_public_live_presence_view")
        .select("player_name, game_name, community_name, minutes_playing")
        .order("minutes_playing", { ascending: false })
        .limit(15);

      if (!live?.length) {
        return interaction.editReply({ content: "Nadie está jugando ahora mismo.", ephemeral: true });
      }

      const lines = live.map((p, i) => {
        const mins = Math.floor(p.minutes_playing);
        const time = mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h ${mins%60}min`;
        return `${i + 1}. **${p.player_name}** — ${p.game_name} (${p.community_name}) — ${time}`;
      });

      await interaction.editReply({ content: `**🔴 En vivo ahora (${live.length})**\n${lines.join("\n")}`, ephemeral: true });
    } catch (err) {
      console.error('Live error:', err);
      await interaction.editReply({ content: `❌ Error: ${err.message}`, ephemeral: true });
    }
    return;
  }

  if (sub === "help") {
    const help = `**Comandos de TIRLY**
\`/tierly sync\` — Sincroniza miembros del server
\`/tierly config\` — Ver configuración actual
\`/tierly set welcome-channel #canal\` — Configurar canal de bienvenida
\`/tierly set announce-channel #canal\` — Configurar canal de anuncios

**Eventos**
\`/tierly event create\` — Crear evento (admin)
\`/tierly event list\` — Listar eventos abiertos
\`/tierly event join <event_id>\` — Inscribirse a evento

**Perfil y ranking**
\`/tierly profile [user]\` — Ver tu perfil (XP, tier, stamps)
\`/tierly leaderboard\` — Top 10 del server
\`/tierly live\` — Quién está jugando ahora

**Otros**
\`/tierly help\` — Esta ayuda`;

    await interaction.reply({ content: help, ephemeral: true });
    return;
  }

  await interaction.reply({ content: `Subcomando desconocido: ${sub}`, ephemeral: true });
});

client.login(DISCORD_BOT_TOKEN);
