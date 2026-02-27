import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { PlayerRatingPoint } from '../types';

interface RatingChartProps {
  data: PlayerRatingPoint[];
}

interface ChartPoint {
  x: number;
  rating: number;
  upper: number;
  lower: number;
}

export default function RatingChart({ data }: RatingChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[320px] text-slate-500 text-sm">
        No rating history available
      </div>
    );
  }

  const chartData: ChartPoint[] = data.map((p) => ({
    x: p.playedAt,
    rating: Math.round(p.ratingElo * 100) / 100,
    upper: Math.round((p.ratingElo + p.sigmaElo) * 100) / 100,
    lower: Math.round((p.ratingElo - p.sigmaElo) * 100) / 100,
  }));

  const allValues = chartData.flatMap((d) => [d.upper, d.lower]);
  const yMin = Math.floor(Math.min(...allValues) / 50) * 50;
  const yMax = Math.ceil(Math.max(...allValues) / 50) * 50;

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.01} />
          </linearGradient>
          <linearGradient id="sigmaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.07} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 6"
          stroke="rgba(148,163,184,0.06)"
          vertical={false}
        />

        <XAxis
          dataKey="x"
          stroke="rgba(148,163,184,0.2)"
          tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'JetBrains Mono' }}
          tickLine={false}
          axisLine={false}
          label={{
            value: 'Game Time',
            position: 'insideBottomRight',
            offset: -5,
            style: { fill: '#475569', fontSize: 10 },
          }}
        />

        <YAxis
          stroke="rgba(148,163,184,0.2)"
          tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'JetBrains Mono' }}
          tickLine={false}
          axisLine={false}
          domain={[yMin, yMax]}
          width={55}
        />

        <Tooltip content={<CustomTooltip />} />

        {/* Sigma upper bound */}
        <Line
          dataKey="upper"
          stroke="rgba(139,92,246,0.15)"
          strokeDasharray="4 4"
          dot={false}
          strokeWidth={1}
          isAnimationActive={false}
        />

        {/* Sigma lower bound */}
        <Line
          dataKey="lower"
          stroke="rgba(139,92,246,0.15)"
          strokeDasharray="4 4"
          dot={false}
          strokeWidth={1}
          isAnimationActive={false}
        />

        {/* Rating area + line */}
        <Area
          dataKey="rating"
          stroke="#8b5cf6"
          fill="url(#ratingFill)"
          strokeWidth={2}
          dot={false}
          activeDot={{
            r: 4,
            fill: '#8b5cf6',
            stroke: '#1e1b4b',
            strokeWidth: 2,
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  return (
    <div className="bg-slate-800 border border-slate-700/80 rounded-lg px-3.5 py-2.5 shadow-xl text-xs space-y-1">
      <div className="flex items-center justify-between gap-6">
        <span className="text-slate-400">Game</span>
        <span className="font-mono text-slate-200">{d.x}</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-violet-400 font-medium">Rating</span>
        <span className="font-mono font-semibold text-white">{d.rating.toFixed(1)}</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-slate-500">Sigma</span>
        <span className="font-mono text-slate-400">
          {d.lower.toFixed(0)} &ndash; {d.upper.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
