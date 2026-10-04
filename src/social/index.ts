// Live-mall services. Today everything is a frontend mock; swap the Mock*
// classes for Laravel + Reverb implementations of the same interfaces.

import type { Catalog } from '../data/types'
import type { QualityLevel } from '../engine/quality'
import { MockDeals } from './mockDeals'
import { MockIdentity } from './mockIdentity'
import { MockPresence } from './mockPresence'
import { MockStaffChat } from './mockStaffChat'
import type { DealsService, IdentityService, PresenceSource, StaffChatService } from './types'

const params = new URLSearchParams(location.search)

/** `?nodemo` turns off every simulation (crowd, toasts, viewers, group deal, flash sales). */
export const demoEnabled = !params.has('nodemo')

/** `?crowd=N`, else High 50 / Medium 30 / Low 20. */
export function crowdSize(level: QualityLevel): number {
  if (!demoEnabled) return 0
  const n = Number(params.get('crowd'))
  if (params.has('crowd') && Number.isFinite(n)) return Math.max(0, Math.min(80, Math.round(n)))
  return level === 'high' ? 50 : level === 'medium' ? 30 : 20
}

export interface Social {
  presence: PresenceSource | null
  chat: StaffChatService
  deals: DealsService | null
  identity: IdentityService
}

let current: Social | null = null

export function createSocial(catalog: Catalog, crowd: number): Social {
  current = {
    presence: demoEnabled ? new MockPresence(catalog, crowd) : null,
    chat: new MockStaffChat(catalog),
    deals: demoEnabled ? new MockDeals(catalog) : null,
    identity: new MockIdentity(),
  }
  return current
}

export function social(): Social {
  if (!current) throw new Error('Social services not created')
  return current
}

export function hasSocial(): boolean {
  return !!current
}
