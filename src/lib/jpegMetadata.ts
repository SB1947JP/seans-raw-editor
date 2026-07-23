/**
 * Writing keyword tags into an exported JPEG.
 *
 * The canvas encoder emits a bare image with no metadata, so a file's tags were
 * being left behind on export — the keywords lived only in this browser and
 * never travelled with the picture. This inserts them as two standard,
 * widely-read blocks immediately after the JPEG's SOI marker:
 *
 *   - XMP  (APP1)  dc:subject    — the modern field Lightroom, Bridge, Capture
 *                                  One, digiKam and OS indexers read
 *   - IPTC (APP13) 2:25 Keywords — the legacy field Photo Mechanic and older
 *                                  tools prefer; still read by all of the above
 *
 * Both are written so the set survives into whatever catalogue the photos end
 * up in. Hand-assembled rather than pulling in a metadata dependency, in
 * keeping with the rest of the project (the map is hand-rolled for the same
 * reason). The RAW on disk is never touched; this only rewrites the bytes of
 * the freshly-encoded JPEG on their way to the file the user is saving.
 */

const enc = new TextEncoder();

/** Big-endian 16-bit, the byte order every JPEG length/marker field uses. */
function u16be(n: number): number[] {
  return [(n >>> 8) & 0xff, n & 0xff];
}

/** Big-endian 32-bit, for the 8BIM resource's data-size field. */
function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  );
}

/** The XMP packet carrying dc:subject as an unordered bag of keywords — the
 *  exact shape Adobe tools write and read. */
function xmpPacket(keywords: string[]): string {
  const items = keywords.map((k) => `      <rdf:li>${escapeXml(k)}</rdf:li>`).join('\n');
  return (
    `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n` +
    ` <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
    `  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">\n` +
    `   <dc:subject>\n` +
    `    <rdf:Bag>\n` +
    `${items}\n` +
    `    </rdf:Bag>\n` +
    `   </dc:subject>\n` +
    `  </rdf:Description>\n` +
    ` </rdf:RDF>\n` +
    `</x:xmpmeta>\n` +
    `<?xpacket end="w"?>`
  );
}

/** FF E1 APP1 segment: the XMP namespace signature then the packet. */
function xmpSegment(keywords: string[]): Uint8Array<ArrayBuffer> | null {
  const sig = enc.encode('http://ns.adobe.com/xap/1.0/\0');
  const packet = enc.encode(xmpPacket(keywords));
  const segLen = 2 + sig.length + packet.length; // length field counts itself
  if (segLen > 0xffff) return null; // too big for one segment; drop rather than corrupt
  const out = new Uint8Array(2 + segLen);
  out.set([0xff, 0xe1, ...u16be(segLen)], 0);
  out.set(sig, 4);
  out.set(packet, 4 + sig.length);
  return out;
}

/** FF ED APP13 segment: a Photoshop IRB holding an IPTC-NAA (2:25) keyword
 *  list, prefixed with a 1:90 UTF-8 declaration so non-ASCII tags decode. */
function iptcSegment(keywords: string[]): Uint8Array<ArrayBuffer> | null {
  const iim: number[] = [];
  // 1:90 CodedCharacterSet = ESC % G — marks the IIM values as UTF-8.
  iim.push(0x1c, 0x01, 0x5a, ...u16be(3), 0x1b, 0x25, 0x47);
  for (const k of keywords) {
    const v = enc.encode(k);
    if (v.length > 0xffff) continue; // 16-bit length field; skip a pathological tag
    iim.push(0x1c, 0x02, 0x19, ...u16be(v.length), ...v);
  }

  // 8BIM resource block wrapping the IIM data. Resource data is padded to an
  // even length, but the size field records the true (unpadded) length.
  const block: number[] = [
    0x38, 0x42, 0x49, 0x4d, // "8BIM"
    0x04, 0x04, // resource id 0x0404 = IPTC-NAA
    0x00, 0x00, // empty Pascal name, itself padded to even
    ...u32be(iim.length),
    ...iim,
  ];
  if (iim.length & 1) block.push(0x00); // pad resource data to even

  const sig = enc.encode('Photoshop 3.0\0');
  const segLen = 2 + sig.length + block.length;
  if (segLen > 0xffff) return null;
  const out = new Uint8Array(2 + segLen);
  out.set([0xff, 0xed, ...u16be(segLen)], 0);
  out.set(sig, 4);
  out.set(Uint8Array.from(block), 4 + sig.length);
  return out;
}

/**
 * Returns a copy of `jpeg` with the keywords embedded as XMP and IPTC blocks.
 * With no keywords, or if the input isn't a JPEG, the bytes are returned
 * unchanged. The new segments go right after SOI, ahead of everything the
 * encoder wrote — marker order among APPn segments is not significant to
 * readers, and this keeps the image data itself byte-for-byte untouched.
 */
export function embedKeywords(
  jpeg: Uint8Array<ArrayBuffer>,
  keywords: string[],
): Uint8Array<ArrayBuffer> {
  if (keywords.length === 0) return jpeg;
  if (jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;

  const inserts = [xmpSegment(keywords), iptcSegment(keywords)].filter(
    (s): s is Uint8Array<ArrayBuffer> => s !== null,
  );
  if (inserts.length === 0) return jpeg;

  const added = inserts.reduce((n, s) => n + s.length, 0);
  const out = new Uint8Array(jpeg.length + added);
  out.set(jpeg.subarray(0, 2), 0); // SOI
  let off = 2;
  for (const s of inserts) {
    out.set(s, off);
    off += s.length;
  }
  out.set(jpeg.subarray(2), off); // the rest of the original stream
  return out;
}
