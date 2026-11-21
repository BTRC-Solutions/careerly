import { TELEMETRY_ANONYMITY_THRESHOLD, type TelemetryStats } from '@careerly/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { type SQL, sql } from 'drizzle-orm';
import { rowsOf } from '../database/database.js';
import { APP_DEPS, type AppDeps } from '../deps.js';

const K = TELEMETRY_ANONYMITY_THRESHOLD;
const MAX_TITLES = 50;

/** Reports from installations that are not excluded. */
const REPORTS = sql`FROM reports r JOIN installs i ON i.install_id = r.install_id AND NOT i.excluded`;
/** Only the period's. */
const inPeriod = (from: string, to: string) =>
  sql`WHERE r.day BETWEEN ${from}::date AND ${to}::date`;
/** Reports of the period from installations that are not excluded. */
const scope = (from: string, to: string) => sql`${REPORTS} ${inPeriod(from, to)}`;

/** A count, or `null` when fewer than `K` installations are behind it (RN-20). */
const anonymous = (count: number, installs: number) => (installs >= K ? count : null);

/**
 * The aggregates of a period for the public page (ARCHITECTURE §19.4, RN-20). The threshold applies to each value
 * on its own: a portal, a country, a category or a title appears only when at least `K` distinct installations
 * reported it. Titles, the only free text, are grouped ignoring case and spaces.
 */
@Injectable()
export class StatsService {
  constructor(@Inject(APP_DEPS) private readonly deps: AppDeps) {}

  async stats(from: string, to: string): Promise<TelemetryStats> {
    const [
      active,
      activeByDay,
      activeByWeek,
      applicationsByWeek,
      sources,
      positionCategories,
      funnel,
      workMode,
      countries,
      outputLanguages,
      positionTitles,
      features,
    ] = await Promise.all([
      this.rows<{ installs: number }>(sql`
        SELECT COUNT(DISTINCT r.install_id)::int AS installs ${scope(from, to)}
          AND r.metrics -> 'activeUsage' IS NOT NULL`),
      this.rows<{ day: string; installs: number }>(sql`
        SELECT to_char(r.day, 'YYYY-MM-DD') AS day, COUNT(DISTINCT r.install_id)::int AS installs
        ${scope(from, to)} AND r.metrics -> 'activeUsage' IS NOT NULL
        GROUP BY r.day ORDER BY r.day`),
      this.rows<{ week: string; installs: number }>(sql`
        SELECT to_char(date_trunc('week', r.day), 'YYYY-MM-DD') AS week,
               COUNT(DISTINCT r.install_id)::int AS installs
        ${scope(from, to)} AND r.metrics -> 'activeUsage' IS NOT NULL
        GROUP BY 1 ORDER BY 1`),
      this.rows<{ week: string; created: number; installs: number }>(sql`
        SELECT to_char(date_trunc('week', r.day), 'YYYY-MM-DD') AS week,
               SUM((r.metrics -> 'applications' ->> 'created')::int)::int AS created,
               COUNT(DISTINCT r.install_id)::int AS installs
        ${scope(from, to)} AND r.metrics -> 'applications' IS NOT NULL
        GROUP BY 1 ORDER BY 1`),
      this.countsOf(sql`r.metrics -> 'sources'`, from, to),
      this.countsOf(sql`r.metrics -> 'positionCategories'`, from, to),
      this.countsOf(sql`r.metrics -> 'funnel'`, from, to),
      this.countsOf(sql`r.metrics -> 'workMode'`, from, to),
      this.countsOf(sql`r.metrics -> 'countries'`, from, to),
      this.countsOf(sql`r.metrics -> 'features' -> 'outputLanguages'`, from, to),
      this.rows<{ title: string; installs: number }>(sql`
        SELECT MIN(t.title) AS title, COUNT(DISTINCT r.install_id)::int AS installs
        ${REPORTS}
        CROSS JOIN LATERAL jsonb_array_elements_text(
          COALESCE(r.metrics -> 'positionTitles', '[]'::jsonb)
        ) AS t(title)
        ${inPeriod(from, to)}
        GROUP BY lower(regexp_replace(trim(t.title), '\\s+', ' ', 'g'))
        HAVING COUNT(DISTINCT r.install_id) >= ${K}
        ORDER BY installs DESC, title
        LIMIT ${MAX_TITLES}`),
      this.rows<{
        installs: number;
        resumes: number;
        gaps: number;
        median_tokens: number | null;
      }>(sql`
        SELECT COUNT(DISTINCT r.install_id)::int AS installs,
               COALESCE(SUM((r.metrics -> 'features' ->> 'resumesGenerated')::int), 0)::int AS resumes,
               COALESCE(SUM((r.metrics -> 'features' ->> 'gapsAnswered')::int), 0)::int AS gaps,
               percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY (r.metrics -> 'features' ->> 'aiTokens')::int
               ) AS median_tokens
        ${scope(from, to)} AND r.metrics -> 'features' IS NOT NULL`),
    ]);

    const feature = features[0]!;
    return {
      from,
      to,
      activeInstalls: anonymous(active[0]!.installs, active[0]!.installs),
      activeByDay: activeByDay.map((row) => ({
        day: row.day,
        installs: anonymous(row.installs, row.installs),
      })),
      activeByWeek: activeByWeek.map((row) => ({
        week: row.week,
        installs: anonymous(row.installs, row.installs),
      })),
      applicationsByWeek: applicationsByWeek.map((row) => ({
        week: row.week,
        created: anonymous(row.created, row.installs),
      })),
      sources,
      positionCategories,
      funnel,
      workMode,
      countries,
      outputLanguages,
      positionTitles,
      features: {
        installs: anonymous(feature.installs, feature.installs),
        resumesGenerated: anonymous(feature.resumes, feature.installs),
        gapsAnswered: anonymous(feature.gaps, feature.installs),
        medianDailyAiTokens:
          feature.median_tokens === null
            ? null
            : anonymous(Math.round(Number(feature.median_tokens)), feature.installs),
      },
    };
  }

  /** `{ key: total }` of a `{ key: count }` metric, only for the keys `K` installations reported. */
  private async countsOf(map: SQL, from: string, to: string): Promise<Record<string, number>> {
    const rows = await this.rows<{ key: string; total: number }>(sql`
      SELECT kv.key AS key, SUM(kv.value::int)::int AS total
      ${REPORTS}
      CROSS JOIN LATERAL jsonb_each_text(COALESCE(${map}, '{}'::jsonb)) AS kv
      ${inPeriod(from, to)}
      GROUP BY kv.key
      HAVING COUNT(DISTINCT r.install_id) >= ${K}
      ORDER BY total DESC, kv.key`);
    return Object.fromEntries(rows.map((row) => [row.key, row.total]));
  }

  private async rows<T>(query: SQL): Promise<T[]> {
    return rowsOf<T>(await this.deps.db.execute(query));
  }
}
