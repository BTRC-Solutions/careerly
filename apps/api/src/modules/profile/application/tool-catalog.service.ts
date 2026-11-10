import type { CreateToolRequest, SearchToolsQuery, Tool } from '@careerly/contracts';
import { Injectable } from '@nestjs/common';
import { cleanToolDisplayName, normalizeToolName } from '../domain/tool-name.js';
import { ToolRepository } from './tool.repository.js';

export class InvalidToolNameError extends Error {
  constructor() {
    super('The tool name must contain at least one letter or digit.');
    this.name = 'InvalidToolNameError';
  }
}

/**
 * Normalized tool catalog with synonyms (RF-PROF-06).
 * Public API of the `profile` module for other modules (job postings, tailoring).
 */
@Injectable()
export class ToolCatalogService {
  constructor(private readonly repository: ToolRepository) {}

  search({ query, limit }: SearchToolsQuery): Promise<Tool[]> {
    const normalized = query ? normalizeToolName(query) : '';
    if (query && !normalized) {
      // Only separators/symbols were typed: nothing can match.
      return Promise.resolve([]);
    }
    return this.repository.search(normalized || undefined, limit);
  }

  findById(id: string): Promise<Tool | undefined> {
    return this.repository.findById(id);
  }

  /** Resolves free text ("Postgres", "k8s", "node js") to a catalog tool, if any. */
  async resolve(text: string): Promise<Tool | undefined> {
    const normalized = normalizeToolName(text);
    return normalized ? this.repository.findByNormalizedAlias(normalized) : undefined;
  }

  /**
   * Creates a user tool unless the name already resolves to one (by name or alias),
   * in which case the existing tool is returned. Never creates duplicates.
   */
  async create(request: CreateToolRequest): Promise<{ tool: Tool; created: boolean }> {
    const name = cleanToolDisplayName(request.name);
    const normalized = normalizeToolName(name);
    if (!normalized) {
      throw new InvalidToolNameError();
    }

    const existing = await this.repository.findByNormalizedAlias(normalized);
    if (existing) {
      return { tool: existing, created: false };
    }
    const tool = await this.repository.createCustom({
      name,
      category: request.category,
      normalized,
    });
    return { tool, created: true };
  }
}
