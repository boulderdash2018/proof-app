/**
 * Basic sanity rules for places proposed in a CoPlan workspace.
 *
 * Pure helper — no React, no store. Gets called BOTH from the picker
 * call-site (so we can show a clear toast/banner before sending to
 * Firestore) AND inside `coPlanStore.proposePlace` as a defense layer
 * (in case a future code path bypasses the UI check).
 *
 * Règles évidentes (proposées par le user) :
 *   1. Pas deux fois le même lieu — dédup par `googlePlaceId`.
 *   2. Pas plus de 10 lieux dans une journée — au-delà la planification
 *      n'a plus de sens (UX surchargée + parcours infaisable).
 *   3. Pas de villes / régions entières (Bayonne, Paris, France…) —
 *      ce sont des zones administratives, pas des lieux à visiter.
 *      Détecté via les `types` Google Places (locality, political,
 *      country, administrative_area_level_X…).
 *
 * Le validator retourne un code d'erreur sémantique (`duplicate`,
 * `too_many`, `is_region`) que le caller peut mapper sur sa propre
 * UX — copy adaptée, icône, etc.
 */

import { CoPlanProposedPlace } from '../types';

/** Borne haute "raisonnable" pour une journée. Ajustable si besoin. */
export const COPLAN_MAX_PLACES = 10;

/** Google Places types qui correspondent à des zones administratives,
 *  PAS à des lieux visitables. Si le type principal d'un lieu (ou un
 *  de ses types secondaires) tombe ici, on refuse l'ajout au plan. */
const REGION_TYPES = new Set<string>([
  'locality',
  'sublocality',
  'sublocality_level_1',
  'sublocality_level_2',
  'neighborhood',
  'political',
  'country',
  'continent',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'administrative_area_level_4',
  'administrative_area_level_5',
  'postal_code',
  'postal_town',
]);

export type CoPlanValidationCode = 'duplicate' | 'too_many' | 'is_region';

export type CoPlanValidationResult =
  | { ok: true }
  | { ok: false; code: CoPlanValidationCode; reason: string };

interface ValidateInput {
  googlePlaceId: string;
  /** Premier type Google (= `types[0]`), stocké comme `category` sur les
   *  CoPlanProposedPlace existants. */
  category?: string;
  /** Liste complète des types Google (de `getPlaceDetails`). Si fournie,
   *  on regarde TOUS les types — un lieu peut avoir `tourist_attraction`
   *  en premier mais aussi être `locality` quelque part dans la liste. */
  types?: string[];
}

/**
 * Vérifie qu'un lieu sur le point d'être proposé respecte les règles
 * de base. Appelé avant `proposePlace` côté UI (picker), et également
 * comme garde-fou côté store.
 */
export function validatePlaceForCoPlan(
  input: ValidateInput,
  existing: Pick<CoPlanProposedPlace, 'googlePlaceId'>[],
): CoPlanValidationResult {
  // 1. Doublon — même googlePlaceId déjà dans la liste.
  if (existing.some((p) => p.googlePlaceId === input.googlePlaceId)) {
    return {
      ok: false,
      code: 'duplicate',
      reason: 'Ce lieu est déjà dans la liste.',
    };
  }

  // 2. Plafond — la journée a déjà 10 lieux.
  if (existing.length >= COPLAN_MAX_PLACES) {
    return {
      ok: false,
      code: 'too_many',
      reason: `Une journée tient en ${COPLAN_MAX_PLACES} lieux max.`,
    };
  }

  // 3. Région / ville entière — pas un lieu visitable.
  // On regarde les types passés (liste complète si dispo) + le category
  // (= types[0] historiquement). Les deux sources sont fusionnées.
  const allTypes = new Set<string>([
    ...(input.types || []),
    ...(input.category ? [input.category] : []),
  ]);
  for (const t of allTypes) {
    if (REGION_TYPES.has(t)) {
      return {
        ok: false,
        code: 'is_region',
        reason: 'Choisis un lieu précis (café, parc, musée…) plutôt qu\'une ville entière.',
      };
    }
  }

  return { ok: true };
}
