// Formas de fila tal como las devuelven las tablas y vistas reales. Los nombres
// de campo son los del schema: si algo no esta aca, no existe en la base.
//
// `string | null` no es decorativo: en Postgres casi todos estos timestamps son
// nullable y la UI tiene que distinguir "no paso" de "paso".

export interface Community {
  guild_id: string;
  name: string;
  timezone: string | null;
  presence_enabled: boolean;
  public_directory: boolean;
}

export interface Game {
  id: number;
  display_name: string;
  canonical_name: string;
}

/** `public.daily_game_rollups`. Granularidad DIARIA: no hay hora del dia aca. */
export interface Rollup {
  guild_id: string;
  game_id: number;
  day: string;
  unique_players: number;
  total_minutes: number;
  session_count: number;
}

/** `public.suggested_events`. No tiene score ni texto de recomendacion. */
export interface Suggestion {
  id: number;
  guild_id: string;
  game_id: number;
  generated_at: string;
  window_days: number;
  player_count: number;
  status: "pending" | "accepted" | "dismissed";
}

/** Vista `public.tierly_admin_game_players`. */
export interface ObservedPlayer {
  guild_id: string;
  game_id: number;
  display_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  started_at: string | null;
}

export interface CommunityEvent {
  id: string;
  guild_id: string;
  name: string;
  event_date: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  location: string | null;
  luma_url: string | null;
  description: string | null;
  status: string | null;
}

export interface Attendance {
  event_id: string;
  player_id: string;
  registered_at: string | null;
  unregistered_at: string | null;
  checked_in_at: string | null;
  confirmed_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
}

/** `is_current_user` lo calcula el cliente, no viene de la base. */
export interface AttendanceRow extends Attendance {
  is_current_user: boolean;
}

export interface LedgerEntry {
  xp: number;
  stamps: number;
  event_id: string | null;
  created_at: string;
}

export interface Player {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export const ADMIN_VIEWS = ["events", "games", "players", "trends", "suggestions"] as const;
export type AdminView = (typeof ADMIN_VIEWS)[number];

export const VIEW_LABELS: Record<AdminView, string> = {
  events: "Eventos",
  games: "Juegos",
  players: "Jugadores",
  trends: "Tendencias",
  suggestions: "Sugerencias",
};

/**
 * Estado de una asistencia. `revoked_at` se evalua PRIMERO porque una revocacion
 * conserva `confirmed_at` como evidencia: el orden inverso nunca mostraria
 * "Revocada".
 */
export function attendanceState(row: Attendance): string {
  if (row.revoked_at) return "Revocada";
  if (row.confirmed_at) return "Confirmada";
  if (row.checked_in_at) return "Check-in";
  if (row.unregistered_at) return "Salió";
  return "Registrado";
}
