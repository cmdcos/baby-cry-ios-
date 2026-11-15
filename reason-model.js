/*
 * Local, browser-side inference for the pre-trained "baby-cry-reasoning" model.
 *
 * Model: manfye/baby-cry-reasoning v0.6 (Extra Trees, 217 features, 6 labels)
 * Source: https://huggingface.co/manfye/baby-cry-reasoning
 * License: CC BY-SA 4.0
 *
 * The feature contract and bundle format follow the model card and
 * runtime/extra-trees.ts published with the model. This file is a JavaScript
 * port of that runtime (no training, no network at inference time).
 *
 * IMPORTANT: the model card says this is experimental, external validation is
 * missing (33.8% on EnesBabyCries2), and it must not be used for diagnosis,
 * infant monitoring, or caregiving decisions.
 */
(function (global) {
  'use strict';

  const MAGIC = 'LLTREE01';
  const MEL_BINS = 64;
  const FFT_SIZE = 512;
  const FRAME_SIZE = 400;
  const FRAME_HOP = 160;
  const CLASS_COUNT = 6;
  const LABELS = ['belly_pain', 'burping', 'discomfort', 'hungry', 'lonely', 'scared'];
  const VERSION = 'v0.6';

  const hzToMel = (hz) => 2595 * Math.log10(1 + hz / 700);
  const melToHz = (mel) => 700 * (10 ** (mel / 2595) - 1);

  function melFilters() {
    const points = Array.from({ length: MEL_BINS + 2 }, (_, index) => {
      const ratio = index / (MEL_BINS + 1);
      return melToHz(hzToMel(50) + ratio * (hzToMel(8000) - hzToMel(50)));
    });
    return Array.from({ length: MEL_BINS }, (_, mel) => {
      const left = points[mel];
      const center = points[mel + 1];
      const right = points[mel + 2];
      return Float64Array.from({ length: FFT_SIZE / 2 + 1 }, (_, bin) => {
        const frequency = (bin * 8000) / 256;
        return Math.max(0, Math.min(
          (frequency - left) / (center - left),
          (right - frequency) / (right - center)
        ));
      });
    });
  }

  const FILTERS = melFilters();
  const HANN = Float64Array.from(
    { length: FRAME_SIZE },
    (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / FRAME_SIZE)
  );
  const WINDOW_SUM = HANN.reduce((sum, value) => sum + value, 0);

  function fftInPlace(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i += 1) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const tr = re[i]; re[i] = re[j]; re[j] = tr;
        const ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const angle = (-2 * Math.PI) / len;
      const wLenRe = Math.cos(angle);
      const wLenIm = Math.sin(angle);
      for (let i = 0; i < n; i += len) {
        let wRe = 1;
        let wIm = 0;
        for (let j = 0; j < len / 2; j += 1) {
          const uRe = re[i + j];
          const uIm = im[i + j];
          const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
          const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
          re[i + j] = uRe + vRe;
          im[i + j] = uIm + vIm;
          re[i + j + len / 2] = uRe - vRe;
          im[i + j + len / 2] = uIm - vIm;
          const nextRe = wRe * wLenRe - wIm * wLenIm;
          wIm = wRe * wLenIm + wIm * wLenRe;
          wRe = nextRe;
        }
      }
    }
  }

  function meansAndStandardDeviations(values, rows, columns) {
    const output = new Float64Array(rows * 2);
    for (let row = 0; row < rows; row += 1) {
      let mean = 0;
      for (let column = 0; column < columns; column += 1) mean += values[row * columns + column];
      mean /= columns;
      let variance = 0;
      for (let column = 0; column < columns; column += 1) {
        const difference = values[row * columns + column] - mean;
        variance += difference * difference;
      }
      output[row] = mean;
      output[rows + row] = Math.sqrt(variance / columns);
    }
    return output;
  }

  function gradient(values, rows, columns) {
    const output = new Float64Array(values.length);
    for (let row = 0; row < rows; row += 1) {
      const offset = row * columns;
      output[offset] = values[offset + 1] - values[offset];
      for (let column = 1; column < columns - 1; column += 1) {
        output[offset + column] = 0.5 * (values[offset + column + 1] - values[offset + column - 1]);
      }
      output[offset + columns - 1] = values[offset + columns - 1] - values[offset + columns - 2];
    }
    return output;
  }

  function dctMfcc(logMel, frames) {
    const output = new Float64Array(13 * frames);
    for (let coefficient = 0; coefficient < 13; coefficient += 1) {
      const scale = coefficient === 0 ? Math.sqrt(1 / MEL_BINS) : Math.sqrt(2 / MEL_BINS);
      for (let frame = 0; frame < frames; frame += 1) {
        let sum = 0;
        for (let mel = 0; mel < MEL_BINS; mel += 1) {
          sum += logMel[mel * frames + frame]
            * Math.cos((Math.PI / MEL_BINS) * (mel + 0.5) * coefficient);
        }
        output[coefficient * frames + frame] = scale * sum;
      }
    }
    return output;
  }

  /**
   * 16 kHz mono, exactly 49,152 samples (3.072 s).
   * Returns 217 deterministic features matching the model contract.
   */
  function extractFeatures(waveform) {
    if (!waveform || waveform.length < FRAME_SIZE) {
      throw new Error('录音太短，无法提取声学特征');
    }
    const frames = Math.floor((waveform.length - FRAME_SIZE) / FRAME_HOP) + 1;
    const logMel = new Float64Array(MEL_BINS * frames);
    const centroid = new Float64Array(frames);
    const bandwidth = new Float64Array(frames);
    const rolloff = new Float64Array(frames);
    const flatness = new Float64Array(frames);
    const rms = new Float64Array(frames);
    const power = new Float64Array(FFT_SIZE / 2 + 1);

    for (let frame = 0; frame < frames; frame += 1) {
      const re = new Float64Array(FFT_SIZE);
      const im = new Float64Array(FFT_SIZE);
      const start = frame * FRAME_HOP;
      for (let index = 0; index < FRAME_SIZE; index += 1) {
        re[index] = waveform[start + index] * HANN[index];
      }
      fftInPlace(re, im);

      let powerTotal = 0;
      let logPowerTotal = 0;
      let weightedFrequency = 0;
      for (let bin = 0; bin <= FFT_SIZE / 2; bin += 1) {
        const real = re[bin] / WINDOW_SUM;
        const imaginary = im[bin] / WINDOW_SUM;
        const value = Math.max(real * real + imaginary * imaginary, 1e-12);
        power[bin] = value;
        powerTotal += value;
        logPowerTotal += Math.log(value);
        weightedFrequency += bin * (8000 / 256) * value;
      }

      centroid[frame] = weightedFrequency / powerTotal;
      let spread = 0;
      let cumulative = 0;
      let rolloffBin = 0;
      for (let bin = 0; bin <= FFT_SIZE / 2; bin += 1) {
        const frequency = bin * (8000 / 256);
        spread += (frequency - centroid[frame]) ** 2 * power[bin];
        cumulative += power[bin];
        if (rolloffBin === 0 && cumulative >= 0.85 * powerTotal) rolloffBin = bin;
      }
      bandwidth[frame] = Math.sqrt(spread / powerTotal);
      rolloff[frame] = rolloffBin * (8000 / 256);
      flatness[frame] = Math.exp(logPowerTotal / power.length) / (powerTotal / power.length);
      rms[frame] = Math.sqrt(powerTotal / power.length);

      for (let mel = 0; mel < MEL_BINS; mel += 1) {
        let energy = 0;
        for (let bin = 0; bin <= FFT_SIZE / 2; bin += 1) {
          energy += FILTERS[mel][bin] * power[bin];
        }
        logMel[mel * frames + frame] = Math.log(Math.max(energy, 1e-6));
      }
    }

    const mfcc = dctMfcc(logMel, frames);
    const firstDelta = gradient(mfcc, 13, frames);
    const secondDelta = gradient(firstDelta, 13, frames);
    const blocks = [
      meansAndStandardDeviations(logMel, MEL_BINS, frames),
      meansAndStandardDeviations(mfcc, 13, frames),
      meansAndStandardDeviations(firstDelta, 13, frames),
      meansAndStandardDeviations(secondDelta, 13, frames)
    ];
    const features = new Float64Array(217);
    let cursor = 0;
    for (const block of blocks) {
      features.set(block, cursor);
      cursor += block.length;
    }
    const scalarRows = [centroid, bandwidth, rolloff, flatness, rms];
    for (const row of scalarRows) {
      const pair = meansAndStandardDeviations(row, 1, frames);
      features[cursor] = pair[0];
      features[cursor + 1] = pair[1];
      cursor += 2;
    }
    let crossings = 0;
    for (let index = 1; index < waveform.length; index += 1) {
      if ((waveform[index] < 0) !== (waveform[index - 1] < 0)) crossings += 1;
    }
    features[cursor] = crossings / (waveform.length - 1);
    return features;
  }

  function parseBundle(buffer) {
    const view = new DataView(buffer);
    let offset = 0;
    const magic = String.fromCharCode(...new Uint8Array(buffer, offset, MAGIC.length));
    offset += MAGIC.length;
    if (magic !== MAGIC) throw new Error('模型文件签名不正确');
    const version = view.getUint32(offset, true); offset += 4;
    const treeCount = view.getUint32(offset, true); offset += 4;
    const featureCount = view.getUint32(offset, true); offset += 4;
    const classCount = view.getUint32(offset, true); offset += 4;
    if (version !== 1 || featureCount !== 217 || classCount !== CLASS_COUNT) {
      throw new Error('模型文件版本不匹配');
    }
    const trees = [];
    for (let treeIndex = 0; treeIndex < treeCount; treeIndex += 1) {
      const nodeCount = view.getUint32(offset, true); offset += 4;
      const tree = {
        left: new Int32Array(nodeCount),
        right: new Int32Array(nodeCount),
        feature: new Int16Array(nodeCount),
        threshold: new Float64Array(nodeCount),
        probabilities: new Float32Array(nodeCount * classCount)
      };
      for (let node = 0; node < nodeCount; node += 1) {
        tree.left[node] = view.getInt32(offset, true); offset += 4;
        tree.right[node] = view.getInt32(offset, true); offset += 4;
        tree.feature[node] = view.getInt16(offset, true); offset += 2;
        tree.threshold[node] = view.getFloat64(offset, true); offset += 8;
        for (let label = 0; label < classCount; label += 1) {
          tree.probabilities[node * classCount + label] = view.getFloat32(offset, true);
          offset += 4;
        }
      }
      trees.push(tree);
    }
    if (offset !== buffer.byteLength) throw new Error('模型文件长度不匹配');
    return { version, featureCount, classCount, treeCount, trees };
  }

  function predict(bundle, features) {
    if (!bundle || !features || features.length !== bundle.featureCount) {
      throw new Error('特征数量与模型不匹配');
    }
    const probabilities = new Array(bundle.classCount).fill(0);
    for (const tree of bundle.trees) {
      let node = 0;
      while (tree.feature[node] >= 0) {
        node = features[tree.feature[node]] <= tree.threshold[node]
          ? tree.left[node]
          : tree.right[node];
      }
      for (let label = 0; label < bundle.classCount; label += 1) {
        probabilities[label] += tree.probabilities[node * bundle.classCount + label] / bundle.trees.length;
      }
    }
    return probabilities;
  }

  async function load(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`模型下载失败：${response.status}`);
    const buffer = await response.arrayBuffer();
    return parseBundle(buffer);
  }

  global.BabyCryReason = {
    LABELS,
    VERSION,
    load,
    parseBundle,
    extractFeatures,
    predict
  };
})(window);
