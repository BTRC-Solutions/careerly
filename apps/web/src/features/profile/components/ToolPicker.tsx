import type { ToolRef } from '@careerly/contracts';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InlineError } from '../../../shared/ui/InlineError';
import { Tag } from '../../../shared/ui/Tag';
import { useCreateTool, useToolSearch } from '../api/tools-api';

interface ToolPickerProps {
  value: ToolRef[];
  onChange: (tools: ToolRef[]) => void;
  'aria-describedby'?: string;
}

const CREATE_ITEM = '__create__';

/**
 * Multi-select of catalog tools with autocomplete (RF-PROF-06).
 * Type to search by name or alias, Enter to add, Backspace on an empty field removes the last tool.
 * If nothing matches, "Create" adds a user tool (the API returns the existing one if it already resolves).
 */
export function ToolPicker({ value, onChange, ...aria }: ToolPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const search = useToolSearch(deferredQuery, open);
  const createTool = useCreateTool();

  const selectedIds = new Set(value.map((tool) => tool.id));
  const results = (search.data?.items ?? []).filter((tool) => !selectedIds.has(tool.id));
  const trimmed = query.trim();
  const exactMatch = (search.data?.items ?? []).some((tool) =>
    [tool.name, ...tool.aliases].some((name) => name.toLowerCase() === trimmed.toLowerCase()),
  );
  const showList = open && trimmed.length > 0;

  function add(tool: ToolRef) {
    if (!selectedIds.has(tool.id)) onChange([...value, { id: tool.id, name: tool.name }]);
    setQuery('');
  }

  function remove(toolId: string) {
    onChange(value.filter((tool) => tool.id !== toolId));
  }

  async function create() {
    const { tool } = await createTool.mutateAsync({ name: trimmed });
    add(tool);
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('profile.tools.selected')}>
          {value.map((tool) => (
            <li key={tool.id}>
              <Tag
                onRemove={() => remove(tool.id)}
                removeLabel={t('profile.tools.remove', { name: tool.name })}
              >
                {tool.name}
              </Tag>
            </li>
          ))}
        </ul>
      )}

      <Command shouldFilter={false} loop label={t('profile.tools.label')}>
        <Popover.Root open={showList} onOpenChange={setOpen}>
          <Popover.Anchor asChild>
            <Command.Input
              value={query}
              onValueChange={(next) => {
                setQuery(next);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={(event) => {
                if (event.key === 'Backspace' && query === '' && value.length > 0) {
                  remove(value[value.length - 1]!.id);
                }
                if (event.key === 'Escape' && showList) {
                  // Close the list without closing a surrounding dialog.
                  event.stopPropagation();
                  setOpen(false);
                }
              }}
              placeholder={t('profile.tools.placeholder')}
              className="h-9 w-full rounded-control border border-silver-lining bg-pure-white px-3 text-sm text-slate-ink placeholder:text-fog focus:border-indigo-navy focus:outline-none focus-visible:outline-none"
              {...aria}
            />
          </Popover.Anchor>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={4}
              onOpenAutoFocus={(event) => event.preventDefault()}
              // Keep the input focused when clicking an option.
              onMouseDown={(event) => event.preventDefault()}
              className="z-[60] w-[var(--radix-popover-trigger-width)] min-w-64 rounded-card border border-silver-lining bg-pure-white p-1 shadow-md"
            >
              <Command.List className="max-h-64 overflow-y-auto">
                {results.map((tool) => (
                  <Command.Item
                    key={tool.id}
                    value={tool.id}
                    onSelect={() => add(tool)}
                    className="flex cursor-pointer items-baseline justify-between gap-3 rounded-control px-3 py-2 text-sm text-slate-ink data-[selected=true]:bg-cloud-canvas data-[selected=true]:text-indigo-navy"
                  >
                    <span>{tool.name}</span>
                    {tool.aliases.length > 0 && (
                      <span className="truncate text-xs text-steel-text">
                        {tool.aliases.slice(0, 3).join(', ')}
                      </span>
                    )}
                  </Command.Item>
                ))}
                {!exactMatch && trimmed && !search.isFetching && (
                  <Command.Item
                    value={CREATE_ITEM}
                    onSelect={() => void create()}
                    disabled={createTool.isPending}
                    className="cursor-pointer rounded-control px-3 py-2 text-sm text-indigo-navy data-[selected=true]:bg-cloud-canvas"
                  >
                    {t('profile.tools.create', { name: trimmed })}
                  </Command.Item>
                )}
                {search.isFetching && results.length === 0 && (
                  <Command.Loading>
                    <p className="px-3 py-2 text-sm text-steel-text">{t('common.searching')}</p>
                  </Command.Loading>
                )}
              </Command.List>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </Command>

      {createTool.isError && <InlineError>{createTool.error.message}</InlineError>}
    </div>
  );
}
