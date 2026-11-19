import type { ApplicationStatus, ApplicationSummary } from '@careerly/contracts';
import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cn } from '../../../shared/lib/cn';
import { Tag } from '../../../shared/ui/Tag';
import { formatDay } from '../lib/dates';
import { BOARD_COLUMNS, type BoardColumn, columnOf } from '../lib/moves';
import { useMoveFlow } from './MoveFlow';
import { MoveMenu } from './MoveMenu';

/**
 * Kanban of the applications (roadmap 7.4, RF-APP-06): one column per active state, "no answer", and the
 * closed ones together, collapsed. A card moves by dragging it (also with the keyboard: space to pick it up,
 * left and right arrows to go from column to column, space to drop) or from its "Move to…" menu.
 *
 * While dragging, a copy of the card is drawn over the board (`DragOverlay`): the board scrolls sideways, and
 * the card itself, inside it, would scroll along and never reach another column.
 */
export function ApplicationsBoard({ applications }: { applications: ApplicationSummary[] }) {
  const { t } = useTranslation();
  const flow = useMoveFlow();
  const [closedOpen, setClosedOpen] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const byId = new Map(applications.map((a) => [a.id, a]));
  const [coordinateGetter] = useState(columnByColumn);
  const sensors = useSensors(
    // A small distance so a click on the card's link is not taken for a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );
  const titleOf = (id: string | number) => byId.get(String(id))?.title ?? t('jobPostings.untitled');
  const columnName = (id: string | number | undefined) =>
    id ? t(`applications.board.columns.${String(id)}`) : '';
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t('applications.board.announce.start', { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t('applications.board.announce.over', {
            title: titleOf(active.id),
            column: columnName(over.id),
          })
        : t('applications.board.announce.outside', { title: titleOf(active.id) }),
    onDragEnd: ({ active, over }) =>
      over
        ? t('applications.board.announce.end', {
            title: titleOf(active.id),
            column: columnName(over.id),
          })
        : t('applications.board.announce.cancel', { title: titleOf(active.id) }),
    onDragCancel: ({ active }) =>
      t('applications.board.announce.cancel', { title: titleOf(active.id) }),
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const application = byId.get(String(active.id));
    if (!application || !over) return;
    const column = over.id as BoardColumn;
    if (column === columnOf(application.status)) return;
    flow.move(application, column);
  };

  return (
    <>
      <p role="status" className="min-h-5 text-sm text-slate-ink">
        {flow.message}
      </p>
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setDragging(String(active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t('applications.board.instructions') },
        }}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {BOARD_COLUMNS.map((column) => {
            const cards = applications.filter((a) => columnOf(a.status) === column);
            const collapsed = column === 'CLOSED' && !closedOpen;
            return (
              <Column
                key={column}
                column={column}
                count={cards.length}
                collapsed={collapsed}
                onToggle={column === 'CLOSED' ? () => setClosedOpen(!closedOpen) : undefined}
              >
                {!collapsed &&
                  cards.map((application) => (
                    <Card
                      key={application.id}
                      application={application}
                      onMove={(to) => flow.move(application, to)}
                    />
                  ))}
              </Column>
            );
          })}
        </div>
        {/* Without the drop animation: a dialog may open right on dropping, and the copy would stay over it. */}
        <DragOverlay dropAnimation={null}>
          {dragging && byId.get(dragging) ? (
            <CardPreview application={byId.get(dragging)!} />
          ) : null}
        </DragOverlay>
      </DndContext>
      {flow.dialogs}
    </>
  );
}

function Column({
  column,
  count,
  collapsed,
  onToggle,
  children,
}: {
  column: BoardColumn;
  count: number;
  collapsed: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: column });
  const name = t(`applications.board.columns.${column}`);
  return (
    <section
      ref={setNodeRef}
      aria-label={name}
      className={cn(
        'flex w-60 shrink-0 flex-col gap-2 rounded-card border border-silver-lining bg-cloud-canvas p-2 transition-colors',
        isOver && 'border-indigo-navy',
      )}
    >
      <header className="flex items-center justify-between gap-2 px-1 py-1">
        <h2 className="text-sm font-medium text-indigo-navy">{name}</h2>
        {onToggle ? (
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={onToggle}
            className="rounded-control px-2 py-0.5 text-xs text-steel-text hover:bg-pure-white hover:text-indigo-navy"
          >
            {collapsed
              ? t('applications.board.showClosed', { count })
              : t('applications.board.hideClosed')}
          </button>
        ) : (
          <span className="text-xs text-steel-text">{count}</span>
        )}
      </header>
      <ul className="flex min-h-16 flex-col gap-2">{children}</ul>
    </section>
  );
}

