import { safeStorage } from 'electron';
import type { Encryptor } from './ai-key-store.js';

/**
 * `safeStorage` backed by the OS: DPAPI on Windows, Keychain on macOS, libsecret/kwallet on Linux.
 * On Linux without a keyring Electron falls back to a hard-coded password (`basic_text`), which is
 * not real protection, so it counts as unavailable.
 */
export const safeStorageEncryptor: Encryptor = {
  isAvailable: () =>
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  encrypt: (plainText) => safeStorage.encryptString(plainText),
  decrypt: (encrypted) => safeStorage.decryptString(encrypted),
};
