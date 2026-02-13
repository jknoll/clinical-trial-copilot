"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { DISABLED_OPACITY } from "@/lib/chartPalette";

const STATUS_COLORS: Record<string, string> = {
  "Completed": "#22c55e",
  "Recruiting": "#3b82f6",
  "Active, not recruiting": "#f59e0b",
  "Not yet recruiting": "#8b5cf6",
  "Terminated": "#ef4444",
  "Withdrawn": "#f87171",
  "Unknown status": "#94a3b8",
  "Suspended": "#fb923c",
  "Enrolling by invitation": "#06b6d4",
  "Withheld": "#a1a1aa",
  "No longer available": "#71717a",
  "Temporarily not available": "#d4d4d8",
  "Approved for marketing": "#34d399",
  "Available": "#2dd4bf",
};

const ACTIVE_STATUS_KEYS = new Set([
  "recruiting",
  "not yet recruiting",
  "unknown status",
  "active, not recruiting",
  "enrolling by invitation",
  "available",
]);

function normalizeStatus(s: string): string {
  // Replace underscores with spaces, lowercase, then capitalize first letter of each word
  const spaced = s.replace(/_/g, " ").toLowerCase();
  const titled = spaced.replace(/\b\w/g, (c) => c.toUpperCase());
  // Match STATUS_COLORS convention: "Active, not recruiting" (not "Active, Not Recruiting")
  return titled.replace(/, \w/g, (m) => m.toLowerCase());
}

function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUS_KEYS.has(status.toLowerCase());
}

interface Props {
  data: Record<string, number>;
  allData?: Record<string, number>;
}

export function StatusBar({ data, allData }: Props) {
  const sourceData = allData && Object.keys(allData).length > 0 ? allData : data;

  const entries = Object.entries(sourceData)
    .map(([status, count]) => {
      const normalized = normalizeStatus(status);
      return {
        name: normalized,
        status: normalized,
        value: count,
        active: isActiveStatus(status),
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 9);

  if (!entries.length) return null;

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={entries} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            interval={0}
            tick={(props: any) => {
              const { x, y, payload } = props;
              const entry = entries.find((e) => e.name === payload.value);
              const active = entry?.active ?? false;
              return (
                <text
                  x={x}
                  y={y}
                  dy={4}
                  textAnchor="end"
                  fill={active ? "#64748b" : "#d1d5db"}
                  fontSize={10}
                  style={{ transition: "fill 300ms" }}
                >
                  {payload.value}
                </text>
              );
            }}
          />
          <Tooltip
            formatter={(value: number) => [value.toLocaleString(), "Trials"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} animationDuration={600}>
            {entries.map((entry, i) => (
              <Cell
                key={i}
                fill={STATUS_COLORS[entry.status] || "#94a3b8"}
                fillOpacity={entry.active ? 1 : DISABLED_OPACITY}
                style={{ transition: "fill 300ms, fill-opacity 300ms" }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
