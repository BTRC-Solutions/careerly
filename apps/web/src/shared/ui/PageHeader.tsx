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
    <header className="flex items-start justify-between gap-6">
      <div>
        <h1 className="text-page-title text-indigo-navy">{title}</h1>
        {description && <p className="mt-2 text-sm text-steel-text">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
