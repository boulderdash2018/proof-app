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

/** Prompt the user to choose camera vs library, then return the selected image as a dataUrl. */
export async function pickImage(opts: PickImageOptions = {}): Promise<PickedImage | null> {
  // Ask user first
  const source = await askSource();
  if (!source) return null;
  return pickFromSource(source, opts);
}

/** Pick directly from a specific source without asking — useful for flows where we know the source. */
export async function pickImageFromSource(
  source: ImagePickerSource,
  opts: PickImageOptions = {},
): Promise<PickedImage | null> {
  return pickFromSource(source, opts);
}

function askSource(): Promise<ImagePickerSource | null> {
  return new Promise((resolve) => {
    if (Platform.OS === 'web') {
      // On web we expose both options via separate inputs; here we ask via a simple confirm fallback.
      // Most callers will use pickImageFromSource directly on web. This path is a safety net.
      const wantCamera = typeof window !== 'undefined' && window.confirm
        ? window.confirm('Prendre une photo avec l\'appareil ? (Annuler pour la bibliothèque)')
        : false;
      resolve(wantCamera ? 'camera' : 'library');
      return;
    }
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

async function pickFromWeb(source: ImagePickerSource): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // The 'capture' attribute forces the camera app on mobile browsers.
    // Ignored on desktop — falls back to file picker.
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
        const dataUrl = await readFileAsDataUrl(files[0]);
        resolve({ dataUrl });
      } catch {
        resolve(null);
      }
    };
    // If the user cancels, input.onchange never fires. We rely on the caller's flow
    // which awaits this promise — a cancelled pick will just leave the promise pending.
    // To avoid a stuck await, we resolve null if no file is selected after focus returns.
    // Modern browsers fire a 'cancel' event on the input (supported since Chrome 113).
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
