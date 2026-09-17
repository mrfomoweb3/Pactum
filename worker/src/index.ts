import { verifyAsync } from '@noble/ed25519'
import { blake2b } from '@noble/hashes/blake2.js'
import { sha256 } from '@noble/hashes/sha2.js'

const HASH_RE = /^[0-9a-f]{64}$/i
const NIMIQ_ADDRESS_RE = /^NQ[0-9]{2}(?: [0-9A-Z]{4}){8}$/
const HEX_RE = /^[0-9a-f]+$/i

type Bond = {
  id: string
  public_id: string
  restaurant_name: string
  payout_address: string
  amount_luna: number
  status: 'OPEN' | 'PAYMENT_PENDING' | 'SECURED'
  payment_tx_hash: string | null
  payer_address: string | null
  holder_address: string | null
  pass_version: number
  restaurant_profile_id: string | null
  reservation_at: string | null
  restaurant_timezone: string | null
  party_size: number | null
  policy_text: string | null
  cancellation_deadline: string | null
  external_reference: string | null
}

type Profile = {
  id: string
  wallet_address: string
  role: 'GUEST' | 'RESTAURANT'
  display_name: string
  restaurant_slug: string | null
  timezone: string | null
}

type PaymentIntent = {
  id: string
  bond_id: string
  payer_address: string
  recipient_address: string
  amount_luna: number
  data_reference: string
  network_id: number
  expires_at: string
  consumed_at: string | null
  created_at: string
}

type NimiqTransaction = {
  hash: string
  timestamp: number
  confirmations: number
  relatedAddresses: string[]
  from: string
  to: string
  value: number
  recipientData: string
  networkId: number
  executionResult?: boolean
}

type RpcEnvelope<T> = {
  result?: { data?: T }
  error?: { code?: number; message?: string }
}

function requestId(request: Request): string {
  return request.headers.get('cf-ray') || `req_${crypto.randomUUID()}`
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('origin')
  const allowed = env.ALLOWED_ORIGINS.split(',').map((value) => value.trim())
  const allowOrigin = allowed.includes('*') ? '*' : origin && allowed.includes(origin) ? origin : allowed[0] || 'null'
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-headers': 'content-type,idempotency-key,authorization',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

function json(request: Request, env: Env, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(request, env) })
}

function fail(request: Request, env: Env, status: number, code: string, message: string): Response {
  return json(request, env, { error: { code, message, requestId: requestId(request) } }, status)
}

async function boundedJson<T>(request: Request): Promise<T> {
  const length = Number(request.headers.get('content-length') || 0)
  if (length > 4096) throw new Error('REQUEST_TOO_LARGE')
  return request.json<T>()
}

