// Customer ↔ 122 Mall staff chat, simulated with keyword-based canned replies
// in Egyptian Arabic / English. Staff can attach product cards (added to the
// cart only when the customer approves); stylists send a full look.
// Laravel + Reverb: replace with a private channel per conversation.

import type { Catalog, Product } from '../data/types'
import type { Lang } from '../i18n/i18n'
import type { ChatEvent, ChatMessage, StaffChatService, StaffRef } from './types'

type Reply = { ar: string; en: string }

const RULES: { re: RegExp; reply: Reply[]; suggest?: boolean }[] = [
  {
    re: /مقاس|مقاسات|طول|وزن|size|fit|small|large|xl/i,
    reply: [
      {
        ar: 'المقاسات عندنا من S لحد XXL. لو طولك حوالي ١٦٠ ووزنك ٦٠ غالباً M هتبقى مظبوطة، والعبايات فري سايز وواسعة. قوليلي طولك ووزنك وأنا أقولك بالظبط 😊',
        en: 'We carry S to XXL. Around 160 cm / 60 kg is usually an M, and abayas are free size with a relaxed fit. Tell me your height and weight and I’ll pick the exact size 😊',
      },
    ],
  },
  {
    re: /اقترح|رشح|رشّح|عايزة|عاوزة|حاجة|look|لوك|suggest|recommend|show/i,
    reply: [{ ar: 'بصي اخترتلك دي، أعتقد هتعجبك 👇', en: 'I picked this one for you — I think you’ll love it 👇' }],
    suggest: true,
  },
  {
    re: /لون|ألوان|الوان|color|colour/i,
    reply: [
      {
        ar: 'الألوان الأكتر طلباً دلوقتي البيج والأوف وايت والزيتي. البيج بيمشي مع أي طرحة، ولو بتحبي الغامق الكحلي شيك جداً.',
        en: 'Our best-selling colours right now are beige, off-white and olive. Beige goes with any hijab; navy is very chic if you like darker tones.',
      },
    ],
    suggest: true,
  },
  {
    re: /لفة|لفّة|لفات|لفّات|ألف|الف الطرحة|طرحة|طرح|حجاب|hijab|scarf|wrap|style|ستايل/i,
    reply: [
      {
        ar: 'للطرحة القطن جربي اللفة الكلاسيك مع بونيه (Inner cap) تحتها عشان تثبت طول اليوم. الشيفون حلوة باللفة الطويلة على الكتف. ولو عايزة لون الطرحة يبقى درجة أفتح من الفستان.',
        en: 'For cotton scarves try the classic wrap over an inner cap so it stays put all day. Chiffon looks lovely draped long over the shoulder. Pick a hijab a shade lighter than the dress.',
      },
    ],
    suggest: true,
  },
  {
    re: /سعر|بكام|كام|أسعار|اسعار|price|cost|cheap|خصم|عرض|offer|deal/i,
    reply: [
      {
        ar: 'الأسعار مكتوبة على كل قطعة، وعندنا دلوقتي صفقة جماعية بخصم ٢٥٪ وفلاش سيل كل شوية 🔥 ولو لفيتي على المحلات بتجمعي 122 Coins تستبدليها بخصومات في عداد المكافآت.',
        en: 'Prices are on every piece. Right now there’s a group deal at 25% off and flash sales every few minutes 🔥 Visiting shops earns 122 Coins you can swap for discounts at the rewards counters.',
      },
    ],
  },
  {
    re: /شحن|توصيل|يوصل|ديليفري|delivery|shipping|ship/i,
    reply: [
      {
        ar: 'الشحن لكل محافظات مصر خلال ٢–٤ أيام بـ٧٥ جنيه، والدفع عند الاستلام متاح. والاستبدال خلال ١٤ يوم.',
        en: 'We ship across Egypt in 2–4 days for EGP 75, cash on delivery is available, and exchanges are free within 14 days.',
      },
    ],
  },
  {
    re: /سلام|أهلا|اهلا|ازيك|إزيك|هاي|hi|hello|hey/i,
    reply: [{ ar: 'أهلاً بيكي يا قمر! أقدر أساعدك في إيه؟', en: 'Hi there! How can I help you today?' }],
  },
  {
    re: /شكرا|شكراً|متشكرة|thanks|thank/i,
    reply: [{ ar: 'العفو يا حبيبتي، أنا هنا لو احتجتي أي حاجة 💕', en: 'You’re welcome — I’m right here if you need anything 💕' }],
  },
]

const FALLBACK: Reply = {
  ar: 'تمام! أقدر أساعدك في المقاسات، الألوان، لفّات الطرح، الأسعار أو الشحن. ولو تحبي أرشحلك حاجة قوليلي "اقترحي".',
  en: 'Sure! I can help with sizes, colours, hijab styling, prices or shipping. Say “suggest” and I’ll pick something for you.',
}

/** Words that point at a section (Egyptian Arabic + English). */
const SECTION_WORDS: [RegExp, string][] = [
  [/عباي|إسدال|اسدال|abaya|isdal/i, 'nourhan'],
  [/فستان|فساتين|dress/i, 'noha-collection'],
  [/طرح|سكارف|إيشارب|ايشارب|بونيه|scarf|scarves|hijab/i, 'scarfest'],
  [/شنط|شنطة|حقيبة|bag/i, 'hashbag'],
  [/جزم|جزمة|حذاء|كوتشي|صندل|shoe|sneaker/i, 'slip-and-go'],
  [/بنطلون|جينز|دنيم|pants|jeans|denim/i, 'axis'],
  [/كاجوال|يومي|casual|everyday/i, 'the-cause-wear'],
]

