// Dates as the admin reads them, in French. Absolute dates go through
// <LocalDate>, so they show in the reader's time zone, not the server's.

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const relative = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

export const formatDateTime = (value: Date) => dateTime.format(value);
export const formatDate = (value: Date) => date.format(value);

/** "il y a 3 min", "hier"… */
export function formatRelative(value: Date, now = Date.now()): string {
  const seconds = Math.round((value.getTime() - now) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) {
      return relative.format(Math.round(seconds / size), unit);
    }
  }
  return "à l’instant";
}

/** "Chrome · macOS" from a user agent, good enough to recognise a device. */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Appareil inconnu";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Navigateur";
  const system = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;
  return system ? `${browser} · ${system}` : browser;
}
