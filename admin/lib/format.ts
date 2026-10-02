export const COMMON_TIMEZONES = [
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Mexico_City",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Madrid",
  "Asia/Tokyo",
  "UTC",
] as const;

const numberFormat = new Intl.NumberFormat("es-CL");

export function formatNumber(value: number | null | undefined): string {
  return numberFormat.format(Number(value ?? 0));
}

export function isValidTimezone(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/**
 * Convierte un `datetime-local` ("2026-03-14T21:30") interpretado EN `timezone`
 * a un ISO en UTC.
 *
 * No alcanza con un solo ajuste: el offset depende del instante, y el instante es
 * justo lo que estamos despejando. Se itera 3 veces para converger, que cubre el
 * salto de DST (incluido el caso en que la hora local elegida no existe).
 *
 * Devuelve `null` si la entrada no es parseable: el llamador decide el error.
 */
export function localDateTimeToUtc(value: string, timezone: string): string | null {
  if (!value || !isValidTimezone(timezone)) return null;

  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return null;

  const fields = [...datePart.split("-"), ...timePart.split(":")].map(Number);
  if (fields.length < 5 || fields.some((n) => !Number.isFinite(n))) return null;
  const [year, month, day, hour, minute] = fields as [number, number, number, number, number];

  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let utc = wanted;

  const parser = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Map(
      parser
        .formatToParts(new Date(utc))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)] as const),
    );
    const displayed = Date.UTC(
      parts.get("year") ?? 0,
      (parts.get("month") ?? 1) - 1,
      parts.get("day") ?? 1,
      parts.get("hour") ?? 0,
      parts.get("minute") ?? 0,
    );
    utc += wanted - displayed;
  }

  const result = new Date(utc);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

export function formatEventWhen(event: {
  starts_at: string | null;
  event_date: string | null;
  timezone: string | null;
}): string {
  const timezone = isValidTimezone(event.timezone) ? event.timezone : "UTC";
  if (!event.starts_at) return event.event_date ?? "Fecha pendiente";
  return `${new Date(event.starts_at).toLocaleString("es-CL", { timeZone: timezone })} (${timezone})`;
}
