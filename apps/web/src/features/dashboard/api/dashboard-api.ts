import { type DashboardPeriod, DashboardSummarySchema } from '@careerly/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiGet } from '../../../shared/api/client';

/** Metrics of the applications for the home screen (roadmap 8.1, RF-DASH-01, RF-DASH-02). */
export function useDashboardSummary(period: DashboardPeriod) {
  return useQuery({
    queryKey: ['dashboard', 'summary', period],
    queryFn: () => apiGet(`/dashboard/summary?period=${period}`, DashboardSummarySchema),
    // Changing the period keeps the numbers on screen until the new ones arrive.
    placeholderData: keepPreviousData,
  });
}
