// Mock phone + OTP login used to claim prizes. Any 4 digits are accepted.
// Laravel: POST /otp (SMS) → POST /otp/verify → Sanctum token.

import { store } from '../state/store'
import type { IdentityService, User } from './types'

export class MockIdentity implements IdentityService {
  current(): User | null {
    return store.getState().user
  }

  async requestOtp(phone: string): Promise<{ ok: boolean }> {
    await new Promise((r) => setTimeout(r, 500))
    return { ok: /^01[0125]\d{8}$/.test(phone) }
  }

  async verify(phone: string, code: string, name: string): Promise<User | null> {
    await new Promise((r) => setTimeout(r, 600))
    if (!/^\d{4}$/.test(code)) return null
    const user: User = { phone, name: name.trim() }
    store.getState().set({ user })
    return user
  }

  logout(): void {
    store.getState().set({ user: null })
  }
}
