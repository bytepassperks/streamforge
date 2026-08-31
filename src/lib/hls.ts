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
