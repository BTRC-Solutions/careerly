import type { ReactNode } from 'react';

/** Title and optional description at the top of every screen. */
export function PageHeader({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return (
    <header>
      <h1 className="text-page-title text-indigo-navy">{title}</h1>
      {description && <p className="mt-2 text-sm text-steel-text">{description}</p>}
    </header>
  );
}
