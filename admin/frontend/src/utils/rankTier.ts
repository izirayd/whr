export interface RankTierDefinition {
  id: string;
  label: string;
  maxTopPercent: number;
  iconName:
    | 'crown'
    | 'sparkles'
    | 'gem'
    | 'shield'
    | 'medal'
    | 'trophy'
    | 'flame'
    | 'swords'
    | 'target'
    | 'circle';
  classes: {
    border: string;
    bg: string;
    text: string;
    icon: string;
  };
}

export const RANK_TIERS: ReadonlyArray<RankTierDefinition> = [
  {
    id: 's_plus',
    label: 'S+',
    maxTopPercent: 0.1,
    iconName: 'crown',
    classes: {
      border: 'border-yellow-300/55',
      bg: 'bg-yellow-500/15',
      text: 'text-yellow-200',
      icon: 'text-yellow-300',
    },
  },
  {
    id: 's',
    label: 'S',
    maxTopPercent: 0.3,
    iconName: 'sparkles',
    classes: {
      border: 'border-violet-300/55',
      bg: 'bg-violet-500/15',
      text: 'text-violet-200',
      icon: 'text-violet-300',
    },
  },
  {
    id: 'a_plus',
    label: 'A+',
    maxTopPercent: 0.6,
    iconName: 'gem',
    classes: {
      border: 'border-fuchsia-300/50',
      bg: 'bg-fuchsia-500/15',
      text: 'text-fuchsia-200',
      icon: 'text-fuchsia-300',
    },
  },
  {
    id: 'a',
    label: 'A',
    maxTopPercent: 1.0,
    iconName: 'shield',
    classes: {
      border: 'border-cyan-300/45',
      bg: 'bg-cyan-500/15',
      text: 'text-cyan-200',
      icon: 'text-cyan-300',
    },
  },
  {
    id: 'b_plus',
    label: 'B+',
    maxTopPercent: 2.0,
    iconName: 'medal',
    classes: {
      border: 'border-blue-300/45',
      bg: 'bg-blue-500/15',
      text: 'text-blue-200',
      icon: 'text-blue-300',
    },
  },
  {
    id: 'b',
    label: 'B',
    maxTopPercent: 4.0,
    iconName: 'trophy',
    classes: {
      border: 'border-emerald-300/45',
      bg: 'bg-emerald-500/15',
      text: 'text-emerald-200',
      icon: 'text-emerald-300',
    },
  },
  {
    id: 'c_plus',
    label: 'C+',
    maxTopPercent: 7.0,
    iconName: 'flame',
    classes: {
      border: 'border-lime-300/45',
      bg: 'bg-lime-500/15',
      text: 'text-lime-200',
      icon: 'text-lime-300',
    },
  },
  {
    id: 'c',
    label: 'C',
    maxTopPercent: 12.0,
    iconName: 'swords',
    classes: {
      border: 'border-orange-300/45',
      bg: 'bg-orange-500/15',
      text: 'text-orange-200',
      icon: 'text-orange-300',
    },
  },
  {
    id: 'd_plus',
    label: 'D+',
    maxTopPercent: 20.0,
    iconName: 'target',
    classes: {
      border: 'border-slate-300/35',
      bg: 'bg-slate-500/15',
      text: 'text-slate-200',
      icon: 'text-slate-300',
    },
  },
  {
    id: 'd',
    label: 'D',
    maxTopPercent: 100.0,
    iconName: 'circle',
    classes: {
      border: 'border-zinc-400/30',
      bg: 'bg-zinc-500/10',
      text: 'text-zinc-200',
      icon: 'text-zinc-300',
    },
  },
];

function normalizeTotalPlayers(totalPlayers: number): number {
  if (!Number.isFinite(totalPlayers)) return 1;
  return Math.max(1, Math.floor(totalPlayers));
}

function normalizeRankPosition(rankPosition: number, totalPlayers: number): number {
  if (!Number.isFinite(rankPosition)) return 1;
  const normalizedTotal = normalizeTotalPlayers(totalPlayers);
  return Math.min(Math.max(1, Math.floor(rankPosition)), normalizedTotal);
}

export function getTopPercent(rankPosition: number, totalPlayers: number): number {
  const normalizedTotal = normalizeTotalPlayers(totalPlayers);
  const normalizedRank = normalizeRankPosition(rankPosition, normalizedTotal);
  return (normalizedRank / normalizedTotal) * 100;
}

export function formatTopPercent(topPercent: number): string {
  if (topPercent < 1) return topPercent.toFixed(2);
  if (topPercent < 10) return topPercent.toFixed(1);
  return topPercent.toFixed(0);
}

export function getRankTierFromPosition(
  rankPosition: number,
  totalPlayers: number,
): RankTierDefinition {
  const normalizedTotal = normalizeTotalPlayers(totalPlayers);
  const normalizedRank = normalizeRankPosition(rankPosition, normalizedTotal);

  for (let i = 0; i < RANK_TIERS.length; i += 1) {
    const tier = RANK_TIERS[i];
    const rawCutoff = Math.ceil((tier.maxTopPercent / 100) * normalizedTotal);
    const cutoff = Math.min(normalizedTotal, Math.max(rawCutoff, i + 1));
    if (normalizedRank <= cutoff) {
      return tier;
    }
  }

  return RANK_TIERS[RANK_TIERS.length - 1];
}
