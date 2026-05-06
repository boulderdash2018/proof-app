/**
 * Reusable Google Maps avatar overlay — extracted from
 * GroupLiveMapSheet.web.tsx so other surfaces (DoItNowScreen embedded
 * map, GroupSessionPanel, etc.) can render the SAME terracotta-bordered
 * avatar marker pattern without duplicating the OverlayView subclass.
 *
 * Web-only (depends on `window.google.maps`). Native should never
 * import from this file — Metro auto-resolves `.web.ts` so this is
 * safe in shared call sites.
 */

export interface FriendAvatarMarker {
  userId: string;
  lat: number;
  lng: number;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  avatarUrl?: string | null;
  ts: number;
}

let _AvatarOverlayCache: any = null;

/** Lazy class factory — google.maps isn't available at module load time
 *  so we can't subclass `OverlayView` at the top level. */
export function getAvatarOverlayClass(gm: any): any {
  if (_AvatarOverlayCache) return _AvatarOverlayCache;
  class AvatarOverlay extends gm.OverlayView {
    position: any;
    html: string;
    div: HTMLDivElement | null = null;
    constructor(position: any, html: string) {
      super();
      this.position = position;
      this.html = html;
    }
    onAdd() {
      this.div = document.createElement('div');
      this.div.style.position = 'absolute';
      this.div.style.cursor = 'default';
      this.div.style.pointerEvents = 'none';
      this.div.innerHTML = this.html;
      this.getPanes().overlayMouseTarget.appendChild(this.div);
    }
    draw() {
      const proj = this.getProjection();
      if (!proj || !this.div) return;
      const point = proj.fromLatLngToDivPixel(this.position);
      if (point) {
        // 23px = half the marker's 46px width — anchors at center.
        this.div.style.left = `${point.x - 23}px`;
        this.div.style.top = `${point.y - 23}px`;
      }
    }
    onRemove() {
      this.div?.parentNode?.removeChild(this.div);
      this.div = null;
    }
    update(newPosition: any, newHtml: string) {
      this.position = newPosition;
      if (newHtml !== this.html) {
        this.html = newHtml;
        if (this.div) this.div.innerHTML = newHtml;
      }
      this.draw();
    }
  }
  _AvatarOverlayCache = AvatarOverlay;
  return AvatarOverlay;
}

/**
 * HTML for one avatar marker — circular wrapper, terracotta border
 * (taupe when stale > 2min), photo with onerror → initials fallback.
 */
export function makeAvatarMarkerHtml(m: FriendAvatarMarker, stale: boolean): string {
  const ringColor = stale ? '#A09181' : '#C4704B';
  const opacity = stale ? '0.65' : '1';
  const initials = escapeHtml((m.initials || '?').slice(0, 2).toUpperCase());
  const safeUrl = m.avatarUrl ? escapeAttr(m.avatarUrl) : '';
  const fillColor = escapeAttr(m.avatarBg || '#C4704B');
  const textColor = escapeAttr(m.avatarColor || '#FFF8F0');

  const fallbackHtml = `
    <div style="
      width:100%; height:100%;
      display:flex; align-items:center; justify-content:center;
      background:${fillColor};
      color:${textColor};
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      font-weight:700; font-size:15px; letter-spacing:0.2px;
    ">${initials}</div>
  `.replace(/\s+/g, ' ').trim();

  const imgHtml = safeUrl
    ? `<img src="${safeUrl}" alt=""
        style="width:100%; height:100%; object-fit:cover; display:block;"
        onerror="this.parentElement.innerHTML = decodeURIComponent('${encodeURIComponent(fallbackHtml)}');"
      />`
    : fallbackHtml;

  return `
    <div style="
      width:46px; height:46px; border-radius:50%;
      background:#FAF7F2;
      border:3px solid ${ringColor};
      box-shadow: 0 2px 10px rgba(44,36,32,0.22);
      overflow:hidden;
      opacity:${opacity};
    ">${imgHtml}</div>
  `.replace(/\s+/g, ' ').trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
