import * as rippleKeypairs from 'ripple-keypairs'
import { TestNetURL } from './RippleConst.js'
import { DefaultServer } from './MessengerConst.js'

/**
 * Create a wallet-like object from a seed string.
 * Uses Ed25519 for testnet and secp256k1 for mainnet.
 * @param {string} seed - ED- prefixed seed string (or s... for secp256k1)
 * @param {string} [server_url=DefaultServer] - Server URL to determine network type
 * @returns {{seed: string, classicAddress: string, publicKey: string, privateKey: string}}
 */
function getWallet(seed, server_url = DefaultServer) {
  const keypair = rippleKeypairs.deriveKeypair(seed)
  const address = rippleKeypairs.deriveAddress(keypair.publicKey)
  return {
    seed: seed,
    classicAddress: address,
    publicKey: keypair.publicKey,
    privateKey: keypair.privateKey,
  }
}

/**
 * Generate a random secp256k1 seed (mainnet).
 * @returns {{seed: string, classicAddress: string}}
 */
function generateWallet() {
  const seed = rippleKeypairs.generateSeed('secp256k1')
  const keypair = rippleKeypairs.deriveKeypair(seed)
  const address = rippleKeypairs.deriveAddress(keypair.publicKey)
  return {
    seed: seed,
    classicAddress: address,
  }
}

export { getWallet, generateWallet }
