// @vitest-environment jsdom
import type { Tool, ToolRef } from '@careerly/contracts';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiServer, setupApiServer } from '../../../test-support/api-server';
import { renderScreen } from '../../../test-support/render';
import { ToolPicker } from './ToolPicker';

/*
 * The tool picker as a combobox (roadmap 8.2, RNF-11): it says whether its list is open, the list it controls is
 * always there, and the keyboard never picks a tool the user cannot see.
 */

setupApiServer();

const NODE: Tool = {
  id: 'node',
  name: 'Node.js',
  category: 'TOOL',
  isCustom: false,
  aliases: ['Node'],
};

/** Called with the tools each time the user picks or removes one. */
const onPick = vi.fn<(tools: ToolRef[]) => void>();

function Picker() {
  const [value, setValue] = useState<ToolRef[]>([]);
  return (
    <ToolPicker
      value={value}
      onChange={(tools) => {
        onPick(tools);
        setValue(tools);
      }}
    />
  );
}

beforeEach(() => {
  onPick.mockReset();
  apiServer.use(http.get(api('/tools'), () => HttpResponse.json({ items: [NODE] })));
});

describe('ToolPicker', () => {
  it('opens and closes its list as a combobox, and Enter only picks a visible tool', async () => {
    const { user } = await renderScreen(<Picker />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    // What it controls exists even while closed.
    expect(document.getElementById(input.getAttribute('aria-controls')!)).not.toBeNull();

    await user.type(input, 'Nod');
    expect(await screen.findByRole('option', { name: /Node\.js/ })).toBeVisible();
    expect(input).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.queryByRole('option', { name: /Node\.js/ })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onPick).not.toHaveBeenCalled();

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenLastCalledWith([{ id: 'node', name: 'Node.js' }]);
  });
});
