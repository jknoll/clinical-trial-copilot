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
  const chartHeight = entries.length * 21 + 28;

  return (
    <div style={{ height: chartHeight }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={entries}
          layout="vertical"
          barCategoryGap="20%"
          margin={{ left: 4, right: 24, top: 2, bottom: 2 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={100}
            interval={0}
            tick={{ fontSize: 10, fill: "#64748b" }}
          />
          <Tooltip
            formatter={(value: number | undefined) => [(value ?? 0).toLocaleString(), "Trials"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="value" barSize={14} radius={[0, 4, 4, 0]} animationDuration={600}>
            {entries.map((_, i) => (
              <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
