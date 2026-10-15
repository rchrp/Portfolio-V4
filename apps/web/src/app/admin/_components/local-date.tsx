"use client";

import { formatDate, formatDateTime } from "./format";

/** A date in the browser's time zone. The server's rendering is replaced. */
export function LocalDate({
  value,
  withTime = false,
}: {
  value: Date;
  withTime?: boolean;
}) {
  return (
    <time dateTime={value.toISOString()} suppressHydrationWarning>
      {withTime ? formatDateTime(value) : formatDate(value)}
    </time>
  );
}
