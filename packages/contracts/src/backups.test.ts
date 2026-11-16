import { describe, expect, it } from 'vitest';
import { DeleteAllDataRequestSchema, RestoreBackupRequestSchema } from './backups.js';

describe('RestoreBackupRequestSchema', () => {
  it.each([
    'C:\\Users\\me\\careerly.careerly-backup',
    'D:/backups/x.careerly-backup',
    '/home/me/x',
  ])('accepts the absolute path %s', (value) => {
    expect(RestoreBackupRequestSchema.safeParse({ path: value }).success).toBe(true);
  });

  it.each(['backup.careerly-backup', '../x', ''])('rejects %j', (value) => {
    expect(RestoreBackupRequestSchema.safeParse({ path: value }).success).toBe(false);
  });
});

describe('DeleteAllDataRequestSchema', () => {
  it('only accepts the exact confirmation', () => {
    expect(DeleteAllDataRequestSchema.safeParse({ confirmation: 'DELETE_ALL_DATA' }).success).toBe(
      true,
    );
    expect(DeleteAllDataRequestSchema.safeParse({ confirmation: 'yes' }).success).toBe(false);
    expect(DeleteAllDataRequestSchema.safeParse({}).success).toBe(false);
  });
});
