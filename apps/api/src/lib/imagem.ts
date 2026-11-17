/** JPEG começa com os bytes FF D8 FF. */
export const ehJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
