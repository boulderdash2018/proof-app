/**
 * Spots — recommandations single-place (format secondaire au Plan).
 *
 * Stockés dans la collection `spots/{id}`. Lecture publique, création
 * authentifiée (le user s'attribue lui-même via recommenderId), update
 * limité au champ savedByIds (toggle save), pas de delete pour l'instant
 * (modération manuelle si besoin via console Firebase).
 *
 * Cap mensuel : pas enforce côté serveur pour l'instant — on autorise
 * en posté beaucoup pendant la beta de test. À ré-activer plus tard via
 * une rule custom + helper countMySpotsThisMonth() ci-dessous.
 */

import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit as fbLimit,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Spot } from '../types';

const SPOTS = 'spots';

// ─── Helpers ─────────────────────────────────────────────────

const toISO = (ts: any): string => {
  if (!ts) return new Date().toISOString();
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts === 'string') return ts;
  return new Date().toISOString();
};

const getTimeAgo = (createdAt: string): string => {
  const now = Date.now();
  const then = new Date(createdAt).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'à l\'instant';
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days}j`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `il y a ${weeks} sem`;
  const months = Math.floor(days / 30);
  return `il y a ${months} mois`;
};

const hydrateSpot = (id: string, data: any): Spot => {
  const createdAt = toISO(data.createdAt);
  return {
    id,
    recommenderId: data.recommenderId,
    recommenderName: data.recommenderName || '',
    recommenderUsername: data.recommenderUsername || '',
    recommenderAvatarUrl: data.recommenderAvatarUrl ?? null,
    recommenderAvatarBg: data.recommenderAvatarBg || '#C4704B',
    recommenderAvatarColor: data.recommenderAvatarColor || '#FFF8F0',
    recommenderInitials: data.recommenderInitials || '?',
    googlePlaceId: data.googlePlaceId,
    placeName: data.placeName || '',
    placeCategory: data.placeCategory,
    placeAddress: data.placeAddress,
    photoUrl: data.photoUrl ?? null,
    latitude: data.latitude,
    longitude: data.longitude,
    quote: data.quote || '',
    savedByIds: Array.isArray(data.savedByIds) ? data.savedByIds : [],
    city: data.city,
    createdAt,
    timeAgo: getTimeAgo(createdAt),
  };
};

// ─── Quote validation ────────────────────────────────────────
// Reflète strictement la rule Firestore — toute évolution doit être
// changée AUSSI dans firestore.rules (currently 30 / 180 chars).
export const QUOTE_MIN = 30;
export const QUOTE_MAX = 180;

export const validateQuote = (raw: string): { ok: boolean; reason?: string } => {
  const q = (raw || '').trim();
  if (q.length < QUOTE_MIN) {
    return { ok: false, reason: `Au moins ${QUOTE_MIN} caractères pour donner du contexte.` };
  }
  if (q.length > QUOTE_MAX) {
    return { ok: false, reason: `Maximum ${QUOTE_MAX} caractères — sois punchy.` };
  }
  return { ok: true };
};

// ─── CRUD ────────────────────────────────────────────────────

export interface CreateSpotInput {
  recommenderId: string;
  recommenderName: string;
  recommenderUsername: string;
  recommenderAvatarUrl: string | null;
  recommenderAvatarBg: string;
  recommenderAvatarColor: string;
  recommenderInitials: string;

  googlePlaceId: string;
  placeName: string;
  placeCategory?: string;
  placeAddress?: string;
  photoUrl?: string | null;
  latitude?: number;
  longitude?: number;

  quote: string;
  city?: string;
}

/** Crée un nouveau spot. Renvoie l'id du doc Firestore. */
export const createSpot = async (input: CreateSpotInput): Promise<string> => {
  const validation = validateQuote(input.quote);
  if (!validation.ok) {
    throw new Error(validation.reason || 'Phrase invalide');
  }
  // Strip undefined avant write — Firestore les rejette en strict mode.
  const payload: Record<string, any> = {
    recommenderId: input.recommenderId,
    recommenderName: input.recommenderName,
    recommenderUsername: input.recommenderUsername,
    recommenderAvatarUrl: input.recommenderAvatarUrl,
    recommenderAvatarBg: input.recommenderAvatarBg,
    recommenderAvatarColor: input.recommenderAvatarColor,
    recommenderInitials: input.recommenderInitials,
    googlePlaceId: input.googlePlaceId,
    placeName: input.placeName,
    quote: input.quote.trim(),
    savedByIds: [],
    createdAt: serverTimestamp(),
  };
  if (input.placeCategory) payload.placeCategory = input.placeCategory;
  if (input.placeAddress) payload.placeAddress = input.placeAddress;
  if (input.photoUrl) payload.photoUrl = input.photoUrl;
  if (typeof input.latitude === 'number') payload.latitude = input.latitude;
  if (typeof input.longitude === 'number') payload.longitude = input.longitude;
  if (input.city) payload.city = input.city;

  const ref = await addDoc(collection(db, SPOTS), payload);
  return ref.id;
};

/** Toggle save sur un spot. Idempotent : ajoute ou retire selon shouldSave. */
export const toggleSaveSpot = async (
  spotId: string,
  userId: string,
  shouldSave: boolean,
): Promise<void> => {
  const ref = doc(db, SPOTS, spotId);
  await updateDoc(ref, {
    savedByIds: shouldSave ? arrayUnion(userId) : arrayRemove(userId),
  });
};

/** Fetch les N spots les plus récents pour une ville (Paris par défaut).
 *  On filtre côté client par ville pour gérer les spots legacy sans champ city. */
export const fetchFeedSpots = async (
  city?: string,
  max: number = 30,
): Promise<Spot[]> => {
  try {
    const q = query(
      collection(db, SPOTS),
      orderBy('createdAt', 'desc'),
      // Surcouche x2 pour absorber le filtre ville côté client sans
      // sous-charger le résultat affiché.
      fbLimit(max * 2),
    );
    const snap = await getDocs(q);
    const all = snap.docs.map((d) => hydrateSpot(d.id, d.data()));
    if (!city) return all.slice(0, max);
    return all
      .filter((s) => (s.city || 'Paris') === city)
      .slice(0, max);
  } catch (err) {
    console.warn('[spotsService] fetchFeedSpots error:', err);
    return [];
  }
};

/** Spots posté par un user (pour le profil — onglet "Spots"). */
export const fetchSpotsByUser = async (userId: string): Promise<Spot[]> => {
  try {
    const q = query(
      collection(db, SPOTS),
      where('recommenderId', '==', userId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => hydrateSpot(d.id, d.data()));
  } catch (err) {
    console.warn('[spotsService] fetchSpotsByUser error:', err);
    return [];
  }
};

/** Compte les spots créés par un user dans le mois en cours. Utile pour
 *  enforcer un cap côté UI (ex: 3-5/mois) sans rule Firestore complexe. */
export const countMySpotsThisMonth = async (userId: string): Promise<number> => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const q = query(
      collection(db, SPOTS),
      where('recommenderId', '==', userId),
    );
    const snap = await getDocs(q);
    return snap.docs.filter((d) => {
      const ts = d.data().createdAt;
      const created = ts?.toDate?.() || (ts ? new Date(ts) : null);
      return created && created >= startOfMonth;
    }).length;
  } catch (err) {
    console.warn('[spotsService] countMySpotsThisMonth error:', err);
    return 0;
  }
};
