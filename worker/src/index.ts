const HASH_RE = /^[0-9a-f]{64}$/i
const NIMIQ_ADDRESS_RE = /^NQ[0-9]{2}(?: [0-9A-Z]{4}){8}$/

type Bond = {
  id: string
  public_id: string
  restaurant_name: string
  payout_address: string
  amount_luna: number
  status: 'OPEN' | 'PAYMENT_PENDING' | 'SECURED'
  payment_tx_hash: string | null
  payer_address: string | null
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
    'access-control-allow-headers': 'content-type,idempotency-key',
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
          .bind(tx.hash.toLowerCase(), normalizedAddress(tx.from), now, bond.id),
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
