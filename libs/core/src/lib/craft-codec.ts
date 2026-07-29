/**
 * A synchronous bidirectional conversion between a transport representation
 * and the value used by the application.
 *
 * The core only knows this small contract. Integrations for validation
 * libraries live in separate packages.
 */
export interface CraftCodec<Encoded, Decoded> {
  decode(input: Encoded): Decoded;
  encode(value: Decoded): Encoded;
}

/** A runtime decoder used for successful HTTP response bodies. */
export interface CraftDecoder<Decoded> {
  decode(input: unknown): Decoded | Promise<Decoded>;
}
