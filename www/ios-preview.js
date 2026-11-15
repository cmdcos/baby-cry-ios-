(() => {
  'use strict';

  const PUBLIC_BUILD = document.documentElement.dataset.public === 'true';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const BASE = { hungry: 58, tired: 27, discomfort: 15 };
  const META = {
    hungry: { name: '饿了', icon: 'i-bottle' },
    tired: { name: '困了', icon: 'i-moon' },
    discomfort: { name: '不舒服', icon: 'i-bandage' }
  };

  const SOUNDS = [
    { id: 'rain', title: '雨声', sub: '白噪音 · 循环', icon: 'i-rain', noise: 'rain', kind: 'noise', theme: 'linear-gradient(145deg, #6d8068, #b9c6a7)' },
    { id: 'ocean', title: '海浪', sub: '慢呼吸 · 循环', icon: 'i-ocean', noise: 'ocean', kind: 'noise', theme: 'linear-gradient(145deg, #567b72, #a9c6b8)' },
    { id: 'fan', title: '吹风机', sub: '连续白噪 · 循环', icon: 'i-fan', noise: 'fan', kind: 'noise', theme: 'linear-gradient(145deg, #a58a52, #e0c789)' },
    { id: 'heart', title: '心跳', sub: '节律安抚 · 循环', icon: 'i-heart', noise: 'heart', kind: 'noise', theme: 'linear-gradient(145deg, #a95245, #dfa28e)' },
    { id: 'shush', title: '嘘声', sub: '嘘—— · 循环', icon: 'i-shush', noise: 'shush', kind: 'noise', theme: 'linear-gradient(145deg, #6f7f67, #bcc9ab)' },
    { id: 'womb', title: '子宫环境', sub: '低频包裹 · 循环', icon: 'i-womb', noise: 'womb', kind: 'noise', theme: 'linear-gradient(145deg, #8a654b, #d8b58e)' }
  ];

  const MUSIC = PUBLIC_BUILD ? [] : [
    { id: 'liren', title: '离人', sub: '已内置 · 本地音频', icon: 'i-music-note', kind: 'music', theme: 'linear-gradient(145deg, #6d6a5e, #c2b9a4)', src: 'assets/music/liren.mp3', imported: true },
    { id: 'wind', title: '风吹麦浪', sub: '已内置 · 本地音频', icon: 'i-wheat', kind: 'music', theme: 'linear-gradient(145deg, #9a8a62, #ddc98f)', src: 'assets/music/wind.mp3', imported: true },
    { id: 'xuancao', title: '萱草花（哼唱版）', sub: '已内置 · 本地音频', icon: 'i-flower', kind: 'music', theme: 'linear-gradient(145deg, #a85b4a, #e0b39b)', src: 'assets/music/xuancao.mp3', imported: true }
  ];

  const LYRICS = {
    rain: ['先把灯光调暗', '让雨声盖住房间的杂音', '跟着呼吸，慢慢放慢', '你不需要马上做好一切'],
    ocean: ['把宝宝抱稳，贴近胸口', '像海浪一样慢慢起伏', '呼气比吸气更长一点', '重复几次，再看宝宝的反应'],
    fan: ['白噪音不用太响', '比宝宝哭声略低就好', '保持一段距离，不要贴耳', '连续、均匀的声音更容易入睡'],
    heart: ['把宝宝轻轻贴近左胸', '跟着心跳的节奏轻拍', '一下，一下，不要着急', '小月龄宝宝更熟悉这个节律'],
    shush: ['在耳边轻声“嘘——”', '声音要长、要稳', '配合包裹和轻拍', '先做 10 秒，停下来观察'],
    womb: ['把房间调暗，减少刺激', '用低频、连续的声音包裹', '包裹松紧以能放进两指为准', '宝宝安静后，慢慢降低音量'],
    liren: ['离人 · 本地音频', '把音量调到舒服的位置', '跟着旋律轻轻摇一摇', '宝宝睡着后调低音量'],
    wind: ['风吹麦浪 · 本地音频', '跟着节奏慢慢晃', '注意托住头颈', '不要用力摇晃'],
    xuancao: ['萱草花 · 本地音频', '把音量调到舒服的位置', '哼唱或轻拍都可以', '宝宝睡着后调低音量']
  };

  let probs = { ...BASE };
  let context = new Set();
  let feedback = null;
  const FEED_KEY = 'baby-preview-feedings';
  let feedings = loadFeedings();
  let recordTimer = null;
  let remaining = 10;
  let toastTimer = null;
  let modelPromise = null;
  let rawModelProbs = null;
  let analysisQuality = '';
  let mediaStream = null;
  let mediaRecorder = null;
  let recordChunks = [];
  let recordMode = 'demo';
  let analyzing = false;
  let recordSession = 0;

  const MODEL_NAMES = {
    belly_pain: '肚子痛',
    burping: '胀气',
    discomfort: '不舒服',
    hungry: '饿',
    lonely: '想抱',
    scared: '害怕'
  };

  let currentTrack = null;
  let playing = false;
  let volume = 0.8;
  let fadeFactor = 1;
  let audioCtx = null;
  let masterGain = null;
  let noiseNodes = [];
  const audioEl = new Audio();
  audioEl.preload = 'auto';
  let elapsedMs = 0;
  let startedAt = 0;
  let sleepState = { mode: null, endsAt: null, timer: null, fade: true, lastMinutes: null };
  const liked = new Set();

  function showScreen(name) {
    closeSheets();
    $$('.screen').forEach((screen) => {
      screen.classList.toggle('active', screen.id === `screen-${name}`);
    });
    $$('.tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === name);
    });
    const active = $(`#screen-${name}`);
    if (active) active.scrollTop = 0;
  }

  function stopMedia() {
    if (mediaRecorder) {
      try {
        mediaRecorder.onstop = null;
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      } catch (error) { /* noop */ }
      mediaRecorder = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    recordChunks = [];
    recordMode = 'demo';
  }

  function closeSheets() {
    recordSession += 1;
    $$('.sheet.open').forEach((sheet) => sheet.classList.remove('open'));
    $('#backdrop').classList.remove('open');
    stopTimer();
    stopMedia();
  }

  function openSheet(sheet) {
    closeSheets();
    $('#backdrop').classList.add('open');
    sheet.classList.add('open');
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function buildWave() {
    const wave = $('#wave');
    if (!wave) return;
    wave.innerHTML = Array.from({ length: 26 }, (_, i) => {
      const duration = (0.85 + Math.random() * 0.55).toFixed(2);
      return `<span style="--i:${i};animation-duration:${duration}s"></span>`;
    }).join('');
  }

  function setTimer(value) {
    remaining = Math.max(0, value);
    $('#timerText').textContent = String(Math.ceil(remaining));
    $('#timerRing').style.setProperty('--p', String((remaining / 10) * 100));
  }

  function setRecordStatus(text) {
    const el = $('#recordStatus');
    if (el) el.textContent = text;
  }

  async function ensureReasonModel() {
    if (!window.BabyCryReason) throw new Error('本地模型运行时未加载');
    if (!modelPromise) {
      modelPromise = Promise.race([
        window.BabyCryReason.load('./models/reason-v0.6.bin'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('模型加载超时')), 15000))
      ]).catch((error) => {
        modelPromise = null;
        throw error;
      });
    }
    return modelPromise;
  }

  function prepareClip(data, sampleRate) {
    const targetRate = 16000;
    const targetLen = 49152;
    const ratio = sampleRate / targetRate;
    const fullLen = Math.max(1, Math.floor(data.length / ratio));
    const resampled = new Float32Array(fullLen);
    for (let i = 0; i < fullLen; i += 1) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      const s0 = data[i0] || 0;
      const s1 = data[i0 + 1] ?? s0;
      resampled[i] = s0 + (s1 - s0) * frac;
    }

    const clip = new Float32Array(targetLen);
    if (resampled.length >= targetLen) {
      let bestStart = 0;
      let bestEnergy = -1;
      const hop = 24576;
      for (let start = 0; start + targetLen <= resampled.length; start += hop) {
        let energy = 0;
        for (let i = 0; i < targetLen; i += 8) energy += resampled[start + i] ** 2;
        if (energy > bestEnergy) { bestEnergy = energy; bestStart = start; }
      }
      const lastStart = resampled.length - targetLen;
      let lastEnergy = 0;
      for (let i = 0; i < targetLen; i += 8) lastEnergy += resampled[lastStart + i] ** 2;
      if (lastEnergy > bestEnergy) bestStart = lastStart;
      clip.set(resampled.subarray(bestStart, bestStart + targetLen));
    } else {
      clip.set(resampled, Math.floor((targetLen - resampled.length) / 2));
    }

    let sum = 0;
    let peak = 0;
    for (let i = 0; i < clip.length; i += 1) {
      sum += clip[i] * clip[i];
      if (Math.abs(clip[i]) > peak) peak = Math.abs(clip[i]);
    }
    const rms = Math.sqrt(sum / clip.length);
    const rmsDb = 20 * Math.log10(Math.max(rms, 1e-9));
    let gain = 10 ** (Math.max(-12, Math.min(12, -23 - rmsDb)) / 20);
    const peakLimit = 10 ** (-1 / 20);
    if (peak * gain > peakLimit) gain *= peakLimit / (peak * gain);
    for (let i = 0; i < clip.length; i += 1) clip[i] *= gain;
    return clip;
  }

  function useDemoResult() {
    stopTimer();
    stopMedia();
    recordMode = 'demo';
    analyzing = false;
    rawModelProbs = null;
    analysisQuality = '演示数据';
    setRecordStatus('演示模式');
    showResult('record');
  }

  async function finishRecording() {
    if (analyzing) return;
    stopTimer();
    analyzing = true;
    const stopButton = $('#recordStop');
    if (stopButton) stopButton.disabled = true;

    try {
      if (recordMode === 'real' && mediaRecorder && mediaRecorder.state !== 'inactive') {
        setRecordStatus('正在分析…');
        const recorder = mediaRecorder;
        const stopped = new Promise((resolve) => {
          recorder.addEventListener('stop', resolve, { once: true });
        });
        recorder.stop();
        if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
        await stopped;
        const blob = new Blob(recordChunks, { type: recorder.mimeType || 'audio/mp4' });
        mediaRecorder = null;
        recordChunks = [];
        await analyzeBlob(blob);
      } else {
        useDemoResult();
      }
    } catch (error) {
      console.warn('录音分析失败，使用演示结果：', error);
      toast('分析失败，已切换到演示结果');
      useDemoResult();
    } finally {
      analyzing = false;
      if (stopButton) stopButton.disabled = false;
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }
      if (mediaRecorder && mediaRecorder.state === 'inactive') mediaRecorder = null;
    }
  }

  async function analyzeBlob(blob) {
    let quality = '良好';
    let clip = null;
    try {
      const buffer = await blob.arrayBuffer();
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('浏览器不支持音频解码');
      const ctx = new Ctx();
      const audioBuffer = await new Promise((resolve, reject) => {
        ctx.decodeAudioData(buffer, resolve, reject);
      });
      const data = audioBuffer.getChannelData(0);
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) {
        sum += data[i] * data[i];
        if (Math.abs(data[i]) > peak) peak = Math.abs(data[i]);
      }
      const rmsDb = 20 * Math.log10(Math.max(Math.sqrt(sum / Math.max(1, data.length)), 1e-9));
      if (audioBuffer.duration < 1.5) quality = '太短';
      else if (rmsDb < -45) quality = '太轻';
      else if (peak > 0.995) quality = '爆音';
      clip = prepareClip(data, audioBuffer.sampleRate);
      await ctx.close();
    } catch (error) {
      console.warn('音频解码失败：', error);
      throw error;
    }

    setRecordStatus('正在加载本地模型…');
    const model = await ensureReasonModel();
    const labels = window.BabyCryReason.LABELS.slice();
    const raw = window.BabyCryReason.predict(model, window.BabyCryReason.extractFeatures(clip));
    const rawProbs = {};
    labels.forEach((label, index) => { rawProbs[label] = raw[index]; });
    rawModelProbs = rawProbs;

    const grouped = {
      hungry: rawProbs.hungry || 0,
      tired: Math.max(rawProbs.tired || 0, rawProbs.lonely || 0),
      discomfort: Math.max(
        rawProbs.discomfort || 0,
        rawProbs.belly_pain || 0,
        rawProbs.burping || 0,
        rawProbs.scared || 0
      )
    };
    probs = normalized(grouped);
    analysisQuality = quality === '良好' ? '录音质量良好' : `录音质量${quality}`;
    setRecordStatus(`分析完成 · ${analysisQuality}`);
    showResult('record');
  }

  async function startRecord() {
    probs = { ...BASE };
    context = new Set();
    feedback = null;
    rawModelProbs = null;
    analysisQuality = '';
    analyzing = false;
    recordMode = 'demo';
    $$('#contextChips .chip').forEach((chip) => chip.classList.remove('active'));
    $$('#feedbackGrid button').forEach((btn) => btn.classList.remove('selected'));
    openSheet($('#recordSheet'));
    buildWave();
    setTimer(10);
    stopTimer();
    stopMedia();
    setRecordStatus('正在连接麦克风…');
    const session = ++recordSession;

    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error('麦克风或 MediaRecorder 不可用');
      }
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      if (session !== recordSession) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
        return;
      }
      const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
      const mimeType = candidates.find((type) => window.MediaRecorder.isTypeSupported(type)) || '';
      mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType, audioBitsPerSecond: 128000 } : undefined);
      recordChunks = [];
      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size) recordChunks.push(event.data);
      });
      mediaRecorder.start();
      recordMode = 'real';
      setRecordStatus('正在录音 · 本机处理');
    } catch (error) {
      recordMode = 'demo';
      setRecordStatus('未获得麦克风 · 演示模式');
      toast('未获得麦克风权限，将用示例结果');
    }

    const startedAt = Date.now();
    recordTimer = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setTimer(10 - elapsed);
      if (elapsed >= 10) {
        stopTimer();
        finishRecording();
      }
    }, 100);
  }

  function stopTimer() {
    if (recordTimer) {
      clearInterval(recordTimer);
      recordTimer = null;
    }
  }

  function normalized(values) {
    const keys = Object.keys(values);
    const total = keys.reduce((sum, key) => sum + values[key], 0) || 1;
    let acc = 0;
    const out = {};
    keys.forEach((key, index) => {
      if (index === keys.length - 1) {
        out[key] = Math.max(0, 100 - acc);
      } else {
        const value = Math.round((values[key] / total) * 100);
        out[key] = value;
        acc += value;
      }
    });
    return out;
  }

  function loadFeedings() {
    try {
      const raw = localStorage.getItem(FEED_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          return parsed.filter((item) => item && Number.isFinite(item.ts));
        }
      }
    } catch (error) { /* noop */ }
    const seed = [{
      id: 'seed',
      ts: Date.now() - 200 * 60 * 1000,
      amount: 90,
      type: '瓶喂',
      note: ''
    }];
    try { localStorage.setItem(FEED_KEY, JSON.stringify(seed)); } catch (error) { /* noop */ }
    return seed;
  }

  function saveFeedings() {
    try { localStorage.setItem(FEED_KEY, JSON.stringify(feedings)); } catch (error) { /* noop */ }
  }

  function latestFeeding() {
    return [...feedings].sort((a, b) => b.ts - a.ts)[0] || null;
  }

  function feedingGap() {
    const last = latestFeeding();
    const ms = last ? Math.max(0, Date.now() - last.ts) : 0;
    return { last, ms, hours: ms / 3600000, over: ms >= 3 * 3600000 };
  }

  function formatClock(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function formatFeedDate(ts) {
    const date = new Date(ts);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = start - 86400000;
    if (ts >= start) return `今天 ${formatClock(date)}`;
    if (ts >= yesterday) return `昨天 ${formatClock(date)}`;
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${formatClock(date)}`;
  }

  function formatGap(ms) {
    const minutes = Math.max(0, Math.floor(ms / 60000));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours ? `${hours} 小时 ${rest} 分` : `${rest} 分钟`;
  }

  function todayFeedStats() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const today = feedings.filter((item) => item.ts >= start.getTime());
    return {
      count: today.length,
      amount: today.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    };
  }

  function renderFeedings() {
    const gap = feedingGap();
    const today = todayFeedStats();
    if (gap.last) {
      $('#lastFeedTime').textContent = formatFeedDate(gap.last.ts);
      $('#feedGapText').textContent = `距上次喝奶 ${formatGap(gap.ms)}`;
      $('#feedGapHint').textContent = gap.over
        ? '已超过 3 小时，可能饿了；也看找奶、吸吮手'
        : '不到 3 小时，先排查尿布、温度、拍嗝';
      $('#feedGap').classList.toggle('over', gap.over);
      $('#lastFeedAmount').textContent = gap.last.amount ? `${gap.last.amount} ml` : gap.last.type;
    } else {
      $('#lastFeedTime').textContent = '还没有记录';
      $('#feedGapText').textContent = '先记录一次喝奶';
      $('#feedGapHint').textContent = '记录后会自动计算是否超过 3 小时';
      $('#feedGap').classList.remove('over');
      $('#lastFeedAmount').textContent = '—';
    }
    $('#todayFeedCount').textContent = `${today.count} 次`;
    $('#todayFeedAmount').textContent = today.amount ? `${today.amount} ml` : '—';

    const rows = [...feedings].sort((a, b) => b.ts - a.ts).slice(0, 3);
    $('#feedList').innerHTML = rows.map((item) => `
      <div class="feed-row">
        <span class="feed-dot"><svg class="icon"><use href="#i-bottle"></use></svg></span>
        <span><b>${item.type}${item.amount ? ` · ${item.amount} ml` : ''}</b><small>${item.note || '已记录'}</small></span>
        <span class="feed-time">${formatFeedDate(item.ts)}</span>
      </div>
    `).join('');
  }

  function renderResultFeed(top) {
    const gap = feedingGap();
    const over = gap.over;
    const text = gap.last
      ? `距上次喝奶 ${formatGap(gap.ms)} · ${over ? '已超过 3 小时' : '不到 3 小时'}`
      : '还没有喝奶记录';
    $('#resultFeedText').textContent = text;
    $('#resultFeed').classList.toggle('over', over);

    const suggestion = $('#feedSuggestion');
    if (!suggestion) return;
    if (!gap.last) {
      suggestion.textContent = '先记录一次喝奶，再结合找奶、吸吮手等信号判断。';
      return;
    }
    if (top === 'hungry') {
      suggestion.textContent = over
        ? `距上次喝奶 ${formatGap(gap.ms)}，已超过 3 小时；先喂，喂完竖抱拍嗝 5 分钟。`
        : `距上次喝奶 ${formatGap(gap.ms)}，不到 3 小时；先排查尿布/温度/拍嗝，再决定是否喂。`;
    } else {
      suggestion.textContent = `距上次喝奶 ${formatGap(gap.ms)}；如果刚喂过，先排查其他需求。`;
    }
  }

  function openFeedSheet() {
    const now = new Date();
    $('#feedTime').value = formatClock(now);
    $('#feedAmountInput').value = '';
    $('#feedNote').value = '';
    $$('#feedQuick button').forEach((button) => button.classList.remove('active'));
    $$('#feedType button').forEach((button) => button.classList.toggle('active', button.dataset.type === '瓶喂'));
    openSheet($('#feedSheet'));
  }

  function saveFeed() {
    const time = $('#feedTime').value || formatClock(new Date());
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    if (date.getTime() > Date.now() + 5 * 60000) date.setDate(date.getDate() - 1);
    const amount = Math.max(0, Math.min(300, Number($('#feedAmountInput').value) || 0));
    const type = $('#feedType button.active')?.dataset.type || '瓶喂';
    feedings.push({
      id: String(Date.now()),
      ts: date.getTime(),
      amount,
      type,
      note: $('#feedNote').value.trim()
    });
    saveFeedings();
    renderFeedings();
    renderResultFeed(Object.keys(probs).sort((a, b) => probs[b] - probs[a])[0]);
    $('#feedSheet').classList.remove('open');
    $('#backdrop').classList.remove('open');
    toast(`${type}${amount ? ` ${amount} ml` : ''} 已记录`);
  }

  function renderResult() {
    const top = Object.keys(probs).sort((a, b) => probs[b] - probs[a])[0];
    const meta = META[top] || META.hungry;
    $('#resultEmoji').innerHTML = iconSvg(meta.icon, 'icon result-icon');
    $('#resultTitle').textContent = `更像${meta.name}`;
    $('#resultPct').textContent = String(probs[top]);
    const level = probs[top] >= 60 ? '高' : probs[top] >= 50 ? '中' : '中低';
    $('#resultConfidence').textContent = `置信度：${level} · ${analysisQuality || '录音质量良好'}`;

    const detail = $('#resultModelDetail');
    if (rawModelProbs) {
      const entries = Object.entries(rawModelProbs).sort((a, b) => b[1] - a[1]).slice(0, 3);
      detail.hidden = false;
      detail.textContent = `本地模型 6 类：${entries.map(([key, value]) => `${MODEL_NAMES[key] || key} ${Math.round(value * 100)}%`).join(' · ')}`;
    } else {
      detail.hidden = true;
      detail.textContent = '';
    }

    $$('.prob-row').forEach((row) => {
      const key = row.dataset.key;
      const value = probs[key] || 0;
      row.querySelector('.prob-pct').textContent = `${value}%`;
      row.querySelector('.prob-fill').style.width = `${value}%`;
    });

    $('#contextCount').textContent = context.size ? `已结合 ${context.size} 条` : '可选';
    $$('#contextChips .chip').forEach((chip) => {
      chip.classList.toggle('active', context.has(chip.dataset.context));
    });
    $$('#feedbackGrid button').forEach((btn) => {
      btn.classList.toggle('selected', feedback === btn.dataset.feedback);
    });
    renderResultFeed(top);
  }

  function showResult(source) {
    stopTimer();
    openSheet($('#resultSheet'));
    if (source === 'history') {
      $('#resultBadge').textContent = '历史记录 · 示例';
    } else if (rawModelProbs) {
      $('#resultBadge').textContent = '本地模型 · 本机推理';
    } else {
      if (!analysisQuality) analysisQuality = '演示数据';
      $('#resultBadge').textContent = '演示数据 · 未调用模型';
    }
    renderResult();
  }

  function showHistoryResult(id) {
    if (id === '2') probs = { hungry: 38, tired: 47, discomfort: 15 };
    else if (id === '3') probs = { hungry: 30, tired: 18, discomfort: 52 };
    else if (id === '4') probs = { hungry: 36, tired: 20, discomfort: 44 };
    else probs = { ...BASE };
    rawModelProbs = null;
    analysisQuality = '历史示例';
    feedback = null;
    context = new Set();
    showResult('history');
  }

  function toggleContext(chip) {
    const key = chip.dataset.context;
    if (context.has(key)) context.delete(key);
    else context.add(key);

    const values = { ...BASE };
    if (context.has('feed')) values.hungry += 8;
    if (context.has('sleep')) values.tired += 8;
    if (context.has('diaper')) values.discomfort += 7;
    if (context.has('temp')) values.discomfort += 5;
    probs = normalized(values);
    renderResult();
  }

  function setFeedback(button) {
    feedback = button.dataset.feedback;
    $$('#feedbackGrid button').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.feedback === feedback);
    });
    toast(`已记录：${button.textContent.trim()}`);
  }

  function saveRecord() {
    const top = Object.keys(probs).sort((a, b) => probs[b] - probs[a])[0];
    const meta = META[top] || META.hungry;
    const last = $('.last-row');
    if (last) {
      last.querySelector('b').textContent = `可能${meta.name}`;
      last.querySelector('small').textContent = `刚刚 · ${probs[top]}% · 实验模型`;
    }
    closeSheets();
    showScreen('home');
    toast('已保存（预览数据）');
  }

  /* ---------------- sound / player ---------------- */
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
  }

  function iconSvg(name, cls = 'icon') {
    return `<svg class="${cls}" aria-hidden="true"><use href="#${name}"></use></svg>`;
  }

  function remainingSleep() {
    return sleepState.endsAt ? Math.max(0, sleepState.endsAt - Date.now()) : 0;
  }

  function ensureAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) {
        toast('当前浏览器不支持 Web Audio');
        return null;
      }
      audioCtx = new Ctx();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function makeNoiseBuffer(kind) {
    const ctx = ensureAudio();
    if (!ctx) return null;
    const seconds = kind === 'heart' ? 2.3 : 2;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      if (kind === 'heart') {
        const t = i / ctx.sampleRate;
        const p = t % 1.15;
        const first = Math.exp(-p * 18) * Math.sin(2 * Math.PI * 48 * p);
        const q = Math.max(0, p - 0.18);
        const second = Math.exp(-q * 22) * Math.sin(2 * Math.PI * 42 * q) * 0.55;
        data[i] = (first + second) * 0.8;
      } else if (kind === 'shush') {
        const t = i / ctx.sampleRate;
        const env = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.45 * t));
        data[i] = white * env * 0.5;
      } else if (kind === 'ocean' || kind === 'fan' || kind === 'womb') {
        data[i] = Math.max(-1, Math.min(1, last * 3.2));
      } else {
        data[i] = white * 0.55;
      }
    }
    return buffer;
  }

  function stopNoise() {
    noiseNodes.forEach((node) => {
      try { if (node.stop) node.stop(); } catch (e) { /* noop */ }
      try { node.disconnect(); } catch (e) { /* noop */ }
    });
    noiseNodes = [];
  }

  function stopAudio() {
    audioEl.pause();
    try { audioEl.currentTime = 0; } catch (e) { /* noop */ }
    stopNoise();
    playing = false;
  }

  function startNoise(track) {
    stopAudio();
    const ctx = ensureAudio();
    if (!ctx) return;
    const source = ctx.createBufferSource();
    source.buffer = makeNoiseBuffer(track.noise);
    if (!source.buffer) return;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    let gainValue = 0.32;
    if (track.noise === 'rain') {
      filter.type = 'bandpass'; filter.frequency.value = 1800; filter.Q.value = 0.5;
      gainValue = 0.38;
    } else if (track.noise === 'ocean') {
      filter.type = 'lowpass'; filter.frequency.value = 720;
      gainValue = 0.5;
    } else if (track.noise === 'fan') {
      filter.type = 'lowpass'; filter.frequency.value = 1150;
      gainValue = 0.38;
    } else if (track.noise === 'heart') {
      filter.type = 'lowpass'; filter.frequency.value = 420;
      gainValue = 0.75;
    } else if (track.noise === 'shush') {
      filter.type = 'bandpass'; filter.frequency.value = 1400; filter.Q.value = 0.8;
      gainValue = 0.38;
    } else if (track.noise === 'womb') {
      filter.type = 'lowpass'; filter.frequency.value = 430;
      gainValue = 0.55;
    } else {
      filter.type = 'lowpass'; filter.frequency.value = 6000;
      gainValue = 0.3;
    }

    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    noiseNodes = [source, filter, gain];

    if (track.noise === 'ocean' || track.noise === 'fan' || track.noise === 'shush') {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = track.noise === 'ocean' ? 0.08 : track.noise === 'fan' ? 0.12 : 0.3;
      lfoGain.gain.value = gainValue * 0.35;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
      noiseNodes.push(lfo, lfoGain);
    }

    source.start();
    currentTrack = track;
    playing = true;
    elapsedMs = 0;
    startedAt = Date.now();
    applyVolume();
    updateAllUI();
    updateMediaSession();
  }

  function startMusic(track) {
    if (!track.src) {
      toast('音频文件未找到');
      return;
    }
    stopAudio();
    audioEl.src = track.src;
    audioEl.currentTime = 0;
    audioEl.volume = volume * fadeFactor;
    currentTrack = track;
    playing = true;
    elapsedMs = 0;
    startedAt = Date.now();
    updateAllUI();
    updateMediaSession();
    audioEl.play().catch(() => {
      playing = false;
      updateAllUI();
      toast('无法播放，请换一个音频文件');
    });
  }

  function playTrack(track) {
    if (!track) return;
    if (track.kind === 'noise') startNoise(track);
    else startMusic(track);
  }

  function playableTracks() {
    return [...SOUNDS, ...MUSIC.filter((track) => track.imported)];
  }

  function nextTrack() {
    const list = playableTracks();
    if (!list.length) return;
    const index = list.findIndex((track) => track.id === currentTrack?.id);
    playTrack(list[(index + 1 + list.length) % list.length]);
  }

  function prevTrack() {
    const list = playableTracks();
    if (!list.length) return;
    const index = list.findIndex((track) => track.id === currentTrack?.id);
    playTrack(list[(index - 1 + list.length) % list.length]);
  }

  function pausePlayback() {
    if (!currentTrack || !playing) return;
    if (currentTrack.kind === 'noise') {
      elapsedMs += Date.now() - startedAt;
      if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
    } else {
      audioEl.pause();
      elapsedMs += Date.now() - startedAt;
    }
    playing = false;
    updateAllUI();
    updateMediaSession();
  }

  function resumePlayback() {
    if (!currentTrack) {
      playTrack(SOUNDS[0]);
      return;
    }
    if (currentTrack.kind === 'noise') {
      ensureAudio();
      if (audioCtx) audioCtx.resume();
    } else {
      if (audioEl.ended) audioEl.currentTime = 0;
      audioEl.play().catch(() => toast('无法继续播放'));
    }
    playing = true;
    startedAt = Date.now();
    updateAllUI();
    updateMediaSession();
  }

  function togglePlayback() {
    if (playing) pausePlayback();
    else resumePlayback();
  }

  function getElapsedSeconds() {
    if (!currentTrack) return 0;
    if (currentTrack.kind === 'music') return audioEl.currentTime || 0;
    const live = playing ? Date.now() - startedAt : 0;
    return (elapsedMs + live) / 1000;
  }

  function setVolume(value) {
    volume = Math.max(0, Math.min(1, Number(value)));
    applyVolume();
    const bar = $('#volumeBar');
    if (bar) bar.value = String(volume);
  }

  function applyVolume() {
    const effective = Math.max(0, Math.min(1, volume * fadeFactor));
    if (masterGain) masterGain.gain.value = effective;
    audioEl.volume = effective;
  }

  function updateMediaSession() {
    if (!('mediaSession' in navigator) || !currentTrack) return;
    try {
      if ('MediaMetadata' in window) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.kind === 'music' ? '本地导入' : '宝宝哭声小助手',
          album: '哄睡声音'
        });
      }
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    } catch (e) { /* noop */ }
  }

  function updateMini() {
    const mini = $('#miniPlayer');
    if (!mini) return;
    if (!currentTrack) {
      mini.hidden = true;
      return;
    }
    mini.hidden = false;
    $('#miniArt').innerHTML = iconSvg(currentTrack.icon, 'icon mini-icon');
    $('#miniArt').style.background = currentTrack.theme;
    $('#miniTitle').textContent = currentTrack.title;
    const timerText = sleepState.mode === 'duration' ? `定时 ${formatTime(remainingSleep() / 1000)}` : '';
    const base = currentTrack.kind === 'music' ? '本地音频 · 仅个人使用' : currentTrack.sub;
    $('#miniSub').textContent = timerText ? `${timerText} · ${base}` : base;
    $('#miniPlay').classList.toggle('is-playing', playing);
  }

  function updatePlayerProgress() {
    if (!currentTrack) return;
    const seek = $('#seekBar');
    const isMusic = currentTrack.kind === 'music';
    $('#playerProgressWrap').classList.toggle('no-seek', !isMusic);
    seek.disabled = !isMusic;
    if (isMusic && Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
      seek.max = String(audioEl.duration);
      seek.value = String(audioEl.currentTime);
      $('#timeNow').textContent = formatTime(audioEl.currentTime);
      $('#timeTotal').textContent = formatTime(audioEl.duration);
    } else {
      seek.value = '0';
      $('#timeNow').textContent = formatTime(getElapsedSeconds());
      $('#timeTotal').textContent = '循环';
    }
  }

  function renderLyrics(track) {
    const lines = LYRICS[track.id] || ['把房间调暗，减少刺激', '跟着呼吸，慢慢放慢', '先做 10 秒，再观察宝宝', '你不需要马上做好一切'];
    $('#playerLyrics').innerHTML = lines.map((line, index) =>
      `<p class="${index === 1 ? 'active' : ''}">${line}</p>`
    ).join('');
  }

  function updatePlayer() {
    if (!currentTrack) return;
    $('#playerArt').innerHTML = iconSvg(currentTrack.icon, 'icon player-icon-art');
    $('#playerArt').style.background = currentTrack.theme;
    $('#playerBg').style.background = currentTrack.theme;
    $('#playerTitle').textContent = currentTrack.title;
    $('#playerSub').textContent = currentTrack.kind === 'music' ? '本地音频 · 仅个人使用' : currentTrack.sub;
    $('#playerBadge').textContent = currentTrack.kind === 'music' ? '本地音频' : '循环';
    $('#playerLike').classList.toggle('liked', liked.has(currentTrack.id));
    renderLyrics(currentTrack);
    $('#playerPlay').classList.toggle('is-playing', playing);
    const bar = $('#volumeBar');
    if (bar) bar.value = String(volume);
    updatePlayerProgress();
    updateTimerUI();
  }

  function updateSoundCards() {
    $$('.sound-card').forEach((card) => {
      card.classList.toggle('playing', currentTrack?.id === card.dataset.play && playing);
    });
    const feature = $('.feature-play');
    if (feature) feature.textContent = currentTrack?.id === 'rain' && playing ? '暂停' : '播放';
  }

  function updateMusicRows() {
    $$('.music-row').forEach((row) => {
      const track = MUSIC.find((item) => item.id === row.dataset.music);
      if (!track) return;
      row.classList.toggle('playing', currentTrack?.id === track.id && playing);
      row.classList.toggle('imported', track.imported);
      const action = row.querySelector('.music-action');
      if (action) action.textContent = track.imported ? '播放' : '导入';
    });
  }

  function updateAllUI() {
    updateMini();
    updatePlayer();
    updateSoundCards();
    updateMusicRows();
    if ($('#queueSheet').classList.contains('open')) renderQueue();
  }

  function renderSoundGrid() {
    $('#soundGrid').innerHTML = SOUNDS.map((sound) => `
      <button class="sound-card glass" data-play="${sound.id}">
        <span class="sound-art" style="background:${sound.theme}">${iconSvg(sound.icon, 'icon art-icon')}</span>
        <b>${sound.title}</b>
        <small>${sound.sub}</small>
        <span class="eq"><i></i><i></i><i></i></span>
      </button>`).join('');
  }

  function renderMusicList() {
    $('#musicList').innerHTML = MUSIC.map((track) => `
      <button class="music-row imported" data-music="${track.id}">
        <span class="music-art" style="background:${track.theme}">${iconSvg(track.icon, 'icon music-icon')}</span>
        <span class="music-main">
          <b>${track.title}</b>
          <small>已内置 · 本地音频</small>
        </span>
        <span class="music-action">播放</span>
      </button>`).join('');
  }

  function openPlayer() {
    if (!currentTrack) {
      playTrack(SOUNDS[0]);
    }
    $('#playerScreen').classList.add('open');
    updatePlayer();
  }

  function closePlayer() {
    $('#playerScreen').classList.remove('open');
    closeTimer();
    closeQueue();
  }

  function openTimer() {
    closeQueue();
    $('#timerSheet').classList.add('open');
    updateTimerUI();
  }

  function closeTimer() {
    $('#timerSheet').classList.remove('open');
  }

  function openQueue() {
    closeTimer();
    renderQueue();
    $('#queueSheet').classList.add('open');
  }

  function closeQueue() {
    $('#queueSheet').classList.remove('open');
  }

  function renderQueue() {
    const list = [...SOUNDS, ...MUSIC];
    $('#queueList').innerHTML = list.map((track) => `
      <button class="queue-row ${currentTrack?.id === track.id ? 'playing' : ''}" data-queue="${track.id}">
        <span class="queue-art" style="background:${track.theme}">${iconSvg(track.icon, 'icon queue-icon')}</span>
        <span class="queue-main">
          <b>${track.title}</b>
          <small>${track.kind === 'noise' ? '白噪音 · 循环' : (track.imported ? '本地文件 · 已导入' : '需导入')}</small>
        </span>
        <span class="queue-tag">${track.kind === 'noise' ? '循环' : '音乐'}</span>
      </button>`).join('');
  }

  function setSleepTimer(minutes) {
    clearSleepTimer(false);
    sleepState.mode = 'duration';
    sleepState.endsAt = Date.now() + minutes * 60 * 1000;
    sleepState.lastMinutes = minutes;
    sleepState.timer = setInterval(tickSleepTimer, 500);
    updateTimerUI();
    toast(`已设置 ${minutes} 分钟`);
  }

  function setSleepTrack() {
    if (!currentTrack || currentTrack.kind !== 'music') {
      toast('白噪音是循环的，请选择具体时长');
      return;
    }
    clearSleepTimer(false);
    sleepState.mode = 'track';
    sleepState.lastMinutes = 'track';
    updateTimerUI();
    toast('播完当前曲目后暂停');
  }

  function clearSleepTimer(showToast) {
    if (sleepState.timer) clearInterval(sleepState.timer);
    sleepState.mode = null;
    sleepState.endsAt = null;
    sleepState.timer = null;
    sleepState.lastMinutes = null;
    fadeFactor = 1;
    applyVolume();
    updateTimerUI();
    if (showToast) toast('已关闭定时');
  }

  function tickSleepTimer() {
    if (sleepState.mode !== 'duration' || !sleepState.endsAt) return;
    const left = sleepState.endsAt - Date.now();
    if (left <= 0) {
      pausePlayback();
      clearSleepTimer(false);
      toast('定时结束，已暂停');
      return;
    }
    fadeFactor = sleepState.fade && left <= 15000 ? Math.max(0, left / 15000) : 1;
    applyVolume();
    updateTimerUI();
  }

  function updateTimerUI() {
    const chip = $('#timerChip');
    const remainingLabel = $('#timerRemaining');
    if (sleepState.mode === 'duration') {
      const left = formatTime(remainingSleep() / 1000);
      if (chip) chip.textContent = `⏱ ${left}`;
      if (remainingLabel) remainingLabel.textContent = `还剩 ${left}`;
    } else if (sleepState.mode === 'track') {
      if (chip) chip.textContent = '⏱ 播完';
      if (remainingLabel) remainingLabel.textContent = '播完当前曲目后暂停';
    } else {
      if (chip) chip.textContent = '⏱ 定时';
      if (remainingLabel) remainingLabel.textContent = '未设置';
    }
    $$('#timerOptions button').forEach((button) => {
      const value = button.dataset.min;
      const active = String(sleepState.lastMinutes) === value || (value === 'track' && sleepState.mode === 'track');
      button.classList.toggle('active', active);
    });
  }

  audioEl.addEventListener('timeupdate', () => {
    if (currentTrack?.kind === 'music') updatePlayerProgress();
  });
  audioEl.addEventListener('loadedmetadata', updatePlayerProgress);
  audioEl.addEventListener('ended', () => {
    if (sleepState.mode === 'track') {
      pausePlayback();
      clearSleepTimer(false);
      toast('播完当前，已暂停');
      return;
    }
    if (playableTracks().length > 1) nextTrack();
    else pausePlayback();
  });
  audioEl.addEventListener('error', () => toast('音频加载失败'));

  setInterval(() => {
    if (!currentTrack) return;
    updatePlayerProgress();
    updateMini();
    updateTimerUI();
  }, 500);

  /* ---------------- events ---------------- */
  $('#recordBtn').addEventListener('click', startRecord);
  $('#recordStop').addEventListener('click', finishRecording);
  $('#recordDemo').addEventListener('click', useDemoResult);
  $('#recordClose').addEventListener('click', closeSheets);
  $('#resultClose').addEventListener('click', closeSheets);
  $('#againBtn').addEventListener('click', startRecord);
  $('#saveBtn').addEventListener('click', saveRecord);
  $('#backdrop').addEventListener('click', closeSheets);

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => showScreen(tab.dataset.tab));
  });

  $$('[data-go]').forEach((button) => {
    button.addEventListener('click', () => showScreen(button.dataset.go));
  });

  $$('[data-toast]').forEach((button) => {
    button.addEventListener('click', () => toast(button.dataset.toast));
  });

  $$('.soothe').forEach((button) => {
    button.addEventListener('click', () => toast(`预览：${button.dataset.soothe} — 正式版会显示步骤`));
  });

  $$('[data-result]').forEach((row) => {
    row.addEventListener('click', () => showHistoryResult(row.dataset.result));
  });

  $$('#contextChips .chip').forEach((chip) => {
    chip.addEventListener('click', () => toggleContext(chip));
  });

  $$('#feedbackGrid button').forEach((button) => {
    button.addEventListener('click', () => setFeedback(button));
  });

  /* ---------------- sound events ---------------- */
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-play]');
    if (!target) return;
    const track = SOUNDS.find((item) => item.id === target.dataset.play);
    if (!track) return;
    if (currentTrack?.id === track.id) togglePlayback();
    else playTrack(track);
  });

  $('#musicList').addEventListener('click', (event) => {
    const row = event.target.closest('[data-music]');
    if (!row) return;
    const track = MUSIC.find((item) => item.id === row.dataset.music);
    if (track) playTrack(track);
  });

  $('#queueList').addEventListener('click', (event) => {
    const row = event.target.closest('[data-queue]');
    if (!row) return;
    const track = [...SOUNDS, ...MUSIC].find((item) => item.id === row.dataset.queue);
    if (track) playTrack(track);
  });

  $('#miniOpen').addEventListener('click', openPlayer);
  $('#miniPlay').addEventListener('click', togglePlayback);
  $('#miniNext').addEventListener('click', nextTrack);
  $('#playerClose').addEventListener('click', closePlayer);
  $('#playerPlay').addEventListener('click', togglePlayback);
  $('#prevBtn').addEventListener('click', prevTrack);
  $('#nextBtn').addEventListener('click', nextTrack);
  $('#playerMore').addEventListener('click', () => toast('歌词 / 音质 / 定时在正式版提供'));
  $('#playerLike').addEventListener('click', () => {
    if (!currentTrack) return;
    if (liked.has(currentTrack.id)) liked.delete(currentTrack.id);
    else liked.add(currentTrack.id);
    $('#playerLike').classList.toggle('liked', liked.has(currentTrack.id));
  });

  $('#timerChip').addEventListener('click', openTimer);
  $('#soundsTimer').addEventListener('click', openTimer);
  $('#guideBtn').addEventListener('click', () => openSheet($('#guideSheet')));
  $('#guideClose').addEventListener('click', () => {
    $('#guideSheet').classList.remove('open');
    $('#backdrop').classList.remove('open');
  });
  $('#feedAddBtn').addEventListener('click', openFeedSheet);
  $('#feedClose').addEventListener('click', () => {
    $('#feedSheet').classList.remove('open');
    $('#backdrop').classList.remove('open');
  });
  $('#feedSave').addEventListener('click', saveFeed);
  $('#feedQuick').addEventListener('click', (event) => {
    const button = event.target.closest('[data-amount]');
    if (!button) return;
    $$('#feedQuick button').forEach((item) => item.classList.toggle('active', item === button));
    $('#feedAmountInput').value = button.dataset.amount;
  });
  $('#feedType').addEventListener('click', (event) => {
    const button = event.target.closest('[data-type]');
    if (!button) return;
    $$('#feedType button').forEach((item) => item.classList.toggle('active', item === button));
  });
  $('#timerClose').addEventListener('click', closeTimer);
  $('#timerOptions').addEventListener('click', (event) => {
    const button = event.target.closest('[data-min]');
    if (!button) return;
    const value = button.dataset.min;
    if (value === 'off') clearSleepTimer(true);
    else if (value === 'track') setSleepTrack();
    else setSleepTimer(Number(value));
  });
  $('#fadeToggle').addEventListener('change', (event) => {
    sleepState.fade = event.target.checked;
    if (!sleepState.fade) {
      fadeFactor = 1;
      applyVolume();
    }
  });

  $('#queueChip').addEventListener('click', openQueue);
  $('#queueClose').addEventListener('click', closeQueue);

  $('#seekBar').addEventListener('input', (event) => {
    if (currentTrack?.kind === 'music' && Number.isFinite(audioEl.duration)) {
      audioEl.currentTime = Number(event.target.value);
    }
  });
  $('#volumeBar').addEventListener('input', (event) => setVolume(event.target.value));

  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', resumePlayback);
      navigator.mediaSession.setActionHandler('pause', pausePlayback);
      navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
      navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (currentTrack?.kind === 'music' && details.seekTime != null) audioEl.currentTime = details.seekTime;
      });
    } catch (e) { /* noop */ }
  }

  $('#resetPreview').addEventListener('click', () => {
    toast('重置预览…');
    setTimeout(() => location.reload(), 550);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePlayer();
      closeSheets();
    }
  });

  renderSoundGrid();
  renderMusicList();
  renderFeedings();

  if (PUBLIC_BUILD) {
    ['musicTitle', 'musicList', 'musicNote'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const subtitle = $('#soundsSubtitle');
    if (subtitle) subtitle.textContent = '白噪音本机实时生成；公开版不含版权音乐。';
  }
  updateTimerUI();
  buildWave();

  const preview = new URLSearchParams(location.search).get('screen');
  if (preview === 'result') showResult('record');
  else if (preview === 'record') startRecord();
  else if (preview === 'sounds') showScreen('sounds');
  else if (preview === 'history') showScreen('history');
  else if (preview === 'settings') showScreen('settings');

  if (new URLSearchParams(location.search).get('debug') === 'box') {
    const hero = document.querySelector('.hero').getBoundingClientRect();
    const button = document.querySelector('.record-button').getBoundingClientRect();
    const ring = document.querySelector('.record-ring').getBoundingClientRect();
    document.body.dataset.debug = JSON.stringify({
      hero: { x: hero.x, y: hero.y, w: hero.width, h: hero.height },
      button: { x: button.x, y: button.y, w: button.width, h: button.height },
      ring: { x: ring.x, y: ring.y, w: ring.width, h: ring.height }
    });
  }
})();


