import { Client as SshClient } from "ssh2";
import { isIP } from "node:net";

function ipv4ToInt(ip: string): number {
  const octets = ip.split(".").map(Number);
  return ((octets[0] ?? 0) << 24) | ((octets[1] ?? 0) << 16) | ((octets[2] ?? 0) << 8) | (octets[3] ?? 0);
}

function inCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range!) & mask);
}

// Always blocked regardless of the private-network opt-in: cloud metadata
// endpoints and loopback have no legitimate reason to be a "remote server" target.
const ALWAYS_BLOCKED_CIDRS = ["169.254.0.0/16", "127.0.0.0/8"];
const PRIVATE_RANGE_CIDRS = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];

export function isBlockedTarget(host: string, allowPrivateNetworks: boolean): boolean {
  const version = isIP(host);
  if (version !== 4) return false; // IPv6/hostname handling is a follow-up; DNS resolution risk noted separately

  if (ALWAYS_BLOCKED_CIDRS.some((cidr) => inCidr(host, cidr))) return true;
  if (!allowPrivateNetworks && PRIVATE_RANGE_CIDRS.some((cidr) => inCidr(host, cidr))) return true;
  return false;
}

export interface SshJoinTarget {
  host: string;
  port: number;
  username: string;
  privateKeyPem: string;
  /** TOFU: absent on first connect (we record it then), compared on every subsequent connect. */
  expectedHostKeyFingerprint?: string;
  allowPrivateNetworkTarget?: boolean;
}

export interface SshJoinResult {
  hostKeyFingerprint: string;
  output: string;
}

/**
 * Runs exactly one fixed, parameterized command on the remote host: docker
 * swarm join with a manager-issued token. This is the platform's only outbound
 * connection to a user-supplied host, and it never constructs a shell string
 * from user input beyond the join token/address themselves (both come from
 * our own Swarm manager, not from the request).
 */
export async function runSwarmJoin(
  target: SshJoinTarget,
  managerAddr: string,
  joinToken: string,
): Promise<SshJoinResult> {
  if (isBlockedTarget(target.host, target.allowPrivateNetworkTarget ?? false)) {
    throw new Error(`Refusing to connect to disallowed target: ${target.host}`);
  }

  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    let hostKeyFingerprint = "";

    conn
      .on("ready", () => {
        const command = `docker swarm join --token ${joinToken} ${managerAddr}`;
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }
          let output = "";
          stream
            .on("close", (code: number) => {
              conn.end();
              if (code === 0) resolve({ hostKeyFingerprint, output });
              else reject(new Error(`swarm join failed (exit ${code}): ${output}`));
            })
            .on("data", (data: Buffer) => (output += data.toString()))
            .stderr.on("data", (data: Buffer) => (output += data.toString()));
        });
      })
      .on("error", reject)
      .connect({
        host: target.host,
        port: target.port,
        username: target.username,
        privateKey: target.privateKeyPem,
        readyTimeout: 15_000,
        hostHash: "sha256",
        // TOFU: first connect records the fingerprint (handled by the caller from
        // the resolved SshJoinResult); every later connect must match what was pinned.
        hostVerifier: (hashedKey: string) => {
          hostKeyFingerprint = hashedKey;
          if (!target.expectedHostKeyFingerprint) return true;
          return hashedKey === target.expectedHostKeyFingerprint;
        },
      });
  });
}
