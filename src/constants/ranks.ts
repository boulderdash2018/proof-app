export type RankId = 'ghost' | 'newcomer' | 'local' | 'explorer' | 'curator' | 'tastemaker' | 'proof_icon' | 'top_creator';

export interface RankDef {
  id: RankId;
  name: string;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
  minProofs: number;
  shimmer?: boolean;
}

export const RANKS: RankDef[] = [
  { id: 'ghost', name: 'Ghost', emoji: '👻', color: '#A09181', bgColor: '#F5F0E8', borderColor: '#EDE5D8', minProofs: 0 },
  { id: 'newcomer', name: 'Newcomer', emoji: '🌱', color: '#7B9971', bgColor: '#F0F5EE', borderColor: '#D4E0D0', minProofs: 1 },
  { id: 'local', name: 'Local', emoji: '📍', color: '#D4A04A', bgColor: '#FDF6EC', borderColor: '#F0E0C4', minProofs: 5 },
  { id: 'explorer', name: 'Explorer', emoji: '🧭', color: '#C4704B', bgColor: '#FDF5F0', borderColor: '#F9E8DD', minProofs: 15 },
  { id: 'curator', name: 'Curator', emoji: '✨', color: '#B07888', bgColor: '#F6F0F2', borderColor: '#E8D8DE', minProofs: 35 },
  { id: 'tastemaker', name: 'Tastemaker', emoji: '👑', color: '#8B7BA0', bgColor: '#F3F0F6', borderColor: '#DDD8E6', minProofs: 75 },
  { id: 'proof_icon', name: 'Proof. Icon', emoji: '🏆', color: '#D4A04A', bgColor: '#FDF6EC', borderColor: '#F0E0C4', minProofs: 150 },
  { id: 'top_creator', name: 'Top Creator', emoji: '💎', color: '#C4704B', bgColor: '#FDF5F0', borderColor: '#F9E8DD', minProofs: 300, shimmer: true },
];

export const getRankForProofs = (proofs: number): RankDef => {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (proofs >= RANKS[i].minProofs) return RANKS[i];
  }
  return RANKS[0];
};

export const getNextRank = (rank: RankDef): RankDef | null => {
  const idx = RANKS.findIndex((r) => r.id === rank.id);
  return idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
};

export const getRankProgress = (proofs: number): { current: RankDef; next: RankDef | null; progress: number; proofsInRank: number; proofsNeeded: number } => {
  const current = getRankForProofs(proofs);
  const next = getNextRank(current);
  if (!next) return { current, next: null, progress: 1, proofsInRank: 0, proofsNeeded: 0 };
  const range = next.minProofs - current.minProofs;
  const done = proofs - current.minProofs;
  return { current, next, progress: Math.min(1, done / range), proofsInRank: done, proofsNeeded: range };
};
