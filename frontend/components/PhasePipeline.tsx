"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

interface PhaseCount {
  phase: string;
  count: number;
}

interface Props {
  phaseCounts: PhaseCount[];
}

const phaseColors: Record<string, string> = {
  "Phase 1": "#93c5fd",  // blue-300
  "Phase 2": "#60a5fa",  // blue-400
  "Phase 3": "#3b82f6",  // blue-500
  "Phase 4": "#1d4ed8",  // blue-700
};

function getColor(phase: string): string {
  return phaseColors[phase] || "#60a5fa";
}

export function PhasePipeline({ phaseCounts }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold text-slate-800 mb-4">Trials by Phase</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={phaseCounts}
          layout="vertical"
          margin={{ top: 0, right: 40, left: 10, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="phase"
            width={70}
            tick={{ fontSize: 13, fill: "#475569" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "0.5rem",
              border: "1px solid #e2e8f0",
              fontSize: "0.875rem",
            }}
            formatter={(value) => [`${value} trials`, "Count"]}
          />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={28}>
            {phaseCounts.map((entry) => (
              <Cell key={entry.phase} fill={getColor(entry.phase)} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              style={{ fontSize: 13, fontWeight: 600, fill: "#334155" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
