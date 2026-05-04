/**
 * Proof filters — single source of truth.
 *
 * Extracted from PhotoEditorSheet so the camera, the post-capture editor,
 * and any future filter slider all read from the same definitions. CSS
 * filter strings are applied on web via canvas ctx.filter ; on native
 * (Phase 2) the equivalent will be a Skia color matrix or shader. The
 * `overlay` color is a soft-light tint that goes on top after the
 * filter, used to push the warmth/coolness when CSS alone isn't enough.
 */

export interface ProofFilter {
  /** Stable id used for analytics + persisted state. */
  id: 'original' | 'warm' | 'golden' | 'chill' | 'fade';
  /** Human-readable label shown on the filter strip. */
  label: string;
  /** CSS filter string applied to the photo on web. `none` = identity. */
  css: string;
  /** Optional soft-light overlay drawn on top after the CSS filter. */
  overlay: string | null;
}

export const PROOF_FILTERS: ProofFilter[] = [
  {
    id: 'original',
    label: 'Original',
    css: 'none',
    overlay: null,
  },
  {
    id: 'warm',
    label: 'Proof. Warm',
    css: 'sepia(0.25) saturate(1.4) brightness(1.05) hue-rotate(-10deg)',
    overlay: 'rgba(255,140,50,0.15)',
  },
  {
    id: 'golden',
    label: 'Golden',
    css: 'sepia(0.4) brightness(1.12) saturate(1.1) hue-rotate(-15deg)',
    overlay: 'rgba(255,200,50,0.18)',
  },
  {
    id: 'chill',
    label: 'Chill',
    css: 'saturate(0.7) brightness(0.95) hue-rotate(15deg) contrast(1.05)',
    overlay: 'rgba(80,130,210,0.15)',
  },
  {
    id: 'fade',
    label: 'Fade',
    css: 'contrast(0.85) brightness(1.15) saturate(0.75) sepia(0.1)',
    overlay: 'rgba(255,255,255,0.12)',
  },
];

export const DEFAULT_FILTER_ID: ProofFilter['id'] = 'original';

/** Lookup helper — falls back to original if the id isn't recognised. */
export const getFilterById = (id: string | undefined | null): ProofFilter => {
  if (!id) return PROOF_FILTERS[0];
  return PROOF_FILTERS.find((f) => f.id === id) || PROOF_FILTERS[0];
};
