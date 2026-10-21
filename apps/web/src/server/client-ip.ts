import { AsyncLocalStorage } from "node:async_hooks";
import { isIP } from "node:net";
import http from "node:http";

/** Bucket key shared by every request when the direct peer address is unknown. */
export const GLOBAL_CLIENT_KEY = "global";

const peerAddressScope = new AsyncLocalStorage<string>();

let captureInstalled = false;

/**
 * Captures the socket peer address of every inbound HTTP request.
 *
 * The address comes from the socket, so a client cannot forge it with a header.
 * The capture is installed when this module is first imported, which happens
 * while the server route handlers are loaded, before requests are served.
 */
function installPeerAddressCapture(): void {
  if (captureInstalled) return;
  captureInstalled = true;
  const prototype = http.Server.prototype as unknown as { emit: (event: string | symbol, ...args: unknown[]) => boolean };
  const originalEmit = prototype.emit;
  prototype.emit = function capturePeerAddress(this: http.Server, event: string | symbol, ...args: unknown[]): boolean {
    if (event !== "request") return originalEmit.apply(this, [event, ...args]);
    const incoming = args[0] as { socket?: { remoteAddress?: string | undefined } } | undefined;
    const address = incoming?.socket?.remoteAddress;
    if (!address) return originalEmit.apply(this, [event, ...args]);
    return peerAddressScope.run(address, () => originalEmit.apply(this, [event, ...args]));
  };
}

installPeerAddressCapture();

/** Direct peer address of the request currently being handled, when the runtime exposes one. */
export function capturedPeerAddress(): string | undefined {
  const address = peerAddressScope.getStore();
  return address && isIP(address) ? address : undefined;
}

export type PeerAddressProvider = () => string | undefined;
export type WarningSink = (message: string) => void;

const MISSING_PEER_ADDRESS_WARNING = "Client peer address is unavailable: every request shares one rate-limit bucket. Run behind a trusted proxy with TRUST_PROXY=true, or expose the socket address to keep per-client limits.";

/**
 * Resolves the rate-limit bucket key for a request.
 *
 * Behind a trusted proxy the forwarded address is used. Otherwise the direct
 * socket peer address is used, which a client cannot spoof. When neither is
 * available every request shares one bucket and a single warning is logged.
 */
export class ClientIdentity {
  private warned = false;
  constructor(
    private readonly peerAddress: PeerAddressProvider = capturedPeerAddress,
    private readonly warn: WarningSink = (message) => console.warn(message),
  ) {}

  ip(request: Request, trustProxy = process.env.TRUST_PROXY === "true"): string {
    if (trustProxy) {
      const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      if (forwarded && isIP(forwarded)) return forwarded;
    }
    const peer = this.peerAddress();
    if (peer) return peer;
    if (!this.warned) {
      this.warned = true;
      this.warn(MISSING_PEER_ADDRESS_WARNING);
    }
    return GLOBAL_CLIENT_KEY;
  }
}

export const clientIdentity = new ClientIdentity();

/** Rate-limit bucket key for a request. */
export function clientIp(request: Request, trustProxy = process.env.TRUST_PROXY === "true"): string {
  return clientIdentity.ip(request, trustProxy);
}
