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
  data: { bucket: string; count: number }[];
}

export function EnrollmentHistogram({ data }: Props) {
  if (!data.length) return null;

  return (
    <div style={{ height: 160 }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ left: 5, right: 5, top: 5, bottom: 5 }}
        >
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: 10, fill: "#64748b" }}
          />
          <YAxis hide />
          <Tooltip
            formatter={(value: number) => [value.toLocaleString(), "Trials"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar
            dataKey="count"
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
            animationDuration={600}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
