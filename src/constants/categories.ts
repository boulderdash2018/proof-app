import { CategoryTag } from '../types';

export interface CategoryDef {
  name: CategoryTag;
  emoji: string;
  bg: string;
}

export const CATEGORIES: CategoryDef[] = [
  { name: 'cheap date', emoji: '💸', bg: '#FF6B35' },
  { name: 'w the bro', emoji: '🍺', bg: '#1D9E75' },
  { name: 'solo vibe', emoji: '🎧', bg: '#534AB7' },
  { name: 'tiktokable', emoji: '📱', bg: '#E24B4A' },
  { name: 'soirée', emoji: '🌙', bg: '#185FA5' },
  { name: 'sport', emoji: '🏃', bg: '#3B6D11' },
  { name: 'culture', emoji: '🎨', bg: '#7F77DD' },
  { name: 'foodie', emoji: '🍜', bg: '#B37518' },
  { name: 'famille', emoji: '👨‍👩‍👧', bg: '#059669' },
  { name: 'outdoor', emoji: '🌿', bg: '#0F9B68' },
  { name: 'fashion', emoji: '👗', bg: '#993556' },
  { name: 'niche', emoji: '🔮', bg: '#534AB7' },
];
