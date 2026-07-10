import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// Sender address — must be a verified domain in your Resend account
const FROM = 'Canteen <canteen@miamimesivta.com>'
const REPLY_TO = 'canteen@miamimesivta.com'

export async function sendTopupReceived({
  parentEmail,
  parentName,
  studentName,
  amount,
  method,
}: {
  parentEmail: string
  parentName: string
  studentName: string
  amount: number
  method: string
}) {
  const methodLabel: Record<string, string> = {
    zelle: 'Zelle',
    venmo: 'Venmo',
    paypal: 'PayPal',
    cashapp: 'Cash App',
    cash: 'Cash',
    credit_card: 'Credit Card',
  }
  const fmt = (n: number) => `$${n.toFixed(2)}`

  return resend.emails.send({
    from: FROM,
    reply_to: REPLY_TO,
    to: parentEmail,
    subject: `Top-up request received — ${fmt(amount)} for ${studentName}`,
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
        <p style="color:#94a3b8;font-size:12px;margin-top:32px">Questions? Reply to this email.</p>
      </div>
    `,
  })
}

export async function sendTopupApproved({
  parentEmail,
  parentName,
  studentName,
  amount,
  newBalance,
}: {
  parentEmail: string
  parentName: string
  studentName: string
  amount: number
  newBalance?: number
}) {
  const fmt = (n: number) => `$${n.toFixed(2)}`
  const balanceLine = newBalance !== undefined
    ? `<p style="margin:4px 0;color:#64748b;font-size:14px"><strong style="color:#1e293b">New balance:</strong> ${fmt(newBalance)}</p>`
    : ''

  return resend.emails.send({
    from: FROM,
    reply_to: REPLY_TO,
    to: parentEmail,
    subject: `Top-up approved — ${fmt(amount)} added for ${studentName}`,
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
        <p style="color:#94a3b8;font-size:12px;margin-top:32px">Questions? Reply to this email.</p>
      </div>
    `,
  })
}

export async function sendTopupRejected({
  parentEmail,
  parentName,
  studentName,
  amount,
  reason,
}: {
  parentEmail: string
  parentName: string
  studentName: string
  amount: number
  reason?: string
}) {
  const fmt = (n: number) => `$${n.toFixed(2)}`

  return resend.emails.send({
    from: FROM,
    reply_to: REPLY_TO,
    to: parentEmail,
    subject: `Top-up request not approved — ${studentName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#dc2626;margin-bottom:8px">Top-up not approved</h2>
        <p style="color:#475569;margin-top:0">Hi ${parentName},</p>
        <p style="color:#475569">We were unable to process your top-up request of ${fmt(amount)} for ${studentName}.</p>
        ${reason ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;margin:20px 0"><p style="margin:0;color:#991b1b;font-size:14px"><strong>Reason:</strong> ${reason}</p></div>` : ''}
        <p style="color:#475569;font-size:14px">Please reply to this email or contact us directly to resolve this.</p>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px">Questions? Reply to this email.</p>
      </div>
    `,
  })
}
