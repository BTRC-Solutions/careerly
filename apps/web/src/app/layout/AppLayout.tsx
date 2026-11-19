import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { OfflineBanner } from '../../features/ai/components/OfflineBanner';
import { OnboardingGate } from '../../features/onboarding/components/OnboardingGate';
import { UiLanguageSync } from '../../features/settings/components/UiLanguageSync';
import logo from '../../shared/brand/careerly-horizontal-color.svg';
import { cn } from '../../shared/lib/cn';

const NAV_ITEMS = [
  { to: '/', labelKey: 'nav.home', end: true },
  { to: '/profile', labelKey: 'nav.profile', end: false },
  { to: '/job-postings', labelKey: 'nav.jobPostings', end: false },
  { to: '/applications', labelKey: 'nav.applications', end: false },
  { to: '/settings', labelKey: 'nav.settings', end: true },
] as const;

export function AppLayout() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full">
      <UiLanguageSync />
      <OnboardingGate />
      <aside className="flex w-60 shrink-0 flex-col border-r border-silver-lining bg-pure-white px-4 py-6">
        <img src={logo} alt="Careerly" className="h-8 w-auto self-start px-3" />
        <nav aria-label={t('nav.label')} className="mt-8">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-control px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-cloud-canvas text-indigo-navy'
                        : 'text-steel-text hover:bg-cloud-canvas hover:text-slate-ink',
                    )
                  }
                >
                  {t(item.labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <main className="flex-1 overflow-y-auto px-10 py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
