export interface CityConfig {
  name: string;
  emoji: string;
  country: string;
  countryCode: string;
  coordinates: { lat: number; lng: number };
  available: boolean;
}

export const CITIES: CityConfig[] = [
  { name: 'Paris', emoji: '🗼', country: 'France', countryCode: 'fr', coordinates: { lat: 48.8566, lng: 2.3522 }, available: true },
  { name: 'London', emoji: '🎡', country: 'England', countryCode: 'gb', coordinates: { lat: 51.5074, lng: -0.1278 }, available: true },
  { name: 'Madrid', emoji: '💃', country: 'Spain', countryCode: 'es', coordinates: { lat: 40.4168, lng: -3.7038 }, available: true },
];

export const DEFAULT_CITY = 'Paris';

export const getCityConfig = (name: string): CityConfig =>
  CITIES.find((c) => c.name === name) || CITIES[0];

export const getCityCoordinates = (name: string): { lat: number; lng: number } =>
  getCityConfig(name).coordinates;
