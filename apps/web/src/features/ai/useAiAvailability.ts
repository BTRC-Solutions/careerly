import type { AiStatus } from '@careerly/contracts';
import { useOnline } from '../../shared/lib/useOnline';
import { useAiStatus } from './api/useAiStatus';

/**
 * Why AI actions cannot run right now (RNF-13):
 * - `OFFLINE`: no network connection.
 * - `NOT_CONFIGURED`: no API key and Claude Code is off.
 * - `KEY_REJECTED`: the provider refused the key on its last call.
 */
export type AiUnavailableReason = 'OFFLINE' | 'NOT_CONFIGURED' | 'KEY_REJECTED';

export interface AiAvailability {
  /** `null` while the status loads (or could not be read): actions stay enabled and the API decides. */
  reason: AiUnavailableReason | null;
  available: boolean;
}

export function useAiAvailability(): AiAvailability {
  const reason = unavailableReason(useOnline(), useAiStatus().data);
  return { reason, available: reason === null };
}

export function unavailableReason(
  online: boolean,
  status: AiStatus | undefined,
): AiUnavailableReason | null {
  if (!online) return 'OFFLINE';
  if (!status) return null;
  if (!status.configured) return 'NOT_CONFIGURED';
  return status.keyRejected ? 'KEY_REJECTED' : null;
}
