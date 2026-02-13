"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Smartphone, Copy, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface SessionQRProps {
  sessionId: string;
  backendUrl: string;
}

export function SessionQR({ sessionId, backendUrl }: SessionQRProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  // Position the portal dropdown relative to the button
  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may not be available
    }
  };

  const qrData = JSON.stringify({ session_id: sessionId, backend_url: backendUrl });

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-slate-100 text-slate-600 hover:bg-slate-200"
      >
        <Smartphone className="w-3.5 h-3.5" />
        Pair Device
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] w-64 bg-white rounded-xl border border-slate-200 shadow-lg p-4 flex flex-col items-center gap-3"
          style={{ top: pos.top, right: pos.right }}
        >
          <div className="flex items-center gap-2 w-full">
            <span className="text-lg font-mono font-bold tracking-wider text-slate-900 flex-1 text-center">
              {sessionId}
            </span>
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
              title="Copy session ID"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>

          <QRCodeSVG value={qrData} size={160} />

          <p className="text-xs text-slate-500 text-center">
            Scan with iOS app to connect
          </p>
        </div>,
        document.body
      )}
    </>
  );
}
