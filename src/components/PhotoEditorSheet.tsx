import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useColors } from '../hooks/useColors';

const { width: SCREEN_W } = Dimensions.get('window');
const PHOTO_H = 320;
const THUMB_SIZE = 62;
const SLIDER_W = SCREEN_W - 100;

// ==================== FILTERS ====================
interface FilterDef {
  name: string;
  css: string;
  overlay: string | null; // rgba color for native fallback
}

const FILTERS: FilterDef[] = [
  { name: 'Proof Warm', css: 'sepia(0.25) saturate(1.4) brightness(1.05) hue-rotate(-10deg)', overlay: 'rgba(255,140,50,0.15)' },
  { name: 'Golden', css: 'sepia(0.4) brightness(1.12) saturate(1.1) hue-rotate(-15deg)', overlay: 'rgba(255,200,50,0.18)' },
  { name: 'Chill', css: 'saturate(0.7) brightness(0.95) hue-rotate(15deg) contrast(1.05)', overlay: 'rgba(80,130,210,0.15)' },
  { name: 'Fade', css: 'contrast(0.85) brightness(1.15) saturate(0.75) sepia(0.1)', overlay: 'rgba(255,255,255,0.12)' },
  { name: 'Original', css: 'none', overlay: null },
];

type AdjustTool = 'brightness' | 'contrast' | 'saturation' | null;

const ADJUST_TOOLS: { key: AdjustTool; icon: string; label: string }[] = [
  { key: 'brightness', icon: 'sunny-outline', label: 'Luminosité' },
  { key: 'contrast', icon: 'contrast-outline', label: 'Contraste' },
  { key: 'saturation', icon: 'color-palette-outline', label: 'Saturation' },
];