function Card({
  application,
  onMove,
}: {
  application: ApplicationSummary;
  onMove: (to: ApplicationStatus) => void;
}) {
  const { t, i18n } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: application.id,
    data: { column: columnOf(application.status) },
  });
  const title = application.title ?? t('jobPostings.untitled');

  return (
    <li
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-1 rounded-control border border-silver-lining bg-pure-white p-3 shadow-sm',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/applications/${application.id}`}
          className="min-w-0 text-sm font-medium text-indigo-navy hover:underline"
        >
          {title}
        </Link>
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label={t('applications.board.drag', { title })}
          className="shrink-0 cursor-grab rounded-control px-1 text-steel-text hover:bg-cloud-canvas hover:text-indigo-navy active:cursor-grabbing"
        >
          <GripIcon />
        </button>
      </div>
      {application.company && <p className="text-xs text-slate-ink">{application.company}</p>}
      <p className="text-xs text-steel-text">
        {application.appliedAt
          ? t('applications.sentOn', { date: formatDay(application.appliedAt, i18n.language) })
          : t('applications.notSent')}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        {columnOf(application.status) === 'CLOSED' ? (
          <Tag>{t(`applications.statuses.${application.status}`)}</Tag>
        ) : (
          <span />
        )}
        <MoveMenu application={application} onMove={onMove} />
      </div>
    </li>
  );
}

/** What is dragged: the job and company, over the board. */
function CardPreview({ application }: { application: ApplicationSummary }) {
  const { t } = useTranslation();
  return (
    <div className="w-56 rounded-control border border-indigo-navy bg-pure-white p-3 shadow-md">
      <p className="text-sm font-medium text-indigo-navy">
        {application.title ?? t('jobPostings.untitled')}
      </p>
      {application.company && <p className="text-xs text-slate-ink">{application.company}</p>}
    </div>
  );
}

/**
 * With the keyboard, left and right go to the previous or next column (not 25 px at a time); up and down do
 * nothing, since the order inside a column is not chosen. It remembers the column it sent the card to, since
 * dnd-kit learns what the card is over only after rendering, and a second arrow may come before that; and it
 * measures that column when the key is pressed, because the board may have scrolled.
 */
function columnByColumn(): KeyboardCoordinateGetter {
  let drag: { id: UniqueIdentifier; column: BoardColumn } | null = null;
  return (event, { active, context, currentCoordinates }) => {
    const step = event.code === 'ArrowRight' ? 1 : event.code === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return undefined;
    if (drag?.id !== active) {
      // A new drag starts in the card's own column (each card says which, in its drag data).
      const own = context.active?.data.current?.column as BoardColumn | undefined;
      drag = own ? { id: active, column: own } : null;
    }
    if (!drag) return undefined;
    const next = BOARD_COLUMNS[BOARD_COLUMNS.indexOf(drag.column) + step];
    const node = next ? context.droppableContainers.get(next)?.node.current : null;
    if (!next || !node) return undefined;
    drag.column = next;
    return { x: node.getBoundingClientRect().left + 8, y: currentCoordinates.y };
  };
}

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true">
      {[8, 16].flatMap((x) =>
        [6, 12, 18].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.5} />),
      )}
    </svg>
  );
}
