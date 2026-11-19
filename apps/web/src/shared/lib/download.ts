/**
 * Saves a file the API returned with the given name (inside Electron, its save dialog asks where).
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
  } finally {
    // Give the download a moment to start before releasing the file.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