function normalizedAddress(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

function utf8Hex(value: string): string {
  return Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexBytes(value: string): Uint8Array {
  if (value.length % 2) throw new Error('INVALID_HEX')
  return Uint8Array.from(value.match(/.{2}/g) || [], (byte) => Number.parseInt(byte, 16))
}

function nimiqBase32(bytes: Uint8Array): string {
  const alphabet = '0123456789ABCDEFGHJKLMNPQRSTUVXY'
  let shift = 3; let carry = 0; let result = ''
  for (const byte of bytes) {
    let symbol = carry | byte >> shift
    result += alphabet[symbol & 31]
    if (shift > 5) { shift -= 5; symbol = byte >> shift; result += alphabet[symbol & 31] }
    shift = 5 - shift; carry = byte << shift; shift = 8 - shift
  }
  if (shift !== 3) result += alphabet[carry & 31]
  return result
}

function mod97(value: string): number {
  let remainder = 0
  for (const character of value) {
    const expanded = /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character
    for (const digit of expanded) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder
}

export function addressFromPublicKey(publicKeyHex: string): string {
  const addressBytes = blake2b(hexBytes(publicKeyHex), { dkLen: 32 }).slice(0, 20)
  const bban = nimiqBase32(addressBytes)
  const check = String(98 - mod97(`${bban}232600`)).padStart(2, '0')
  return (`NQ${check}${bban}`).match(/.{1,4}/g)?.join(' ') || ''
}

function randomToken(bytes = 32): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes))
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function verifyWalletSignature(message: string, walletAddress: string, publicKeyHex: string, signatureHex: string): Promise<boolean> {
  if (!HEX_RE.test(publicKeyHex) || !HEX_RE.test(signatureHex)) return false
  try {
    if (normalizedAddress(addressFromPublicKey(publicKeyHex)) !== normalizedAddress(walletAddress)) return false
    const prefix = `\u0016Nimiq Signed Message:\n${message.length}${message}`
    const digest = sha256(new TextEncoder().encode(prefix))
    return verifyAsync(hexBytes(signatureHex), digest, hexBytes(publicKeyHex))
  } catch {
    return false
  }
}

async function authenticatedProfile(request: Request, env: Env): Promise<Profile | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer ([0-9a-f]{64})$/i)?.[1]
  if (!token) return null
  const tokenHash = await sha256Hex(token)
  return env.DB.prepare(`SELECT profiles.* FROM sessions
    JOIN profiles ON profiles.id = sessions.profile_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
    .bind(tokenHash, new Date().toISOString()).first<Profile>()
}

export function verifyTransaction(tx: NimiqTransaction, intent: PaymentIntent): string[] {
  const failures: string[] = []
  if (!tx.hash) failures.push('missing_hash')
  if (normalizedAddress(tx.to) !== normalizedAddress(intent.recipient_address)) failures.push('wrong_recipient')
  const payer = normalizedAddress(intent.payer_address)
  const payerIsRelated = tx.relatedAddresses.some((address) => normalizedAddress(address) === payer)
  if (normalizedAddress(tx.from) !== payer && !payerIsRelated) failures.push('wrong_sender')
  if (tx.value !== intent.amount_luna) failures.push('wrong_amount')
  if (tx.networkId !== intent.network_id) failures.push('wrong_network')
  if (tx.confirmations < 1) failures.push('unconfirmed')
  if (tx.executionResult === false) failures.push('execution_failed')
  const data = tx.recipientData || ''
  if (data !== intent.data_reference && data.toLowerCase() !== utf8Hex(intent.data_reference)) failures.push('wrong_reference')
  return failures
}

async function rpc<T>(env: Env, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(env.NIMIQ_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: crypto.randomUUID() }),
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`RPC_HTTP_${response.status}`)
  const payload = await response.json<RpcEnvelope<T>>()
  if (payload.error || payload.result?.data === undefined) throw new Error(payload.error?.message || 'RPC_INVALID_RESPONSE')
  return payload.result.data
}

async function getBond(env: Env, publicId: string): Promise<Bond | null> {
  return env.DB.prepare('SELECT * FROM bonds WHERE public_id = ?').bind(publicId).first<Bond>()
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) })

  if (request.method === 'GET' && path === '/api/v1/health') {
    const [db, blockNumber] = await Promise.all([
      env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>(),
      rpc<number>(env, 'getBlockNumber', []),
    ])
    return json(request, env, {
      ok: db?.ok === 1,
      service: 'pactum-api',
      environment: env.ENVIRONMENT,
      nimiq: { networkId: Number(env.NIMIQ_NETWORK_ID), blockNumber },
      requestId: requestId(request),
    })
  }

  if (request.method === 'POST' && path === '/api/v1/auth/nonce') {
    const body = await boundedJson<{ walletAddress?: string; role?: string }>(request)
    const walletAddress = normalizedAddress(body.walletAddress || '')
    const role = body.role === 'RESTAURANT' ? 'RESTAURANT' : body.role === 'GUEST' ? 'GUEST' : null
    if (!NIMIQ_ADDRESS_RE.test(walletAddress) || !role) return fail(request, env, 400, 'INVALID_IDENTITY', 'A valid wallet and role are required.')
    const id = crypto.randomUUID()
    const nonce = randomToken(16)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString()
    const message = `Pactum Profile Registration v1\nDomain: pactum-delta.vercel.app\nWallet: ${walletAddress}\nRole: ${role}\nNonce: ${nonce}\nIssued At: ${now.toISOString()}\nExpires At: ${expiresAt}`
    await env.DB.prepare(`INSERT INTO wallet_nonces (id, wallet_address, role, message, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(id, walletAddress, role, message, expiresAt, now.toISOString()).run()
    return json(request, env, { id, message, expiresAt }, 201)
  }

  if (request.method === 'POST' && path === '/api/v1/auth/register') {
    const body = await boundedJson<{ nonceId?: string; publicKey?: string; signature?: string; displayName?: string; restaurantSlug?: string; timezone?: string }>(request)
    const nonce = body.nonceId ? await env.DB.prepare('SELECT * FROM wallet_nonces WHERE id = ?').bind(body.nonceId).first<{
      id: string; wallet_address: string; role: 'GUEST' | 'RESTAURANT'; message: string; expires_at: string; consumed_at: string | null
    }>() : null
    if (!nonce || nonce.consumed_at || nonce.expires_at <= new Date().toISOString()) return fail(request, env, 400, 'NONCE_INVALID', 'This registration request has expired. Please reconnect your wallet.')
    const displayName = (body.displayName || '').trim()
    const slug = (body.restaurantSlug || '').trim().toLowerCase()
    if (displayName.length < 2 || displayName.length > 80) return fail(request, env, 400, 'INVALID_NAME', 'Display name must be between 2 and 80 characters.')
    if (nonce.role === 'RESTAURANT' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return fail(request, env, 400, 'INVALID_SLUG', 'Use a lowercase restaurant URL slug.')
    const valid = await verifyWalletSignature(nonce.message, nonce.wallet_address, body.publicKey || '', body.signature || '')
    if (!valid) return fail(request, env, 401, 'INVALID_SIGNATURE', 'The wallet signature could not be verified.')
    const existing = await env.DB.prepare('SELECT * FROM profiles WHERE wallet_address = ?').bind(nonce.wallet_address).first<Profile>()
    if (existing && existing.role !== nonce.role) return fail(request, env, 409, 'ROLE_ALREADY_CHOSEN', 'This wallet already has a different Pactum role.')
    const profileId = existing?.id || crypto.randomUUID()
    const now = new Date().toISOString()
    const timezone = nonce.role === 'RESTAURANT' ? (body.timezone || 'UTC').slice(0, 64) : null
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO profiles (id, wallet_address, role, display_name, restaurant_slug, timezone, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(wallet_address) DO UPDATE SET display_name = excluded.display_name, restaurant_slug = excluded.restaurant_slug,
        timezone = excluded.timezone, updated_at = excluded.updated_at`)
        .bind(profileId, nonce.wallet_address, nonce.role, displayName, nonce.role === 'RESTAURANT' ? slug : null, timezone, now, now),
      env.DB.prepare('UPDATE wallet_nonces SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL').bind(now, nonce.id),
    ])
    const token = randomToken()
    await env.DB.prepare('INSERT INTO sessions (id, profile_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), profileId, await sha256Hex(token), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), now).run()
    return json(request, env, { token, profile: { id: profileId, walletAddress: nonce.wallet_address, role: nonce.role, displayName, restaurantSlug: nonce.role === 'RESTAURANT' ? slug : null, timezone } }, 201)
  }

  if (request.method === 'GET' && path === '/api/v1/me') {
    const profile = await authenticatedProfile(request, env)
    if (!profile) return fail(request, env, 401, 'AUTH_REQUIRED', 'Connect and register your wallet first.')
    return json(request, env, { id: profile.id, walletAddress: profile.wallet_address, role: profile.role, displayName: profile.display_name, restaurantSlug: profile.restaurant_slug, timezone: profile.timezone })
  }

  const restaurantBonds = path.match(/^\/api\/v1\/restaurants\/([a-f0-9-]+)\/bonds$/)
  if (restaurantBonds && request.method === 'POST') {
    const profile = await authenticatedProfile(request, env)
    if (!profile || profile.role !== 'RESTAURANT' || profile.id !== restaurantBonds[1]) return fail(request, env, 403, 'RESTAURANT_AUTH_REQUIRED', 'Sign in with the restaurant wallet that owns this profile.')
    const idempotencyKey = request.headers.get('idempotency-key')
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) return fail(request, env, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.')
    const body = await boundedJson<{ reservationAt?: string; partySize?: number; amountLuna?: number; policyText?: string; cancellationDeadline?: string; externalReference?: string }>(request)
    const reservationAt = new Date(body.reservationAt || '')
    const cancellationDeadline = new Date(body.cancellationDeadline || '')
    const partySize = Number(body.partySize)
    const amountLuna = Number(body.amountLuna)
    const policyText = (body.policyText || '').trim()
    if (!Number.isFinite(reservationAt.getTime()) || reservationAt.getTime() <= Date.now()) return fail(request, env, 400, 'INVALID_RESERVATION_TIME', 'Reservation time must be in the future.')
    if (!Number.isFinite(cancellationDeadline.getTime()) || cancellationDeadline >= reservationAt) return fail(request, env, 400, 'INVALID_CANCELLATION_DEADLINE', 'Cancellation deadline must be before the reservation.')
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) return fail(request, env, 400, 'INVALID_PARTY_SIZE', 'Party size must be between 1 and 20.')
    if (!Number.isSafeInteger(amountLuna) || amountLuna < 1) return fail(request, env, 400, 'INVALID_AMOUNT', 'Enter a positive NIM bond amount.')
    if (policyText.length < 10 || policyText.length > 600) return fail(request, env, 400, 'INVALID_POLICY', 'Policy must be between 10 and 600 characters.')
    const existing = await env.DB.prepare("SELECT metadata FROM bond_events WHERE event_type = 'BOND_CREATED' AND json_extract(metadata, '$.idempotencyKey') = ?").bind(idempotencyKey).first<{ metadata: string }>()
    if (existing) {
      const metadata = JSON.parse(existing.metadata) as { publicId: string; bondId: string }
      return json(request, env, metadata)
    }
    const id = crypto.randomUUID()
    const publicId = randomToken(16)
    const now = new Date().toISOString()
    const timezone = profile.timezone || 'UTC'
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO bonds (id, public_id, restaurant_name, payout_address, amount_luna, status, holder_address, pass_version,
        restaurant_profile_id, reservation_at, restaurant_timezone, party_size, policy_text, cancellation_deadline, external_reference, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'OPEN', NULL, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, publicId, profile.display_name, profile.wallet_address, amountLuna, profile.id, reservationAt.toISOString(), timezone, partySize, policyText, cancellationDeadline.toISOString(), (body.externalReference || '').trim().slice(0, 120) || null, now, now),
      env.DB.prepare(`INSERT INTO bond_events (id, bond_id, event_type, from_status, to_status, metadata, created_at)
        VALUES (?, ?, 'BOND_CREATED', NULL, 'OPEN', ?, ?)`)
        .bind(crypto.randomUUID(), id, JSON.stringify({ idempotencyKey, publicId, bondId: id }), now),
    ])
    return json(request, env, { bondId: id, publicId, status: 'OPEN' }, 201)
  }

  if (restaurantBonds && request.method === 'GET') {
    const profile = await authenticatedProfile(request, env)
    if (!profile || profile.role !== 'RESTAURANT' || profile.id !== restaurantBonds[1]) return fail(request, env, 403, 'RESTAURANT_AUTH_REQUIRED', 'This restaurant profile is required.')
    const bonds = await env.DB.prepare(`SELECT id, public_id, reservation_at, party_size, amount_luna, status
      FROM bonds WHERE restaurant_profile_id = ? ORDER BY reservation_at ASC LIMIT 100`).bind(profile.id).all()
    return json(request, env, { bonds: bonds.results })
  }

  const publicBond = path.match(/^\/api\/v1\/p\/([a-zA-Z0-9-]+)$/)
  if (request.method === 'GET' && publicBond) {
    const bond = await getBond(env, publicBond[1])
    if (!bond) return fail(request, env, 404, 'BOND_NOT_FOUND', 'Reservation bond not found.')
    return json(request, env, {
      publicId: bond.public_id,
      restaurant: bond.restaurant_name,
      amountLuna: bond.amount_luna,
      payoutAddress: bond.payout_address,
      status: bond.status,
      paymentTxHash: bond.payment_tx_hash,
      reservationAt: bond.reservation_at,
      timezone: bond.restaurant_timezone,
      partySize: bond.party_size,
      policyText: bond.policy_text,
      cancellationDeadline: bond.cancellation_deadline,
    })
  }

  const createIntent = path.match(/^\/api\/v1\/p\/([a-zA-Z0-9-]+)\/payment-intents$/)
  if (request.method === 'POST' && createIntent) {
    const idempotencyKey = request.headers.get('idempotency-key')
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      return fail(request, env, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.')
    }
    const body = await boundedJson<{ payerAddress?: string }>(request)
    const payerAddress = normalizedAddress(body.payerAddress || '')
    if (!NIMIQ_ADDRESS_RE.test(payerAddress)) return fail(request, env, 400, 'INVALID_PAYER', 'A valid Nimiq payer address is required.')
    const bond = await getBond(env, createIntent[1])
    if (!bond) return fail(request, env, 404, 'BOND_NOT_FOUND', 'Reservation bond not found.')
    if (bond.status === 'SECURED') return fail(request, env, 409, 'BOND_ALREADY_SECURED', 'This reservation is already secured.')

    const existing = await env.DB.prepare('SELECT * FROM payment_intents WHERE id = ?').bind(idempotencyKey).first<PaymentIntent>()
    if (existing) return json(request, env, existing)

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString()
    const reference = `PACTUM:${bond.public_id}:v1`
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO payment_intents
        (id, bond_id, payer_address, recipient_address, amount_luna, data_reference, network_id, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(idempotencyKey, bond.id, payerAddress, bond.payout_address, bond.amount_luna, reference, Number(env.NIMIQ_NETWORK_ID), expiresAt, now.toISOString()),
      env.DB.prepare("UPDATE bonds SET status = 'PAYMENT_PENDING', updated_at = ? WHERE id = ? AND status = 'OPEN'")
        .bind(now.toISOString(), bond.id),
    ])
    return json(request, env, {
      id: idempotencyKey,
      recipient: bond.payout_address,
      amountLuna: bond.amount_luna,
      dataReference: reference,
      networkId: Number(env.NIMIQ_NETWORK_ID),
      expiresAt,
    }, 201)
  }

  const verifyPayment = path.match(/^\/api\/v1\/p\/([a-zA-Z0-9-]+)\/payments\/verify$/)
  if (request.method === 'POST' && verifyPayment) {
    const body = await boundedJson<{ intentId?: string; txHash?: string }>(request)
    if (!body.intentId || !body.txHash || !HASH_RE.test(body.txHash)) {
      return fail(request, env, 400, 'INVALID_PAYMENT_PROOF', 'A valid payment intent and transaction hash are required.')
    }
    const bond = await getBond(env, verifyPayment[1])
    if (!bond) return fail(request, env, 404, 'BOND_NOT_FOUND', 'Reservation bond not found.')
    if (bond.payment_tx_hash?.toLowerCase() === body.txHash.toLowerCase()) {
      return json(request, env, { status: 'SECURED', txHash: bond.payment_tx_hash, verified: true })
    }
    const intent = await env.DB.prepare('SELECT * FROM payment_intents WHERE id = ? AND bond_id = ?')
      .bind(body.intentId, bond.id).first<PaymentIntent>()
    if (!intent) return fail(request, env, 404, 'PAYMENT_INTENT_NOT_FOUND', 'Payment intent not found.')
    if (intent.consumed_at) return fail(request, env, 409, 'PAYMENT_INTENT_CONSUMED', 'This payment intent has already been used.')
    let tx: NimiqTransaction
    try {
      tx = await rpc<NimiqTransaction>(env, 'getTransactionByHash', [body.txHash.toLowerCase()])
    } catch (error) {
      console.error(JSON.stringify({ message: 'nimiq verification lookup failed', requestId: requestId(request), error: error instanceof Error ? error.message : String(error) }))
      return fail(request, env, 202, 'PAYMENT_CONFIRMING', 'Payment has not been confirmed yet. Check again shortly.')
    }
    const transactionTime = tx.timestamp
    const earliestValidTime = Date.parse(intent.created_at) - 2 * 60 * 1000
    const latestValidTime = Date.parse(intent.expires_at) + 2 * 60 * 1000
    if (!Number.isFinite(transactionTime) || transactionTime < earliestValidTime || transactionTime > latestValidTime) {
      return fail(request, env, 409, 'PAYMENT_OUTSIDE_INTENT_WINDOW', 'The transaction was not broadcast during this payment intent.')
    }
    const failures = verifyTransaction(tx, intent)
    if (failures.length) {
      console.log(JSON.stringify({ message: 'payment verification rejected', requestId: requestId(request), bondId: bond.id, failures }))
      return fail(request, env, 422, 'PAYMENT_MISMATCH', 'The transaction does not match this reservation bond.')
    }

    const now = new Date().toISOString()
    try {
      await env.DB.batch([
        env.DB.prepare(`UPDATE bonds SET status = 'SECURED', payment_tx_hash = ?, payer_address = ?, updated_at = ?
          WHERE id = ? AND status IN ('OPEN', 'PAYMENT_PENDING') AND payment_tx_hash IS NULL`)
          .bind(tx.hash.toLowerCase(), normalizedAddress(intent.payer_address), now, bond.id),
        env.DB.prepare('UPDATE bonds SET holder_address = ? WHERE id = ? AND holder_address IS NULL').bind(normalizedAddress(intent.payer_address), bond.id),
        env.DB.prepare('UPDATE payment_intents SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL').bind(now, intent.id),
        env.DB.prepare(`INSERT INTO bond_events (id, bond_id, event_type, from_status, to_status, metadata, created_at)
          VALUES (?, ?, 'PAYMENT_VERIFIED', ?, 'SECURED', ?, ?)`)
          .bind(crypto.randomUUID(), bond.id, bond.status, JSON.stringify({ txHash: tx.hash.toLowerCase(), confirmations: tx.confirmations }), now),
      ])
    } catch (error) {
      console.error(JSON.stringify({ message: 'payment persistence failed', requestId: requestId(request), error: error instanceof Error ? error.message : String(error) }))
      return fail(request, env, 409, 'PAYMENT_ALREADY_ASSIGNED', 'This transaction has already been assigned.')
    }
    return json(request, env, { status: 'SECURED', txHash: tx.hash.toLowerCase(), verified: true })
  }

  const createPassToken = path.match(/^\/api\/v1\/p\/([a-zA-Z0-9-]+)\/pass-tokens$/)
  if (request.method === 'POST' && createPassToken) {
    const profile = await authenticatedProfile(request, env)
    if (!profile) return fail(request, env, 401, 'AUTH_REQUIRED', 'Register your guest wallet to create a pass.')
    const bond = await getBond(env, createPassToken[1])
    if (!bond) return fail(request, env, 404, 'BOND_NOT_FOUND', 'Reservation bond not found.')
    const holder = normalizedAddress(bond.holder_address || bond.payer_address || '')
    if (bond.status !== 'SECURED' || normalizedAddress(profile.wallet_address) !== holder) return fail(request, env, 403, 'PASS_NOT_AVAILABLE', 'This wallet does not hold the active reservation pass.')
    const token = randomToken()
    const shortCode = randomToken(5).toUpperCase()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    await env.DB.prepare(`INSERT INTO pass_tokens (id, bond_id, token_hash, short_code, pass_version, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), bond.id, await sha256Hex(token), shortCode, bond.pass_version, expiresAt, new Date().toISOString()).run()
    return json(request, env, { token, shortCode, expiresAt, passVersion: bond.pass_version }, 201)
  }

  if (request.method === 'GET' && path === '/api/v1/passes/validate') {
    const token = url.searchParams.get('token')
    const code = url.searchParams.get('code')?.toUpperCase()
    if ((!token || !/^[0-9a-f]{64}$/i.test(token)) && (!code || !/^[0-9A-F]{10}$/.test(code))) return fail(request, env, 400, 'INVALID_PASS', 'Enter a valid pass code.')
    const tokenHash = token ? await sha256Hex(token) : null
    const pass = await env.DB.prepare(`SELECT pass_tokens.*, bonds.public_id, bonds.restaurant_name, bonds.amount_luna,
      bonds.status, bonds.pass_version AS active_version, bonds.holder_address
      FROM pass_tokens JOIN bonds ON bonds.id = pass_tokens.bond_id
      WHERE ${tokenHash ? 'pass_tokens.token_hash = ?' : 'pass_tokens.short_code = ?'}`)
      .bind(tokenHash || code).first<Record<string, string | number>>()
    if (!pass || String(pass.expires_at) <= new Date().toISOString()) return fail(request, env, 404, 'PASS_EXPIRED', 'This pass is invalid or expired.')
    if (pass.status !== 'SECURED' || pass.pass_version !== pass.active_version) return fail(request, env, 409, 'PASS_REPLACED', 'This pass has been replaced or is no longer active.')
    const holder = String(pass.holder_address || '')
    return json(request, env, { valid: true, publicId: pass.public_id, restaurant: pass.restaurant_name, amountLuna: pass.amount_luna, status: pass.status, holder: holder ? `${holder.slice(0, 9)}…${holder.slice(-5)}` : null, expiresAt: pass.expires_at })
  }

  return fail(request, env, 404, 'NOT_FOUND', 'Endpoint not found.')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const started = Date.now()
    try {
      const response = await route(request, env)
      console.log(JSON.stringify({ message: 'request complete', method: request.method, path: new URL(request.url).pathname, status: response.status, durationMs: Date.now() - started, requestId: requestId(request) }))
      return response
    } catch (error) {
      console.error(JSON.stringify({ message: 'request failed', error: error instanceof Error ? error.message : String(error), requestId: requestId(request) }))
      return fail(request, env, 500, 'INTERNAL_ERROR', 'The service could not complete this request.')
    }
  },
} satisfies ExportedHandler<Env>
