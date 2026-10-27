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
import { palette } from "./theme";
export default function LossChart({
  history,
  task,
}: {
  history: RecordItem[];
  task: string;
}) {
  const metric = task === "classification" ? "BCE" : "MSE";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={history}
        margin={{ top: 8, right: 10, bottom: 20, left: 0 }}
      >
        <CartesianGrid stroke={palette.grid} vertical={false} />
        <XAxis
          dataKey="step"
          stroke={palette.muted}
          minTickGap={40}
          tick={{ fontSize: 12 }}
          label={{
            value: "업데이트 횟수",
            position: "bottom",
            offset: 8,
            fill: palette.muted,
            fontSize: 12,
          }}
        />
        <YAxis
          stroke={palette.muted}
          width={52}
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => Number(v.toPrecision(3)).toString()}
          label={{
            value: metric,
            angle: -90,
            position: "insideLeft",
            fill: palette.muted,
            fontSize: 12,
          }}
        />
        <Tooltip
          contentStyle={{
            border: `1px solid ${palette.sageLight}`,
            borderRadius: 8,
            color: palette.ink,
          }}
          labelFormatter={(v) => `업데이트 ${v}`}
        />
        <Legend
          verticalAlign="top"
          height={24}
          iconSize={10}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Line
          name={`학습 ${metric}`}
          dataKey="train"
          stroke={palette.sageDeep}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          name={`검증 ${metric}`}
          dataKey="validation"
          stroke={palette.rose}
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
