import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
} from 'react-native';
import { Colors, Fonts } from '../../constants';
import { PROOF_FILTERS, ProofFilter } from './filters';
import { applyProofFilter } from './applyFilter.web';

interface Props {
  /** Source photo as a data URL — used to generate per-filter mini
   *  previews (shrunk to 64px so the canvas re-encode is cheap). */
  sourceDataUrl: string;
  /** Currently active filter id. */
  selectedId: ProofFilter['id'];
  onSelect: (id: ProofFilter['id']) => void;
}

const THUMB_SIZE = 64;

/**
 * Horizontal Instagram-style filter strip — one tile per Proof filter,
 * each tile shows a mini preview of the source photo with that filter
 * applied. The active tile gets a terracotta border + the filter
 * label highlighted.
 *
 * Mini previews are computed once per source photo (cached in state),
 * so swiping between filters on the main photo doesn't re-compute the
 * thumbnail strip. When the source changes (retake), thumbnails are
 * recomputed.
 *
 * Web-only for Phase 1 — the .tsx native fallback will need a Skia
 * equivalent later.
 */
export const FilterStrip: React.FC<Props> = ({ sourceDataUrl, selectedId, onSelect }) => {
  // Map<filterId, dataUrl>. Generated lazily — we kick off the work
  // once on mount and re-kick when the source changes.
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    setThumbs({});
    (async () => {
      // Build a small (THUMB_SIZE px wide) version of the source first
      // so the per-filter pipeline doesn't burn CPU on full-res images.
      const tiny = await downscale(sourceDataUrl, THUMB_SIZE * 2);
      if (cancelRef.current) return;
      // Generate previews sequentially — keeps the UI thread responsive
      // (parallel canvas operations on web tend to compete).
      for (const filter of PROOF_FILTERS) {
        if (cancelRef.current) break;
        try {
          const result = await applyProofFilter(tiny, filter, 0.78);
          if (cancelRef.current) break;
          setThumbs((prev) => ({ ...prev, [filter.id]: result.dataUrl }));
        } catch (err) {
          console.warn('[FilterStrip] thumb failed for', filter.id, err);
        }
      }
    })();
    return () => { cancelRef.current = true; };
  }, [sourceDataUrl]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {PROOF_FILTERS.map((f) => {
        const isActive = f.id === selectedId;
        const thumb = thumbs[f.id];
        return (
          <TouchableOpacity
            key={f.id}
            style={styles.tile}
            onPress={() => onSelect(f.id)}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.thumbFrame,
                isActive && styles.thumbFrameActive,
              ]}
            >
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.thumbImg} />
              ) : (
                <View style={styles.thumbPlaceholder} />
              )}
            </View>
            <Text
              style={[
                styles.label,
                isActive && styles.labelActive,
              ]}
              numberOfLines={1}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

/** Downscale a data URL to maxDim on the longer edge. */
const downscale = (sourceDataUrl: string, maxDim: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new (window as any).Image();
    img.onload = () => {
      try {
        const longer = Math.max(img.naturalWidth, img.naturalHeight);
        const scale = longer > maxDim ? maxDim / longer : 1;
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no ctx')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      } catch (err) { reject(err); }
    };
    img.onerror = () => reject(new Error('decode failed'));
    img.src = sourceDataUrl;
  });

// ──────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
    alignItems: 'flex-start',
  },
  tile: {
    width: THUMB_SIZE + 4,
    alignItems: 'center',
    gap: 6,
  },
  thumbFrame: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  thumbFrameActive: {
    borderColor: Colors.primary,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  label: {
    fontSize: 10.5,
    fontFamily: Fonts.bodyMedium,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.05,
  },
  labelActive: {
    color: '#FFFFFF',
    fontFamily: Fonts.bodyBold,
  },
});
