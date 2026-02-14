"use client";

import { useCallback, useState } from "react";
import { X, Play, Loader2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";

interface Props {
  initialSql?: string;
  initialParams?: string[];
  onClose: () => void;
}

export function QueryEditor({ initialSql, initialParams, onClose }: Props) {
  const [sql, setSql] = useState(initialSql || "SELECT COUNT(*) FROM ctgov.studies");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  const runQuery = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/stats/raw-query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Query failed (${res.status})`);
      }
      const data = await res.json();
      setColumns(data.columns || []);
      setRows(data.rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
      setColumns([]);
      setRows([]);
    } finally {
      setRunning(false);
    }
  }, [sql]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col overflow-hidden modal-enter">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">SQL Query Editor</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SQL Editor */}
        <div className="px-6 py-4 space-y-3">
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            className="w-full h-32 font-mono text-sm border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            placeholder="SELECT ..."
          />

          {initialParams && initialParams.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500 font-medium">Params:</span>
              {initialParams.map((p, i) => (
                <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-mono">
                  ${i + 1} = {p}
                </span>
              ))}
            </div>
          )}

          <button
            onClick={runQuery}
            disabled={running || !sql.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run Query
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto px-6 pb-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-3">
              {error}
            </div>
          )}

          {columns.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-auto max-h-[400px]">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {columns.map((col) => (
                      <th key={col} className="text-left px-3 py-2 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      {columns.map((col) => (
                        <td key={col} className="px-3 py-1.5 text-slate-700 whitespace-nowrap font-mono">
                          {String(row[col] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
                {rows.length} row{rows.length !== 1 ? "s" : ""} returned{rows.length >= 500 ? " (limit 500)" : ""}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
