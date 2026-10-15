import { BlockList, isIPv4, isIPv6 } from "node:net";

// Addresses a link check must never reach: loopback, private networks, link
// local (including cloud metadata at 169.254.169.254), carrier-grade NAT,
// documentation and benchmark ranges, multicast, and reserved space.
const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

/**
 * Whether an IP address is on the public internet. BlockList applies the IPv4
 * rules to IPv4-mapped IPv6 addresses (::ffff:127.0.0.1, ::ffff:7f00:1) too.
 */
export function isPublicAddress(address: string): boolean {
  if (isIPv4(address)) return !blocked.check(address, "ipv4");
  if (isIPv6(address)) return !blocked.check(address, "ipv6");
  return false;
}
