export type SupportedLocale = 'en' | 'hi'

export type SupportedCurrency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED'

export interface Dictionary {
  common: {
    appName: string
    tagline: string
    save: string
    cancel: string
    delete: string
    edit: string
    confirm: string
    loading: string
    search: string
    actions: string
    all: string
    active: string
    pending: string
    paid: string
    overdue: string
    vacated: string
    required: string
  }
  nav: {
    overview: string
    property: string
    roomsBeds: string
    tenants: string
    rentPayments: string
    electricity: string
    expenses: string
    complaints: string
    reports: string
    settings: string
    signOut: string
  }
  metrics: {
    monthlyRevenue: string
    pendingRent: string
    operatingExpenses: string
    occupiedBeds: string
    availableBeds: string
    activeTenants: string
  }
  legal: {
    termsOfService: string
    privacyPolicy: string
    cookiePolicy: string
    securityDisclosures: string
    cookieConsentTitle: string
    cookieConsentDesc: string
    acceptAll: string
    acceptNecessary: string
    customize: string
  }
}
