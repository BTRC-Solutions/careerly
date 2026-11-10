import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { cn } from '../../shared/lib/cn';

const NAV_ITEMS = [{ to: '/', labelKey: 'nav.home' }] as const;

export function AppLayout() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-silver-lining bg-pure-white px-4 py-6">
        <p className="px-3 text-xl font-semibold tracking-tight text-indigo-navy">Careerly</p>
        <nav aria-label={t('nav.label')} className="mt-8">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    cn(
                      'block rounded-control px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-cloud-canvas text-indigo-navy'
                        : 'text-steel hover:bg-cloud-canvas hover:text-slate-ink',
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
      <main className="flex-1 overflow-y-auto px-10 py-10">
        <Outlet />
      </main>
    </div>
  );
}
