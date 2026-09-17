const API_URL = (import.meta.env.VITE_API_URL || 'https://pactum-api.samuelsuccess234.workers.dev/api/v1').replace(/\/$/, '')

export type PaymentIntent = {
  id: string
  recipient: string
  amountLuna: number
  dataReference: string
  networkId: number
  expiresAt: string
}

export type PublicBond = {
  publicId: string
  status: 'OPEN' | 'PAYMENT_PENDING' | 'SECURED'
  paymentTxHash: string | null
}

type ApiError = { error?: { code?: string; message?: string } }

async function api<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init)
  const payload = await response.json() as T & ApiError
  if (!response.ok) throw new Error(payload.error?.message || `Pactum API error (${response.status})`)
  return payload
}

export function createPaymentIntent(publicId: string, payerAddress: string): Promise<PaymentIntent> {
  return api(`/p/${publicId}/payment-intents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ payerAddress }),
  })
}

export function getPublicBond(publicId: string): Promise<PublicBond> {
  return api(`/p/${publicId}`, { method: 'GET' })
}

export async function verifyPayment(publicId: string, intentId: string, txHash: string): Promise<boolean> {
  const response = await fetch(`${API_URL}/p/${publicId}/payments/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ intentId, txHash }),
  })
  const payload = await response.json() as { verified?: boolean; error?: { message?: string } }
  if (response.status === 202) return false
  if (!response.ok) throw new Error(payload.error?.message || `Payment verification failed (${response.status})`)
  return payload.verified === true
}
