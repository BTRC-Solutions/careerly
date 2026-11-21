import type { ReactNode } from 'react';

/** Title and optional description at the top of every screen, with optional actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    // In narrow windows (from 1024 px, RNF-11) the actions go below rather than squeezing the description.
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-[20rem] flex-1">
        <h1 className="text-page-title text-indigo-navy">{title}</h1>
        {description && <p className="mt-2 text-sm text-steel-text">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
