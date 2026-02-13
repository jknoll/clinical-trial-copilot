"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CHART_PALETTE } from "@/lib/chartPalette";

interface Props {
  data: { name: string; value: number }[];
}

export function FunderTypeChart({ data }: Props) {
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
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [value.toLocaleString(), "Trials"]}
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
