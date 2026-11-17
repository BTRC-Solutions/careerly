/*
 * Guard for AI rewording of the user's own text (RF-PROF-10, RN-01): a suggestion may say the same thing
 * better, never add facts. Numbers are the facts that can be checked deterministically (metrics, team sizes,
 * years, amounts), so a suggestion with a number the original does not have is discarded.
 */

/**
 * Numbers in `suggestion` that are not in `source`. Separators are ignored ("1,000" = "1000" = "1.000"), so
 * reformatting a number is fine; "15%" for "15 %" too. Numbers written as words are not checked.
 */
export function inventedNumbers(source: string, suggestion: string): string[] {
  const known = new Set(numbersIn(source).map(normalize));
  const invented = numbersIn(suggestion).filter((number) => !known.has(normalize(number)));
  return [...new Set(invented)];
}

function numbersIn(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)*/g) ?? [];
}

function normalize(number: string): string {
  return number.replace(/[.,]/g, '').replace(/^0+(?=\d)/, '');
}
