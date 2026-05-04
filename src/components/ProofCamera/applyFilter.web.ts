import { ProofFilter } from './filters';

/**
 * Apply a Proof filter to a source image (data URL or blob URL) on web.
 *
 * Uses an offscreen canvas with `ctx.filter` for the CSS-based color
 * grade, then composites the optional soft-light overlay on top before
 * exporting back to a JPEG data URL. The output mirrors what the user
 * sees in the live preview, so "what you see is what you save".
 *
 * Returns the filtered data URL + the canvas dimensions (the canvas is
 * sized to the source image at 1:1 — we don't downscale here, that's
 * the picker's job).
 *
 * Web-only — guarded by the `.web.ts` extension. Native (Phase 2) will
 * have its own Skia-based equivalent.
 */
export const applyProofFilter = (
  sourceDataUrl: string,
  filter: ProofFilter,
  /** Output JPEG quality 0..1. Default 0.9 — we already compressed at
   *  pickImage time, no need to re-crush here. */
  quality: number = 0.9,
): Promise<{ dataUrl: string; width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new (window as any).Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas 2D ctx unavailable'));
          return;
        }
        // 1) Apply the CSS color grade.
        if (filter.css && filter.css !== 'none') {
          (ctx as any).filter = filter.css;
        }
        ctx.drawImage(img, 0, 0, w, h);
        // 2) Composite the soft-light overlay (terracotta wash, blue
        //    tint, etc.) using source-atop so it doesn't extend beyond
        //    the photo edges.
        if (filter.overlay) {
          (ctx as any).filter = 'none';
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = filter.overlay;
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = 'source-over';
        }
        const out = canvas.toDataURL('image/jpeg', quality);
        resolve({ dataUrl: out, width: w, height: h });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = sourceDataUrl;
  });
