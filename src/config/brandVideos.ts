// Vertical (9:16) videos per brand for the shop's stories screen
// (src/world/storyScreen.ts). Put the files in public/videos/<brandId>/ and list
// them here (absolute URL paths). Muted, they play one after another; brands
// without videos show a moving reel of their products instead.
//
// Keep them light: H.264 MP4, 720×1280, ~1–2 Mbit/s, 10–20 s each.

const VIDEOS: Record<string, string[]> = {
  // levoile: ['/videos/levoile/new-season.mp4'],
}

export function brandVideos(brandId: string): string[] {
  return VIDEOS[brandId] ?? []
}
