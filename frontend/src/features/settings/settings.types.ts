export interface BusinessSettings { name: string; phone: string | null; address: string | null; logoUrl: string | null }
export interface UpdateBusinessInput { name: string; phone: string | null; address: string | null }
export interface SettingsData { business: BusinessSettings }
