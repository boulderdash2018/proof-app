import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type ImagePickerSource = 'camera' | 'library';

export interface PickedImage {
  /** Usable in RN <Image source={{ uri }} /> and firebase uploadString (data URL) */
  dataUrl: string;
  width?: number;
  height?: number;
}

interface PickImageOptions {
  /** Aspect ratio for camera crop (iOS only). Default: undefined = free */
  aspect?: [number, number];
  /** Whether to show the built-in crop/edit UI after picking. Default: false */
  allowsEditing?: boolean;
  /** JPEG quality 0..1. Default: 0.7 */
  quality?: number;
}

const readFileAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/**
 * Resize a File/Blob to fit within `maxDim` on the longer edge and
 * re-encode as JPEG at the given quality. Returns a PickedImage with
 * the compressed data URL + the new dimensions.
 *
 * Web-only — relies on the browser's <img> + <canvas> APIs. On modern
 * browsers, a 6 MB iPhone photo comes out at ~400 KB and visually
 * identical at 1920 px wide. Drastically cuts upload time and avoids
 * Storage timeouts.
 */
const resizeAndCompress = (
  file: Blob,
  maxDim: number,
  quality: number,
): Promise<PickedImage> =>
  new Promise(async (resolve, reject) => {
    try {
      const originalDataUrl = await readFileAsDataUrl(file);
      const img = new (window as any).Image();
      img.onload = () => {
        try {
          const w0 = img.naturalWidth || img.width;
          const h0 = img.naturalHeight || img.height;
          const longer = Math.max(w0, h0);
          const scale = longer > maxDim ? maxDim / longer : 1;
          const w = Math.round(w0 * scale);
          const h = Math.round(h0 * scale);

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('canvas 2D ctx unavailable'));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({ dataUrl: compressedDataUrl, width: w, height: h });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = originalDataUrl;
    } catch (err) {
      reject(err);
    }
  });

/**
 * Pick an image — intelligent source resolution:
 *
 * - Web: bypass any pre-step. The mobile browser's native file input already
 *   presents a gorgeous menu (Photothèque / Prendre une photo / Choisir le fichier
 *   on iOS Safari, same idea on Android). We just open that menu and let the OS
 *   handle the choice — way better UX than a custom confirm dialog.
 *
 * - Native (iOS/Android app): no built-in menu, so we present our own Alert
 *   asking between camera and library.
 */
export async function pickImage(opts: PickImageOptions = {}): Promise<PickedImage | null> {
  if (Platform.OS === 'web') {
    // No capture attribute → OS shows its native menu with camera + library + files.
    return pickFromWeb(null);
  }
  const source = await askNativeSource();
  if (!source) return null;
  return pickFromSource(source, opts);
}

/** Pick directly from a specific source without asking. */
export async function pickImageFromSource(
  source: ImagePickerSource,
  opts: PickImageOptions = {},
): Promise<PickedImage | null> {
  if (Platform.OS === 'web') {
    return pickFromWeb(source);
  }
  return pickFromSource(source, opts);
}

function askNativeSource(): Promise<ImagePickerSource | null> {
  return new Promise((resolve) => {
    Alert.alert(
      'Ajouter une photo',
      undefined,
      [
        { text: '📷 Prendre une photo', onPress: () => resolve('camera') },
        { text: '🖼️ Choisir dans la galerie', onPress: () => resolve('library') },
        { text: 'Annuler', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

async function pickFromSource(
  source: ImagePickerSource,
  opts: PickImageOptions,
): Promise<PickedImage | null> {
  const quality = opts.quality ?? 0.7;
  const allowsEditing = opts.allowsEditing ?? false;

  if (Platform.OS === 'web') {
    return pickFromWeb(source);
  }

  // Native — request the right permission
  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission refusée',
        "Autorise l'appareil photo dans les réglages pour prendre des photos.",
      );
      return null;
    }
  } else {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission refusée',
        "Autorise l'accès aux photos dans les réglages.",
      );
      return null;
    }
  }

  const commonOpts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality,
    allowsEditing,
    ...(opts.aspect && { aspect: opts.aspect }),
    base64: true,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(commonOpts)
      : await ImagePicker.launchImageLibraryAsync(commonOpts);

  if (result.canceled || !result.assets || !result.assets[0]) return null;
  const asset = result.assets[0];
  const dataUrl = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
  return { dataUrl, width: asset.width, height: asset.height };
}

/**
 * Create a hidden <input type="file"> and let the browser open its native picker.
 *
 * - source = null → no `capture` attribute → on iOS Safari the native sheet shows
 *   "Photothèque / Prendre une photo / Choisir le fichier" (user chooses). On Android
 *   Chrome shows an equivalent intent picker. This is the preferred path — zero custom UI.
 * - source = 'camera' → `capture="environment"` hint → mobile browsers open the camera
 *   directly (no library option).
 * - source = 'library' → no capture attribute (same as null, user-initiated choice of gallery).
 */
async function pickFromWeb(source: ImagePickerSource | null): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (source === 'camera') {
      input.setAttribute('capture', 'environment');
    }
    input.onchange = async () => {
      const files = input.files;
      if (!files || files.length === 0) {
        resolve(null);
        return;
      }
      try {
        // Modern phone photos are 4–8 MB straight out of the camera ;
        // base64-encoded that's 5–11 MB. Uploading that to Firebase
        // Storage on a 4G connection routinely times out or silently
        // stalls, which was the root cause of "loading forever" /
        // "looks like it worked but the photo isn't anywhere".
        // We resize to max 1920 px on the longer edge + JPEG quality
        // 0.82 → typically ~300–600 KB final payload, fast to upload
        // and indistinguishable from the original on most screens.
        const compressed = await resizeAndCompress(files[0], 1920, 0.82);
        resolve(compressed);
      } catch (err) {
        console.warn('[pickImage] web compression fallback to raw:', err);
        // Fallback : if canvas compression fails for any reason
        // (rare — bad image, OOM), use the raw data URL so the user
        // isn't blocked. The upload will be slower but still works.
        try {
          const dataUrl = await readFileAsDataUrl(files[0]);
          resolve({ dataUrl });
        } catch {
          resolve(null);
        }
      }
    };
    // Modern browsers fire 'cancel' when the picker is dismissed without a selection.
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Multi-select picker — library only (camera captures one at a time). */
export async function pickMultipleImages(opts: PickImageOptions & { max?: number } = {}): Promise<PickedImage[]> {
  const quality = opts.quality ?? 0.7;
  const max = opts.max ?? 7;

  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = async () => {
        const files = input.files;
        if (!files || files.length === 0) {
          resolve([]);
          return;
        }
        const fileArray: File[] = [];
        for (let i = 0; i < Math.min(files.length, max); i++) fileArray.push(files[i]);
        const dataUrls = await Promise.all(fileArray.map((f) => readFileAsDataUrl(f)));
        resolve(dataUrls.map((dataUrl) => ({ dataUrl })));
      };
      input.oncancel = () => resolve([]);
      input.click();
    });
  }

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission refusée', "Autorise l'accès aux photos dans les réglages.");
    return [];
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: max,
    quality,
    base64: true,
  });

  if (result.canceled || !result.assets) return [];
  return result.assets.map((asset) => ({
    dataUrl: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri,
    width: asset.width,
    height: asset.height,
  }));
}
