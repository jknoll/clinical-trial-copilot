"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface Props {
  data: { name: string; value: number }[];
}

const COMPLETION_COLORS: Record<string, string> = {
  Completed: "#22c55e",
  Terminated: "#ef4444",
  Withdrawn: "#f87171",
  Suspended: "#fb923c",
  Active: "#3b82f6",
  Other: "#f59e0b",
};

function getColor(name: string): string {
  for (const [key, color] of Object.entries(COMPLETION_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return "#94a3b8";
}

export function CompletionRateChart({ data }: Props) {
  if (!data.length) return null;

  const total = data.reduce((s, e) => s + e.value, 0);

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={75}
            paddingAngle={1}
            dataKey="value"
            animationDuration={600}
            label={false}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={getColor(entry.name)} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number | undefined) => [(value ?? 0).toLocaleString(), "Trials"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-700 text-sm font-semibold"
          >
            {total.toLocaleString()}
          </text>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
