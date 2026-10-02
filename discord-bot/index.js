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

if (!DISCORD_BOT_TOKEN) {
  throw new Error("Falta DISCORD_BOT_TOKEN en las variables de entorno");
}
// DISCORD_GUILD_ID queda como fallback opcional (canales .env legacy). El bot
// opera en todos los guilds donde esté instalado.

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
              { name: "starts_at", description: "Inicio ISO-8601 (UTC), ej. 2026-10-10T23:00:00Z", type: 3, required: true },
              { name: "timezone", description: "Zona IANA (default: comunidad)", type: 3, required: false },
              { name: "location", description: "Lugar o canal", type: 3, required: false },
              { name: "description", description: "Descripción / reglas", type: 3, required: false },
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

async function registerCommandsForGuild(guild) {
  try {
    await guild.commands.set(TIERLY_COMMANDS);
    console.log(`Slash commands registrados en guild ${guild.name} (${guild.id})`);
  } catch (error) {
    console.error(`Error registrando slash commands en ${guild.id}:`, error.message);
  }
}

async function registerCommands() {
  const guilds = [...client.guilds.cache.values()];
  if (guilds.length === 0) {
    try {
      await client.application.commands.set(TIERLY_COMMANDS);
      console.log("Slash commands registrados globalmente (sin guilds en caché)");
    } catch (error) {
      console.error("Error registrando slash commands globales:", error.message);
    }
    return;
  }
  for (const guild of guilds) {
    await registerCommandsForGuild(guild);
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

function sessionKey(guildId, userId, gameName) {
  return `${guildId}:${userId}:${gameName}`;
}

function clearUserSessions(guildId, userId) {
  const prefix = `${guildId}:${userId}:`;
  for (const key of activeSessions.keys()) {
    if (key.startsWith(prefix)) activeSessions.delete(key);
  }
}

async function handleTierlyCommand(message) {
  const parts = message.content.trim().toLowerCase().split(/\s+/);
  if (parts[0] !== "!tierly") return false;
  if (!["presencia", "borrar", "voy"].includes(parts[1])) return false;
  if (!sessions) {
    await message.channel.send("El servicio de consentimiento no está disponible en este momento.");
    return true;
  }

  const guildId = message.guild.id;
  try {
    if (parts[1] === "presencia" && parts[2] === "si") {
      await sessions.acceptMemberConsent(guildId, message.author.id, CONSENT_VERSION);
      await message.channel.send("Consentimiento de presencia activado. TIRLY podrá registrar las sesiones de juego.");
    } else if (parts[1] === "presencia" && parts[2] === "no") {
      await sessions.declineMemberConsent(guildId, message.author.id);
      clearUserSessions(guildId, message.author.id);
      await message.channel.send("Consentimiento de presencia retirado. Las sesiones abiertas se cerraron y no se registrarán nuevas sesiones.");
    } else if (parts[1] === "voy" && parts.length === 2) {
      await handleAttendanceCommand(message);
    } else if (parts[1] === "borrar" && parts.length === 2) {
      await sessions.requestMemberDeletion(guildId, message.author.id);
      clearUserSessions(guildId, message.author.id);
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
  if (!guildId) return;
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
        guildId,
        communityName: newPresence.guild?.name,
        discordUserId: userId,
        gameId,
        ...identity,
      });
      if (session?.id) activeSessions.set(sessionKey(guildId, userId, gameName), session.id);
    } catch (error) {
      await recordBotHealth("error", "presence_open");
      console.error("No se pudo abrir la sesion de presence.");
    }
  }
  for (const gameName of stopped) {
    try {
      const key = sessionKey(guildId, userId, gameName);
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
  const guildId = guild.id;
  const settings = await sessions.getCommunitySettings(guildId);
  if (settings?.presence_enabled === false) return;
  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    for (const gameName of playingGames(member.presence)) {
      const gameId = await sessions.resolveGame(gameName);
      const identity = memberIdentity(member);
      const session = await sessions.openSession({
        guildId,
        discordUserId: member.id,
        gameId,
        ...identity,
      });
      if (session?.id) activeSessions.set(sessionKey(guildId, member.id, gameName), session.id);
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
  for (const guild of client.guilds.cache.values()) {
    try {
      const settings = await sessions.getCommunitySettings(guild.id);
      const staleHours = Number(settings?.stale_session_hours) || 12;
      await sessions.closeStaleSessions({
        guildId: guild.id,
        before: new Date(Date.now() - staleHours * 60 * 60 * 1000).toISOString(),
        endedAt: heartbeatAt,
      });
    } catch (error) {
      await recordBotHealth("error", "stale_sessions");
      console.error("No se pudo cerrar sesiones obsoletas.");
    }
  }
}

async function getWelcomeChannel(guild) {
  const { data } = await supabase.from("communities")
    .select("welcome_channel_id")
    .eq("guild_id", guild.id).maybeSingle();

  const channelId = data?.welcome_channel_id || (guild.id === DISCORD_GUILD_ID ? WELCOME_CHANNEL_ID : null);
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
    .eq("guild_id", guild.id).maybeSingle();

  const channelId = data?.announce_channel_id || (guild.id === DISCORD_GUILD_ID ? ANNOUNCE_CHANNEL_ID : null);
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
async function announceNewEvents(channel, guildId) {
  const { data: events, error: eventsError } = await supabase
    .from("gaming_events")
    .select("id, name, event_date")
    .eq("guild_id", guildId)
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
  await deliverEventReminders(channel, guild.id);
  await announceNewEvents(channel, guild.id);
  await announceRankUps(channel);
}

async function deliverEventReminders(channel, guildId) {
  const now = new Date().toISOString();
  const { data: reminders, error } = await supabase
    .from("tierly_event_notifications")
    .select("id, event_id, reminder_minutes, scheduled_for, gaming_events(name, starts_at, timezone)")
    .eq("guild_id", guildId)
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

  const guilds = [...client.guilds.cache.values()];
  console.log(`Guilds conectados: ${guilds.map((g) => `${g.name}(${g.id})`).join(", ") || "(ninguno)"}`);

  async function bootstrapGuild(guild) {
    if (sessions) {
      await sessions.ensureCommunity({ guildId: guild.id, name: guild.name })
        .catch((err) => console.error("Fallo el bootstrap de la comunidad:", err.message));
      await sessions.reconcileOpenSessions({ guildId: guild.id, reason: "crash" })
        .catch((err) => console.error("Fallo la reconciliacion inicial:", err.message));
      await reconcilePresence(guild)
        .catch((err) => console.error("Fallo la reconciliacion de presence:", err.message));
    }
    if (supabase) {
      await runNotificationPoll(guild).catch((err) => console.error("Fallo el poll de notificaciones:", err.message));
    }
  }

  for (const guild of guilds) {
    await bootstrapGuild(guild);
  }

  if (supabase) {
    setInterval(() => {
      for (const guild of client.guilds.cache.values()) {
        runNotificationPoll(guild).catch((err) => console.error("Fallo el poll de notificaciones:", err.message));
      }
    }, POLL_INTERVAL_MS);
  }

  if (sessions) {
    setInterval(() => {
      recordBotHealth("heartbeat").catch(() => {});
      runPresenceHeartbeat().catch((err) => console.error("Fallo el heartbeat de presence:", err.message));
    }, HEARTBEAT_INTERVAL_MS);
  }
});

client.on("guildCreate", async (guild) => {
  console.log(`Bot agregado a guild: ${guild.name} (${guild.id})`);
  await registerCommandsForGuild(guild);
  if (sessions) {
    await sessions.ensureCommunity({ guildId: guild.id, name: guild.name })
      .catch((err) => console.error("Fallo ensureCommunity en guildCreate:", err.message));
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
  if (!message.guild) return;
  if (await handleTierlyCommand(message)) return;
  if (message.content.trim().toLowerCase() !== "!bienvenida") return;

  await message.channel
    .send(`🐈‍⬛ ¡Bienvenido/a, ${message.member}! Sumate al leaderboard gaming de TIRLY → ${LEADERBOARD_URL}`)
    .catch((err) => console.error("No se pudo postear bienvenida:", err.message));
  await syncMembership(message.member);
});

console.log('>>> Registering interactionCreate handler');
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "tierly") return;
  if (!interaction.guildId) {
    return interaction.reply({ content: "Los comandos de TIRLY solo funcionan dentro de un servidor.", ephemeral: true });
  }

  const guildId = interaction.guildId;
  const member = interaction.member;
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand(false);

  if (sessions) {
    await sessions.ensureCommunity({ guildId, name: interaction.guild?.name || guildId })
      .catch(() => {});
  }

  if (group === "event") {
    const eventSub = sub;

    if (eventSub === "create") {
      if (!isAdminMember(member)) {
        return interaction.reply({ content: "Solo administradores pueden crear eventos.", ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      try {
        const name = interaction.options.getString("name");
        const startsAtRaw = interaction.options.getString("starts_at");
        const timezoneOpt = interaction.options.getString("timezone");
        const location = interaction.options.getString("location");
        const description = interaction.options.getString("description");

        const startsAt = new Date(startsAtRaw);
        if (Number.isNaN(startsAt.getTime())) {
          return interaction.editReply({ content: "starts_at inválido. Usá ISO-8601 UTC, ej. 2026-10-10T23:00:00Z", ephemeral: true });
        }

        const { data: community } = await supabase
          .from("communities")
          .select("guild_id, timezone")
          .eq("guild_id", guildId)
          .maybeSingle();

        if (!community) {
          return interaction.editReply({ content: "Comunidad no configurada. Usa /tierly set welcome-channel primero.", ephemeral: true });
        }

        const timezone = (timezoneOpt || community.timezone || "America/Santiago").trim();
        const eventDate = startsAt.toISOString().slice(0, 10);

        // organizations es prerequisito Tellus compartido (fuera del SQL del repo).
        // Reusamos organization_id de un evento previo del mismo guild.
        const { data: prior, error: priorError } = await supabase
          .from("gaming_events")
          .select("organization_id")
          .eq("guild_id", guildId)
          .not("organization_id", "is", null)
          .limit(1)
          .maybeSingle();
        if (priorError) throw priorError;
        if (!prior?.organization_id) {
          return interaction.editReply({
            content: "No hay organization_id previo en este guild. Creá el primer evento desde el Admin web y después podés usar /tierly event create.",
            ephemeral: true,
          });
        }

        const { data: event, error } = await supabase
          .from("gaming_events")
          .insert({
            organization_id: prior.organization_id,
            guild_id: guildId,
            name: name.trim(),
            event_date: eventDate,
            starts_at: startsAt.toISOString(),
            ends_at: null,
            timezone,
            location: location?.trim() || null,
            description: description?.trim() || null,
            status: "scheduled",
          })
          .select("id, starts_at")
          .single();

        if (error) throw error;

        const ts = Math.floor(new Date(event.starts_at).getTime() / 1000);
        await interaction.editReply({
          content: `✅ Evento creado: **${name.trim()}** — <t:${ts}:F> (${timezone})\nid: \`${event.id}\`\n${LEADERBOARD_URL}`,
          ephemeral: true,
        });
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
          .select("id, name, starts_at, status, timezone")
          .eq("guild_id", guildId)
          .eq("status", "scheduled")
          .order("starts_at", { ascending: true })
          .limit(10);

        if (error) throw error;
        if (!events?.length) {
          return interaction.editReply({ content: "No hay eventos programados.", ephemeral: true });
        }

        const lines = events.map((e) => {
          const time = e.starts_at
            ? `<t:${Math.floor(new Date(e.starts_at).getTime() / 1000)}:F>`
            : "sin fecha";
          return `• **${e.name}** — ${time} (${e.timezone || "UTC"})\n  id: \`${e.id}\``;
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
          return interaction.editReply({ content: "No estás sincronizado. Pedile a un admin `/tierly sync` o usá `!bienvenida`.", ephemeral: true });
        }

        const { data: event, error: eventError } = await supabase
          .from("gaming_events")
          .select("id, guild_id, status")
          .eq("id", eventId)
          .maybeSingle();
        if (eventError) throw eventError;
        if (!event || event.guild_id !== guildId) {
          return interaction.editReply({ content: "Evento no encontrado en este server.", ephemeral: true });
        }
        if (event.status !== "scheduled" && event.status !== "live") {
          return interaction.editReply({ content: `El evento no acepta inscripciones (estado: ${event.status}).`, ephemeral: true });
        }

        const { error } = await supabase
          .from("tierly_event_attendance")
          .upsert({
            event_id: eventId,
            player_id: membership.id,
            unregistered_at: null,
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
      guild_id: guildId,
      name: interaction.guild?.name || null,
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
        .eq("guild_id", guildId).maybeSingle();

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
