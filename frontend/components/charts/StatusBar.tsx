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

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "#22c55e",
  RECRUITING: "#3b82f6",
  ACTIVE_NOT_RECRUITING: "#f59e0b",
  NOT_YET_RECRUITING: "#8b5cf6",
  TERMINATED: "#ef4444",
  WITHDRAWN: "#f87171",
  UNKNOWN: "#94a3b8",
  SUSPENDED: "#fb923c",
  ENROLLING_BY_INVITATION: "#06b6d4",
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Completed",
  RECRUITING: "Recruiting",
  ACTIVE_NOT_RECRUITING: "Active, not recruiting",
  NOT_YET_RECRUITING: "Not yet recruiting",
  TERMINATED: "Terminated",
  WITHDRAWN: "Withdrawn",
  UNKNOWN: "Unknown",
  SUSPENDED: "Suspended",
  ENROLLING_BY_INVITATION: "Enrolling by invitation",
};

interface Props {
  data: Record<string, number>;
}

export function StatusBar({ data }: Props) {
  const entries = Object.entries(data)
    .map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      status,
      value: count,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  if (!entries.length) return null;

  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={entries} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={140}
            tick={{ fontSize: 10, fill: "#64748b" }}
          />
          <Tooltip
            formatter={(value: number) => [value.toLocaleString(), "Trials"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} animationDuration={600}>
            {entries.map((entry, i) => (
              <Cell key={i} fill={STATUS_COLORS[entry.status] || "#94a3b8"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
