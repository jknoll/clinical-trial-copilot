"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Smartphone,
  Upload,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
  Copy,
  Check,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";

export interface ImportSummary {
  lab_count: number;
  vital_count: number;
  medication_count: number;
  activity_steps_per_day: number | null;
  estimated_ecog: number | null;
  import_date: string;
  source_file: string;
}

interface HealthImportProps {
  sessionId: string;
  backendUrl?: string;
  onImported?: (summary: ImportSummary) => void;
  externalSummary?: ImportSummary | null;
}

type ImportState = "idle" | "uploading" | "success" | "error";

export function HealthImport({ sessionId, backendUrl, onImported, externalSummary }: HealthImportProps) {
  const [state, setState] = useState<ImportState>("idle");
  const [expanded, setExpanded] = useState(true);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (externalSummary) {
      setSummary(externalSummary);
      setState("success");
      setExpanded(false);
      onImported?.(externalSummary);
    }
  }, [externalSummary]);

  const handleCopySession = async () => {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may not be available
    }
  };

  const qrData = backendUrl
    ? JSON.stringify({ session_id: sessionId, backend_url: backendUrl })
    : sessionId;

  const handleUpload = useCallback(
    async (file: File) => {
      setState("uploading");
      setErrorMessage("");
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(
          `${API_URL}/api/sessions/${sessionId}/health-import`,
          { method: "POST", body: formData }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `Upload failed (${res.status})`);
        }
        const data: ImportSummary = await res.json();
        setSummary(data);
        setState("success");
        setExpanded(false);
        onImported?.(data);
      } catch (err) {
        setState("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Upload failed. Please try again."
        );
      }
    },
    [sessionId, onImported]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      // Reset so the same file can be re-selected
      e.target.value = "";
    },
    [handleUpload]
  );

  const handleDemoData = useCallback(async () => {
    setState("uploading");
    setErrorMessage("");
    try {
      const res = await fetch(
        `${API_URL}/api/sessions/${sessionId}/health-import?use_dummy=true`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Demo import failed (${res.status})`);
      }
      const data: ImportSummary = await res.json();
      setSummary(data);
      setState("success");
      setExpanded(false);
      onImported?.(data);
    } catch (err) {
      setState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Demo import failed. Please try again."
      );
    }
  }, [sessionId, onImported]);

  const handleDismiss = useCallback(() => {
    setExpanded(false);
  }, []);

  // Success badge shown when collapsed after import
  if (state === "success" && !expanded) {
    return (
      <div className="mx-4 mt-3 mb-1">
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-2 px-4 py-2 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-medium hover:bg-green-100 transition-all shadow-sm"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="truncate">
            {summary?.source_file === "ios-healthkit" ? "iOS: " : "Imported: "}{summary?.lab_count ?? 0} labs, {summary?.vital_count ?? 0} vitals, {summary?.medication_count ?? 0} medications
            {summary?.estimated_ecog != null && ` | ECOG ${summary.estimated_ecog}`}
          </span>
          <img src="/Apple_Health_badge_US-UK_blk_sRGB.svg" alt="Works with Apple Health" className="h-[20px] w-auto shrink-0 ml-auto" />
          <ChevronDown className="w-4 h-4 shrink-0" />
        </button>
      </div>
    );
  }

  // Collapsed idle state — small toggle
  if (!expanded && state !== "success") {
    return (
      <div className="mx-4 mt-3 mb-1">
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-sm hover:bg-slate-100 transition-colors"
        >
          <Smartphone className="w-4 h-4" />
          <span>Import Apple Health Data (Optional)</span>
          <ChevronDown className="w-4 h-4 ml-auto" />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-3 mb-1">
      <div className="rounded-xl border border-slate-200/60 bg-white/90 backdrop-blur-sm shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-slate-800">
              Import Apple Health Data
            </span>
            <span className="text-xs text-slate-400 font-normal">(Optional)</span>
          </div>
          <div className="flex items-center gap-2">
            <img src="/Apple_Health_badge_US-UK_blk_sRGB.svg" alt="Works with Apple Health" className="h-[24px] w-auto" />
          <button
            onClick={state === "success" ? () => setExpanded(false) : handleDismiss}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Collapse"
          >
            {state === "success" ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <X className="w-4 h-4" />
            )}
          </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4">
          {state === "uploading" && (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <p className="text-sm text-slate-600">Processing health data...</p>
            </div>
          )}

          {state === "error" && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{errorMessage}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-slate-200 text-sm font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition-all"
                >
                  <Upload className="w-4 h-4" />
                  Try Again
                </button>
                <button
                  onClick={handleDemoData}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-slate-200 text-sm font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition-all"
                >
                  <FlaskConical className="w-4 h-4" />
                  Use Demo Data
                </button>
              </div>
            </div>
          )}

          {state === "success" && summary && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                <div className="text-sm text-green-800">
                  <p className="font-medium">
                    {summary.source_file === "ios-healthkit"
                      ? "Health data received from iOS device"
                      : "Health data imported successfully"}
                  </p>
                  <p className="mt-1 text-green-700">
                    {summary.lab_count} lab results, {summary.vital_count} vitals, {summary.medication_count} medications
                    {summary.activity_steps_per_day != null && (
                      <span> | ~{Math.round(summary.activity_steps_per_day).toLocaleString()} steps/day</span>
                    )}
                  </p>
                  {summary.estimated_ecog != null && (
                    <p className="mt-0.5 text-green-600">
                      Estimated activity level: ECOG {summary.estimated_ecog}
                      {summary.estimated_ecog === 0 && " (fully active)"}
                      {summary.estimated_ecog === 1 && " (moderately active)"}
                      {summary.estimated_ecog === 2 && " (ambulatory, limited activity)"}
                      {summary.estimated_ecog === 3 && " (limited self-care)"}
                      {summary.estimated_ecog === 4 && " (completely disabled)"}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {state === "idle" && (
            <>
              <p className="text-sm text-slate-600 mb-4">
                Importing your health data can improve trial matching by providing lab
                results, activity levels, and medication history.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex flex-col items-center gap-1.5 px-4 py-4 rounded-lg border-2 border-dashed border-slate-200 text-sm font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50/80 hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <Upload className="w-5 h-5 text-blue-600" />
                  <span>Upload File</span>
                  <span className="text-xs text-slate-400 font-normal">(.zip export)</span>
                </button>
                <button
                  onClick={handleDemoData}
                  className="flex-1 flex flex-col items-center gap-1.5 px-4 py-4 rounded-lg border-2 border-dashed border-slate-200 text-sm font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50/80 hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <FlaskConical className="w-5 h-5 text-blue-600" />
                  <span>Use Demo Data</span>
                  <span className="text-xs text-slate-400 font-normal">&nbsp;</span>
                </button>
              </div>

              {/* Pair Device — QR code for iOS app */}
              {backendUrl && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => {
                      const el = document.getElementById("pair-device-qr");
                      if (el) el.classList.toggle("hidden");
                    }}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    Pair Device
                  </button>
                  <div id="pair-device-qr" className="mt-3 flex flex-col items-center gap-3">
                    <QRCodeSVG value={qrData} size={160} />
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold tracking-wider text-slate-900">
                        {sessionId}
                      </span>
                      <button
                        onClick={handleCopySession}
                        className="p-1 rounded hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
                        title="Copy session ID"
                      >
                        {copied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 text-center">
                      Scan with iOS app to connect
                    </p>
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-400 mt-3">
                How to export: Settings &gt; Health &gt; Export All Health Data
              </p>
            </>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
