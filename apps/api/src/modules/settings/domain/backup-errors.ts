/** Why a backup cannot be restored. Nothing is changed when this is thrown. */
export type BackupRejection = 'NOT_FOUND' | 'INVALID' | 'TOO_NEW';

export class BackupRejectedError extends Error {
  constructor(
    readonly reason: BackupRejection,
    message: string,
  ) {
    super(message);
    this.name = 'BackupRejectedError';
  }
}
