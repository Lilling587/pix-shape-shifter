// Minimal type declarations for the `utif` package (no shipped types).
declare module "utif" {
  export interface IFD {
    width: number;
    height: number;
    [key: string]: unknown;
  }

  export function decode(buffer: Uint8Array): IFD[];
  export function decodeImage(buffer: Uint8Array, img: IFD, ifds?: IFD[]): void;
  export function toRGBA8(out: IFD): Uint8Array;
  export function encodeImage(
    rgba: Uint8Array | ArrayBuffer,
    w: number,
    h: number,
    metadata?: Record<string, unknown>,
  ): ArrayBuffer;
  export function encode(ifds: IFD[]): ArrayBuffer;

  const UTIF: {
    decode: typeof decode;
    decodeImage: typeof decodeImage;
    toRGBA8: typeof toRGBA8;
    encodeImage: typeof encodeImage;
    encode: typeof encode;
  };
  export default UTIF;
}
