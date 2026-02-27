import {
  Circle,
  Crown,
  Flame,
  Gem,
  Medal,
  Shield,
  Sparkles,
  Swords,
  Target,
  Trophy,
} from 'lucide-react';
import clsx from 'clsx';
import { formatTopPercent, getRankTierFromPosition, getTopPercent } from '../utils/rankTier';

interface RankTierBadgeProps {
  rankPosition: number;
  totalPlayers: number;
  showRank?: boolean;
  showPercent?: boolean;
  compact?: boolean;
  className?: string;
}

const ICONS = {
  crown: Crown,
  sparkles: Sparkles,
  gem: Gem,
  shield: Shield,
  medal: Medal,
  trophy: Trophy,
  flame: Flame,
  swords: Swords,
  target: Target,
  circle: Circle,
} as const;

export default function RankTierBadge({
  rankPosition,
  totalPlayers,
  showRank = false,
  showPercent = false,
  compact = false,
  className,
}: RankTierBadgeProps) {
  const tier = getRankTierFromPosition(rankPosition, totalPlayers);
  const Icon = ICONS[tier.iconName];
  const topPercent = getTopPercent(rankPosition, totalPlayers);

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md border font-semibold',
        compact ? 'gap-1 px-2 py-0.5 text-[10px]' : 'gap-1.5 px-2.5 py-1 text-xs',
        tier.classes.border,
        tier.classes.bg,
        tier.classes.text,
        className,
      )}
      title={`Top ${formatTopPercent(topPercent)}% | rank #${rankPosition.toLocaleString()} / ${totalPlayers.toLocaleString()}`}
    >
      <Icon className={clsx(compact ? 'h-3 w-3' : 'h-3.5 w-3.5', tier.classes.icon)} />
      <span>{tier.label}</span>
      {showRank && <span className="font-mono opacity-90">#{rankPosition.toLocaleString()}</span>}
      {showPercent && (
        <span className="font-mono opacity-90">Top {formatTopPercent(topPercent)}%</span>
      )}
    </span>
  );
}
