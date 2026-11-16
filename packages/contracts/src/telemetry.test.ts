import { describe, expect, it } from 'vitest';
import {
  TELEMETRY_METRIC_SINCE,
  TelemetryMetricIdSchema,
  TelemetryReportV1Schema,
  UpdateTelemetrySettingsRequestSchema,
} from './telemetry.js';

const fullReport = {
  schemaVersion: 1,
  installId: '9f1c2e4a-2b3c-4d5e-8f90-123456789abc',
  day: '2026-11-16',
  appVersion: '0.1.0',
  metrics: {
    activeUsage: { active: true },
    applications: { created: 3 },
    sources: { 'linkedin.com': 2, other: 1 },
    positionCategories: { 'backend:senior': 2, 'fullstack:semi-senior': 1 },
    positionTitles: ['Senior Backend Engineer'],
    funnel: { SCREENING: 1, REJECTED: 1 },
    workMode: { remote: 2, hybrid: 1 },
    countries: { AR: 1, ES: 2 },
    features: { resumesGenerated: 2, outputLanguages: { en: 2 }, gapsAnswered: 5, aiTokens: 41000 },
  },
};

describe('TelemetryReportV1Schema (RN-18: closed schema)', () => {
  it('accepts the documented example and a report with only some metrics', () => {
    expect(TelemetryReportV1Schema.parse(fullReport)).toEqual(fullReport);
    expect(
      TelemetryReportV1Schema.safeParse({
        ...fullReport,
        metrics: { activeUsage: { active: true } },
      }).success,
    ).toBe(true);
  });

  it.each([
    ['an unknown top-level field', { ...fullReport, email: 'me@example.com' }],
    ['an unknown metric', { ...fullReport, metrics: { ...fullReport.metrics, resumeText: 'x' } }],
    [
      'an unknown field inside a metric',
      { ...fullReport, metrics: { applications: { created: 1, companies: ['Acme'] } } },
    ],
    [
      'a source outside the portal list',
      { ...fullReport, metrics: { sources: { 'acme.com': 1 } } },
    ],
    ['a full URL as source', { ...fullReport, metrics: { sources: { 'https://x.io/jobs/1': 1 } } }],
    [
      'an unknown category',
      { ...fullReport, metrics: { positionCategories: { 'chef:senior': 1 } } },
    ],
    ['a free-text funnel status', { ...fullReport, metrics: { funnel: { 'called back': 1 } } }],
    ['a country that is not ISO alpha-2', { ...fullReport, metrics: { countries: { Spain: 1 } } }],
    [
      'a title over 80 characters',
      { ...fullReport, metrics: { positionTitles: ['x'.repeat(81)] } },
    ],
    ['a non-UUID install id', { ...fullReport, installId: 'user-42' }],
    ['a negative count', { ...fullReport, metrics: { applications: { created: -1 } } }],
  ])('rejects %s', (_case, report) => {
    expect(TelemetryReportV1Schema.safeParse(report).success).toBe(false);
  });
});

describe('telemetry metric catalog', () => {
  it('declares the consent version of every metric', () => {
    expect(Object.keys(TELEMETRY_METRIC_SINCE).sort()).toEqual(
      [...TelemetryMetricIdSchema.options].sort(),
    );
  });
});

describe('UpdateTelemetrySettingsRequestSchema', () => {
  it('accepts a decision, metric toggles or both (except REJECT with metrics)', () => {
    expect(UpdateTelemetrySettingsRequestSchema.safeParse({ decision: 'REJECT' }).success).toBe(
      true,
    );
    expect(
      UpdateTelemetrySettingsRequestSchema.safeParse({
        decision: 'ACCEPT',
        metrics: { positionTitles: false },
      }).success,
    ).toBe(true);
    expect(
      UpdateTelemetrySettingsRequestSchema.safeParse({ metrics: { funnel: true } }).success,
    ).toBe(true);
    expect(UpdateTelemetrySettingsRequestSchema.safeParse({}).success).toBe(false);
    expect(
      UpdateTelemetrySettingsRequestSchema.safeParse({
        decision: 'REJECT',
        metrics: { funnel: true },
      }).success,
    ).toBe(false);
    expect(UpdateTelemetrySettingsRequestSchema.safeParse({ metrics: { cv: true } }).success).toBe(
      false,
    );
  });
});
