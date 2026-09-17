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
  restaurant: string
  amountLuna: number
  payoutAddress: string
  status: 'OPEN' | 'PAYMENT_PENDING' | 'SECURED'
  paymentTxHash: string | null
  reservationAt: string | null
  timezone: string | null
  partySize: number | null
  policyText: string | null
  cancellationDeadline: string | null
  serviceStatus: 'CHECKED_IN' | 'APPLIED' | 'REFUND_PENDING' | 'REFUNDED' | null
}

export type Role = 'GUEST' | 'RESTAURANT'
export type Profile = {
  id: string
  walletAddress: string
  role: Role
  displayName: string
  restaurantSlug: string | null
  timezone: string | null
}
export type RegistrationNonce = { id: string; message: string; expiresAt: string }
export type PassToken = { token: string; shortCode: string; expiresAt: string; passVersion: number }
export type PassValidation = { valid: true; publicId: string; restaurant: string; amountLuna: number; status: string; holder: string | null; expiresAt: string }
export type RestaurantBond = { id: string; public_id: string; reservation_at: string; party_size: number; amount_luna: number; status: string; service_status?: string | null }
export type AuditEvent = { event_type: string; from_status: string | null; to_status: string | null; metadata: string; created_at: string }

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

export function createRegistrationNonce(walletAddress: string, role: Role): Promise<RegistrationNonce> {
  return api('/auth/nonce', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ walletAddress, role }) })
}

export async function registerProfile(input: { nonceId: string; publicKey: string; signature: string; displayName: string; restaurantSlug?: string; timezone?: string }): Promise<{ token: string; profile: Profile }> {
  const result = await api<{ token: string; profile: Profile }>('/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  localStorage.setItem('pactum_session', result.token)
  localStorage.setItem('pactum_profile', JSON.stringify(result.profile))
  return result
}

export function storedProfile(): Profile | null {
  try { return JSON.parse(localStorage.getItem('pactum_profile') || 'null') as Profile | null } catch { return null }
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('pactum_session')
  return { authorization: `Bearer ${token || ''}` }
}

export function createPassToken(publicId: string): Promise<PassToken> {
  return api(`/p/${publicId}/pass-tokens`, { method: 'POST', headers: authHeaders() })
}

export function validatePass(input: { token?: string; code?: string }): Promise<PassValidation> {
  const query = input.token ? `token=${encodeURIComponent(input.token)}` : `code=${encodeURIComponent(input.code || '')}`
  return api(`/passes/validate?${query}`, { method: 'GET' })
}

export type CreateBondInput = {
  reservationAt: string
  partySize: number
  amountLuna: number
  policyText: string
  cancellationDeadline: string
  externalReference?: string
}

export function createRestaurantBond(restaurantId: string, input: CreateBondInput): Promise<{ bondId: string; publicId: string; status: 'OPEN' }> {
  return api(`/restaurants/${restaurantId}/bonds`, {
    method: 'POST',
    headers: { ...authHeaders(), 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(input),
  })
}

export function getRestaurantBonds(restaurantId: string): Promise<{ bonds: RestaurantBond[] }> {
  return api(`/restaurants/${restaurantId}/bonds`, { method: 'GET', headers: authHeaders() })
}

export function updateServiceStatus(publicId: string, action: 'check-in' | 'apply'): Promise<{ publicId: string; serviceStatus: 'CHECKED_IN' | 'APPLIED' }> {
  return api(`/staff/bonds/${publicId}/${action}`, { method: 'POST', headers: { ...authHeaders(), 'idempotency-key': crypto.randomUUID() } })
}

export function getAuditEvents(publicId: string): Promise<{ events: AuditEvent[] }> {
  return api(`/staff/bonds/${publicId}/events`, { method: 'GET', headers: authHeaders() })
}

export function createTransferNonce(publicId: string, toAddress: string): Promise<RegistrationNonce> {
  return api(`/p/${publicId}/transfer-nonce`, { method: 'POST', headers: { ...authHeaders(), 'content-type': 'application/json' }, body: JSON.stringify({ toAddress }) })
}

export function submitTransfer(publicId: string, input: { nonceId: string; publicKey: string; signature: string }): Promise<{ holderAddress: string; passVersion: number }> {
  return api(`/p/${publicId}/transfers`, { method: 'POST', headers: { ...authHeaders(), 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input) })
}

export function createRefundIntent(publicId: string): Promise<PaymentIntent> {
  return api(`/staff/bonds/${publicId}/refund-intents`, { method: 'POST', headers: { ...authHeaders(), 'idempotency-key': crypto.randomUUID() } })
}

export async function verifyRefund(publicId: string, intentId: string, txHash: string): Promise<boolean> {
  const response = await fetch(`${API_URL}/staff/bonds/${publicId}/refunds/verify`, { method: 'POST', headers: { ...authHeaders(), 'content-type': 'application/json' }, body: JSON.stringify({ intentId, txHash }) })
  const payload = await response.json() as { serviceStatus?: string; error?: { message?: string } }
  if (response.status === 202) return false
  if (!response.ok) throw new Error(payload.error?.message || 'Refund verification failed.')
  return payload.serviceStatus === 'REFUNDED'
}
