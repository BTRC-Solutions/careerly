import { TelemetryMetricsV1Schema } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import {
  type ApplicationsDay,
  createdMetric,
  funnelMetric,
  jobSource,
  positionCategoriesMetric,
  positionTitlesMetric,
  reportedTitle,
  sourcesMetric,
  workModeAndCountryMetric,
} from './application-metrics.js';

/* The application metrics of a day (roadmap 7.7, RF-TEL-03b–g): only enums, counts, portals and trimmed titles. */

const analyzed = (
  workMode: 'remote' | 'hybrid' | 'onsite' | 'unknown',
  country: string | null,
) => ({ roleCategory: 'backend' as const, seniority: 'senior' as const, workMode, country });

describe('jobSource', () => {
  it('reports a known portal or one of its subdomains, and nothing else of the URL', () => {
    expect(jobSource('https://www.linkedin.com/jobs/view/1?trk=x')).toBe('linkedin.com');
    expect(jobSource('https://ar.linkedin.com/jobs/view/1')).toBe('linkedin.com');
    expect(jobSource('https://boards.greenhouse.io/acme/jobs/1')).toBe('greenhouse.io');
    expect(jobSource('https://JOBS.LEVER.CO/acme')).toBe('lever.co');
  });

  it('is `other` for any other site, even one that only looks like a portal', () => {
    expect(jobSource('https://careers.acme.com/1')).toBe('other');
    expect(jobSource('https://notlinkedin.com/jobs')).toBe('other');
    expect(jobSource('https://linkedin.com.evil.example/jobs')).toBe('other');
  });

  it('is `unknown` without a URL or with one that cannot be read', () => {
    expect(jobSource(null)).toBe('unknown');
    expect(jobSource('')).toBe('unknown');
    expect(jobSource('not a url')).toBe('unknown');
  });
});

describe('reportedTitle', () => {
  it('collapses spaces and cuts to 80 characters', () => {
    expect(reportedTitle('  Senior\n  Backend   Engineer ')).toBe('Senior Backend Engineer');
    expect(reportedTitle('a'.repeat(100))).toHaveLength(80);
    expect(reportedTitle(`${'ñ'.repeat(79)}😀😀`)).toBe(`${'ñ'.repeat(79)}😀`);
  });

  it('is `null` when there is no title', () => {
    expect(reportedTitle(null)).toBeNull();
    expect(reportedTitle('   ')).toBeNull();
  });
});

describe('the metrics of a day', () => {
  const day: ApplicationsDay = {
    created: [
      {
        url: 'https://www.linkedin.com/jobs/1',
        title: 'Backend Engineer',
        analysis: analyzed('remote', 'ar'),
      },
      { url: null, title: null, analysis: null },
      // Well formed, but not a country in use.
      { url: null, title: null, analysis: analyzed('remote', 'XX') },
      {
        url: 'https://acme.com/1',
        title: 'Platform Engineer',
        analysis: analyzed('onsite', 'XYZ'),
      },
    ],
    transitions: { APPLIED: 2, REJECTED: 1 },
  };

  it('counts and groups the applications created that day', () => {
    const metrics = {
      ...createdMetric(day),
      ...sourcesMetric(day),
      ...positionCategoriesMetric(day),
      ...positionTitlesMetric(day),
      ...funnelMetric(day),
      ...workModeAndCountryMetric(day),
    };
    expect(metrics).toEqual({
      applications: { created: 4 },
      sources: { 'linkedin.com': 1, unknown: 2, other: 1 },
      positionCategories: { 'backend:senior': 3 },
      positionTitles: ['Backend Engineer', 'Platform Engineer'],
      funnel: { APPLIED: 2, REJECTED: 1 },
      workMode: { remote: 2, unknown: 1, onsite: 1 },
      countries: { AR: 1 },
    });
    expect(TelemetryMetricsV1Schema.parse(metrics)).toEqual(metrics);
  });

  it('leaves every metric out on a day without applications or changes', () => {
    const quiet: ApplicationsDay = { created: [], transitions: {} };
    for (const metric of [
      createdMetric,
      sourcesMetric,
      positionCategoriesMetric,
      positionTitlesMetric,
      funnelMetric,
      workModeAndCountryMetric,
    ]) {
      expect(metric(quiet)).toEqual({});
    }
  });

  it('reports at most 50 titles', () => {
    const many: ApplicationsDay = {
      created: Array.from({ length: 60 }, (_, i) => ({
        url: null,
        title: `Role ${i}`,
        analysis: null,
      })),
      transitions: {},
    };
    expect(positionTitlesMetric(many).positionTitles).toHaveLength(50);
  });
});
