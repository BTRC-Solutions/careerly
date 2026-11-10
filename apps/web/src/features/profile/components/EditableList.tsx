import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { Dialog } from '../../../shared/ui/Dialog';
import { PencilIcon, PlusIcon, TrashIcon } from '../../../shared/ui/icons';
import { EmptyState, SectionCard } from './ProfileLayout';

interface EditableListProps<T extends { id: string }> {
  title: string;
  addLabel: string;
  emptyLabel: string;
  items: T[];
  /** Main and secondary line of each row. */
  describe: (item: T) => { primary: ReactNode; secondary?: ReactNode; aside?: ReactNode };
  /** Accessible name of an item, used in button labels and the delete confirmation. */
  nameOf: (item: T) => string;
  /** Form for creating (`item` undefined) or editing; call `close` after saving. */
  renderForm: (props: { item?: T; close: () => void }) => ReactNode;
  onDelete: (item: T) => Promise<unknown>;
}

/**
 * Flat list section (education, certifications, languages): rows with edit and delete,
 * create and edit in a dialog, delete with confirmation.
 */
export function EditableList<T extends { id: string }>({
  title,
  addLabel,
  emptyLabel,
  items,
  describe,
  nameOf,
  renderForm,
  onDelete,
}: EditableListProps<T>) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<T | 'new'>();
  const [toDelete, setToDelete] = useState<T>();
  const close = () => setEditing(undefined);

  return (
    <SectionCard
      title={title}
      actions={
        <Button variant="secondary" onClick={() => setEditing('new')}>
          <PlusIcon /> {addLabel}
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState>{emptyLabel}</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-silver-lining rounded-control border border-silver-lining">
          {items.map((item) => {
            const { primary, secondary, aside } = describe(item);
            return (
              <li key={item.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-ink">{primary}</p>
                  {secondary && <p className="mt-0.5 text-sm text-steel-text">{secondary}</p>}
                </div>
                {aside && <div className="shrink-0 text-sm text-steel-text">{aside}</div>}
                <div className="flex shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('common.editItem', { name: nameOf(item) })}
                    onClick={() => setEditing(item)}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('common.deleteItem', { name: nameOf(item) })}
                    onClick={() => setToDelete(item)}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && close()}
        title={
          editing === 'new'
            ? addLabel
            : t('common.editItem', { name: editing ? nameOf(editing) : '' })
        }
        size="lg"
      >
        {editing !== undefined &&
          renderForm({ item: editing === 'new' ? undefined : editing, close })}
      </Dialog>

      <ConfirmDialog
        open={toDelete !== undefined}
        onOpenChange={(open) => !open && setToDelete(undefined)}
        title={t('common.deleteItem', { name: toDelete ? nameOf(toDelete) : '' })}
        description={t('common.deleteDescription')}
        confirmLabel={t('common.delete')}
        onConfirm={() => onDelete(toDelete!)}
      />
    </SectionCard>
  );
}
