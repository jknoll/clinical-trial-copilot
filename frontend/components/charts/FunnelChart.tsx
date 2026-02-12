"use client";

import { FunnelStep } from "@/lib/types";
import { CHART_PALETTE } from "@/lib/chartPalette";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface Props {
  data: FunnelStep[];
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function FunnelChart({ data }: Props) {
  if (!data.length) return null;

  const formatted = data.map((d, i) => ({
    ...d,
    stage: titleCase(d.stage),
    fill: CHART_PALETTE[i % CHART_PALETTE.length],
  }));

  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formatted} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="stage"
            width={130}
            tick={{ fontSize: 11, fill: "#64748b" }}
          />
          <Tooltip
            formatter={(value: number) => [value.toLocaleString(), "Trials"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} animationDuration={600}>
            {formatted.map((d, i) => (
              <Cell
                key={i}
                fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                fillOpacity={data[0].count > 0 ? 0.5 + 0.5 * (d.count / data[0].count) : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
