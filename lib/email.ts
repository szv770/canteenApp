import { Resend } from 'resend'

// Lazily constructed so importing this module never throws when
// RESEND_API_KEY is unset (e.g. local dev, or during Next.js's build-time
// page data collection) — callers already gate email sends behind an env check.
let resend: Resend | null = null
function getResend(): Resend {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY)
  return resend
}

export interface EmailSettings {
  senderName: string
  senderAddress: string
  replyTo: string
  contactPhone: string
  footerNote: string
  receivedEnabled: boolean
  receivedSubject: string
  receivedNote: string
  approvedEnabled: boolean
  approvedSubject: string
  approvedNote: string
  rejectedEnabled: boolean
  rejectedSubject: string
  rejectedNote: string
}

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  senderName: 'Canteen',
  senderAddress: 'canteen@miamimesivta.com',
  replyTo: 'canteen@miamimesivta.com',
  contactPhone: '',
  footerNote: 'Questions? Reply to this email.',
  receivedEnabled: true,
  receivedSubject: 'Top-up request received — {amount} for {student}',
  receivedNote: '',
  approvedEnabled: true,
  approvedSubject: 'Top-up approved — {amount} added for {student}',
  approvedNote: '',
  rejectedEnabled: true,
  rejectedSubject: 'Top-up request not approved — {student}',
  rejectedNote: '',
}

export function buildEmailSettings(raw: Record<string, string>): EmailSettings {
  return {
    senderName: raw['email_sender_name'] || DEFAULT_EMAIL_SETTINGS.senderName,
    senderAddress: raw['email_sender_address'] || DEFAULT_EMAIL_SETTINGS.senderAddress,
    replyTo: raw['email_reply_to'] || DEFAULT_EMAIL_SETTINGS.replyTo,
    contactPhone: raw['email_contact_phone'] || '',
    footerNote: raw['email_footer_note'] ?? DEFAULT_EMAIL_SETTINGS.footerNote,
    receivedEnabled: raw['email_topup_received_enabled'] !== 'false',
    receivedSubject: raw['email_topup_received_subject'] || DEFAULT_EMAIL_SETTINGS.receivedSubject,
    receivedNote: raw['email_topup_received_note'] || '',
    approvedEnabled: raw['email_topup_approved_enabled'] !== 'false',
    approvedSubject: raw['email_topup_approved_subject'] || DEFAULT_EMAIL_SETTINGS.approvedSubject,
    approvedNote: raw['email_topup_approved_note'] || '',
    rejectedEnabled: raw['email_topup_rejected_enabled'] !== 'false',
    rejectedSubject: raw['email_topup_rejected_subject'] || DEFAULT_EMAIL_SETTINGS.rejectedSubject,
    rejectedNote: raw['email_topup_rejected_note'] || '',
  }
}

function resolveSubject(template: string, amount: string, student: string): string {
  return template.replace('{amount}', amount).replace('{student}', student)
}

function footerHtml(note: string, contactPhone?: string): string {
  const parts: string[] = []
  if (contactPhone) parts.push(`For any issues, please reach out to us at <strong>${contactPhone}</strong>.`)
  if (note) parts.push(note)
  if (!parts.length) return ''
  return `<p style="color:#94a3b8;font-size:12px;margin-top:32px">${parts.join('<br>')}</p>`
}

function extraNoteHtml(note: string): string {
  if (!note) return ''
  return `<p style="color:#475569;font-size:14px">${note}</p>`
}

