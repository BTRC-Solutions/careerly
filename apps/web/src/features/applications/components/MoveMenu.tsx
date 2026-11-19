import type { ApplicationStatus, ApplicationSummary } from '@careerly/contracts';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../shared/lib/cn';
import { moveTargets } from '../lib/moves';

/**
 * "Move to…": the states the application can go to from where it is (RF-APP-03), as a menu that works with the
 * keyboard (arrows, Enter, Escape). The flow then asks for what the move needs.
 */
export function MoveMenu({
  application,
  onMove,
  className,
}: {
  application: Pick<ApplicationSummary, 'status' | 'ghostedFrom' | 'appliedAt' | 'title'>;
  onMove: (to: ApplicationStatus) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const title = application.title ?? t('jobPostings.untitled');
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t('applications.board.moveMenu', { title })}
        className={cn(
          'rounded-control px-2 py-1 text-xs font-medium text-steel-text hover:bg-cloud-canvas hover:text-indigo-navy data-[state=open]:bg-cloud-canvas',
          className,
        )}
      >
        {t('applications.board.moveTo')}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-44 rounded-control border border-silver-lining bg-pure-white p-1 shadow-md"
        >
          {moveTargets(application).map((to) => (
            <DropdownMenu.Item
              key={to}
              onSelect={() => onMove(to)}
              className="cursor-pointer rounded-[6px] px-2 py-1.5 text-sm text-slate-ink outline-none data-[highlighted]:bg-cloud-canvas data-[highlighted]:text-indigo-navy"
            >
              {t(`applications.statuses.${to}`)}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
