/** Today in the local time zone (YYYY-MM-DD): the day the user sees. */
export function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A YYYY-MM-DD day in the user's language, without moving it across time zones. */
export function formatDay(day: string, language: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(
    new Date(year!, month! - 1, date!),
  );
}
