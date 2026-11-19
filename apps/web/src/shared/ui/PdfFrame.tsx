import { useEffect, useRef } from 'react';

/**
 * Shows a PDF in Chromium's viewer (ARCHITECTURE.md §9) through a `blob:` URL, created while the frame
 * shows it and released afterwards.
 */
export function PdfFrame({ pdf, title }: { pdf: Blob; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(pdf);
    // Fit the page width and skip the thumbnails pane: the preview is one or two pages.
    if (frame.current) frame.current.src = `${url}#navpanes=0&view=FitH`;
    return () => URL.revokeObjectURL(url);
  }, [pdf]);
  return <iframe ref={frame} title={title} className="size-full" />;
}
