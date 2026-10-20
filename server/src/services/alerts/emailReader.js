import { simpleParser } from "mailparser";

/**
 * Extracts the sender ADDRESS from a From header value (display names are discarded).
 * Returns null unless there is exactly one address, so tricks with multiple addresses fail closed.
 */
export async function senderAddressFromHeader(fromHeader) {
  if (typeof fromHeader !== "string" || fromHeader.length > 1000 || /[\r\n]/.test(fromHeader)) return null;
  const parsed = await simpleParser(`From: ${fromHeader}\r\n\r\n`);
  const addresses = parsed.from?.value ?? [];
  return addresses.length === 1 && addresses[0].address ? addresses[0].address.trim().toLowerCase() : null;
}

/** Parses a raw RFC 822 message into what the alert parsers need. `receivedAt` overrides the Date header. */
export async function readRawEmail(rawBuffer, { receivedAt } = {}) {
  const parsed = await simpleParser(rawBuffer);
  const addresses = parsed.from?.value ?? [];
  return {
    fromAddress: addresses.length === 1 && addresses[0].address ? addresses[0].address.trim().toLowerCase() : null,
    receivedAt: receivedAt ?? parsed.date ?? new Date(),
    html: typeof parsed.html === "string" ? parsed.html : "",
    text: typeof parsed.text === "string" ? parsed.text : "",
  };
}
