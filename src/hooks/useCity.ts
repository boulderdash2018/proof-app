import { useAuthStore, useSettingsStore } from '../store';
import { useGuestStore } from '../store/guestStore';
import { getCityConfig, getCityCoordinates, DEFAULT_CITY, CityConfig } from '../constants/cities';

/**
 * Returns the current city config based on auth state.
 * - Authenticated users → settingsStore.city
 * - Guest users → guestStore.city
 */
export const useCity = (): CityConfig => {
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  const settingsCity = useSettingsStore((s) => s.city);
  const guestCity = useGuestStore((s) => s.city);
  const city = isAuth ? settingsCity : (guestCity || DEFAULT_CITY);
  return getCityConfig(city);
};

/**
 * Returns just the coordinates of the current city.
 */
export const useCityCoordinates = (): { lat: number; lng: number } => {
  const city = useCity();
  return city.coordinates;
};
