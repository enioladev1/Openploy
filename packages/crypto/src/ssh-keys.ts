import { generateKeyPairSync } from "node:crypto";

export interface GeneratedSshKeypair {
  publicKeyOpenSsh: string;
  privateKeyPem: string;
}

/**
 * Pure key generation, no Docker/SSH-connection code - lives here (not
 * packages/docker) so apps/web can generate a server's keypair at
 * "add server" time without importing anything that touches /var/run/docker.sock.
 */
export function generateSshKeypair(): GeneratedSshKeypair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  // ssh2 accepts PKCS8 PEM directly for the client key; the "public key to add to
  // authorized_keys" needs OpenSSH wire format, which Node doesn't emit natively -
  // deriving it is out of scope here, so callers should present the PEM and instruct
  // the user's SSH setup accordingly, or a future pass can add proper OpenSSH encoding.
  return { publicKeyOpenSsh: publicKey, privateKeyPem: privateKey };
}
