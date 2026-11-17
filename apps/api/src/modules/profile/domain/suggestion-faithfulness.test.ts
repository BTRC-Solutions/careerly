import { describe, expect, it } from 'vitest';
import { inventedNumbers } from './suggestion-faithfulness.js';

describe('inventedNumbers', () => {
  it('accepts the same numbers, reformatted', () => {
    expect(
      inventedNumbers(
        'Bajé la latencia p95 un 40 % para 1.000.000 de requests por día con un equipo de 3',
        'Reduje un 40% la latencia p95 en un servicio de 1,000,000 requests diarios (equipo de 3).',
      ),
    ).toEqual([]);
  });

  it('reports numbers the original does not have', () => {
    expect(
      inventedNumbers(
        'Migré el monolito a microservicios',
        'Migré el monolito a 12 microservicios, reduciendo costos un 30% y un 30% el tiempo de deploy',
      ),
    ).toEqual(['12', '30']);
  });

  it('treats a changed number as new', () => {
    expect(inventedNumbers('Led a team of 5 engineers', 'Led a team of 6 engineers')).toEqual([
      '6',
    ]);
  });

  it('accepts text without numbers', () => {
    expect(inventedNumbers('Wrote the docs', 'Authored the documentation')).toEqual([]);
  });
});
