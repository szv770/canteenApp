'use client'

// Generic topup request page (no specific bochur linked)
import TopupRequestPage from './[id]/page'

export default function GenericTopupPage() {
  return <TopupRequestPage params={{ id: 'none' }} />
}
