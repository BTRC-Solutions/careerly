// @vitest-environment jsdom
import type {
  Profile,
  RevertProfileChangesRequest,
  RevertProfileChangesResult,
  SessionProfileChange,
} from '@careerly/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, apiError, apiServer, setupApiServer } from '../../../test-support/api-server';
import { renderScreen } from '../../../test-support/render';
import { SessionProfileChanges } from './SessionProfileChanges';

/* Undoing a session's changes to the master profile (roadmap 5.7, RF-TAIL-06) against a mocked API. */

setupApiServer();

const ID = 'session-1';
const AT = '2026-11-18T12:00:00.000Z';

const provenance = {
  origin: 'GAP_ANSWER',
  originSessionId: ID,
  createdAt: AT,
  updatedAt: AT,
} as const;

const PROFILE = {
  personalInfo: {
    firstNames: null,
    lastNames: null,
    headline: null,
    location: null,
    email: null,
    phone: null,
    summary: null,
    links: [],
    updatedAt: null,
  },
  positions: [
    {
      id: 'pos-1',
      company: 'Acme',
      title: 'Backend Engineer',
      location: null,
      workMode: null,
      startDate: '2019-03',
      endDate: null,
      context: null,
      tools: [],
      achievements: [
        {
          id: 'ach-1',
          text: 'Ran the Kafka consumers of the ledger.',
          metrics: null,
          tools: [],
          ...provenance,
        },
      ],
      ...provenance,
      origin: 'MANUAL',
      originSessionId: null,
    },
  ],
  projects: [],
  education: [],
  certifications: [],
  languages: [],
} satisfies Profile;

const CHANGES: SessionProfileChange[] = [
  {
    id: 'c1',
    entity: 'ACHIEVEMENT',
    entityId: 'ach-1',
    kind: 'CREATE',
    createdAt: AT,
    revertedAt: null,
  },
  {
    id: 'c2',
    entity: 'POSITION',
    entityId: 'pos-1',
    kind: 'UPDATE',
    createdAt: AT,
    revertedAt: null,
  },
];

/** What the mocked API has; reverting marks the changes like the real one would. */
let changes: SessionProfileChange[];
let reverts: RevertProfileChangesRequest[];
let keptFields: RevertProfileChangesResult['keptFields'];

beforeEach(() => {
  changes = CHANGES;
  reverts = [];
  keptFields = [];
  apiServer.use(
    http.get(api('/profile'), () => HttpResponse.json(PROFILE)),
    http.get(api(`/tailoring-sessions/${ID}/profile-changes`), () =>
      HttpResponse.json({ changes }),
    ),
    http.post(api(`/tailoring-sessions/${ID}/revert-profile-changes`), async ({ request }) => {
      const body = (await request.json()) as RevertProfileChangesRequest;
      reverts.push(body);
      changes = changes.map((change) =>
        !body.changeIds || body.changeIds.includes(change.id)
          ? { ...change, revertedAt: change.revertedAt ?? '2026-11-18T13:00:00.000Z' }
          : change,
      );
      return HttpResponse.json({ changes, keptFields });
    }),
  );
});

const render = () => renderScreen(<SessionProfileChanges sessionId={ID} />);

describe('SessionProfileChanges', () => {
  it('lists what the session added or changed', async () => {
    await render();

    expect(await screen.findByRole('heading', { name: 'Cambios en tu perfil' })).toBeVisible();
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]!).getByText('Agregado')).toBeVisible();
    expect(
      await within(rows[0]!).findByRole('link', { name: /Ran the Kafka consumers/ }),
    ).toHaveAttribute('href', '/profile/experience/pos-1');
    expect(within(rows[1]!).getByText('Modificado')).toBeVisible();
    expect(within(rows[1]!).getByRole('link', { name: 'Backend Engineer · Acme' })).toBeVisible();
  });

  it('undoes one change', async () => {
    const { user } = await render();
    await user.click(
      await screen.findByRole('button', {
        name: 'Deshacer el cambio en «Ran the Kafka consumers of the ledger.»',
      }),
    );

    await waitFor(() => expect(reverts).toEqual([{ changeIds: ['c1'] }]));
    const rows = screen.getAllByRole('listitem');
    expect(await within(rows[0]!).findByText('Deshecho')).toBeVisible();
    expect(within(rows[1]!).getByRole('button', { name: /Deshacer el cambio/ })).toBeEnabled();
  });

  it('asks before undoing all, and says which edits were kept', async () => {
    keptFields = [{ entity: 'POSITION', entityId: 'pos-1', fields: ['toolIds'] }];
    const { user } = await render();
    await user.click(await screen.findByRole('button', { name: 'Deshacer todos' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Se van a deshacer 2 cambios/)).toBeVisible();
    expect(reverts).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Deshacer todos' }));

    await waitFor(() => expect(reverts).toEqual([{}]));
    expect(await screen.findByText(/1 campo lo editaste después/)).toBeVisible();
    expect(screen.getAllByText('Deshecho')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Deshacer todos' })).not.toBeInTheDocument();
  });

  it('shows the error when undoing fails', async () => {
    apiServer.use(
      http.post(api(`/tailoring-sessions/${ID}/revert-profile-changes`), () =>
        apiError(404, 'NOT_FOUND', 'Profile change not found in this session.'),
      ),
    );
    const { user } = await render();
    await user.click(
      await screen.findByRole('button', { name: /Deshacer el cambio en «Backend Engineer/ }),
    );

    expect(await screen.findByText(/Profile change not found/)).toBeVisible();
  });

  it('shows nothing when the session did not change the profile', async () => {
    changes = [];
    const { container } = await render();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
