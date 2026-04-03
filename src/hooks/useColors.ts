import { Colors, DarkColors } from '../constants';
import { useThemeStore } from '../store';

export const useColors = () => {
  const isDark = useThemeStore((s) => s.isDark);
  return isDark ? DarkColors : Colors;
};
