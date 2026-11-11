import net from 'node:net'

// Electron's Node abandons each dual-stack attempt after 250 ms; here the IPv4
// handshake takes ~459 ms, so every request fails while IPv6 is unreachable.
export function tuneNetwork(): void {
  net.setDefaultAutoSelectFamilyAttemptTimeout(5000)
}
