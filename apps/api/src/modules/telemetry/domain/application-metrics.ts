import {
  type ApplicationStatus,
  type JobSourceSchema,
  KNOWN_JOB_PORTALS,
  type RoleCategory,
  type Seniority,
  TELEMETRY_TITLE_MAX_LENGTH,
  type TelemetryMetricsV1,
  type TelemetryWorkMode,
} from '@careerly/contracts';
import type { z } from 'zod';

/*
 * The application metrics of one day (RF-TEL-03b–g, roadmap 7.7), from the applications created that day and the
 * changes of state recorded that day. Pure. Only enums, counts, a portal domain and the trimmed title: never the
 * company, the full URL, contacts, notes or salaries (RN-18).
 */

type JobSource = z.infer<typeof JobSourceSchema>;

/** What telemetry may know of an application created that day, through its job description. */
export interface CreatedApplicationFacts {
  url: string | null;
  title: string | null;
  /** `null` while its job description was not analyzed. */
  analysis: {
    roleCategory: RoleCategory;
    seniority: Seniority;
    workMode: TelemetryWorkMode;
    country: string | null;
  } | null;
}

export interface ApplicationsDay {
  created: CreatedApplicationFacts[];
  /** Changes of state, by the state reached. */
  transitions: Partial<Record<ApplicationStatus, number>>;
}

/**
 * The portal of a job description URL (RF-TEL-03c): its domain when it is a known portal or one of its
 * subdomains (`ar.linkedin.com`, `boards.greenhouse.io`), `other` for any other site, `unknown` without a URL.
 * Only the domain of the list leaves the computer, never the URL.
 */
export function jobSource(url: string | null): JobSource {
  if (!url) return 'unknown';
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
  return (
    KNOWN_JOB_PORTALS.find((portal) => host === portal || host.endsWith(`.${portal}`)) ?? 'other'
  );
}

/** The title as reported (RF-TEL-03e): spaces collapsed and cut to 80 characters; `null` when empty. */
export function reportedTitle(title: string | null): string | null {
  const clean = title?.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return [...clean].slice(0, TELEMETRY_TITLE_MAX_LENGTH).join('').trim();
}

/** At most this many titles per day, as the schema allows. */
const MAX_TITLES = 50;

const tally = <K extends string>(keys: K[]): Partial<Record<K, number>> => {
  const counts: Partial<Record<K, number>> = {};
  for (const key of keys) counts[key] = (counts[key] ?? 0) + 1;
  return counts;
};

const orNothing = <T extends object>(value: T, metrics: TelemetryMetricsV1): TelemetryMetricsV1 =>
  Object.keys(value).length > 0 ? metrics : {};

/** Applications created (RF-TEL-03b). A day without any leaves the metric out. */
export const createdMetric = ({ created }: ApplicationsDay): TelemetryMetricsV1 =>
  created.length > 0 ? { applications: { created: created.length } } : {};

/** Where the job descriptions came from (RF-TEL-03c). */
export function sourcesMetric({ created }: ApplicationsDay): TelemetryMetricsV1 {
  const sources = tally(created.map((facts) => jobSource(facts.url)));
  return orNothing(sources, { sources });
}

/** Category and seniority of the positions, from their analysis (RF-TEL-03d). */
export function positionCategoriesMetric({ created }: ApplicationsDay): TelemetryMetricsV1 {
  const positionCategories = tally(
    created.flatMap(({ analysis }) =>
      analysis ? [`${analysis.roleCategory}:${analysis.seniority}`] : [],
    ),
  );
  return orNothing(positionCategories, { positionCategories });
}

/** The trimmed titles of the positions (RF-TEL-03e). */
export function positionTitlesMetric({ created }: ApplicationsDay): TelemetryMetricsV1 {
  const positionTitles = created
    .flatMap((facts) => reportedTitle(facts.title) ?? [])
    .slice(0, MAX_TITLES);
  return positionTitles.length > 0 ? { positionTitles } : {};
}

/** Changes of state by the state reached (RF-TEL-03f). */
export function funnelMetric({ transitions }: ApplicationsDay): TelemetryMetricsV1 {
  return orNothing(transitions, { funnel: { ...transitions } });
}

/**
 * Work mode and country of the positions (RF-TEL-03g). Without an analysis the work mode is `unknown`; a country
 * that is not an ISO 3166-1 alpha-2 code is left out.
 */
export function workModeAndCountryMetric({ created }: ApplicationsDay): TelemetryMetricsV1 {
  if (created.length === 0) return {};
  const workMode = tally(created.map(({ analysis }) => analysis?.workMode ?? 'unknown'));
  const countries = tally(
    created.flatMap(({ analysis }) => {
      const code = analysis?.country?.trim().toUpperCase();
      return code && /^[A-Z]{2}$/.test(code) ? [code] : [];
    }),
  );
  return Object.keys(countries).length > 0 ? { workMode, countries } : { workMode };
}
