import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import type { TierlyBridge } from "./bridge";
import type {
  Attendance,
  AttendanceRow,
  Community,
  CommunityEvent,
  Game,
  LedgerEntry,
  ObservedPlayer,
  Player,
  Rollup,
  Suggestion,
} from "./types";

export interface AdminData {
  communities: Community[];
  events: CommunityEvent[];
  attendance: AttendanceRow[];
  ledger: LedgerEntry[];
  player: Player | null;
  games: Game[];
  rollups: Rollup[];
  suggestions: Suggestion[];
  observedPlayers: ObservedPlayer[];
  isAdmin: boolean;
}

const EMPTY: AdminData = {
  communities: [],
  events: [],
  attendance: [],
  ledger: [],
  player: null,
  games: [],
  rollups: [],
  suggestions: [],
  observedPlayers: [],
  isAdmin: false,
};

export type AuthState = "checking" | "anonymous" | "authenticated";

export interface AdminState {
  readonly auth: AuthState;
  readonly session: Session | null;
  readonly data: AdminData;
  readonly selectedGuildId: string | null;
  readonly loading: boolean;
  /** `true` cuando hay sesion y admin pero la cuenta no administra ninguna guild. */
  readonly needsOnboarding: boolean;
  readonly message: string;
  setMessage(message: string): void;
  selectCommunity(guildId: string): void;
  reload(): Promise<void>;
}

export function useAdminData(bridge: TierlyBridge): AdminState {
  const supabase = bridge.supabase;

  const [auth, setAuth] = useState<AuthState>("checking");
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<AdminData>(EMPTY);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [message, setMessage] = useState("");

  // Guard de reentrada. El original usaba `state.loading` para lo mismo, pero un
  // state de React no se lee actualizado dentro del mismo tick, asi que va en ref.
  const inFlight = useRef(false);
  // La guild pedida puede cambiar MIENTRAS carga (el usuario toca el selector).
  // Se compara contra la efectivamente cargada al final y se recarga: si no, se
  // quedan pintados datos de otra comunidad.
  const requestedGuild = useRef<string | null>(null);
  const loadedGuild = useRef<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const current = sessionData.session;
      setSession(current);
      setAuth(current ? "authenticated" : "anonymous");
      if (!current) {
        setData(EMPTY);
        // Alinear el par pedido/cargado es lo que corta el reintento del final:
        // sin esto, una salida temprana con `requestedGuild` seteado se
        // reinvocaria sin fin.
        loadedGuild.current = requestedGuild.current;
        return;
      }

      const adminResult = await supabase.from("community_admins").select("guild_id, role");
      const guildIds = (adminResult.data ?? [])
        .map((row: { guild_id: string | null }) => row.guild_id)
        .filter((id): id is string => Boolean(id));
      const isAdmin = !adminResult.error && guildIds.length > 0;

      const communitiesResult = await supabase
        .from("communities")
        .select("guild_id, name, timezone, presence_enabled, public_directory")
        .in("guild_id", guildIds);
      const communities = (communitiesResult.data ?? []) as Community[];

      const guildId =
        communities.find((c) => c.guild_id === requestedGuild.current)?.guild_id ??
        communities[0]?.guild_id ??
        null;

      if (!guildId) {
        setData({ ...EMPTY, communities });
        setNeedsOnboarding(true);
        loadedGuild.current = requestedGuild.current;
        return;
      }
      setNeedsOnboarding(false);
      setSelectedGuildId(guildId);
      requestedGuild.current = guildId;

      const eventsResult = await supabase
        .from("gaming_events")
        .select(
          "id, guild_id, name, event_date, starts_at, ends_at, timezone, location, luma_url, description, status",
        )
        .eq("guild_id", guildId)
        .order("starts_at", { ascending: true });
      const events = (eventsResult.data ?? []) as CommunityEvent[];
      const eventIds = events.map((row) => row.id);

      const [playerResult, attendanceResult] = await Promise.all([
        supabase
          .from("gaming_players")
          .select("id, display_name, avatar_url")
          .eq("auth_user_id", current.user.id)
          .maybeSingle(),
        eventIds.length
          ? supabase
              .from("tierly_event_attendance")
              .select(
                "event_id, player_id, registered_at, unregistered_at, checked_in_at, confirmed_at, revoked_at, revocation_reason",
              )
              .in("event_id", eventIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const player = (playerResult.data ?? null) as Player | null;

      const ledgerResult = player
        ? await supabase
            .from("tierly_xp_ledger")
            .select("xp, stamps, event_id, created_at")
            .eq("player_id", player.id)
            .eq("guild_id", guildId)
        : { data: [], error: null };

      const attendance = ((attendanceResult.data ?? []) as Attendance[]).map<AttendanceRow>((row) => ({
        ...row,
        is_current_user: Boolean(player && String(row.player_id) === String(player.id)),
      }));

      let adminOnly = {
        games: [] as Game[],
        rollups: [] as Rollup[],
        suggestions: [] as Suggestion[],
        observedPlayers: [] as ObservedPlayer[],
      };

      if (isAdmin) {
        const [games, rollups, suggestions, observed] = await Promise.all([
          supabase.from("games").select("id, display_name, canonical_name"),
          supabase
            .from("daily_game_rollups")
            .select("guild_id, game_id, day, unique_players, total_minutes, session_count")
            .eq("guild_id", guildId),
          supabase
            .from("suggested_events")
            .select("id, guild_id, game_id, generated_at, window_days, player_count, status")
            .eq("guild_id", guildId),
          supabase
            .from("tierly_admin_game_players")
            .select("guild_id, game_id, display_name, avatar_url, is_active, started_at")
            .eq("guild_id", guildId),
        ]);
        adminOnly = {
          games: (games.data ?? []) as Game[],
          rollups: (rollups.data ?? []) as Rollup[],
          suggestions: (suggestions.data ?? []) as Suggestion[],
          observedPlayers: (observed.data ?? []) as ObservedPlayer[],
        };
      }

      setData({
        communities,
        events,
        attendance,
        ledger: (ledgerResult.data ?? []) as LedgerEntry[],
        player,
        isAdmin,
        ...adminOnly,
      });

      const failed = [playerResult, eventsResult, attendanceResult, ledgerResult].find(
        (result) => result.error,
      );
      setMessage(failed?.error?.message ?? "");
      loadedGuild.current = guildId;
    } finally {
      inFlight.current = false;
      setLoading(false);
    }

    // El usuario cambio de comunidad MIENTRAS cargaba: el guard de reentrada
    // descarto ese pedido, asi que lo que quedo pintado es de otra guild. Se
    // reintenta ahora que el guard esta libre.
    if (requestedGuild.current !== loadedGuild.current) {
      await load();
    }
  }, [supabase]);

  // `load` se lee por ref en los listeners para no re-suscribir en cada render.
  const loadRef = useRef(load);
  loadRef.current = load;

  const selectCommunity = useCallback((guildId: string) => {
    requestedGuild.current = guildId;
    setSelectedGuildId(guildId);
    void loadRef.current();
  }, []);

  useEffect(() => {
    void loadRef.current();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setAuth(nextSession ? "authenticated" : "anonymous");
      setMessage("");
      void loadRef.current();
    });
    return () => subscription.subscription.unsubscribe();
  }, [supabase]);

  return {
    auth,
    session,
    data,
    selectedGuildId,
    loading,
    needsOnboarding,
    message,
    setMessage,
    selectCommunity,
    reload: load,
  };
}
