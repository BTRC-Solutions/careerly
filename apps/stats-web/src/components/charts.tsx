import { useId } from 'react';

/*
 * Charts of the public page. One series each, so one hue (`--color-chart`, seafoam) and no legend: the title says
 * what is plotted. Thin bars with a rounded data end, the value at the tip, a hover/focus tooltip per mark, and the
 * numbers always readable as text (the lists are the table view).
 */

export interface Formatters {
  number: (value: number) => string;
  hidden: string;
}

/** A headline number; `null` when fewer than 5 installations are behind it. */
export function StatTile({
  label,
  value,
  format,
}: {
  label: string;
  value: number | null;
  format: Formatters;
}) {
  return (
    <div className="rounded-card bg-pure-white p-5 shadow-card">
      <p className="text-sm text-steel-text">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-indigo-navy">
        {value === null ? (
          <span className="text-xl text-steel-text">{format.hidden}</span>
        ) : (
          format.number(value)
        )}
      </p>
    </div>
  );
}

/** Values per week as columns; a hidden week (`null`) leaves an empty slot with its note in the tooltip. */
export function WeekColumns({
  title,
  weeks,
  format,
  weekLabel,
}: {
  title: string;
  weeks: { week: string; value: number | null }[];
  format: Formatters;
  weekLabel: (week: string) => string;
}) {
  const titleId = useId();
  const max = Math.max(1, ...weeks.map((week) => week.value ?? 0));
  const height = 140;
  const slot = 32;
  const bar = 20;
  const width = Math.max(weeks.length * slot, slot);

  return (
    <figure className="rounded-card bg-pure-white p-5 shadow-card" aria-labelledby={titleId}>
      <figcaption id={titleId} className="text-section-title text-indigo-navy">
        {title}
      </figcaption>
      <div className="mt-4 overflow-x-auto">
        <svg
          role="img"
          aria-labelledby={titleId}
          width={width}
          height={height + 40}
          className="block overflow-visible"
        >
          <line
            x1={0}
            x2={width}
            y1={height}
            y2={height}
            className="stroke-silver-lining"
            strokeWidth={1}
          />
          {weeks.map((week, index) => {
            const value = week.value ?? 0;
            const h = week.value === null ? 0 : Math.max(2, (value / max) * (height - 18));
            const x = index * slot + (slot - bar) / 2;
            const text = `${weekLabel(week.week)}: ${week.value === null ? format.hidden : format.number(value)}`;
            return (
              <g key={week.week} tabIndex={0} className="group outline-none" aria-label={text}>
                <title>{text}</title>
                {/* Hit target taller and wider than the mark. */}
                <rect x={index * slot} y={0} width={slot} height={height} fill="transparent" />
                {h > 0 && (
                  <path
                    d={roundedTop(x, height - h, bar, h, Math.min(4, h))}
                    className="fill-chart group-hover:fill-chart-strong group-focus:fill-chart-strong"
                  />
                )}
                {week.value !== null && (
                  <text
                    x={x + bar / 2}
                    y={height - h - 6}
                    textAnchor="middle"
                    className="fill-slate-ink text-[11px]"
                  >
                    {format.number(value)}
                  </text>
                )}
                {(index === 0 || index === weeks.length - 1 || index % 4 === 0) && (
                  <text
                    x={x + bar / 2}
                    y={height + 16}
                    textAnchor="middle"
                    className="fill-steel-text text-[11px]"
                  >
                    {week.week.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}

/** `{ key: count }` as horizontal bars, largest first, each with its label and value in text. */
export function BarList({
  title,
  values,
  label,
  format,
  empty,
}: {
  title: string;
  values: Record<string, number>;
  label: (key: string) => string;
  format: Formatters;
  empty: string;
}) {
  const titleId = useId();
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, value]) => value));

  return (
    <section className="rounded-card bg-pure-white p-5 shadow-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="text-section-title text-indigo-navy">
        {title}
      </h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-steel-text">{empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {entries.map(([key, value]) => (
            <li key={key} title={`${label(key)}: ${format.number(value)}`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-slate-ink">{label(key)}</span>
                <span className="font-medium text-indigo-navy tabular-nums">
                  {format.number(value)}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-r-[4px] bg-cloud-canvas" aria-hidden="true">
                <div
                  className="h-2 rounded-r-[4px] bg-chart"
                  style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** An SVG path for a column with a rounded top and a square base. */
function roundedTop(x: number, y: number, width: number, height: number, radius: number): string {
  return [
    `M${x},${y + height}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + width - radius}`,
    `Q${x + width},${y} ${x + width},${y + radius}`,
    `V${y + height}`,
    'Z',
  ].join(' ');
}
