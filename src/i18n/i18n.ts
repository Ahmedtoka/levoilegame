// Bilingual strings. Arabic is the default; brand/product terms stay in English.

export type Lang = 'ar' | 'en'

const STRINGS = {
  enterMall: { ar: 'ادخل المول', en: 'Enter the Mall' },
  loading: { ar: 'بنجهّز المول…', en: 'Preparing the mall…' },
  tagline: { ar: 'تجربة تسوّق ثلاثية الأبعاد', en: 'A 3D shopping experience' },
  controlsDesktop: {
    ar: 'WASD للحركة · الماوس للنظر · Shift للجري · E للتفاعل · C السلة · M الخريطة',
    en: 'WASD move · Mouse look · Shift run · E interact · C cart · M map',
  },
  controlsMobile: {
    ar: 'الجويستيك للحركة · اسحب للنظر · المس المنتج عشان تشوفه',
    en: 'Joystick to move · Drag to look · Tap a product to view it',
  },
  paused: { ar: 'متوقف مؤقتاً', en: 'Paused' },
  resume: { ar: 'كمّل', en: 'Resume' },
  clickToResume: { ar: 'اضغط عشان تكمّل', en: 'Click to resume' },
  atrium: { ar: 'البهو الرئيسي', en: 'Main Atrium' },
  boulevard: { ar: 'الممر الرئيسي', en: 'Boulevard' },
  lounge: { ar: 'منطقة الاستراحة', en: 'Lounge' },
  cashier: { ar: 'الكاشير', en: 'Cashier' },
  exit: { ar: 'خروج', en: 'Exit' },
  view: { ar: 'شوف', en: 'View' },
  talk: { ar: 'كلّم', en: 'Talk to' },
  pressE: { ar: 'E', en: 'E' },
  tap: { ar: 'المس', en: 'Tap' },
  checkoutPrompt: { ar: 'ادفع عند الكاشير', en: 'Check out at the cashier' },
  leaveMall: { ar: 'اخرج من المول', en: 'Leave the mall' },
  addToCart: { ar: 'ضيف للسلة', en: 'Add to cart' },
  added: { ar: 'اتضاف للسلة', en: 'Added to cart' },
  size: { ar: 'المقاس', en: 'Size' },
  color: { ar: 'اللون', en: 'Color' },
  quantity: { ar: 'الكمية', en: 'Quantity' },
  viewOnSite: { ar: 'شوفه على الموقع', en: 'View on site' },
  close: { ar: 'إغلاق', en: 'Close' },
  cart: { ar: 'السلة', en: 'Cart' },
  cartEmpty: { ar: 'السلة فاضية… لف في المول واختار اللي يعجبك', en: 'Your cart is empty — explore the mall and pick something you love' },
  subtotal: { ar: 'الإجمالي', en: 'Subtotal' },
  remove: { ar: 'شيل', en: 'Remove' },
  goToCashier: { ar: 'روح للكاشير', en: 'Go to cashier' },
  checkout: { ar: 'إتمام الشراء', en: 'Checkout' },
  orderSummary: { ar: 'ملخص الطلب', en: 'Order summary' },
  yourDetails: { ar: 'بياناتك', en: 'Your details' },
  name: { ar: 'الاسم', en: 'Full name' },
  phone: { ar: 'رقم الموبايل', en: 'Mobile number' },
  address: { ar: 'العنوان', en: 'Delivery address' },
  city: { ar: 'المدينة', en: 'City' },
  paymentMethod: { ar: 'طريقة الدفع', en: 'Payment method' },
  payCard: { ar: 'بطاقة بنكية', en: 'Card' },
  payVodafone: { ar: 'Vodafone Cash', en: 'Vodafone Cash' },
  payInstapay: { ar: 'InstaPay', en: 'InstaPay' },
  payCod: { ar: 'الدفع عند الاستلام', en: 'Cash on Delivery' },
  payCardNote: {
    ar: 'هتكمّل الدفع بالبطاقة في صفحة دفع آمنة (تجريبي دلوقتي)',
    en: 'You’ll complete card payment on a secure payment page (simulated for now)',
  },
  payWalletNote: { ar: 'هيوصلك طلب دفع على رقم المحفظة (تجريبي)', en: 'You’ll get a payment request on your wallet number (simulated)' },
  payInstapayNote: { ar: 'هيوصلك لينك InstaPay على الموبايل (تجريبي)', en: 'You’ll receive an InstaPay link by SMS (simulated)' },
  payCodNote: { ar: 'ادفع كاش لما الأوردر يوصلك', en: 'Pay in cash when your order arrives' },
  walletNumber: { ar: 'رقم المحفظة', en: 'Wallet number' },
  placeOrder: { ar: 'أكّد الطلب', en: 'Place order' },
  processing: { ar: 'بنأكد طلبك…', en: 'Processing your order…' },
  demoNotice: { ar: 'نسخة تجريبية — مفيش دفع حقيقي', en: 'Demo — no real payment is taken' },
  required: { ar: 'مطلوب', en: 'Required' },
  invalidPhone: { ar: 'رقم موبايل مصري غير صحيح', en: 'Enter a valid Egyptian mobile number' },
  thankYou: { ar: 'شكراً لاختيارك Le Voile', en: 'Thank you for choosing Le Voile' },
  orderNumber: { ar: 'رقم الطلب', en: 'Order number' },
  walkToExit: { ar: 'اتفضل اتجه لباب الخروج — أو كمّل تسوّق', en: 'Head to the exit door — or keep shopping' },
  continueShopping: { ar: 'كمّل تسوّق', en: 'Continue shopping' },
  comeBack: { ar: 'نورتينا… مستنيينك تاني', en: 'Come back soon' },
  visitSite: { ar: 'زوري levoilestores.com', en: 'Visit levoilestores.com' },
  leaveWithCart: { ar: 'لسه عندك حاجات في السلة. تخرجي من غير ما تدفعي؟', en: 'You still have items in your cart. Leave without checking out?' },
  leaveAnyway: { ar: 'اخرج برضه', en: 'Leave anyway' },
  teleport: { ar: 'انتقل لقسم', en: 'Go to section' },
  settings: { ar: 'الإعدادات', en: 'Settings' },
  quality: { ar: 'الجودة', en: 'Quality' },
  qAuto: { ar: 'تلقائي', en: 'Auto' },
  qLow: { ar: 'منخفضة', en: 'Low' },
  qMedium: { ar: 'متوسطة', en: 'Medium' },
  qHigh: { ar: 'عالية', en: 'High' },
  music: { ar: 'الموسيقى', en: 'Music' },
  sound: { ar: 'الأصوات', en: 'Sound effects' },
  cameraView: { ar: 'الكاميرا', en: 'Camera' },
  firstPerson: { ar: 'منظور أول', en: 'First person' },
  thirdPerson: { ar: 'منظور ثالث', en: 'Third person' },
  minimap: { ar: 'الخريطة', en: 'Minimap' },
  language: { ar: 'English', en: 'العربية' },
  on: { ar: 'شغّال', en: 'On' },
  off: { ar: 'مقفول', en: 'Off' },
  noWebgl: {
    ar: 'المتصفح ده مش بيدعم العرض ثلاثي الأبعاد. تقدري تتسوقي من الكتالوج هنا أو من الموقع.',
    en: 'This browser can’t show the 3D mall. You can still browse the catalogue here or on our website.',
  },
  freeSize: { ar: 'مقاس واحد', en: 'Free size' },
  sale: { ar: 'خصم', en: 'Sale' },
  greetings: {
    ar: 'أهلاً بيكي في Le Voile! لو محتاجة أي مساعدة أنا هنا',
    en: 'Welcome to Le Voile! Let me know if you need any help',
  },
  greetings2: { ar: 'عندنا كولكشن جديد نزل النهارده… اتفرجي براحتك', en: 'Our new collection just landed — take your time' },
  greetings3: { ar: 'المقاسات كلها متوفرة، لو حابة تجربي قولي', en: 'All sizes are in stock — just ask' },
  cashierGreeting: { ar: 'أهلاً! جاهزة تدفعي؟', en: 'Hi! Ready to check out?' },
  cashierEmpty: { ar: 'السلة لسه فاضية… لفي في المول الأول', en: 'Your cart is still empty — have a look around first' },
  items: { ar: 'قطعة', en: 'items' },
  directory: { ar: 'دليل المول', en: 'Mall directory' },
  egp: { ar: 'ج.م', en: 'EGP' },
} satisfies Record<string, Record<Lang, string>>

export type StringKey = keyof typeof STRINGS

export function t(key: StringKey, lang: Lang): string {
  return STRINGS[key][lang]
}

export function both(key: StringKey): { ar: string; en: string } {
  return STRINGS[key]
}

export function formatPrice(amount: number, lang: Lang, currency = 'EGP'): string {
  try {
    return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-EG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}
