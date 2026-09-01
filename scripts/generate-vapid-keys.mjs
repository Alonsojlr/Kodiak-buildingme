import { webcrypto } from 'node:crypto'

const keys = await webcrypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
)

const vapidKeys = {
  publicKey: await webcrypto.subtle.exportKey('jwk', keys.publicKey),
  privateKey: await webcrypto.subtle.exportKey('jwk', keys.privateKey)
}
const applicationServerKey = Buffer.from(
  await webcrypto.subtle.exportKey('raw', keys.publicKey)
).toString('base64url')

console.log(JSON.stringify(vapidKeys, null, 2))
console.error(`Clave pública para verificar: ${applicationServerKey}`)
