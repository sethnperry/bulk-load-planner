"use client";

import { ReactNode, useEffect } from "react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;

  /**
   * Footer content.
   * - undefined => show default Done button
   * - null      => hide footer entirely
   * - ReactNode => render that node
   */
  footer?: ReactNode | null;
};

export function FullscreenModal({ open, title, onClose, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const footerNode =
    footer === null ? null : footer ?? (
      <button
        onClick={onClose}
        className="w-full rounded-2xl bg-[#111] px-4 py-3 font-semibold text-white border border-white/15 hover:bg-[#151515]"
      >
        Done
      </button>
    );

  const contentClass =
    footerNode === null ? "h-[calc(100%-56px)]" : "h-[calc(100%-56px-72px)]";

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop: dim + blur. Click backdrop to close */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Floating panel */}
      <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
        <div
          className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0b0b0b] text-white shadow-2xl"
          style={{ height: "min(92vh, 900px)" }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <button
              onClick={onClose}
              className="rounded-xl px-3 py-2 text-sm hover:bg-white/10"
              aria-label="Close"
            >
              Close
            </button>

            <div className="text-base font-semibold">{title}</div>

            <div className="w-[64px]" />
          </div>

          {/* Content */}
          <div className={`${contentClass} overflow-auto px-4 py-4`}>{children}</div>

          {/* Footer */}
          {footerNode !== null ? (
            <div className="border-t border-white/10 px-4 py-3">{footerNode}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
