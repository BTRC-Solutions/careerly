import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A local stand-in for the Gemini API (ARCHITECTURE §7): the app reaches it through
 * CAREERLY_GEMINI_BASE_URL. It lists two models and answers each `generateContent` according to the
 * JSON schema the task asks for, so the flow does not depend on the order of the calls.
 */
export interface FakeGemini {
  url: string;
  /** Top-level keys of the schema of every call, in order (to tell the tasks apart in failures). */
  calls: string[][];
  close(): Promise<void>;
}

/** What each task answers, picked by a key only its schema has. */
export type FakeAnswers = Record<string, (prompt: string) => unknown>;

export async function startFakeGemini(answers: FakeAnswers): Promise<FakeGemini> {
  const calls: string[][] = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk: Buffer) => (raw += chunk.toString()));
    request.on('end', () => {
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      const url = new URL(request.url ?? '/', 'http://fake');

      if (request.method === 'GET' && url.pathname === '/v1beta/models') {
        return send(200, {
          models: ['gemini-3.5-flash-lite', 'gemini-3.6-flash'].map((name) => ({
            name: `models/${name}`,
            supportedGenerationMethods: ['generateContent'],
          })),
        });
      }
      if (request.method !== 'POST' || !url.pathname.endsWith(':generateContent')) {
        return send(404, { error: { code: 404, message: 'Not found' } });
      }

      const body = JSON.parse(raw) as {
        systemInstruction?: { parts?: { text?: string }[] };
        contents?: { parts?: { text?: string }[] }[];
        generationConfig?: { responseJsonSchema?: { properties?: Record<string, unknown> } };
      };
      const keys = Object.keys(body.generationConfig?.responseJsonSchema?.properties ?? {});
      calls.push(keys);
      const answer = Object.entries(answers).find(([key]) => keys.includes(key))?.[1];
      if (!answer) {
        return send(400, { error: { code: 400, message: `No fake answer for ${keys.join(',')}` } });
      }
      const prompt = [
        ...(body.systemInstruction?.parts ?? []),
        ...(body.contents ?? []).flatMap((content) => content.parts ?? []),
      ]
        .map((part) => part.text ?? '')
        .join('\n');
      send(200, {
        candidates: [
          {
            content: { parts: [{ text: JSON.stringify(answer(prompt)) }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 200 },
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
