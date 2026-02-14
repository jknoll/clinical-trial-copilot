"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  data: { name: string; value: number }[];
}

export function StartYearChart({ data }: Props) {
  if (!data.length) return null;

  return (
    <div className="h-[185px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ left: 5, right: 5, top: 5, bottom: 5 }}
        >
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "#64748b" }}
            interval={Math.max(0, Math.floor(data.length / 8) - 1)}
          />
          <YAxis hide />
          <Tooltip
            formatter={(value: number | undefined) => [(value ?? 0).toLocaleString(), "Trials"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar
            dataKey="value"
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
            animationDuration={600}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
