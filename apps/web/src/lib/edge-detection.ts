// Edge maps for the pixel matrix: gradient magnitude of a derivative-of-Gaussian
// filter, computed with separable 1D kernels.
// This module stays dependency-free and type-strippable so the build script
// (`scripts/build-edge-maps.mjs`, plain Node) and the browser fallback share it.

export type EdgeMapOptions = {
  /** Gaussian standard deviation, in pixels of the working image. */
  sigma?: number;
  /** Magnitudes above this percentile saturate to 255 (robust to outliers). */
  percentile?: number;
  /** Below 1, faint edges are lifted; above 1, only strong edges remain. */
  gamma?: number;
};

export type EdgeMap = {
  width: number;
  height: number;
  /** One byte per pixel, 0 (flat) to 255 (strongest edge). */
  data: Uint8ClampedArray;
};

function gaussianKernels(sigma: number) {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const size = radius * 2 + 1;
  const gaussian = new Float32Array(size);
  const derivative = new Float32Array(size);
  let gaussianSum = 0;

  for (let index = 0; index < size; index += 1) {
    const x = index - radius;
    gaussian[index] = Math.exp(-(x * x) / (2 * sigma * sigma));
    gaussianSum += gaussian[index];
  }

  // Normalize the derivative so a unit ramp yields a unit response.
  let derivativeMoment = 0;
  for (let index = 0; index < size; index += 1) {
    const x = index - radius;
    gaussian[index] /= gaussianSum;
    derivative[index] = (-x / (sigma * sigma)) * gaussian[index];
    derivativeMoment += -x * derivative[index];
  }
  for (let index = 0; index < size; index += 1) {
    derivative[index] /= derivativeMoment;
  }

  return { gaussian, derivative, radius };
}

// Correlates along one axis with clamped (replicated) borders.
function convolveAxis(
  source: Float32Array,
  width: number,
  height: number,
  kernel: Float32Array,
  radius: number,
  horizontal: boolean,
) {
  const output = new Float32Array(source.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sampleX = horizontal
          ? Math.min(width - 1, Math.max(0, x + k))
          : x;
        const sampleY = horizontal
          ? y
          : Math.min(height - 1, Math.max(0, y + k));
        sum += source[sampleY * width + sampleX] * kernel[k + radius];
      }
      output[y * width + x] = sum;
    }
  }

  return output;
}

/** Rec. 709 luminance in [0, 1], composited over `background` when transparent. */
export function rgbaToGrayscale(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  background = 1,
) {
  const gray = new Float32Array(width * height);

  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    const alpha = rgba[offset + 3] / 255;
    const luminance =
      (0.2126 * rgba[offset] +
        0.7152 * rgba[offset + 1] +
        0.0722 * rgba[offset + 2]) /
      255;
    gray[index] = luminance * alpha + background * (1 - alpha);
  }

  return gray;
}

export function computeEdgeMap(
  gray: Float32Array,
  width: number,
  height: number,
  { sigma = 1.2, percentile = 0.985, gamma = 0.8 }: EdgeMapOptions = {},
): EdgeMap {
  const { gaussian, derivative, radius } = gaussianKernels(sigma);
  // Ix = dG/dx ⊗ G(y), Iy = G(x) ⊗ dG/dy: four 1D passes instead of two 2D ones.
  const smoothedY = convolveAxis(gray, width, height, gaussian, radius, false);
  const smoothedX = convolveAxis(gray, width, height, gaussian, radius, true);
  const gradientX = convolveAxis(
    smoothedY,
    width,
    height,
    derivative,
    radius,
    true,
  );
  const gradientY = convolveAxis(
    smoothedX,
    width,
    height,
    derivative,
    radius,
    false,
  );
  const magnitude = new Float32Array(gray.length);
  const histogram = new Uint32Array(1024);
  let maximum = 0;

  for (let index = 0; index < magnitude.length; index += 1) {
    magnitude[index] = Math.hypot(gradientX[index], gradientY[index]);
    maximum = Math.max(maximum, magnitude[index]);
  }

  const data = new Uint8ClampedArray(gray.length);
  if (maximum <= 1e-6) return { width, height, data };

  // Percentile from a histogram: linear time, no sort of the full image.
  for (const value of magnitude) {
    histogram[Math.min(1023, Math.floor((value / maximum) * 1023))] += 1;
  }
  const threshold = magnitude.length * percentile;
  let cumulative = 0;
  let bin = 0;
  for (; bin < histogram.length; bin += 1) {
    cumulative += histogram[bin];
    if (cumulative >= threshold) break;
  }
  const reference = Math.max(((bin + 1) / 1024) * maximum, 1e-6);

  for (let index = 0; index < magnitude.length; index += 1) {
    data[index] = Math.round(
      Math.pow(Math.min(1, magnitude[index] / reference), gamma) * 255,
    );
  }

  return { width, height, data };
}
