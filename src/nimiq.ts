import { init, type ErrorResponse } from '@nimiq/mini-app-sdk'

export type WalletState = { address: string; connected: boolean }

function isErrorResponse(value: unknown): value is ErrorResponse {
  return typeof value === 'object' && value !== null && 'error' in value
}

export function walletErrorMessage(value: unknown, fallback: string): string {
  let message = ''
  if (value instanceof Error && value.message) message = value.message
  else if (typeof value === 'string' && value.trim()) message = value
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { message?: unknown; error?: { message?: unknown; type?: unknown } | string }
    if (typeof candidate.message === 'string' && candidate.message.trim()) message = candidate.message
    if (typeof candidate.error === 'string' && candidate.error.trim()) message = candidate.error
    if (typeof candidate.error === 'object' && candidate.error) {
      if (typeof candidate.error.message === 'string' && candidate.error.message.trim()) message = candidate.error.message
      else if (typeof candidate.error.type === 'string' && candidate.error.type.trim()) message = candidate.error.type
    }
  }
  if (/syncing your account/i.test(message)) {
    return 'Nimiq Pay could not sync this account. Return to the Wallet screen, wait until the balance finishes loading, then reopen Pactum and retry.'
  }
  return message || fallback
}

export async function ensureNimiqReady(): Promise<number> {
  const provider = await init()
  const ready = await provider.isConsensusEstablished()
  if (!ready) {
    throw new Error('Nimiq Pay is still connecting to the network. Return to the Wallet screen, wait until the balance loads, then retry.')
  }
  return provider.getBlockNumber()
}

export async function connectNimiq(): Promise<WalletState> {
  const provider = await init()
  const accounts = await provider.listAccounts()
  if (isErrorResponse(accounts)) throw new Error(accounts.error.message)
  if (!accounts[0]) throw new Error('No Nimiq account was selected.')
  return { address: accounts[0], connected: true }
}

export type PaymentRequest = { recipient: string; amountLuna: number; dataReference: string }

export async function payBond(request: PaymentRequest) {
  const provider = await init()
  const result = await provider.sendBasicTransactionWithData({
    recipient: request.recipient,
    value: request.amountLuna,
    data: request.dataReference,
  })
  if (isErrorResponse(result)) throw new Error(result.error.message)
  return result
}

export async function signTransfer(message: string) {
  const provider = await init()
  const result = await provider.sign(message)
  if (isErrorResponse(result)) throw new Error(result.error.message)
  return result
}

export async function signRegistration(message: string): Promise<{ publicKey: string; signature: string }> {
  const provider = await init()
  const result = await provider.sign(message)
  if (isErrorResponse(result)) throw new Error(result.error.message)
  return result
}
