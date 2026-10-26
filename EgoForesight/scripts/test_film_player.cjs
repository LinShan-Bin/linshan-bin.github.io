'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseSource, decodingConfiguration, create } = require('../film-player.js');

const sources = [
  { id: 'av1', src: 'av1.mp4?v=aaa', codec: 'av01.0.08M.10', bytes: 59_000_000 },
  { id: 'hevc', src: 'hevc.mp4?v=bbb', codec: 'hvc1.2.4.L123.B0', bytes: 67_000_000 },
  { id: 'h264', src: 'h264.mp4?v=ccc', codec: 'avc1.640029', bytes: 79_000_000 }
].map(source => ({ ...source, width: 1920, height: 1080, fps: 24,
  bitrate: 2_400_000, capabilityBitrate: 8_800_000, audio: { sampleRate: 48000, bitrate: 258189 } }));
const efficient = { supported: true, smooth: true, powerEfficient: true };
const decode = fn => ({ mediaCapabilities: { decodingInfo: fn }, canPlayType: () => 'probably', timeoutMs: 30 });
const flush = () => new Promise(resolve => setImmediate(resolve));

class FakeVideo extends EventTarget {
  constructor() {
    super();
    this.src = sources[2].src;
    this.dataset = {};
    this.paused = true;
    this.ended = false;
    this.muted = true;
    this.volume = 1;
    this.playbackRate = 1;
    this._time = 0;
    this.duration = 179;
    this.readyState = 4;
    this.seeking = false;
    this.loads = 0;
    this.plays = 0;
    this.error = null;
    this.bufferEnd = 179;
    this.buffered = { length: 1, start: () => 0, end: () => this.bufferEnd };
    this.quality = { totalVideoFrames: 0, droppedVideoFrames: 0 };
    this.autoMetadata = () => true;
    this.failSource = () => false;
  }
  canPlayType() { return 'probably'; }
  get currentTime() { return this._time; }
  set currentTime(value) {
    this._time = value;
    this.seeking = true;
    this.dispatchEvent(new Event('seeking'));
    queueMicrotask(() => {
      this.seeking = false;
      this.dispatchEvent(new Event('seeked'));
    });
  }
  load() {
    this.loads++;
    this.error = null;
    this._time = 0;
    this.playbackRate = 1;
    this.readyState = 0;
    this.pause();
    const src = this.src;
    queueMicrotask(() => {
      if (src !== this.src) return;
      if (this.failSource(src)) { this.error = { code: 3 }; this.dispatchEvent(new Event('error')); }
      else if (this.autoMetadata(src)) this.metadata();
    });
  }
  metadata() { this.readyState = 4; this.dispatchEvent(new Event('loadedmetadata')); }
  play() {
    this.plays++;
    if (this.paused) { this.paused = false; this.dispatchEvent(new Event('play')); }
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
  pause() {
    if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); }
  }
  getVideoPlaybackQuality() { return { ...this.quality }; }
}
function setup(t, overrides = {}) {
  let clock = 0;
  let visible = true;
  const doc = new EventTarget();
  doc.hidden = false;
  const video = overrides.video || new FakeVideo();
  const player = create(video, sources, {
    navigator: { mediaCapabilities: { decodingInfo: async () => efficient } }, document: doc,
    now: () => clock, isVisible: () => visible,
    mayResume: () => visible && !doc.hidden,
    setInterval: () => 123, clearInterval: () => {}, probeTimeoutMs: 30, loadTimeoutMs: 80,
    ...overrides
  });
  t.after(() => player.destroy());
  return { video, player, doc, visible: value => { visible = value; },
    tick(time, total, dropped) {
      clock = time;
      video.quality = { totalVideoFrames: total, droppedVideoFrames: dropped };
      player.checkQuality();
    } };
}

