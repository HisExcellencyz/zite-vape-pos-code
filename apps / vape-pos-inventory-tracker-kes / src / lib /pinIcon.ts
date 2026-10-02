// Map pins styled like Google Maps' own markers: a teardrop in the given colour
// with a darker shade of that same colour for the outline and centre dot.
// The colour passed in always decides the pin colour (e.g. tag colours on routes,
// type colours on addresses, blue for a picked location) — only the look changed.

function shade(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const ch = [1, 2, 3].map(i => Math.round(parseInt(m[i], 16) * (1 - amount)));
  return '#' + ch.map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('');
}

const PIN_PATH = 'M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1z';

function toIcon(svg: string): google.maps.Icon {
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(32, 42),
    anchor: new google.maps.Point(16, 41),
  };
}

/** A teardrop map pin with a number inside, as a Google Maps marker icon. */
export function numberedPin(n: number | string, color = '#ef4444'): google.maps.Icon {
  const outline = shade(color, 0.3);
  const centre = shade(color, 0.4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
<ellipse cx="16" cy="40.5" rx="5" ry="1.5" fill="#000" opacity="0.18"/>
<path d="${PIN_PATH}" fill="${color}" stroke="${outline}" stroke-width="1.5"/>
<circle cx="16" cy="15.8" r="9" fill="${centre}"/>
<text x="16" y="20" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="#fff">${n}</text>
</svg>`;
  return toIcon(svg);
}

/** A teardrop map pin with a dark centre dot (no number). */
export function plainPin(color = '#ef4444'): google.maps.Icon {
  const outline = shade(color, 0.3);
  const centre = shade(color, 0.5);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
<ellipse cx="16" cy="40.5" rx="5" ry="1.5" fill="#000" opacity="0.18"/>
<path d="${PIN_PATH}" fill="${color}" stroke="${outline}" stroke-width="1.5"/>
<circle cx="16" cy="15.8" r="5.5" fill="${centre}"/>
</svg>`;
  return toIcon(svg);
}
