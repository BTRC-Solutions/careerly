import { type TelemetryStats, TelemetryStatsSchema } from '@careerly/contracts';
import { useEffect, useMemo, useState } from 'react';
import { BarList, type Formatters, StatTile, WeekColumns } from './components/charts';
import { type Language, labelOf, messagesFor } from './messages';

const RANGES = [30, 90, 365] as const;
type Range = (typeof RANGES)[number];

type State =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; stats: TelemetryStats };

/**
 * The public statistics page (RF-TEL-10, ARCHITECTURE §19.5). It shows only what the server returns, which
 * `telemetry-api` already filtered by the anonymity threshold (RN-20).
 */
export function App({ language }: { language: Language }) {
  const m = messagesFor(language);
  const [range, setRange] = useState<Range>(30);
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    fetch(`/api/stats?range=${range}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return TelemetryStatsSchema.parse(await response.json());
      })
      .then(
        (stats) => current && setState({ status: 'ready', stats }),
        () => current && setState({ status: 'error' }),
      );
    return () => {
      current = false;
    };
  }, [range]);

  const format = useMemo<Formatters>(() => {
    const compact = new Intl.NumberFormat(language, { notation: 'compact' });
    return { number: (value) => compact.format(value), hidden: m.hidden };
  }, [language, m.hidden]);
  const label = (key: string) => labelOf(key, language);
  const weekLabel = (week: string) =>
    `${m.weekOf} ${new Date(`${week}T12:00:00`).toLocaleDateString(language, { dateStyle: 'medium' })}`;

  return (
    <main className="mx-auto flex max-w-[64rem] flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-page-title text-indigo-navy">{m.title}</h1>
        <p className="max-w-[44rem] text-slate-ink">{m.intro}</p>
        <p className="max-w-[44rem] text-sm text-steel-text">{m.threshold}</p>
        <label className="mt-2 flex w-fit items-center gap-2 text-sm text-slate-ink">
          {m.range}
          <select
            className="rounded-control border border-silver-lining bg-pure-white px-3 py-1.5 text-sm"
            value={range}
            onChange={(event) => {
              setState({ status: 'loading' });
              setRange(Number(event.target.value) as Range);
            }}
          >
            {RANGES.map((value) => (
              <option key={value} value={value}>
                {m.ranges[value]}
              </option>
            ))}
          </select>
        </label>
      </header>

      {state.status === 'loading' && (
        <p role="status" className="text-sm text-steel-text">
          {m.loading}
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-slate-ink">
          {m.error}
        </p>
      )}

      {state.status === 'ready' && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label={m.activeInstalls} value={state.stats.activeInstalls} format={format} />
            <StatTile
              label={m.applicationsCreated}
              value={totalOrNull(state.stats.applicationsByWeek.map((week) => week.created))}
              format={format}
            />
            <StatTile
              label={m.resumesGenerated}
              value={state.stats.features.resumesGenerated}
              format={format}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <WeekColumns
              title={m.activeByWeek}
              weeks={state.stats.activeByWeek.map((w) => ({ week: w.week, value: w.installs }))}
              format={format}
              weekLabel={weekLabel}
            />
            <WeekColumns
              title={m.applicationsByWeek}
              weeks={state.stats.applicationsByWeek.map((w) => ({
                week: w.week,
                value: w.created,
              }))}
              format={format}
              weekLabel={weekLabel}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {(
              [
                ['sources', m.sources],
                ['positionCategories', m.positionCategories],
                ['funnel', m.funnel],
                ['workMode', m.workMode],
                ['countries', m.countries],
                ['outputLanguages', m.outputLanguages],
              ] as const
            ).map(([key, title]) => (
              <BarList
                key={key}
                title={title}
                values={state.stats[key]}
                label={label}
                format={format}
                empty={m.empty}
              />
            ))}
          </div>

          <section
            className="rounded-card bg-pure-white p-5 shadow-card"
            aria-labelledby="titles-heading"
          >
            <h2 id="titles-heading" className="text-section-title text-indigo-navy">
              {m.positionTitles}
            </h2>
            {state.stats.positionTitles.length === 0 ? (
              <p className="mt-3 text-sm text-steel-text">{m.empty}</p>
            ) : (
              <ol className="mt-3 flex flex-col divide-y divide-silver-lining">
                {state.stats.positionTitles.map((title) => (
                  <li key={title.title} className="flex justify-between gap-3 py-2 text-sm">
                    <span className="text-slate-ink">{title.title}</span>
                    <span className="text-steel-text tabular-nums">
                      {m.installs(title.installs)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}

      <footer className="text-sm text-steel-text">{m.footer}</footer>
    </main>
  );
}

/** The sum of the shown weeks; `null` when every week is hidden. */
function totalOrNull(values: (number | null)[]): number | null {
  const shown = values.filter((value): value is number => value !== null);
  return shown.length === 0 ? null : shown.reduce((sum, value) => sum + value, 0);
}
