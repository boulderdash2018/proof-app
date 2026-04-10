export interface CityConfig {
  name: string;
  emoji: string;
  country: string;
  coordinates: { lat: number; lng: number };
  available: boolean;
}

export const CITIES: CityConfig[] = [
  { name: 'Paris', emoji: '🗼', country: 'France', coordinates: { lat: 48.8566, lng: 2.3522 }, available: true },
  { name: 'London', emoji: '🇬🇧', country: 'England', coordinates: { lat: 51.5074, lng: -0.1278 }, available: true },
  { name: 'Madrid', emoji: '🇪🇸', country: 'Spain', coordinates: { lat: 40.4168, lng: -3.7038 }, available: true },
  { name: 'Lyon', emoji: '🦁', country: 'France', coordinates: { lat: 45.7640, lng: 4.8357 }, available: false },
  { name: 'Marseille', emoji: '🌊', country: 'France', coordinates: { lat: 43.2965, lng: 5.3698 }, available: false },
  { name: 'Bordeaux', emoji: '🍷', country: 'France', coordinates: { lat: 44.8378, lng: -0.5792 }, available: false },
];

export const DEFAULT_CITY = 'Paris';

export const getCityConfig = (name: string): CityConfig =>
  CITIES.find((c) => c.name === name) || CITIES[0];

export const getCityCoordinates = (name: string): { lat: number; lng: number } =>
  getCityConfig(name).coordinates;
