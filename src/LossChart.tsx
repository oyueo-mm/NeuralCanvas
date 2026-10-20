import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import type { RecordItem } from "./storage";
export default function LossChart({ history }: { history: RecordItem[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={history}
        margin={{ top: 12, right: 14, bottom: 24, left: 4 }}
      >
        <CartesianGrid stroke="#e9eef5" vertical={false} />
        <XAxis
          dataKey="step"
          stroke="#64748b"
          minTickGap={40}
          tick={{ fontSize: 12 }}
          label={{
            value: "업데이트 횟수",
            position: "bottom",
            offset: 8,
            fill: "#64748b",
            fontSize: 12,
          }}
        />
        <YAxis
          stroke="#64748b"
          width={65}
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => Number(v.toPrecision(3)).toString()}
          label={{
            value: "MSE",
            angle: -90,
            position: "insideLeft",
            fill: "#64748b",
            fontSize: 12,
          }}
        />
        <Tooltip
          contentStyle={{
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            color: "#111827",
          }}
          labelFormatter={(v) => `업데이트 ${v}`}
        />
        <Legend verticalAlign="top" height={28} />
        <Line
          name="학습 MSE"
          dataKey="train"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          name="검증 MSE"
          dataKey="validation"
          stroke="#d97706"
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
