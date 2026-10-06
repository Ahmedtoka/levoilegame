import { describe, expect, it } from 'vitest'
import { instagramEmbed } from '../src/config/brandSocial'

describe('instagramEmbed', () => {
  it('reads reel, post and tv links', () => {
    expect(instagramEmbed('https://www.instagram.com/reel/C9abcDEF_12/?igsh=xyz')).toBe('https://www.instagram.com/reel/C9abcDEF_12/embed/')
    expect(instagramEmbed('https://instagram.com/reels/C9abcDEF_12')).toBe('https://www.instagram.com/reel/C9abcDEF_12/embed/')
    expect(instagramEmbed('https://www.instagram.com/p/Babc-1234/')).toBe('https://www.instagram.com/p/Babc-1234/embed/')
    expect(instagramEmbed('https://www.instagram.com/levoile/reel/C9abcDEF_12/')).toBe('https://www.instagram.com/reel/C9abcDEF_12/embed/')
  })

  it('reads the link inside a pasted embed code', () => {
    const code = '<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/reel/DAbc123xyz/?utm_source=ig_embed"></blockquote><script async src="//www.instagram.com/embed.js"></script>'
    expect(instagramEmbed(code)).toBe('https://www.instagram.com/reel/DAbc123xyz/embed/')
  })

  it('rejects anything else', () => {
    expect(instagramEmbed('https://www.instagram.com/levoilestores/')).toBeNull()
    expect(instagramEmbed('https://example.com/reel/abcdef')).toBeNull()
  })
})
