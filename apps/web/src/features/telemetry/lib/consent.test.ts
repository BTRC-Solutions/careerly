import type { TelemetrySettingsResponse } from '@careerly/contracts';
import { describe, expect, it } from 'vitest';
import { acceptRequest, initialChoices, metricsToAsk } from './consent';

const settings = (newIds: string[]): TelemetrySettingsResponse =>
  ({
    status: 'ACCEPTED',
    consentVersion: 1,
    promptRequired: newIds.length > 0,
    installId: null,
    metrics: [
      { id: 'activeUsage', enabled: true, isNew: newIds.includes('activeUsage') },
      { id: 'funnel', enabled: false, isNew: newIds.includes('funnel') },
    ],
  }) as TelemetrySettingsResponse;

describe('telemetry consent window', () => {
  it('asks only about new metrics, all checked by default', () => {
    const ids = metricsToAsk(settings(['funnel']));
    expect(ids).toEqual(['funnel']);
    expect(initialChoices(ids)).toEqual({ funnel: true });
  });

  it('"Aceptar" sends the boxes as the user left them', () => {
    expect(acceptRequest({ activeUsage: true, funnel: false })).toEqual({
      decision: 'ACCEPT',
      metrics: { activeUsage: true, funnel: false },
    });
  });

  it('"Aceptar" with every box unchecked is a rejection (no anonymous id)', () => {
    expect(acceptRequest({ activeUsage: false, funnel: false })).toEqual({ decision: 'REJECT' });
  });
});
