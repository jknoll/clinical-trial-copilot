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
import { CHART_PALETTE, DISABLED_OPACITY } from "@/lib/chartPalette";

interface ConditionEntry {
  condition: string;
  count: number;
  isUserCondition?: boolean;
}

interface Props {
  data: ConditionEntry[];
  activeCondition?: string;
  userCondition?: string;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DiseaseBar({ data, activeCondition, userCondition }: Props) {
  if (!data.length) return null;

  const needle = activeCondition?.toLowerCase() || "";
  const entries = data.map((d) => ({
    name: titleCase(d.condition),
    value: d.count,
    matches: !needle || d.condition.toLowerCase().includes(needle),
    isUserCondition: !!(d as any).isUserCondition,
  }));

  const chartHeight = entries.length * 21 + 28;

  return (
    <div style={{ height: chartHeight }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={entries} layout="vertical" barCategoryGap="20%" margin={{ left: 4, right: 24, top: 2, bottom: 2 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            interval={0}
            tick={(props: any) => {
              const { x, y, payload } = props;
              const entry = entries.find((e) => e.name === payload.value);
              const bright = entry?.matches ?? true;
              const isUser = entry?.isUserCondition ?? false;
              return (
                <g>
                  {isUser && (
                    <line x1={x - 138} y1={y - 10} x2={x + 60} y2={y - 10} stroke="#e2e8f0" strokeWidth={1} />
                  )}
                  <text
                    x={x}
                    y={y}
                    dy={4}
                    textAnchor="end"
                    fill={bright ? "#64748b" : "#d1d5db"}
                    fontSize={10}
                    fontWeight={isUser ? 600 : 400}
                    style={{ transition: "fill 300ms" }}
                  >
                    {payload.value}
                    {isUser ? " ★" : ""}
                  </text>
                </g>
              );
            }}
          />
          <Tooltip
            formatter={(value: number | undefined) => [(value ?? 0).toLocaleString(), "Trials"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="value" barSize={14} radius={[0, 4, 4, 0]} animationDuration={600}>
            {entries.map((entry, i) => (
              <Cell
                key={i}
                fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                fillOpacity={entry.matches ? 1 : DISABLED_OPACITY}
                stroke={entry.isUserCondition ? CHART_PALETTE[i % CHART_PALETTE.length] : "none"}
                strokeWidth={entry.isUserCondition ? 2 : 0}
                strokeDasharray={entry.isUserCondition ? "4 2" : "none"}
                style={{ transition: "fill 300ms, fill-opacity 300ms" }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
