/**
 * Normalizes a tool name or alias for lookups (RF-PROF-06).
 *
 * - Case, accents, spaces and separators (`.`, `-`, `_`, `/`, ...) are ignored:
 *   "Node.js", "nodejs" and "Node JS" are the same key.
 * - `#` and `+` are kept because they tell tools apart: "C", "C#" and "C++" stay different.
 *
 * Returns an empty string when nothing meaningful is left (e.g. "...").
 */
export function normalizeToolName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#+]/gu, '');
}

/** Collapses inner whitespace so stored display names are tidy ("  React   Native " → "React Native"). */
export function cleanToolDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}
