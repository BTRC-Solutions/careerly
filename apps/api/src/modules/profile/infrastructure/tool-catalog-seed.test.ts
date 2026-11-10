import { describe, expect, it } from 'vitest';
import { normalizeToolName } from '../domain/tool-name.js';
import { loadToolCatalogSeed } from './tool-catalog-seed.js';

describe('tool catalog seed', () => {
  const seed = loadToolCatalogSeed();

  it('is valid and reasonably complete', () => {
    expect(seed.length).toBeGreaterThan(200);
  });

  it('has unique slugs', () => {
    const slugs = seed.map((tool) => tool.slug);
    expect(slugs.length).toBe(new Set(slugs).size);
  });

  it('never assigns the same name or alias to two tools', () => {
    const owners = new Map<string, string>();
    const clashes: string[] = [];
    for (const tool of seed) {
      for (const name of new Set([tool.name, ...tool.aliases].map(normalizeToolName))) {
        expect(name, `"${tool.slug}" has an empty name or alias`).not.toBe('');
        const owner = owners.get(name);
        if (owner && owner !== tool.slug) clashes.push(`"${name}": ${owner} / ${tool.slug}`);
        owners.set(name, tool.slug);
      }
    }
    expect(clashes).toEqual([]);
  });
});
