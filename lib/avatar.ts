// Avatar URLs come from Google ("Sign in with Google" profile pictures on
// *.googleusercontent.com). Rendering them directly would make every signed-in
// student's browser fetch from Google, handing Google the student's IP on each
// page load. Instead we route the picture through Next.js's image optimizer on
// our own origin: the browser asks /_next/image on stembuilder.io, and the
// server fetches from Google. The student's device never contacts Google.
//
// The allowed remote host is declared in next.config.ts (images.remotePatterns);
// `w` must be one of Next's configured image sizes (16, 32, 48, 64, 96, ...) and
// `q` must be an allowed quality — Next 16 permits only 75 unless
// images.qualities is configured, and anything else returns 400.
export function proxiedAvatarUrl(url: string | null | undefined, displayPx = 32): string | null {
  if (!url) return null
  // Already same-origin (a relative path, or a future self-hosted avatar): leave it.
  if (url.startsWith('/')) return url
  // 2× the display size so the circle stays crisp on retina screens.
  const w = displayPx <= 16 ? 32 : displayPx <= 24 ? 48 : displayPx <= 32 ? 64 : 96
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`
}
