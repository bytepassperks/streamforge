/**
 * Returns the master-rendition indexes that are safe to publish.
 *
 * The copied top rendition follows the source video's keyframes rather than
 * our four-second GOP, so a sparse-keyframe source can make it unsuitable for
 * adaptive seeking. Callers should pass its longest segment duration.
 */
export function selectHlsVariantIndexes(longestCopiedSegmentSeconds: number, variantCount = 3): number[] {
  const count = Math.max(0, Math.floor(variantCount));
  if (count < 3 || !Number.isFinite(longestCopiedSegmentSeconds) || longestCopiedSegmentSeconds <= 12) {
    return Array.from({ length: count }, (_, index) => index);
  }
  return Array.from({ length: count - 1 }, (_, index) => index);
}

/**
 * Returns the encoded renditions worth publishing for a source of the given
 * height. The copied source rendition is handled separately, and the ladder
 * intentionally starts adding encoded quality only when the source is at
 * least the next standard rung up.
 */
export function selectHlsEncodedVariantIndexes(sourceHeight: number): number[] {
  if (!Number.isFinite(sourceHeight) || sourceHeight < 720) return [];
  if (sourceHeight < 1080) return [0];
  return [0, 1];
}

/** Filters a generated master playlist without changing its rendition metadata. */
export function selectHlsMasterPlaylist(master: string, indexes: number[]): string {
  const wanted = new Set(indexes);
  const lines = master.split(/\r?\n/);
  const output: string[] = [];
  let rendition = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      rendition += 1;
      if (!wanted.has(rendition)) {
        index += 1;
        continue;
      }
    }
    output.push(line);
  }
  return output.join('\n');
}

export interface HlsVariantBandwidthInput {
  playlist: string;
  segmentSizes: Readonly<Record<string, number>>;
}

export interface HlsBandwidthMeasurement {
  bandwidth: number;
  averageBandwidth: number;
}

function hlsSegments(playlist: string): { uri: string; duration: number }[] {
  const lines = playlist.split(/\r?\n/);
  const segments: { uri: string; duration: number }[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^#EXTINF:([^,]+)/.exec(lines[index].trim());
    if (!match) continue;
    const duration = Number(match[1]);
    let uriIndex = index + 1;
    while (uriIndex < lines.length && (!lines[uriIndex].trim() || lines[uriIndex].trim().startsWith('#'))) {
      uriIndex += 1;
    }
    if (uriIndex < lines.length) segments.push({ uri: lines[uriIndex].trim(), duration });
    index = uriIndex;
  }
  return segments;
}

/**
 * Measures a rendition's sliding-window peak and average bitrate from its
 * playlist and R2 sizes.
 * A missing segment, invalid size, or non-positive duration makes the
 * measurement unusable so callers can preserve the encoder's declaration.
 */
export function measureHlsBandwidth(
  playlist: string,
  segmentSizes: Readonly<Record<string, number>>,
): HlsBandwidthMeasurement | null {
  const segments = hlsSegments(playlist);
  if (!segments.length) return null;
  let totalBytes = 0;
  let totalDuration = 0;
  const bitrates: { bytes: number; duration: number }[] = [];
  for (const segment of segments) {
    const size = Number(segmentSizes[segment.uri]);
    if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(segment.duration) || segment.duration <= 0) return null;
    totalBytes += size;
    totalDuration += segment.duration;
    bitrates.push({ bytes: size, duration: segment.duration });
  }
  if (totalBytes <= 0 || totalDuration <= 0 || !Number.isFinite(totalBytes) || !Number.isFinite(totalDuration)) return null;
  const averageBandwidth = Math.round((totalBytes * 8) / totalDuration);
  if (!Number.isFinite(averageBandwidth) || averageBandwidth <= 0) return null;

  const minimumWindowDuration = 10;
  let peakBandwidth = averageBandwidth;
  if (totalDuration >= minimumWindowDuration) {
    peakBandwidth = 0;
    for (let start = 0; start < bitrates.length; start += 1) {
      let windowBytes = 0;
      let windowDuration = 0;
      for (let end = start; end < bitrates.length; end += 1) {
        windowBytes += bitrates[end].bytes;
        windowDuration += bitrates[end].duration;
        if (windowDuration >= minimumWindowDuration) {
          peakBandwidth = Math.max(peakBandwidth, (windowBytes * 8) / windowDuration);
        }
      }
    }
  }
  if (!Number.isFinite(peakBandwidth) || peakBandwidth <= 0) return null;
  return {
    bandwidth: Math.round(peakBandwidth),
    averageBandwidth,
  };
}

/** Returns the URI paired with each stream-inf line, preserving master order. */
export function hlsMasterVariantUris(master: string): string[] {
  const lines = master.split(/\r?\n/);
  const uris: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith('#EXT-X-STREAM-INF:')) continue;
    let uriIndex = index + 1;
    while (uriIndex < lines.length && (!lines[uriIndex].trim() || lines[uriIndex].trim().startsWith('#'))) {
      uriIndex += 1;
    }
    if (uriIndex < lines.length) uris.push(lines[uriIndex].trim());
    index = uriIndex;
  }
  return uris;
}

/**
 * Rewrites measured BANDWIDTH values without changing rendition metadata or
 * the stream-inf/URI pairing. Invalid measurements leave their variants alone.
 */
export function rewriteHlsMasterBandwidth(
  master: string,
  variants: ReadonlyArray<HlsVariantBandwidthInput | null | undefined>,
): string {
  const lines = master.split(/\r?\n/);
  const output = [];
  let rendition = -1;
  for (const line of lines) {
    if (!line.startsWith('#EXT-X-STREAM-INF:')) {
      output.push(line);
      continue;
    }
    rendition += 1;
    const variant = variants[rendition];
    const measured = variant ? measureHlsBandwidth(variant.playlist, variant.segmentSizes) : null;
    const rewritten = measured
      ? line
        .replace(/,?AVERAGE-BANDWIDTH=\d+(?=,|$)/g, '')
        .replace(
          /\bBANDWIDTH=\d+(?=,|$)/,
          `BANDWIDTH=${measured.bandwidth},AVERAGE-BANDWIDTH=${measured.averageBandwidth}`,
        )
      : line;
    output.push(rewritten);
  }
  return output.join('\n');
}
