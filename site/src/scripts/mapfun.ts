/**
 * The look of every YaY NYC map: OpenFreeMap's colorful "liberty" style, warmed up (parks greener, water
 * bluer), and emoji pins drawn once on a canvas (🍸 happy hour, 🪩 party, 🍹 on right now) instead of
 * plain dots. Cluster bubbles are big and bold with their count.
 */
export const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/** a round pin: a colored disc with a white ring, a soft shadow and an emoji in the middle */
function pinImage(emoji: string, color: string, size = 36) {
  const c = document.createElement('canvas');
  c.width = c.height = size * 2; // drawn at 2x for sharp screens
  const g = c.getContext('2d')!;
  const r = size - 5;
  g.shadowColor = 'rgba(22, 18, 43, 0.35)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
  g.beginPath(); g.arc(size, size, r, 0, Math.PI * 2); g.fillStyle = '#FFFFFF'; g.fill();
  g.shadowColor = 'transparent';
  g.beginPath(); g.arc(size, size, r - 6, 0, Math.PI * 2); g.fillStyle = color; g.fill();
  g.font = `${Math.round(size * 0.86)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, size, size + size * 0.06);
  return g.getImageData(0, 0, c.width, c.height);
}

export const PIN = { bar: ['🍸', '#5B2EE8'], party: ['🪩', '#FF4F64'], live: ['🍹', '#0B7A4B'] } as const;

/** register the pins on a map (call on "load") */
export function addPins(map: any) {
  for (const [name, [e, color]] of Object.entries(PIN)) if (!map.hasImage(`pin-${name}`)) map.addImage(`pin-${name}`, pinImage(e, color), { pixelRatio: 2 });
}

/** brighter parks and water on top of the base style (layers missing in a style are skipped) */
export function warmUp(map: any) {
  const set = (id: string, prop: string, v: unknown) => { if (map.getLayer(id)) try { map.setPaintProperty(id, prop, v); } catch { /* not that kind of layer */ } };
  for (const id of ['water', 'water_shadow']) set(id, 'fill-color', '#8FD3FF');
  for (const id of ['park', 'landuse_park', 'landcover_wood', 'landcover_grass']) set(id, 'fill-color', '#B5E8A6');
  set('background', 'background-color', '#FFF8EC');
}

/** cluster bubbles: a big colored disc with a white ring and the count */
export function clusterPaint(color: string) {
  return {
    circle: { 'circle-color': color, 'circle-opacity': 0.92, 'circle-radius': ['step', ['get', 'point_count'], 17, 20, 23, 80, 30], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 4 },
    count: { layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 14, 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': '#FFFFFF' } },
  };
}
