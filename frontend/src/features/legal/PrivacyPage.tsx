import { PRIVACY_EFFECTIVE_LABEL } from '../../config/legal'
import { LegalDocumentPage } from './LegalDocumentPage'
import { privacyContent } from './privacyContent'

export function PrivacyPage() { return <LegalDocumentPage title="Política de Privacidad" effectiveLabel={PRIVACY_EFFECTIVE_LABEL} description="Conocé cómo TecnoDesk utiliza y protege la información necesaria para prestar el servicio." content={privacyContent}/> }