// Build combined CSS filter string
function buildCssFilter(filter: FilterDef, adj: { brightness: number; contrast: number; saturation: number }): string {
  const parts: string[] = [];
  if (filter.css !== 'none') parts.push(filter.css);
  if (adj.brightness !== 0) parts.push(`brightness(${1 + adj.brightness / 100})`);
  if (adj.contrast !== 0) parts.push(`contrast(${1 + adj.contrast / 100})`);
  if (adj.saturation !== 0) parts.push(`saturate(${1 + adj.saturation / 100})`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

// Apply filters to image via Canvas (web only)
async function bakeFilters(uri: string, cssFilter: string): Promise<string> {
  if (Platform.OS !== 'web' || cssFilter === 'none') return uri;
  return new Promise((resolve) => {
    const img = new (window as any).Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d')!;
      (ctx as any).filter = cssFilter;
      ctx.drawImage(img, 0, 0);
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch {
        resolve(uri); // fallback if tainted canvas
      }
    };
    img.onerror = () => resolve(uri);
    img.src = uri;
  });
}

// ==================== COMPONENT ====================
interface Props {
  visible: boolean;
  photoUri: string;
  onApply: (newUri: string) => void;
  onClose: () => void;
}

export const PhotoEditorSheet: React.FC<Props> = ({ visible, photoUri, onApply, onClose }) => {
  const C = useColors();
  const [filterIdx, setFilterIdx] = useState(0);
  const [adjustments, setAdjustments] = useState({ brightness: 0, contrast: 0, saturation: 0 });
  const [activeTool, setActiveTool] = useState<AdjustTool>(null);
  const [currentUri, setCurrentUri] = useState(photoUri);

  // Reset state when sheet opens with new photo
  React.useEffect(() => {
    if (visible) {
      setFilterIdx(0);
      setAdjustments({ brightness: 0, contrast: 0, saturation: 0 });
      setActiveTool(null);
      setCurrentUri(photoUri);
    }
  }, [visible, photoUri]);

  const selectedFilter = FILTERS[filterIdx];
  const cssFilter = buildCssFilter(selectedFilter, adjustments);

  const handleFilterSelect = useCallback((idx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFilterIdx(idx);
  }, []);

  const handleCrop = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setCurrentUri(result.assets[0].uri);
    }
  }, []);

  const handleSliderChange = useCallback((tool: AdjustTool, value: number) => {
    if (!tool) return;
    setAdjustments((prev) => ({ ...prev, [tool]: value }));
  }, []);

  const handleApply = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await bakeFilters(currentUri, cssFilter);
    onApply(result);
  }, [currentUri, cssFilter, onApply]);

  // Web: apply CSS filter to Image style; Native: overlay View
  const imageFilterStyle = Platform.OS === 'web' ? { filter: cssFilter } as any : {};

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.backdrop}>
          <TouchableWithoutFeedback>
            <View style={[s.sheet, { backgroundColor: C.white }]}>
              {/* Handle */}
              <View style={[s.handle, { backgroundColor: C.gray500 }]} />

              {/* Photo preview */}
              <View style={s.photoWrap}>
                <Image source={{ uri: currentUri }} style={[s.photo, imageFilterStyle]} />
                {Platform.OS !== 'web' && selectedFilter.overlay && (
                  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: selectedFilter.overlay, borderRadius: 14 }]} />
                )}
              </View>

              {/* Row 1: Filters */}
              <Text style={[s.rowLabel, { color: C.gray700 }]}>FILTRES</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersRow}>
                {FILTERS.map((f, i) => {
                  const isActive = i === filterIdx;
                  return (
                    <TouchableOpacity key={f.name} onPress={() => handleFilterSelect(i)} activeOpacity={0.7} style={s.filterItem}>
                      <View style={[s.filterThumbWrap, isActive && { borderColor: Colors.primary, borderWidth: 2 }]}>
                        <Image source={{ uri: currentUri }} style={[s.filterThumb, Platform.OS === 'web' ? { filter: f.css } as any : {}]} />
                        {Platform.OS !== 'web' && f.overlay && (
                          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: f.overlay, borderRadius: 8 }]} />
                        )}
                      </View>
                      <Text style={[s.filterName, { color: isActive ? Colors.primary : C.gray600 }]}>{f.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Row 2: Adjustments */}
              <Text style={[s.rowLabel, { color: C.gray700 }]}>AJUSTEMENTS</Text>
              <View style={s.adjustRow}>
                <TouchableOpacity style={[s.adjustBtn, { backgroundColor: C.gray200 }]} onPress={handleCrop} activeOpacity={0.7}>
                  <Ionicons name="crop-outline" size={18} color={C.gray800} />
                  <Text style={[s.adjustLabel, { color: C.gray800 }]}>Recadrage</Text>
                </TouchableOpacity>
                {ADJUST_TOOLS.map((tool) => {
                  const isActive = activeTool === tool.key;
                  return (
                    <TouchableOpacity
                      key={tool.key}
                      style={[s.adjustBtn, { backgroundColor: isActive ? Colors.primary + '20' : C.gray200 }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTool(isActive ? null : tool.key); }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={tool.icon as any} size={18} color={isActive ? Colors.primary : C.gray800} />
                      <Text style={[s.adjustLabel, { color: isActive ? Colors.primary : C.gray800 }]}>{tool.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Inline slider */}
              {activeTool && (
                <View style={s.sliderRow}>
                  <View
                    style={[s.sliderTrack, { backgroundColor: C.gray300 }]}
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={(e) => {
                      const x = e.nativeEvent.locationX;
                      const pct = Math.max(0, Math.min(1, x / SLIDER_W));
                      handleSliderChange(activeTool, Math.round(-50 + pct * 100));
                    }}
                    onResponderMove={(e) => {
                      const x = e.nativeEvent.locationX;
                      const pct = Math.max(0, Math.min(1, x / SLIDER_W));
                      handleSliderChange(activeTool, Math.round(-50 + pct * 100));
                    }}
                  >
                    <View style={[s.sliderFill, { width: `${((adjustments[activeTool] + 50) / 100) * 100}%` }]} />
                    <View style={[s.sliderThumb, { left: `${((adjustments[activeTool] + 50) / 100) * 100}%` }]} />
                  </View>
                  <Text style={[s.sliderValue, { color: C.gray800 }]}>{adjustments[activeTool] > 0 ? '+' : ''}{adjustments[activeTool]}</Text>
                </View>
              )}

              {/* Buttons */}
              <View style={s.buttonRow}>
                <TouchableOpacity style={[s.cancelBtn, { borderColor: C.gray400 }]} onPress={onClose} activeOpacity={0.7}>
                  <Text style={[s.cancelText, { color: C.gray800 }]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.applyBtn, { backgroundColor: Colors.primary }]} onPress={handleApply} activeOpacity={0.7}>
                  <Text style={s.applyText}>Appliquer</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

// ==================== STYLES ====================
const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingBottom: 34, maxHeight: '92%' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 12 },

  photoWrap: { width: '100%', height: PHOTO_H, borderRadius: 14, overflow: 'hidden', marginBottom: 14 },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },

  rowLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 2 },

  filtersRow: { gap: 10, paddingBottom: 14 },
  filterItem: { alignItems: 'center', width: THUMB_SIZE + 8 },
  filterThumbWrap: { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 10, overflow: 'hidden', borderWidth: 1.5, borderColor: 'transparent' },
  filterThumb: { width: '100%', height: '100%', resizeMode: 'cover' },
  filterName: { fontSize: 9, fontWeight: '600', marginTop: 4, textAlign: 'center' },

  adjustRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  adjustBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, gap: 3 },
  adjustLabel: { fontSize: 9, fontWeight: '600' },

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, paddingHorizontal: 4 },
  sliderTrack: { width: SLIDER_W, height: 4, borderRadius: 2, position: 'relative' },
  sliderFill: { height: '100%', borderRadius: 2, backgroundColor: Colors.primary },
  sliderThumb: { position: 'absolute', top: -8, width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.primary, marginLeft: -10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 4 },
  sliderValue: { fontSize: 12, fontWeight: '700', width: 32, textAlign: 'right' },

  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '700' },
  applyBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  applyText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
