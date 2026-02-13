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
import { CHART_PALETTE } from "@/lib/chartPalette";

interface Props {
  data: { name: string; value: number }[];
}

export function CountryChart({ data }: Props) {
  if (!data.length) return null;

  const entries = data.slice(0, 15);
  const chartHeight = entries.length * 24 + 40;

  return (
    <div style={{ height: chartHeight }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={entries}
          layout="vertical"
          margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            interval={0}
            tick={{ fontSize: 10, fill: "#64748b" }}
          />
          <Tooltip
            formatter={(value: number) => [value.toLocaleString(), "Trials"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} animationDuration={600}>
            {entries.map((_, i) => (
              <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
