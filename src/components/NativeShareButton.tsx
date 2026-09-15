'use client';

import React, { useState, useEffect } from 'react';

interface NativeShareButtonProps {
  /** The video file or blob to share */
  file: File | Blob;
  /** Optional title for the share dialog */
  title?: string;
  /** Optional text for the share dialog */
  text?: string;
  /** Optional file name (if a Blob is provided) */
  fileName?: string;
  /** Additional Tailwind classes */
  className?: string;
}

export function NativeShareButton({ 
  file, 
  title = 'Reframe Video', 
  text = 'Check out this video created with Reframe!', 
  fileName = 'reframe-video.mp4',
  className = '' 
}: NativeShareButtonProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    // 1. Safely check if we are in the browser environment (no SSR execution)
    if (typeof window === 'undefined' || !navigator) {
      return;
    }

    // 2. Safe Capability Test: Instantiate a lightweight 1-byte dummy file to test browser capability.
    // This avoids blocking the main thread by deferring heavy Blob/File interactions.
    const dummyTestFile = new File([new Uint8Array([0])], 'test.mp4', { type: 'video/mp4' });

    // 3. Optimize Mount Lifecycle: Verify EXACTLY ONCE on component mount.
    if (navigator.canShare && navigator.canShare({ files: [dummyTestFile] })) {
      setIsSupported(true);
    }
  }, []); // Empty dependency array ensures this runs only once

  const handleShare = async () => {
    if (!isSupported) return;

    // 4. Deferred Real Conversion: Defer the Blob to File conversion until the exact millisecond of execution.
    const shareFile = file instanceof File 
      ? file 
      : new File([file], fileName, { type: file.type || 'video/mp4' });

    try {
      setIsSharing(true);
      
      await navigator.share({
        title,
        text,
        files: [shareFile]
      });
    } catch (error) {
      // 'AbortError' is thrown when the user intentionally cancels or dismisses the native share sheet. 
      // We can safely ignore it.
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error sharing file:', error);
      }
    } finally {
      setIsSharing(false);
    }
  };

  // Progressive enhancement fallback: hide the button entirely if file sharing is not supported by the browser.
  if (!isSupported) {
    return null;
  }

  return (
    <button
      onClick={handleShare}
      disabled={isSharing}
      type="button"
      aria-label="Share video"
      className={`inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white transition-colors duration-200 bg-[var(--accent)] rounded-md shadow-sm hover:bg-[var(--accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg)] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <svg
        className="w-5 h-5 mr-2 -ml-1"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
        />
      </svg>
      {isSharing ? 'Sharing...' : 'Share Video'}
    </button>
  );
}
