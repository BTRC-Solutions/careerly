import type { TelemetryMetricId, TelemetryMetricsV1 } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { ApplicationsUsageService } from '../../applications/index.js';
import { JobAnalysisService, JobPostingsService } from '../../job-postings/index.js';
import { TelemetryCollector } from '../application/telemetry.ports.js';
import {
  type ApplicationsDay,
  type CreatedApplicationFacts,
  createdMetric,
  funnelMetric,
  positionCategoriesMetric,
  positionTitlesMetric,
  sourcesMetric,
  workModeAndCountryMetric,
} from '../domain/application-metrics.js';
import { dayRange } from '../domain/telemetry-report.js';

/**
 * The applications of a day, through the public services of `applications` and `job-postings`. Of each job
 * description it keeps only the URL (to find the portal), the title (to trim it) and the analysis enums; the
 * company and everything else never get here.
 */
@Injectable()
export class ApplicationsDayReader {
  constructor(
    private readonly applications: ApplicationsUsageService,
    private readonly postings: JobPostingsService,
    private readonly analyses: JobAnalysisService,
  ) {}

  async read(day: string): Promise<ApplicationsDay> {
    const { from, to } = dayRange(day);
    const usage = await this.applications.usageBetween(from, to);
    const created = await Promise.all(usage.createdFor.map((id) => this.facts(id)));
    return { created, transitions: usage.transitions };
  }

  private async facts(jobPostingId: string): Promise<CreatedApplicationFacts> {
    const [posting, { analysis }] = await Promise.all([
      this.postings.get(jobPostingId),
      this.analyses.state(jobPostingId),
    ]);
    return {
      url: posting.url,
      title: posting.title,
      analysis: analysis && {
        roleCategory: analysis.roleCategory,
        seniority: analysis.seniority,
        workMode: analysis.workMode,
        country: analysis.country,
      },
    };
  }
}

/** One collector per application metric (RF-TEL-03b–g), each enabled on its own (RF-TEL-03). */
@Injectable()
abstract class ApplicationsCollector extends TelemetryCollector {
  constructor(private readonly reader: ApplicationsDayReader) {
    super();
  }

  protected abstract readonly pick: (day: ApplicationsDay) => TelemetryMetricsV1;

  async collect(day: string): Promise<TelemetryMetricsV1> {
    return this.pick(await this.reader.read(day));
  }
}

const collector = (
  metric: TelemetryMetricId,
  pick: (day: ApplicationsDay) => TelemetryMetricsV1,
) => {
  @Injectable()
  class Collector extends ApplicationsCollector {
    readonly metric = metric;
    protected readonly pick = pick;
  }
  return Collector;
};

export const ApplicationsCreatedCollector = collector('applications', createdMetric);
export const JobSourcesCollector = collector('sources', sourcesMetric);
export const PositionCategoriesCollector = collector(
  'positionCategories',
  positionCategoriesMetric,
);
export const PositionTitlesCollector = collector('positionTitles', positionTitlesMetric);
export const FunnelCollector = collector('funnel', funnelMetric);
export const WorkModeAndCountryCollector = collector(
  'workModeAndCountry',
  workModeAndCountryMetric,
);

export const APPLICATION_COLLECTORS = [
  ApplicationsCreatedCollector,
  JobSourcesCollector,
  PositionCategoriesCollector,
  PositionTitlesCollector,
  FunnelCollector,
  WorkModeAndCountryCollector,
];
