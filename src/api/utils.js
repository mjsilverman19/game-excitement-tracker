export function normalizeNumericValue(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function normalizeWinProbability(value) {
  if (value === null || value === undefined) {
    return 50;
  }

  const numeric = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(numeric)) {
    return 50;
  }

  const percent = numeric <= 1 ? numeric * 100 : numeric;
  const clamped = Math.max(0.1, Math.min(99.9, percent));

  return clamped;
}

export function estimateTimeRemaining(index, totalLength) {
  const progress = index / totalLength;
  return Math.max(0, 3600 * (1 - progress));
}

export function applyAdaptiveSmoothing(probabilities) {
  const smoothed = [...probabilities];
  const windowSize = 3;

  for (let i = windowSize; i < probabilities.length - windowSize; i++) {
    const window = probabilities.slice(i - windowSize, i + windowSize + 1);
    const avg = window.reduce((sum, p) => sum + p.probability, 0) / window.length;
    const current = probabilities[i].probability;

    const deviation = Math.abs(current - avg);
    if (deviation > 15 && deviation < 30) {
      smoothed[i].probability = 0.7 * current + 0.3 * avg;
    }
  }

  return smoothed;
}

export function calculateBalanceFromProbability(probability) {
  if (probability === null || probability === undefined) {
    return 0;
  }

  const difference = Math.abs(probability - 50);
  return Math.max(0, 50 - difference);
}

export function sigmoidTransform(value, midpoint, scale) {
  return scale / (1 + Math.exp(-(value - midpoint) / (midpoint * 0.3)));
}

export function linear(value, minIn, maxIn, minOut, maxOut) {
  const clampedValue = Math.max(minIn, Math.min(maxIn, value));
  return minOut + (clampedValue - minIn) * (maxOut - minOut) / (maxIn - minIn);
}

export function calculateVolatility(values) {
  if (values.length < 2) return 0;

  let sumSquaredDiffs = 0;
  for (let i = 1; i < values.length; i++) {
    sumSquaredDiffs += Math.pow(values[i] - values[i - 1], 2);
  }

  return Math.sqrt(sumSquaredDiffs / (values.length - 1));
}

export function calculateLateGameWeight(index, totalLength) {
  const progress = index / totalLength;
  return Math.exp(progress * 1.5);
}

export function calculateNoisePenalty(noiseLevel) {
  if (!noiseLevel || noiseLevel <= 8) {
    return 1.0;
  }

  if (noiseLevel >= 30) {
    return 0.75;
  }

  const scale = (noiseLevel - 8) / (30 - 8);
  return 1.0 - scale * 0.25;
}
