/**
 * MapLibre's stylesheet, loaded only when a map is about to show. A plain import() of the CSS
 * makes Vite put it in <head> as a render-blocking link on every page that has a map below the fold.
 */
import href from 'maplibre-gl/dist/maplibre-gl.css?url';

let done: Promise<void> | null = null;
export function mapCss(): Promise<void> {
  done ??= new Promise((ok) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.onload = () => ok(); l.onerror = () => ok();
    document.head.appendChild(l);
  });
  return done;
}
