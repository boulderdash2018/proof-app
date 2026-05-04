import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, Image, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../../constants';
import { PROOF_FILTERS, ProofFilter, getFilterById, DEFAULT_FILTER_ID } from './filters';
import { applyProofFilter } from './applyFilter.web';
import { FilterStrip } from './FilterStrip.web';

export interface ProofCameraResult {
  /** Final data URL — already filtered + JPEG-encoded. */
  dataUrl: string;
  width: number;
  height: number;
  /** Filter applied (id from PROOF_FILTERS). 'original' if none. */
  filterId: ProofFilter['id'];
  /** Source of the image — useful for analytics + permission UX. */
  source: 'camera' | 'gallery';
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onCapture: (result: ProofCameraResult) => void;
  /** Aspect ratio of the captured image. Default: free (camera native). */
  aspect?: [number, number];
  /** Surface a "Pellicule" tile that opens the system file picker.
   *  Default: true. Pass false for camera-only flows (e.g. live souvenir). */
  allowGallery?: boolean;
}

type Stage = 'capture' | 'review';

/**
 * ProofCamera (web variant) — fullscreen branded camera replacing the
 * combo system picker + native camera. Built on top of getUserMedia
 * for the live preview, an offscreen canvas for the capture, and the
 * shared PROOF_FILTERS stack for the post-capture editor.
 *
 * Two stages :
 *   1. CAPTURE — viewfinder fullscreen + capture button + flip + flash
 *      (limited on web, see notes). Tap the gallery thumbnail to pull
 *      a file from the OS picker (the only viable web fallback ; on
 *      native we'll surface a custom Proof gallery in Phase 2).
 *   2. REVIEW — post-capture editor with the photo + horizontal
 *      filter strip (Insta-style) + Retake / Valider footer.
 *
 * Permissions : navigator.mediaDevices.getUserMedia returns a
 * MediaStream for the chosen facing mode. If the user denies the
 * camera permission, the capture button switches to a gallery-only
 * affordance ("Importer une photo") so they're never blocked.
 *
 * The result returned to onCapture is ALREADY filtered — the caller
 * just gets a finished JPEG data URL ready to upload via
 * sendPhotoMessage / Storage / etc. The caller doesn't need to know
 * about filters at all.
 */
