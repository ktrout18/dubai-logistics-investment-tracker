import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, RegisterFileSchema, csvCell, registerToCsv, registerToJson, serializeDataFile } from '../index.ts';
import { FIXTURE_PROJECTS, alpha, zeta, zetaPhase1 } from '../__fixtures__/projects.ts';
import { parseCsv } from './parseCsv.ts';

describe('CSV export', () => {
  const csv = registerToCsv(FIXTURE_PROJECTS);
  const rows = parseCsv(csv);
  const col = (name: string) => CSV_COLUMNS.indexOf(name);

  it('has a header and one row per project', () => {
    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    expect(rows).toHaveLength(FIXTURE_PROJECTS.length + 1);
    for (const r of rows) expect(r).toHaveLength(CSV_COLUMNS.length);
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('keeps each area basis in its own column', () => {
    const a = rows.find((r) => r[0] === alpha.id)!;
    expect(a[col('area_warehouse_gfa_m2')]).toBe('49981.84');
    expect(a[col('area_site_land_m2')]).toBe('100000');
    expect(a[col('area_gla_m2')]).toBe('');
  });

  it('uses the shared delivery, asset-group, floor-figure and investment-scope definitions', () => {
    const a = rows.find((r) => r[0] === alpha.id)!;
    expect(a[col('delivery')]).toBe('Opened / operational');
    expect(a[col('asset_group')]).toBe('warehouse');
    expect(a[col('floor_figure_m2')]).toBe('49981.84');
    expect(a[col('floor_figure_basis')]).toBe('warehouse_gfa');
    expect(a[col('investment_scope')]).toBe('facility');
    const y = rows.find((r) => r[0] === 'epsilon-jafza-open-yard')!;
    expect(y[col('asset_group')]).toBe('other_infrastructure');
    expect(y[col('floor_figure_m2')]).toBe('');
    const b = rows.find((r) => r[0] === 'beta-dic-gla-park')!;
    expect(b[col('delivery')]).toBe('Construction completed');
  });

  it('marks umbrellas and phases', () => {
    expect(rows.find((r) => r[0] === zeta.id)![col('is_umbrella')]).toBe('true');
    const p1 = rows.find((r) => r[0] === zetaPhase1.id)!;
    expect(p1[col('is_umbrella')]).toBe('false');
    expect(p1[col('parent_id')]).toBe(zeta.id);
  });

  it('escapes quotes, commas, newlines and formula prefixes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(false)).toBe('false');
  });

  it('optional BOM', () => {
    expect(registerToCsv([], { bom: true }).startsWith('﻿')).toBe(true);
  });
});

describe('JSON export', () => {
  it('is the canonical envelope and round-trips through the schema', () => {
    const json = registerToJson(FIXTURE_PROJECTS, '2027-02-15T06:00:00Z');
    expect(json.endsWith('}\n')).toBe(true);
    const parsed = RegisterFileSchema.parse(JSON.parse(json));
    expect(parsed.projects).toEqual(FIXTURE_PROJECTS);
  });

  it('serializeDataFile is stable 2-space JSON with trailing newline', () => {
    expect(serializeDataFile({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});
