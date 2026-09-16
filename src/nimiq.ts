import { init, type ErrorResponse } from '@nimiq/mini-app-sdk'

export type WalletState = { address: string; connected: boolean }

function isErrorResponse(value: unknown): value is ErrorResponse {
  return typeof value === 'object' && value !== null && 'error' in value
}

export async function connectNimiq(): Promise<WalletState> {
  const provider = await init()
  const accounts = await provider.listAccounts()
  if (isErrorResponse(accounts)) throw new Error(accounts.error.message)
  if (!accounts[0]) throw new Error('No Nimiq account was selected.')
  return { address: accounts[0], connected: true }
}

export async function payBond(recipient: string, amountLuna: number, publicId: string) {
  const provider = await init()
  const result = await provider.sendBasicTransactionWithData({
    recipient,
    value: amountLuna,
    data: `PACTUM:${publicId}:v1`,
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
