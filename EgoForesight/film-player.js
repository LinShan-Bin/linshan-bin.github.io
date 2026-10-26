/* Local progressive MP4 selection. No UA sniffing, remote service, or MSE needed. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EgoForesightFilmPlayer = api;
})(typeof window === 'object' ? window : null, function () {
  'use strict';

  function decodingConfiguration(source) {
    return {
      type: 'file',
      video: {
        contentType: `video/mp4; codecs="${source.codec}"`,
        width: source.width, height: source.height,
        bitrate: source.capabilityBitrate || source.bitrate, framerate: source.fps
      },
      audio: {
        contentType: 'audio/mp4; codecs="mp4a.40.2"', channels: '2',
        samplerate: source.audio.sampleRate, bitrate: source.audio.bitrate
      }
    };
  }

  async function chooseSource(sources, options = {}) {
    const fallback = sources.find(source => source.id === 'h264');
    if (!fallback) throw new Error('An H.264 fallback is required.');
    const capabilities = options.mediaCapabilities;
    if (typeof capabilities?.decodingInfo !== 'function' || typeof options.canPlayType !== 'function') return fallback;
    const timeoutMs = options.timeoutMs ?? 1000;
    const results = await Promise.all(sources.filter(source => source.id !== 'h264').map(async source => {
      let timer;
      try {
        const type = `video/mp4; codecs="${source.codec}, mp4a.40.2"`;
        if (!options.canPlayType(type)) return null;
        const result = await Promise.race([
          Promise.resolve().then(() => capabilities.decodingInfo(decodingConfiguration(source))),
          new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); })
        ]);
        // "Supported" alone can mean an expensive software decoder. Unknown,
        // rejected, timed-out, or non-efficient reports deliberately stay AVC.
        return result?.supported === true && result?.smooth === true && result?.powerEfficient === true ? source : null;
      } catch (_) {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }));
    // The release manifest contains visually checked versions of the same film.
    // Among efficient candidates, transfer the smallest one, not every source.
    return results.filter(Boolean).sort((a, b) => a.bytes - b.bytes)[0] || fallback;
  }

  function create(video, sources, options = {}) {
    const fallbackSource = sources.find(source => source.id === 'h264');
    if (!fallbackSource) throw new Error('An H.264 fallback is required.');
    const environment = options.navigator || (typeof navigator !== 'undefined' ? navigator : {});
    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    const now = options.now || (() => performance.now());
    const mayResume = options.mayResume || (() => !doc?.hidden);
    const isVisible = options.isVisible || (() => !doc?.hidden);
    const notify = () => options.onChange?.({ source: current, switching: Boolean(pending), reason });
    const internalPauses = new WeakSet();
    const listeners = [];
    let current = fallbackSource;
    let pending = null;
    let ready = false;
    let destroyed = false;
    let upgradeCancelled = false;
    let fallbackUsed = false;
    let hasPlayed = false;
    let wantsPlayback = !video.paused && !video.ended;
    let reason = 'compatibility-default';
    let baseline = null;
    let slowWindows = 0;
    let warmUntil = 0;

    function listen(target, type, fn) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, fn);
      listeners.push(() => target.removeEventListener(type, fn));
    }
    function resetHealth() {
      baseline = null;
      slowWindows = 0;
      warmUntil = now() + 3000;
    }
    function captureState() {
      return {
        time: Number.isFinite(video.currentTime) ? video.currentTime : 0,
        playing: !video.ended && (!video.paused || (Boolean(video.error) && wantsPlayback)),
        muted: video.muted, volume: video.volume, rate: video.playbackRate
      };
    }
    function settle(state, success) {
      if (pending !== state) return;
      clearTimeout(state.timer);
      pending = null;
      ready = true;
      resetHealth();
      state.resolve(success);
      notify();
      if (success && state.snapshot.playing && mayResume() && !video.ended) video.play().catch(() => {});
      if (success) options.onReady?.();
    }
    function swap(source, why, snapshot = captureState()) {
      if (destroyed) return Promise.resolve(false);
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(false);
      }
      current = source;
      reason = why;
      resetHealth();
      const state = { snapshot, ignoreLoadPause: !video.paused, seeking: false };
      const promise = new Promise(resolve => { state.resolve = resolve; });
      state.promise = promise;
      pending = state;
      video.dataset.codec = source.id;
      video.dataset.codecReason = why;
      state.timer = setTimeout(() => {
        if (pending !== state) return;
        if (source.id !== 'h264') fallback('load-timeout');
        else settle(state, false);
      }, options.loadTimeoutMs ?? 12000);
      notify();
      try {
        video.src = source.src;
        video.load();
        // load() can reset playbackRate. Restore immediately, not at metadata
        // time, so later volume/rate changes made by the visitor are not lost.
        video.muted = snapshot.muted;
        video.volume = snapshot.volume;
        video.playbackRate = snapshot.rate;
      } catch (_) {
        if (source.id !== 'h264') fallback('source-error');
        else settle(state, false);
      }
      return promise;
    }
    function fallback(why = 'decode-error') {
      if (destroyed || fallbackUsed || current.id === 'h264') return Promise.resolve(false);
      fallbackUsed = true;
      upgradeCancelled = true;
      // A second source may fail before metadata: retain the original time and
      // playback intent, rather than the new element's temporary time of zero.
      const snapshot = pending ? { ...pending.snapshot,
        muted: video.muted, volume: video.volume, rate: video.playbackRate } : captureState();
      return swap(fallbackSource, why, snapshot);
    }

    listen(video, 'loadedmetadata', () => {
      const state = pending;
      if (!state) return;
      const limit = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : state.snapshot.time;
      const target = Math.min(state.snapshot.time, limit);
      if (Math.abs(video.currentTime - target) > 0.05) {
        state.seeking = true;
        try {
          video.currentTime = target;
          if (!video.seeking) settle(state, true);
        } catch (_) {
          if (current.id !== 'h264') fallback('seek-error');
          else settle(state, false);
        }
      } else settle(state, true);
    });
    listen(video, 'seeked', () => {
      if (pending?.seeking) settle(pending, true);
      resetHealth();
    });
    listen(video, 'error', () => {
      if (current.id !== 'h264') fallback('media-error');
      else if (pending) settle(pending, false);
    });
    listen(video, 'play', () => {
      wantsPlayback = true;
      hasPlayed = true;
      upgradeCancelled = true;
      ready = true;
      if (pending) pending.snapshot.playing = true;
      resetHealth();
    });
    listen(video, 'pause', event => {
      if (video.error && current.id !== 'h264') {
        // A decoder may pause itself before dispatching its fatal error.
        // Preserve the visitor's play intent across that internal pause.
        internalPauses.add(event);
      } else if (pending?.ignoreLoadPause) {
        pending.ignoreLoadPause = false;
        internalPauses.add(event);
      } else {
        wantsPlayback = false;
        if (pending) pending.snapshot.playing = false;
      }
      resetHealth();
    });
    for (const event of ['playing', 'waiting', 'seeking', 'ratechange']) listen(video, event, resetHealth);
    listen(doc, 'visibilitychange', resetHealth);

    function bufferedAhead() {
      try {
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) {
            return video.buffered.end(i) - video.currentTime;
          }
        }
      } catch (_) { /* A source transition may invalidate TimeRanges. */ }
      return 0;
    }
    function checkQuality() {
      const time = now();
      if (destroyed || pending || current.id === 'h264' || video.paused || video.ended ||
          video.seeking || doc?.hidden || !isVisible() || video.readyState < 3 || bufferedAhead() < 0.75) {
        resetHealth();
        return;
      }
      if (time < warmUntil) return;
      let quality;
      try { quality = video.getVideoPlaybackQuality?.(); } catch (_) { /* Optional API. */ }
      const total = quality?.totalVideoFrames ?? video.webkitDecodedFrameCount;
      const dropped = quality?.droppedVideoFrames ?? video.webkitDroppedFrameCount;
      if (!Number.isFinite(total) || !Number.isFinite(dropped)) return;
      const next = { time, total, dropped };
      if (!baseline) { baseline = next; return; }
      const elapsed = time - baseline.time;
      if (elapsed < 3000) return;
      const frames = total - baseline.total;
      const lost = dropped - baseline.dropped;
      baseline = next;
      // Ignore startup, seek/network stalls, counter resets, background timer
      // throttling, and tiny samples. Two bad windows are required (~8 s).
      if (elapsed > 9000 || frames < 48 || lost < 0 || lost > frames) { slowWindows = 0; return; }
      slowWindows = lost / frames > 0.05 ? slowWindows + 1 : 0;
      if (slowWindows >= 2) fallback('sustained-dropped-frames');
    }
    const interval = (options.setInterval || setInterval)(checkQuality, 4000);
    video.dataset.codec = current.id;
    video.dataset.codecReason = reason;
    const whenReady = (async () => {
      const selected = await chooseSource(sources, {
        mediaCapabilities: environment.mediaCapabilities,
        canPlayType: type => video.canPlayType(type), timeoutMs: options.probeTimeoutMs
      });
      if (destroyed) return current;
      // Never replace a film the visitor has already started during the probe.
      if (!upgradeCancelled && !hasPlayed && video.paused && video.currentTime < 0.05 && selected.id !== current.id) {
        await swap(selected, 'supported-smooth-efficient');
        // If the candidate failed and was replaced, wait for the fallback too.
        while (pending && !destroyed) await pending.promise;
      } else {
        ready = true;
        notify();
        options.onReady?.();
      }
      return current;
    })();

    return {
      whenReady,
      get source() { return current; },
      get switching() { return Boolean(pending); },
      get canPlay() { return ready && !pending; },
      isInternalPause: event => internalPauses.has(event),
      cancelUpgradeForUserGesture() { upgradeCancelled = true; ready = true; },
      suspendResume() {
        wantsPlayback = false;
        if (pending) pending.snapshot.playing = false;
      },
      fallback, checkQuality,
      destroy() {
        destroyed = true;
        (options.clearInterval || clearInterval)(interval);
        if (pending) { clearTimeout(pending.timer); pending.resolve(false); pending = null; }
        listeners.forEach(remove => remove());
      }
    };
  }

  return { decodingConfiguration, chooseSource, create };
});