export const ProofCamera: React.FC<Props> = ({
  visible, onClose, onCapture, aspect, allowGallery = true,
}) => {
  // ── Refs ──────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── State ─────────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>('capture');
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [permissionState, setPermissionState] = useState<'unknown' | 'pending' | 'granted' | 'denied'>('unknown');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [capturedRaw, setCapturedRaw] = useState<{ dataUrl: string; width: number; height: number; source: 'camera' | 'gallery' } | null>(null);
  const [filterId, setFilterId] = useState<ProofFilter['id']>(DEFAULT_FILTER_ID);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  // ── Capture button press animation ─────────────────────────────
  const captureScale = useRef(new Animated.Value(1)).current;
  const animCapture = () => {
    Animated.sequence([
      Animated.timing(captureScale, { toValue: 0.85, duration: 90, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.spring(captureScale, { toValue: 1, friction: 5, tension: 200, useNativeDriver: true }),
    ]).start();
  };

  // ── Lifecycle: start/stop the camera stream ───────────────────
  useEffect(() => {
    if (!visible) {
      stopStream();
      return;
    }
    if (stage !== 'capture') return; // no preview during review
    setErrorMsg(null);
    setPermissionState('pending');
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1920 },
            height: { ideal: 1920 },
          },
          audio: false,
        });
        streamRef.current = stream;
        setPermissionState('granted');
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        console.warn('[ProofCamera] getUserMedia failed:', err);
        setPermissionState('denied');
        setErrorMsg(
          err?.name === 'NotAllowedError'
            ? 'Accès à la caméra refusé. Tu peux importer une photo depuis ton appareil.'
            : 'Caméra indisponible. Tu peux importer une photo depuis ton appareil.',
        );
      }
    })();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, facing, stage]);

  // ── Re-apply the active filter whenever it changes (review only) ──
  useEffect(() => {
    if (stage !== 'review' || !capturedRaw) return;
    let cancelled = false;
    (async () => {
      const filter = getFilterById(filterId);
      try {
        const out = await applyProofFilter(capturedRaw.dataUrl, filter, 0.92);
        if (!cancelled) setPreviewDataUrl(out.dataUrl);
      } catch (err) {
        console.warn('[ProofCamera] filter apply failed:', err);
        if (!cancelled) setPreviewDataUrl(capturedRaw.dataUrl);
      }
    })();
    return () => { cancelled = true; };
  }, [stage, capturedRaw, filterId]);

  // ── Helpers ────────────────────────────────────────────────────
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const resetAndClose = () => {
    stopStream();
    setStage('capture');
    setCapturedRaw(null);
    setFilterId(DEFAULT_FILTER_ID);
    setPreviewDataUrl(null);
    setErrorMsg(null);
    setValidating(false);
    onClose();
  };

  const handleCapture = async () => {
    if (!videoRef.current || !streamRef.current) return;
    animCapture();
    const video = videoRef.current;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    // Center-crop to the requested aspect ratio if any.
    let cropX = 0, cropY = 0, cropW = w, cropH = h;
    if (aspect) {
      const target = aspect[0] / aspect[1];
      const current = w / h;
      if (current > target) {
        cropW = Math.round(h * target);
        cropX = Math.round((w - cropW) / 2);
      } else if (current < target) {
        cropH = Math.round(w / target);
        cropY = Math.round((h - cropH) / 2);
      }
    }

    // Cap output to 1920 on the longer edge — same threshold as
    // pickImage.ts, keeps the upload payload small.
    const longer = Math.max(cropW, cropH);
    const scale = longer > 1920 ? 1920 / longer : 1;
    const outW = Math.round(cropW * scale);
    const outH = Math.round(cropH * scale);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Front camera (user) → mirror so the captured image matches what
    // the user saw in the preview (browsers mirror the video element by
    // default for user-facing cameras, but the canvas doesn't).
    if (facing === 'user') {
      ctx.translate(outW, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setCapturedRaw({ dataUrl, width: outW, height: outH, source: 'camera' });
    setFilterId(DEFAULT_FILTER_ID);
    setPreviewDataUrl(dataUrl);
    setStage('review');
    stopStream();
  };

  const handleFlip = () => {
    setFacing((f) => (f === 'user' ? 'environment' : 'user'));
  };

  const handlePickFromGallery = () => {
    fileInputRef.current?.click();
  };

  const handleFileChosen: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input so the same file can be picked again later.
    e.target.value = '';
    try {
      const dataUrl = await fileToDataUrl(file);
      const dims = await readImageDims(dataUrl);
      // Downscale gallery imports to 1920 max — same as live capture.
      const longer = Math.max(dims.width, dims.height);
      const scale = longer > 1920 ? 1920 / longer : 1;
      const out = scale === 1
        ? { dataUrl, ...dims }
        : await downscaleDataUrl(dataUrl, Math.round(dims.width * scale), Math.round(dims.height * scale));
      setCapturedRaw({ dataUrl: out.dataUrl, width: out.width, height: out.height, source: 'gallery' });
      setFilterId(DEFAULT_FILTER_ID);
      setPreviewDataUrl(out.dataUrl);
      setStage('review');
      stopStream();
    } catch (err) {
      console.warn('[ProofCamera] gallery import failed:', err);
      setErrorMsg('Impossible de lire ce fichier image.');
    }
  };

  const handleRetake = () => {
    setCapturedRaw(null);
    setPreviewDataUrl(null);
    setFilterId(DEFAULT_FILTER_ID);
    setStage('capture');
  };

  const handleValidate = async () => {
    if (!capturedRaw || validating) return;
    setValidating(true);
    try {
      const filter = getFilterById(filterId);
      const out = await applyProofFilter(capturedRaw.dataUrl, filter, 0.9);
      onCapture({
        dataUrl: out.dataUrl,
        width: out.width,
        height: out.height,
        filterId: filter.id,
        source: capturedRaw.source,
      });
      resetAndClose();
    } catch (err) {
      console.warn('[ProofCamera] validate failed:', err);
      setErrorMsg('Échec de la finalisation. Réessaie.');
      setValidating(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={resetAndClose}
      transparent={false}
    >
      <View style={styles.root}>
        {/* Hidden file input — opened on demand by the gallery tile. */}
        {allowGallery && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChosen}
          />
        )}

        {stage === 'capture' ? (
          <>
            {/* ── Viewfinder ── */}
            <View style={styles.viewfinder}>
              {permissionState === 'pending' && (
                <View style={styles.centeredOverlay}>
                  <ActivityIndicator size="large" color={Colors.terracotta300} />
                  <Text style={styles.overlayText}>Autorise la caméra…</Text>
                </View>
              )}
              {permissionState === 'denied' && (
                <View style={styles.centeredOverlay}>
                  <Ionicons name="camera-reverse-outline" size={36} color={Colors.terracotta200} />
                  <Text style={styles.overlayText} numberOfLines={3}>
                    {errorMsg || 'Caméra indisponible.'}
                  </Text>
                </View>
              )}
              {/* The video element is the actual preview. We mirror it
                  for the front camera so the user sees themselves the
                  way they expect. */}
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: facing === 'user' ? 'scaleX(-1)' : 'none',
                  background: '#000',
                }}
              />
            </View>

            {/* ── Top bar : close + brand ── */}
            <View style={[styles.topBar, { top: 0 }]}>
              <TouchableOpacity onPress={resetAndClose} style={styles.iconBtn} hitSlop={12}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.brand}>
                <View style={styles.brandDot} />
                <Text style={styles.brandText}>PROOF</Text>
              </View>
              <View style={styles.iconBtn} />
            </View>

            {/* ── Bottom bar : gallery / capture / flip ── */}
            <View style={styles.bottomBar}>
              <View style={styles.bottomBarRow}>
                {allowGallery ? (
                  <TouchableOpacity
                    style={styles.galleryTile}
                    onPress={handlePickFromGallery}
                    activeOpacity={0.8}
                  >
                    {/* Renamed from "Pellicule" → "Importer" on web :
                        a system file input on macOS opens Finder (no
                        "photo library" concept), and on iOS Safari it
                        opens a sheet that includes "Take photo" along
                        with the library. The honest label is "import a
                        photo from your device". On native Phase 2
                        we'll rename back to "Pellicule" with a real
                        photo-library accessor (expo-media-library). */}
                    <Ionicons name="image-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.galleryTileLabel}>Importer</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.galleryTile} />
                )}

                <TouchableOpacity
                  onPress={handleCapture}
                  disabled={permissionState !== 'granted'}
                  activeOpacity={0.85}
                  style={{ opacity: permissionState === 'granted' ? 1 : 0.4 }}
                >
                  <Animated.View style={[styles.captureBtnOuter, { transform: [{ scale: captureScale }] }]}>
                    <View style={styles.captureBtnInner} />
                  </Animated.View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.galleryTile}
                  onPress={handleFlip}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera-reverse-outline" size={22} color="#FFFFFF" />
                  <Text style={styles.galleryTileLabel}>Face</Text>
                </TouchableOpacity>
              </View>

              {permissionState === 'denied' && allowGallery && (
                <TouchableOpacity
                  style={styles.fallbackImportBtn}
                  onPress={handlePickFromGallery}
                  activeOpacity={0.85}
                >
                  <Ionicons name="image-outline" size={16} color={Colors.textOnAccent} />
                  <Text style={styles.fallbackImportText}>Importer une photo</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <>
            {/* ── Review stage : filtered preview + filter strip ── */}
            <View style={styles.reviewWrap}>
              {previewDataUrl ? (
                <Image source={{ uri: previewDataUrl }} style={styles.reviewImg} />
              ) : (
                <View style={[styles.reviewImg, { alignItems: 'center', justifyContent: 'center' }]}>
                  <ActivityIndicator size="large" color={Colors.terracotta300} />
                </View>
              )}
            </View>

            {/* Top bar */}
            <View style={[styles.topBar, { top: 0 }]}>
              <TouchableOpacity onPress={resetAndClose} style={styles.iconBtn} hitSlop={12}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.reviewTitle}>Choisis un filtre</Text>
              <View style={styles.iconBtn} />
            </View>

            {/* Bottom : filter strip + Retake/Valider */}
            <View style={styles.reviewBottom}>
              {capturedRaw && (
                <FilterStrip
                  sourceDataUrl={capturedRaw.dataUrl}
                  selectedId={filterId}
                  onSelect={setFilterId}
                />
              )}
              <View style={styles.reviewActions}>
                <TouchableOpacity
                  style={styles.btnGhost}
                  onPress={handleRetake}
                  disabled={validating}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh" size={14} color="#FFFFFF" />
                  <Text style={styles.btnGhostText}>Reprendre</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, validating && { opacity: 0.6 }]}
                  onPress={handleValidate}
                  disabled={validating}
                  activeOpacity={0.85}
                >
                  {validating ? (
                    <ActivityIndicator size="small" color={Colors.textOnAccent} />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={14} color={Colors.textOnAccent} />
                      <Text style={styles.btnPrimaryText}>Valider</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
};

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const readImageDims = (dataUrl: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new (window as any).Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('decode failed'));
    img.src = dataUrl;
  });

