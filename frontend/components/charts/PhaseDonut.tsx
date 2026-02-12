"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const COLORS = [
  "#1e40af", "#2563eb", "#3b82f6", "#60a5fa",
  "#93c5fd", "#bfdbfe", "#1e3a5f", "#0ea5e9", "#7dd3fc",
];

const PHASE_LABELS: Record<string, string> = {
  "EARLY_PHASE1": "Early Phase 1",
  "PHASE1": "Phase 1",
  "PHASE1/PHASE2": "Phase 1/2",
  "PHASE2": "Phase 2",
  "PHASE2/PHASE3": "Phase 2/3",
  "PHASE3": "Phase 3",
  "PHASE4": "Phase 4",
  "NA": "N/A",
};

interface Props {
  data: Record<string, number>;
}

export function PhaseDonut({ data }: Props) {
  const entries = Object.entries(data)
    .map(([phase, count]) => ({
      name: PHASE_LABELS[phase] || phase || "Not specified",
      value: count,
    }))
    .sort((a, b) => b.value - a.value);

  if (!entries.length) return null;

  const total = entries.reduce((s, e) => s + e.value, 0);

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={entries}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={75}
            paddingAngle={1}
            dataKey="value"
            animationDuration={600}
            label={false}
          >
            {entries.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [value.toLocaleString(), "Trials"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 10 }}
            iconSize={8}
          />
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
