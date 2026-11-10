import type { Profile } from '@careerly/contracts';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { cn } from '../../../shared/lib/cn';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { InlineError } from '../../../shared/ui/InlineError';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { useProfile } from '../api/profile-api';

const TABS = [
  { to: 'personal', labelKey: 'profile.tabs.personal' },
  { to: 'experience', labelKey: 'profile.tabs.experience' },
  { to: 'projects', labelKey: 'profile.tabs.projects' },
  { to: 'education', labelKey: 'profile.tabs.education' },
  { to: 'languages', labelKey: 'profile.tabs.languages' },
] as const;

/** Master profile screen: header + section tabs; each section is a nested route. */
export function ProfileLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-[70rem] flex-col gap-6">
      <PageHeader title={t('profile.title')} description={t('profile.subtitle')} />
      <nav aria-label={t('profile.tabs.label')} className="border-b border-silver-lining">
        <ul className="-mb-px flex gap-1">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    'block border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-indigo-navy text-indigo-navy'
                      : 'border-transparent text-steel-text hover:text-slate-ink',
                  )
                }
              >
                {t(tab.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}

/** Loads the profile once for every section and handles the loading and error states. */
export function WithProfile({ children }: { children: (profile: Profile) => ReactNode }) {
  const { t } = useTranslation();
  const profile = useProfile();

  if (profile.isPending) {
    return (
      <p role="status" className="text-sm text-steel-text">
        {t('profile.loading')}
      </p>
    );
  }
  if (profile.isError) {
    return (
      <Card>
        <InlineError>{t('profile.loadError', { message: profile.error.message })}</InlineError>
        <Button variant="secondary" className="mt-4" onClick={() => void profile.refetch()}>
          {t('common.retry')}
        </Button>
      </Card>
    );
  }
  return <>{children(profile.data)}</>;
}

/** Card with a title row and optional actions, used by every profile section. */
export function SectionCard({
  title,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-section-title text-indigo-navy">{title}</h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}

/** Empty state inside a section. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-control border border-dashed border-silver-lining px-4 py-6 text-center text-sm text-steel-text">
      {children}
    </p>
  );
}
