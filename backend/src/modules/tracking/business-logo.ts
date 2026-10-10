
export const publicBusinessLogoUrl = (businessId: string, storedLogo: string | null) => storedLogo?.startsWith('data:') ? `/api/business-logo/${businessId}` : storedLogo