test('capabilities use real codec, 10-bit profile, conservative bitrate, and unchanged AAC', () => {
  const config = decodingConfiguration(sources[0]);
  assert.equal(config.type, 'file');
  assert.equal(config.video.contentType, 'video/mp4; codecs="av01.0.08M.10"');
  assert.equal(config.video.bitrate, 8_800_000);
  assert.equal(config.video.framerate, 24);
  assert.deepEqual(config.audio, { contentType: 'audio/mp4; codecs="mp4a.40.2"', channels: '2', samplerate: 48000, bitrate: 258189 });
});
test('smallest efficient source wins, independent of user agent or manifest order', async () => {
  const selected = await chooseSource([...sources].reverse(), decode(async () => efficient));
  assert.equal(selected.id, 'av1');
});
test('HEVC selected if AV1 is supported but expensive to decode', async () => {
  const selected = await chooseSource(sources, decode(async config => ({ ...efficient,
    powerEfficient: !config.video.contentType.includes('av01') })));
  assert.equal(selected.id, 'hevc');
});
for (const key of ['supported', 'smooth', 'powerEfficient']) {
  for (const value of [false, undefined]) {
    test(`${key}=${value}: cannot opt in to modern codec`, async () => {
      const selected = await chooseSource(sources, decode(async () => ({ ...efficient, [key]: value })));
      assert.equal(selected.id, 'h264');
    });
  }
}
test('missing API is an immediate H.264 fallback', async () => {
  assert.equal((await chooseSource(sources, {})).id, 'h264');
});
test('canPlayType rejection prevents a capability query', async () => {
  let calls = 0;
  const selected = await chooseSource(sources, { ...decode(async () => { calls++; return efficient; }), canPlayType: () => '' });
  assert.equal(calls, 0);
  assert.equal(selected.id, 'h264');
});
test('capability exceptions and unresolved promises fall back, with bounded latency', async () => {
  assert.equal((await chooseSource(sources, decode(async () => { throw Error('denied'); }))).id, 'h264');
  const start = performance.now();
  assert.equal((await chooseSource(sources, { ...decode(() => new Promise(() => {})), timeoutMs: 10 })).id, 'h264');
  assert.ok(performance.now() - start < 500);
});
test('bad configuration without H.264 fails explicitly', async () => {
  await assert.rejects(chooseSource(sources.slice(0, 2)), /H.264/);
});
test('one selected URL only; initial metadata load does not autoplay by itself', async t => {
  const { video, player } = setup(t);
  await player.whenReady;
  assert.equal(video.src, sources[0].src);
  assert.equal(video.loads, 1);
  assert.equal(video.plays, 0);
  assert.equal(player.canPlay, true);
  assert.equal(video.dataset.codec, 'av1');
});
test('explicit sound gesture during probe keeps H.264 and immediate play()', async t => {
  const { video, player } = setup(t);
  player.cancelUpgradeForUserGesture();
  video.muted = false;
  video.play();
  await player.whenReady;
  assert.equal(player.source.id, 'h264');
  assert.equal(video.loads, 0);
  assert.equal(video.plays, 1);
  assert.equal(video.muted, false);
});
test('native play during probe also prevents a mid-play source upgrade', async t => {
  const { video, player } = setup(t);
  video.play();
  await player.whenReady;
  assert.equal(player.source.id, 'h264');
  assert.equal(video.loads, 0);
});
test('fallback preserves time, sound, volume, rate, and playing state', async t => {
  const { video, player } = setup(t);
  await player.whenReady;
  video.currentTime = 64.25;
  await flush();
  video.muted = false;
  video.volume = 0.37;
  video.playbackRate = 1.25;
  video.play();
  const pauses = [];
  video.addEventListener('pause', event => pauses.push(player.isInternalPause(event)));
  await player.fallback('test');
  assert.equal(player.source.id, 'h264');
  assert.equal(video.currentTime, 64.25);
  assert.equal(video.muted, false);
  assert.equal(video.volume, 0.37);
  assert.equal(video.playbackRate, 1.25);
  assert.equal(video.paused, false);
  assert.deepEqual(pauses, [true]);
});
test('paused film stays paused during fallback', async t => {
  const { video, player } = setup(t);
  await player.whenReady;
  video.currentTime = 33;
  await flush();
  await player.fallback();
  assert.equal(video.currentTime, 33);
  assert.equal(video.paused, true);
  assert.equal(video.plays, 0);
});
test('a new visitor pause during source loading cancels pending resume', async t => {
  const { video, player } = setup(t);
  await player.whenReady;
  video.play();
  video.autoMetadata = () => false;
  const pending = player.fallback();
  video.play();
  video.pause();
  video.metadata();
  await pending;
  assert.equal(video.paused, true);
});
test('visibility changes during load cannot wake an offscreen or hidden film', async t => {
  const context = setup(t);
  const { video, player, doc } = context;
  await player.whenReady;
  video.play();
  video.autoMetadata = () => false;
  const pending = player.fallback();
  context.visible(false);
  doc.hidden = true;
  video.metadata();
  await pending;
  assert.equal(video.paused, true);
});
test('decode failure during initial loading falls back only once', async t => {
  const video = new FakeVideo();
  video.failSource = src => src.startsWith('av1');
  const { player } = setup(t, { video });
  await player.whenReady;
  await flush();
  assert.equal(player.source.id, 'h264');
  assert.equal(video.loads, 2);
  video.error = { code: 3 };
  video.dispatchEvent(new Event('error'));
  await player.fallback();
  assert.equal(video.loads, 2);
});
test('modern source load timeout falls back rather than hanging indefinitely', async t => {
  const video = new FakeVideo();
  video.autoMetadata = src => src.startsWith('h264');
  const { player } = setup(t, { video, loadTimeoutMs: 10 });
  await player.whenReady;
  await flush();
  assert.equal(player.source.id, 'h264');
  assert.equal(player.canPlay, true);
  assert.equal(video.loads, 2);
});
test('two well-buffered bad windows trigger one-way H.264 fallback', async t => {
  const { video, player, tick } = setup(t);
  await player.whenReady;
  video.play();
  tick(4000, 96, 0);
  tick(8000, 192, 10);
  assert.equal(player.source.id, 'av1');
  tick(12000, 288, 20);
  await flush();
  assert.equal(player.source.id, 'h264');
  assert.equal(video.dataset.codecReason, 'sustained-dropped-frames');
  tick(16000, 384, 40);
  assert.equal(video.loads, 2);
});
test('one drop spike followed by healthy playback never triggers fallback', async t => {
  const { video, player, tick } = setup(t);
  await player.whenReady;
  video.play();
  tick(4000, 96, 0); tick(8000, 192, 10); tick(12000, 288, 10); tick(16000, 384, 20);
  assert.equal(player.source.id, 'av1');
});
for (const condition of ['unbuffered', 'hidden', 'offscreen', 'seeking', 'paused']) {
  test(`${condition} samples are not mistaken for an overloaded decoder`, async t => {
    const context = setup(t);
    const { video, player, tick, doc } = context;
    await player.whenReady;
    video.play();
    if (condition === 'unbuffered') video.bufferEnd = 0.2;
    if (condition === 'hidden') doc.hidden = true;
    if (condition === 'offscreen') context.visible(false);
    if (condition === 'seeking') video.seeking = true;
    if (condition === 'paused') video.pause();
    tick(4000, 96, 0); tick(8000, 192, 30); tick(12000, 288, 60); tick(16000, 384, 90);
    assert.equal(player.source.id, 'av1');
  });
}
test('destroy during probe never loads a new source', async t => {
  const { player, video } = setup(t);
  player.destroy();
  await player.whenReady;
  assert.equal(video.loads, 0);
});


test('decoder-induced pause before fatal error is internal and preserves play intent', async t => {
  const { video, player } = setup(t);
  await player.whenReady;
  video.currentTime = 40;
  await flush();
  video.play();
  const internal = [];
  video.addEventListener('pause', event => internal.push(player.isInternalPause(event)));
  video.error = { code: 3 };
  video.pause();
  video.dispatchEvent(new Event('error'));
  await flush();
  assert.equal(player.source.id, 'h264');
  assert.equal(video.currentTime, 40);
  assert.equal(video.paused, false);
  assert.equal(internal[0], true);
});


test('environmental pause during load cancels queued resume even when already paused', async t => {
  const { video, player } = setup(t);
  await player.whenReady;
  video.play();
  video.autoMetadata = () => false;
  const pending = player.fallback();
  assert.equal(video.paused, true); // Source load has already paused it.
  player.suspendResume();
  video.metadata();
  await pending;
  assert.equal(video.paused, true);
});
