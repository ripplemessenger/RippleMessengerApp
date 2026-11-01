import * as rippleKeypairs from 'ripple-keypairs'

/**
 * Create a wallet-like object from a seed string.
 * Uses Ed25519 for testnet and secp256k1 for mainnet.
 * @param {string} seed - ED- prefixed seed string (or s... for secp256k1)
 * @returns {{seed: string, classicAddress: string, publicKey: string, privateKey: string}}
 */
function getWallet(seed) {
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
 * Generate a random ed25519 seed (mainnet).
 * @returns {{seed: string, classicAddress: string}}
 */
function generateWallet() {
  const seed = rippleKeypairs.generateSeed({algorithm:'ed25519'})
  const keypair = rippleKeypairs.deriveKeypair(seed)
  const address = rippleKeypairs.deriveAddress(keypair.publicKey)
  return {
    seed: seed,
    classicAddress: address,
  }
}

export { getWallet, generateWallet }
