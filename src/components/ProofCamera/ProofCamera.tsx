import React, { useEffect, useRef } from 'react';
import { ProofFilter } from './filters';
import { pickImage } from '../../utils';

export interface ProofCameraResult {
  dataUrl: string;
  width: number;
  height: number;
  filterId: ProofFilter['id'];
  source: 'camera' | 'gallery';
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onCapture: (result: ProofCameraResult) => void;
  aspect?: [number, number];
  allowGallery?: boolean;
}

/**
 * Native fallback for the Proof camera.
 *
 * Phase 1 ships the web variant only ; on iOS / Android we still go
 * through expo-image-picker so existing flows aren't broken. The full
 * native ProofCamera will arrive in Phase 2 with react-native-vision-
 * camera + Skia (which require a custom dev build, can't ship via
 * Expo Go).
 *
 * The component exposes the SAME API as ProofCamera.web.tsx so callers
 * stay platform-agnostic. When mounted with `visible: true`, it
 * immediately opens the system picker, then resolves the onCapture
 * callback with a result shaped like the web variant (filterId set to
 * 'original' since we don't have the post-capture editor yet).
 */
export const ProofCamera: React.FC<Props> = ({
  visible, onClose, onCapture,
}) => {
  // Guard so we don't trigger the picker twice on rapid prop flips.
  const firingRef = useRef(false);

  useEffect(() => {
    if (!visible || firingRef.current) return;
    firingRef.current = true;
    (async () => {
      try {
        const picked = await pickImage();
        if (picked) {
          onCapture({
            dataUrl: picked.dataUrl,
            width: picked.width || 0,
            height: picked.height || 0,
            filterId: 'original',
            source: 'gallery', // we can't tell on native — defaults to gallery
          });
        }
      } catch (err) {
        console.warn('[ProofCamera native] picker failed:', err);
      } finally {
        firingRef.current = false;
        onClose();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return null;
};