export async function sendTopupReceived({
  parentEmail,
  parentName,
  studentName,
  amount,
  method,
  emailSettings,
}: {
  parentEmail: string
  parentName: string
  studentName: string
  amount: number
  method: string
  emailSettings?: EmailSettings
}): Promise<boolean> {
  const es = emailSettings ?? DEFAULT_EMAIL_SETTINGS
  if (!es.receivedEnabled) return false
  const methodLabel: Record<string, string> = {
    zelle: 'Zelle',
    venmo: 'Venmo',
    paypal: 'PayPal',
    cashapp: 'Cash App',
    cash: 'Cash',
    credit_card: 'Credit Card',
  }
  const fmt = (n: number) => `$${n.toFixed(2)}`
  const from = `${es.senderName} <${es.senderAddress}>`
  const subject = resolveSubject(es.receivedSubject, fmt(amount), studentName)

  try {
    await getResend().emails.send({
      from,
      replyTo: es.replyTo,
      to: parentEmail,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="color:#1e293b;margin-bottom:8px">We got your request ✅</h2>
          <p style="color:#475569;margin-top:0">Hi ${parentName},</p>
          <p style="color:#475569">We received your top-up request and will process it shortly.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:20px 0">
            <p style="margin:4px 0;color:#64748b;font-size:14px"><strong style="color:#1e293b">Student:</strong> ${studentName}</p>
            <p style="margin:4px 0;color:#64748b;font-size:14px"><strong style="color:#1e293b">Amount:</strong> ${fmt(amount)}</p>
            <p style="margin:4px 0;color:#64748b;font-size:14px"><strong style="color:#1e293b">Method:</strong> ${methodLabel[method] ?? method}</p>
          </div>
          <p style="color:#475569;font-size:14px">You'll receive another email once the balance has been added to ${studentName}'s account.</p>
          ${extraNoteHtml(es.receivedNote)}
          ${footerHtml(es.footerNote, es.contactPhone)}
        </div>
      `,
    })
    return true
  } catch (err) {
    console.error('[email] sendTopupReceived failed:', err)
    return false
  }
}

export async function sendTopupApproved({
  parentEmail,
  parentName,
  studentName,
  amount,
  newBalance,
  emailSettings,
}: {
  parentEmail: string
  parentName: string
  studentName: string
  amount: number
  newBalance?: number
  emailSettings?: EmailSettings
}): Promise<boolean> {
  const es = emailSettings ?? DEFAULT_EMAIL_SETTINGS
  if (!es.approvedEnabled) return false
  const fmt = (n: number) => `$${n.toFixed(2)}`
  const balanceLine = newBalance !== undefined
    ? `<p style="margin:4px 0;color:#64748b;font-size:14px"><strong style="color:#1e293b">New balance:</strong> ${fmt(newBalance)}</p>`
    : ''
  const from = `${es.senderName} <${es.senderAddress}>`
  const subject = resolveSubject(es.approvedSubject, fmt(amount), studentName)

  try {
    await getResend().emails.send({
      from,
      replyTo: es.replyTo,
      to: parentEmail,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="color:#15803d;margin-bottom:8px">Top-up approved 🎉</h2>
          <p style="color:#475569;margin-top:0">Hi ${parentName},</p>
          <p style="color:#475569">${fmt(amount)} has been added to ${studentName}'s canteen account.</p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin:20px 0">
            <p style="margin:4px 0;color:#64748b;font-size:14px"><strong style="color:#1e293b">Student:</strong> ${studentName}</p>
            <p style="margin:4px 0;color:#64748b;font-size:14px"><strong style="color:#1e293b">Amount added:</strong> ${fmt(amount)}</p>
            ${balanceLine}
          </div>
          ${extraNoteHtml(es.approvedNote)}
          ${footerHtml(es.footerNote, es.contactPhone)}
        </div>
      `,
    })
    return true
  } catch (err) {
    console.error('[email] sendTopupApproved failed:', err)
    return false
  }
}

export async function sendTopupRejected({
  parentEmail,
  parentName,
  studentName,
  amount,
  reason,
  emailSettings,
}: {
  parentEmail: string
  parentName: string
  studentName: string
  amount: number
  reason?: string
  emailSettings?: EmailSettings
}): Promise<boolean> {
  const es = emailSettings ?? DEFAULT_EMAIL_SETTINGS
  if (!es.rejectedEnabled) return false
  const fmt = (n: number) => `$${n.toFixed(2)}`
  const from = `${es.senderName} <${es.senderAddress}>`
  const subject = resolveSubject(es.rejectedSubject, fmt(amount), studentName)

  try {
    await getResend().emails.send({
      from,
      replyTo: es.replyTo,
      to: parentEmail,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="color:#dc2626;margin-bottom:8px">Top-up not approved</h2>
          <p style="color:#475569;margin-top:0">Hi ${parentName},</p>
          <p style="color:#475569">We were unable to process your top-up request of ${fmt(amount)} for ${studentName}.</p>
          ${reason ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;margin:20px 0"><p style="margin:0 0 6px;color:#991b1b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Message from us</p><p style="margin:0;color:#7f1d1d;font-size:14px;white-space:pre-line">${reason}</p></div>` : ''}
          ${extraNoteHtml(es.rejectedNote)}
          <p style="color:#475569;font-size:14px">Please reply to this email or contact us directly to resolve this.</p>
          ${footerHtml(es.footerNote, es.contactPhone)}
        </div>
      `,
    })
    return true
  } catch (err) {
    console.error('[email] sendTopupRejected failed:', err)
    return false
  }
}
