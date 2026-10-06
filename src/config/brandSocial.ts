// Each brand's Instagram: its handle and the reels/posts to show in the shop's
// stories viewer (src/ui/reelsOverlay.ts, opened from the stories screen).
// Paste a post/reel link or the whole embed code; the shortcode is read from it.
//
// Instagram embeds are iframes from instagram.com: they play in the overlay, not
// on the 3D screen itself (a cross-origin iframe can't be drawn into WebGL). For
// playback on the 3D screen, add MP4 files in src/config/brandVideos.ts.

export interface BrandSocial {
  /** Handle without the @. */
  instagram?: string
  /** Reel / post links or embed codes. */
  reels?: string[]
}

const SOCIAL: Record<string, BrandSocial> = {
  // levoile: { instagram: 'levoilestores', reels: ['https://www.instagram.com/reel/XXXXXXXXXXX/'] },
}

export function brandSocial(brandId: string): BrandSocial {
  return SOCIAL[brandId] ?? {}
}

/**
 * The embeddable URL of an Instagram reel/post from its link or embed code
 * (`/reel/`, `/reels/`, `/p/`, `/tv/`), or null if it isn't one.
 */
export function instagramEmbed(linkOrCode: string): string | null {
  const m = linkOrCode.match(/instagram\.com\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]{5,})/i)
  if (!m) return null
  const kind = m[1].toLowerCase() === 'p' ? 'p' : m[1].toLowerCase() === 'tv' ? 'tv' : 'reel'
  return `https://www.instagram.com/${kind}/${m[2]}/embed/`
}

/** The brand's valid reel embeds. */
export function brandReels(brandId: string): string[] {
  return (brandSocial(brandId).reels ?? []).map(instagramEmbed).filter((u): u is string => !!u)
}

export function instagramProfile(handle: string): string {
  return `https://www.instagram.com/${handle.replace(/^@/, '')}/`
}