const OUTFIT_SECTIONS = ['nourhan', 'noha-collection', 'levoile', 'rwan-designs', 'bezravoga', 'dnd', 'fashion-avenue']

export class MockStaffChat implements StaffChatService {
  private readonly threads = new Map<string, ChatMessage[]>()
  private readonly subs = new Set<(e: ChatEvent) => void>()
  private readonly catalog: Catalog
  private id = 0

  constructor(catalog: Catalog) {
    this.catalog = catalog
  }

  history(staffId: string): readonly ChatMessage[] {
    return this.threads.get(staffId) ?? []
  }

  subscribe(fn: (e: ChatEvent) => void): () => void {
    this.subs.add(fn)
    return () => this.subs.delete(fn)
  }

  open(staff: StaffRef, lang: Lang): void {
    if (this.threads.get(staff.id)?.length) return
    const sec = this.catalog.sections.find((s) => s.id === staff.sectionId)
    const hello: Reply =
      staff.role === 'stylist'
        ? { ar: `أهلاً! أنا ${staff.name}، ستايلست في ١٢٢ مول ✨ قوليلي المناسبة وأنا أظبطلك لوك كامل: لبس + طرحة + إكسسوار.`, en: `Hi! I’m ${staff.name}, a 122 Mall stylist ✨ Tell me the occasion and I’ll put together a full look: outfit + hijab + accessory.` }
        : sec
          ? { ar: `أهلاً بيكي في قسم ${sec.titleAr}! أنا ${staff.name}، تحبي أساعدك في إيه؟`, en: `Welcome to ${sec.title}! I’m ${staff.name} — how can I help?` }
          : { ar: `أهلاً بيكي في ١٢٢ مول! أنا ${staff.name}، محتاجة مساعدة في إيه؟`, en: `Welcome to 122 Mall! I’m ${staff.name} — what can I help you with?` }
    this.push(staff.id, { from: 'staff', text: hello[lang] })
  }

  send(staff: StaffRef, text: string, lang: Lang): void {
    const clean = text.trim().slice(0, 400)
    if (!clean) return
    this.push(staff.id, { from: 'me', text: clean })
    this.emit({ staffId: staff.id, type: 'typing', typing: true })
    setTimeout(() => {
      this.emit({ staffId: staff.id, type: 'typing', typing: false })
      this.reply(staff, clean, lang)
    }, 700 + Math.random() * 900)
  }

  // -------------------------------------------------------------- replies

  private reply(staff: StaffRef, text: string, lang: Lang): void {
    const word = SECTION_WORDS.find(([re, id]) => re.test(text) && this.catalog.sections.some((s) => s.id === id))
    const named = word ? this.catalog.sections.find((s) => s.id === word[1]) : undefined
    const rule = RULES.find((r) => r.re.test(text))
    const stylistLook = staff.role === 'stylist' && (!rule || rule.suggest || /مناسبة|فرح|خروجة|شغل|occasion|wedding|work|outing/i.test(text))
    if (stylistLook) {
      const look = this.look()
      this.push(staff.id, {
        from: 'staff',
        text: lang === 'ar' ? 'بصي اللوك ده 😍 فستان + طرحة + إكسسوار متناسقين مع بعض:' : 'How about this look 😍 an outfit, hijab and accessory that go together:',
        products: look.map((p) => ({ id: p.id, size: this.size(p) })),
        look: true,
      })
      return
    }
    if (rule) this.push(staff.id, { from: 'staff', text: rule.reply[0][lang] })
    else if (!named) this.push(staff.id, { from: 'staff', text: FALLBACK[lang] })
    if (rule?.suggest || named) {
      const p = this.suggest(named?.id ?? staff.sectionId)
      if (p)
        this.push(staff.id, {
          from: 'staff',
          text: lang === 'ar' ? `دي من أحلى القطع عندنا — مقاسك غالباً ${this.size(p)}. أضيفهالك للسلة؟` : `One of our favourites — you’re probably a ${this.size(p)}. Shall I add it to your cart?`,
          products: [{ id: p.id, size: this.size(p) }],
        })
    }
  }

  private size(p: Product): string {
    return p.sizes.includes('M') ? 'M' : (p.sizes[0] ?? '')
  }

  private pick<T>(arr: readonly T[]): T | undefined {
    return arr[Math.floor(Math.random() * arr.length)]
  }

  private fromSection(id: string): Product | undefined {
    const ids = this.catalog.sections.find((s) => s.id === id)?.productIds ?? []
    const pid = this.pick(ids)
    return pid ? this.catalog.byId.get(pid) : undefined
  }

  private suggest(sectionId?: string): Product | undefined {
    return (sectionId && this.fromSection(sectionId)) || this.pick(this.catalog.products)
  }

  /** Outfit + hijab + accessory. */
  private look(): Product[] {
    const outfit = this.fromSection(this.pick(OUTFIT_SECTIONS.filter((s) => this.catalog.sections.some((x) => x.id === s))) ?? 'levoile')
    const hijab = this.fromSection('scarfest')
    const acc = this.fromSection('hashbag') ?? this.fromSection('slip-and-go')
    return [outfit, hijab, acc].filter((p): p is Product => !!p)
  }

  private push(staffId: string, m: Omit<ChatMessage, 'id'>): void {
    const msg: ChatMessage = { ...m, id: ++this.id }
    const list = this.threads.get(staffId) ?? []
    list.push(msg)
    this.threads.set(staffId, list)
    this.emit({ staffId, type: 'message', message: msg })
  }

  private emit(e: ChatEvent): void {
    for (const fn of this.subs) fn(e)
  }
}
