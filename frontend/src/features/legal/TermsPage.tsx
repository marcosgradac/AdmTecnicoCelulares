import { TERMS_EFFECTIVE_LABEL } from '../../config/legal'
import { LegalDocumentPage } from './LegalDocumentPage'
import { termsContent } from './termsContent'
export function TermsPage() { return <LegalDocumentPage title="Términos y Condiciones" effectiveLabel={TERMS_EFFECTIVE_LABEL} description="Leé atentamente estas condiciones antes de utilizar TecnoDesk." content={termsContent}/> }
