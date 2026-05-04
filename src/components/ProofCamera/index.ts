/**
 * Proof Camera — public API.
 *
 * Two ways to consume :
 *
 *   1. Declarative — mount <ProofCamera visible onClose onCapture /> in
 *      your screen. Best when the camera is part of a screen's layout
 *      and you control the trigger.
 *
 *   2. Imperative — useProofCamera() returns { open, ProofCameraHost }.
 *      Drop <ProofCameraHost /> at the root of the component, then call
 *      `await open(opts)` to get a ProofCameraResult (or null if the
 *      user closed without capturing). Best for one-shot replacements
 *      of pickImage() — the call site stays a single async line.
 *
 * Both paths resolve to the SAME ProofCameraResult shape, regardless of
 * platform (web variant + native fallback share the type).
 */

export { ProofCamera } from './ProofCamera';
export type { ProofCameraResult } from './ProofCamera';
export { useProofCamera } from './useProofCamera';
export { PROOF_FILTERS, getFilterById } from './filters';
export type { ProofFilter } from './filters';
