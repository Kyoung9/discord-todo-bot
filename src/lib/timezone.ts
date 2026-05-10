/** ギルドの「今日」の日付キー YYYY-MM-DD */
export function dateKeyInTimeZone(now: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA yields YYYY-MM-DD
  return fmt.format(now);
}

export function formatRangeLabel(timeZone: string, dateKey: string): string {
  return `${dateKey} 00:00 ~ 23:59 ${timeZone}`;
}