const downscaleDataUrl = (
  source: string, w: number, h: number,
): Promise<{ dataUrl: string; width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new (window as any).Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no ctx')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.88), width: w, height: h });
      } catch (err) { reject(err); }
    };
    img.onerror = () => reject(new Error('decode failed'));
    img.src = source;
  });

// ──────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create<any>({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },

  // ── Capture stage ──
  viewfinder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  centeredOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
    zIndex: 1,
  },
  overlayText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    textAlign: 'center',
    lineHeight: 19,
  },

  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingTop: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 5,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  brandText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.6,
  },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingBottom: 38,
    paddingHorizontal: 24,
    background: 'linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))' as any,
    zIndex: 5,
  },
  bottomBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  galleryTile: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  galleryTileLabel: {
    fontSize: 9.5,
    color: '#FFFFFF',
    fontFamily: Fonts.bodyMedium,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  captureBtnOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  captureBtnInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
  },
  fallbackImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignSelf: 'center',
  },
  fallbackImportText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },

  // ── Review stage ──
  reviewWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
    backgroundColor: '#000',
  },
  reviewTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: Fonts.displaySemiBold,
    letterSpacing: -0.1,
  },
  reviewBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 6,
    paddingBottom: 24,
    background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))' as any,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  btnGhost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  btnGhostText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: '#FFFFFF',
    letterSpacing: -0.05,
  },
  btnPrimary: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },
  btnPrimaryText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.05,
  },
});
