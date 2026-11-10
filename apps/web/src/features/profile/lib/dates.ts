/** "2023-04" → "abr 2023" / "Apr 2023", in the interface language. */
export function formatMonth(yearMonth: string, locale: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  if (!year || !month) return yearMonth;
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace('.', '');
}

/**
 * Date range for display: "abr 2020 – mar 2023", "abr 2020 – actualidad" (`ongoingLabel`),
 * a single month, or `null` when there are no dates.
 */
export function formatMonthRange(
  start: string | null,
  end: string | null,
  locale: string,
  ongoingLabel: string | null,
): string | null {
  if (!start && !end) return null;
  if (!start) return formatMonth(end!, locale);
  const to = end ? formatMonth(end, locale) : ongoingLabel;
  return to ? `${formatMonth(start, locale)} – ${to}` : formatMonth(start, locale);
}

/** `<input type="month">` gives "" when empty; the API expects `null`. */
export function monthOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}
