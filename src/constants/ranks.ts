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
  { id: 'ghost', name: 'Ghost', emoji: '👻', color: '#5A5249', bgColor: '#1E1B18', borderColor: '#332E29', minProofs: 0 },
  { id: 'newcomer', name: 'Newcomer', emoji: '🌱', color: '#5B9A7B', bgColor: '#1E2A22', borderColor: '#2D3D30', minProofs: 1 },
  { id: 'local', name: 'Local', emoji: '📍', color: '#C9A84C', bgColor: '#2D2510', borderColor: '#3D3318', minProofs: 5 },
  { id: 'explorer', name: 'Explorer', emoji: '🧭', color: '#D4845A', bgColor: '#2D2118', borderColor: '#3D2E22', minProofs: 15 },
  { id: 'curator', name: 'Curator', emoji: '✨', color: '#B07888', bgColor: '#2D1F25', borderColor: '#3D2D30', minProofs: 35 },
  { id: 'tastemaker', name: 'Tastemaker', emoji: '👑', color: '#8B7BA0', bgColor: '#2A2530', borderColor: '#3D3050', minProofs: 75 },
  { id: 'proof_icon', name: 'Proof Icon', emoji: '🏆', color: '#C9A84C', bgColor: '#2D2510', borderColor: '#3D3318', minProofs: 150 },
  { id: 'top_creator', name: 'Top Creator', emoji: '💎', color: '#D4845A', bgColor: '#2D2118', borderColor: '#3D2E22', minProofs: 300, shimmer: true },
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
