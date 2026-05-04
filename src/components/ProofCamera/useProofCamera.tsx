import React, { useCallback, useRef, useState } from 'react';
import { ProofCamera, ProofCameraResult } from './ProofCamera';

interface OpenOptions {
  aspect?: [number, number];
  allowGallery?: boolean;
}

interface ProofCameraController {
  /**
   * Imperatively open the camera. Resolves with a ProofCameraResult on
   * capture, or null if the user closed without capturing.
   */
  open: (opts?: OpenOptions) => Promise<ProofCameraResult | null>;
  /**
   * Render this once at the root of the consuming component so the
   * modal has a place to mount. Zero-config — pass it through with no
   * props.
   */
  ProofCameraHost: React.FC;
}

/**
 * Imperative entry point for the Proof Camera. Lets call sites that
 * used `await pickImage()` swap to `await open()` with no JSX surgery.
 *
 * Usage :
 *
 *   const { open, ProofCameraHost } = useProofCamera();
 *
 *   const handleClick = async () => {
 *     const photo = await open({ aspect: [1, 1] });
 *     if (!photo) return;
 *     console.log(photo.dataUrl, photo.filterId);
 *   };
 *
 *   return (
 *     <>
 *       <Button onPress={handleClick} />
 *       <ProofCameraHost />
 *     </>
 *   );
 */
export const useProofCamera = (): ProofCameraController => {
  const [visible, setVisible] = useState(false);
  const [opts, setOpts] = useState<OpenOptions>({});
  // Resolver for the in-flight open() promise. Single-flight by design ;
  // calling open() while already open replaces the previous resolver.
  const resolverRef = useRef<((r: ProofCameraResult | null) => void) | null>(null);

  const open = useCallback((next?: OpenOptions): Promise<ProofCameraResult | null> => {
    // If a previous open() is still pending, resolve it as cancelled
    // so its caller doesn't hang.
    resolverRef.current?.(null);
    setOpts(next || {});
    setVisible(true);
    return new Promise<ProofCameraResult | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    // If the user closed without capturing, resolve null.
    if (resolverRef.current) {
      resolverRef.current(null);
      resolverRef.current = null;
    }
  }, []);

  const handleCapture = useCallback((result: ProofCameraResult) => {
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
    setVisible(false);
  }, []);

  const ProofCameraHost: React.FC = useCallback(() => (
    <ProofCamera
      visible={visible}
      onClose={handleClose}
      onCapture={handleCapture}
      aspect={opts.aspect}
      allowGallery={opts.allowGallery}
    />
  ), [visible, handleClose, handleCapture, opts.aspect, opts.allowGallery]);

  return { open, ProofCameraHost };
};
