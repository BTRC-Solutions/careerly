import { type ApplicationSummary, ApplicationStatusSchema } from '@careerly/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../../../shared/ui/Button';
import { Checkbox, Field, Input, Select } from '../../../shared/ui/form';
import { formatDay } from '../lib/dates';
import {
  type ApplicationFilters,
  companiesOf,
  filterApplications,
  NO_FILTERS,
} from '../lib/filters';
import { StatusTag } from './ApplicationCard';
import { useMoveFlow } from './MoveFlow';
import { MoveMenu } from './MoveMenu';

/**
 * Table of the applications (roadmap 7.4, RF-APP-06), most recently changed first, with filters by state,
 * company and the day it was sent, and a search in the job title and company.
 */
export function ApplicationsTable({ applications }: { applications: ApplicationSummary[] }) {
  const { t, i18n } = useTranslation();
  const flow = useMoveFlow();
  const [filters, setFilters] = useState<ApplicationFilters>(NO_FILTERS);
  const shown = filterApplications(applications, filters);
  const set = (changes: Partial<ApplicationFilters>) => setFilters({ ...filters, ...changes });
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-card border border-silver-lining bg-pure-white p-4">
        <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <Field label={t('applications.table.search')}>
            {(control) => (
              <Input
                {...control}
                type="search"
                value={filters.query}
                placeholder={t('applications.table.searchPlaceholder')}
                onChange={(event) => set({ query: event.target.value })}
              />
            )}
          </Field>
          <Field label={t('applications.table.company')}>
            {(control) => (
              <Select
                {...control}
                value={filters.company}
                onChange={(event) => set({ company: event.target.value })}
              >
                <option value="">{t('applications.table.anyCompany')}</option>
                {companiesOf(applications).map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('applications.table.sentFrom')}>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={filters.sentFrom}
                onChange={(event) => set({ sentFrom: event.target.value })}
              />
            )}
          </Field>
          <Field label={t('applications.table.sentTo')}>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={filters.sentTo}
                onChange={(event) => set({ sentTo: event.target.value })}
              />
            )}
          </Field>
        </div>
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <legend className="mb-2 text-sm font-medium text-slate-ink">
            {t('applications.table.statuses')}
          </legend>
          {ApplicationStatusSchema.options.map((status) => (
            <Checkbox
              key={status}
              label={t(`applications.statuses.${status}`)}
              checked={filters.statuses.includes(status)}
              onChange={(event) =>
                set({
                  statuses: event.target.checked
                    ? [...filters.statuses, status]
                    : filters.statuses.filter((s) => s !== status),
                })
              }
            />
          ))}
        </fieldset>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setFilters(NO_FILTERS)}
          >
            {t('applications.table.clear')}
          </Button>
        )}
      </div>

      <p role="status" className="text-sm text-steel-text">
        {flow.message ?? t('applications.table.count', { count: shown.length })}
      </p>

      {shown.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-silver-lining bg-pure-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('applications.table.caption')}</caption>
            <thead className="border-b border-silver-lining text-xs text-steel-text">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('applications.table.columns.job')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('applications.table.columns.company')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('applications.table.columns.status')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('applications.table.columns.sent')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('applications.table.columns.updated')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  <span className="sr-only">{t('applications.table.columns.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-silver-lining">
              {shown.map((application) => (
                <tr key={application.id}>
                  <td className="px-4 py-3">
                    <Link
                      to={`/applications/${application.id}`}
                      className="font-medium text-indigo-navy hover:underline"
                    >
                      {application.title ?? t('jobPostings.untitled')}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-ink">{application.company ?? '—'}</td>
                  <td className="px-4 py-3">
                    <StatusTag status={application.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-ink">
                    {application.appliedAt ? formatDay(application.appliedAt, i18n.language) : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-steel-text">
                    {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
                      new Date(application.updatedAt),
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <MoveMenu
                      application={application}
                      onMove={(to) => flow.move(application, to)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {flow.dialogs}
    </div>
  );
}
