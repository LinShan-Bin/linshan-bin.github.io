'use strict';

(() => {
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const explorer = $('.method-explorer');
  const motionButton = $('#motion-toggle');
  let motionPaused = reducedMotion.matches;
  let methodVisible = false;
  let activeMethod = 0;
  let reliability = 0.2;
  let denoiseProgress = 0;
  let inferenceClock = 0;
  let animationClock = 0;

  // Theme follows the system until the visitor explicitly chooses one.
  const themeButton = $('.theme-toggle');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  function currentTheme() {
    return document.documentElement.dataset.theme || (systemTheme.matches ? 'dark' : 'light');
  }
  function updateThemeLabel() {
    const label = `Switch to ${currentTheme() === 'dark' ? 'light' : 'dark'} theme`;
    themeButton.setAttribute('aria-label', label);
    themeButton.title = label;
  }
  themeButton.addEventListener('click', () => {
    const theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('egoforesight-theme', theme); } catch (_) { /* Storage is optional. */ }
    updateThemeLabel();
    drawInference(denoiseProgress);
  });
  systemTheme.addEventListener('change', updateThemeLabel);
  updateThemeLabel();

  function setMotionPaused(paused) {
    motionPaused = paused;
    explorer.classList.toggle('motion-paused', paused);
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.textContent = paused ? '▷ Play animations' : 'Ⅱ Pause animations';
  }
  motionButton.addEventListener('click', () => setMotionPaused(!motionPaused));
  reducedMotion.addEventListener('change', (event) => {
    setMotionPaused(event.matches);
    if (event.matches) videos.forEach(video => video.pause());
  });
  setMotionPaused(motionPaused);

  // Arrow keys, Home, and End are scoped to each tablist, never the whole page.
  function wireTabs(tabs, select) {
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(index));
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next === undefined) return;
        event.preventDefault();
        select(next);
        tabs[next].focus();
      });
    });
  }
  function updateTabs(tabs, panels, selected) {
    tabs.forEach((tab, index) => {
      const active = index === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      tab.classList.toggle('active', active);
      panels[index].hidden = !active;
    });
  }

  const methodTabs = $$('.method-tab');
  const methodPanels = $$('.method-panel');
  const takeaways = [
    'Control where a source teaches, and how strongly it contributes.',
    'Use the demonstrated outcome to enrich early action representations.',
    'Generate future features and actions from current context alone.'
  ];
  const nextLabels = ['Next: learn from the future', 'Next: anticipate & act', 'Back: learn what to trust'];
  function selectMethod(index) {
    activeMethod = index;
    updateTabs(methodTabs, methodPanels, index);
    $('#method-takeaway').textContent = takeaways[index];
    $('#next-method').textContent = `${nextLabels[index]} →`;
    if (index === 2 && !motionPaused) inferenceClock = 0;
  }
  wireTabs(methodTabs, selectMethod);
  $('#next-method').addEventListener('click', () => selectMethod((activeMethod + 1) % 3));

  // Appendix: v ~ Uniform(0,1), g ~ Beta(alpha,2), a = v + (1-v)g.
  // Integrate each heatmap bin using the exact conditional CDF and 8-point
  // Gauss-Legendre quadrature. This also handles alpha < 1 near the diagonal.
  const jointBins = 48;
  const quadratureNodes = [-0.9602898565, -0.7966664774, -0.5255324099, -0.1834346425, 0.1834346425, 0.5255324099, 0.7966664774, 0.9602898565];
  const quadratureWeights = [0.1012285363, 0.2223810345, 0.3137066459, 0.3626837834, 0.3626837834, 0.3137066459, 0.2223810345, 0.1012285363];
  const jointX = actionTime => 64 + 282 * actionTime;
  const jointY = visionTime => 304 - 282 * visionTime;
  const jointCells = [];
  const jointCellGroup = $('#joint-density-cells');
  for (let v = 0; v < jointBins; v++) {
    for (let a = v; a < jointBins; a++) {
      const cell = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      cell.setAttribute('x', jointX(a / jointBins));
      cell.setAttribute('y', jointY((v + 1) / jointBins));
      cell.setAttribute('width', 282 / jointBins + 0.1);
      cell.setAttribute('height', 282 / jointBins + 0.1);
      jointCellGroup.appendChild(cell);
      jointCells.push({ cell, v, a });
    }
  }
  function conditionalActionCDF(actionTime, visionTime, alpha) {
    const gap = Math.max(0, Math.min(1, (actionTime - visionTime) / (1 - visionTime)));
    return gap ** alpha * (alpha + 1 - alpha * gap);
  }
  function jointBinMass(v, a, alpha) {
    const midpoint = (v + 0.5) / jointBins;
    const halfWidth = 0.5 / jointBins;
    return quadratureNodes.reduce((mass, node, index) => {
      const visionTime = midpoint + halfWidth * node;
      const upper = conditionalActionCDF((a + 1) / jointBins, visionTime, alpha);
      const lower = conditionalActionCDF(a / jointBins, visionTime, alpha);
      return mass + quadratureWeights[index] * Math.max(0, upper - lower) * halfWidth;
    }, 0);
  }
  const densityColors = [[250, 241, 220], [231, 205, 167], [207, 164, 113], [176, 122, 66], [137, 80, 32]];
  function jointDensityColor(density) {
    // Match the labeled color key: log(1 + density), capped at density 16.
    const position = Math.min(1, Math.log1p(density) / Math.log(17)) * 4;
    const index = Math.min(3, Math.floor(position));
    const fraction = position - index;
    return `rgb(${densityColors[index].map((channel, c) => Math.round(channel + fraction * (densityColors[index + 1][c] - channel))).join(',')})`;
  }
  function drawJointDensity(alpha) {
    jointCells.forEach(({ cell, v, a }) => {
      const area = (a === v ? 0.5 : 1) / jointBins ** 2;
      cell.setAttribute('fill', jointDensityColor(jointBinMass(v, a, alpha) / area));
    });
    $('#joint-reliability-value').value = reliability.toFixed(2);
  }
  const jointPath = Array.from({ length: 101 }, (_, i) => {
    const actionTime = 1 - i / 100;
    return `${i ? 'L' : 'M'}${jointX(actionTime).toFixed(2)},${jointY(actionTime ** 1.5).toFixed(2)}`;
  }).join(' ');
  $('#joint-inference-path').setAttribute('d', jointPath);
  $('#joint-inference-halo').setAttribute('d', jointPath);
  $('#joint-direction-arrows').setAttribute('d', `M${jointX(0.67)},${jointY(0.67 ** 1.5)} L${jointX(0.63)},${jointY(0.63 ** 1.5)}`);

  // Paper Eq. 4 & 6: alpha = .5 + (1-q)*2.5; p(tau_a) = (alpha+1)*tau_a^alpha.
  // This is an exact density, not a learned confidence estimate or an error bound.
  const densityX = value => 50 + value * 416;
  const densityY = value => 215 - value * 45;
  function setReliability(value) {
    reliability = Math.max(0, Math.min(1, value));
    const alpha = 0.5 + (1 - reliability) * 2.5;
    const points = Array.from({ length: 101 }, (_, i) => {
      const time = i / 100;
      return `${densityX(time).toFixed(2)},${densityY((alpha + 1) * time ** alpha).toFixed(2)}`;
    });
    const path = `M${points.join(' L')}`;
    $('#density-line').setAttribute('d', path);
    $('#density-area').setAttribute('d', `${path} L466,215 L50,215 Z`);
    $('#reliability').value = Math.round(reliability * 100);
    $('#reliability-value').value = reliability.toFixed(2);
    $('#mean-noise').textContent = ((alpha + 1) / (alpha + 2)).toFixed(2);
    $('#loss-weight').textContent = reliability.toFixed(2);
    $$('[data-reliability]').forEach(button => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.reliability) === Math.round(reliability * 100)));
    });
    drawDensityMarker(0.7);
    drawJointDensity(alpha);
  }
  function drawDensityMarker(position) {
    const alpha = 0.5 + (1 - reliability) * 2.5;
    $('#density-marker').setAttribute('cx', densityX(position));
    $('#density-marker').setAttribute('cy', densityY((alpha + 1) * position ** alpha));
  }
  $('#reliability').addEventListener('input', event => setReliability(Number(event.target.value) / 100));
  $$('[data-reliability]').forEach(button => button.addEventListener('click', () => setReliability(Number(button.dataset.reliability) / 100)));
  setReliability(0.2);

  // The moving point follows the paper's inference schedule, from (1,1) to
  // (0,0). The background is a training density, not an inference probability.
  function drawInference(progress) {
    denoiseProgress = Math.max(0, Math.min(1, progress));
    const actionTime = 1 - denoiseProgress;
    const visionTime = actionTime ** 1.5;
    $('#vision-time').value = visionTime.toFixed(2);
    $('#action-time').value = actionTime.toFixed(2);
    $('#denoise-progress').value = Math.round(denoiseProgress * 100);
    $('#denoise-value').value = `${Math.round(denoiseProgress * 100)}%`;
    const x = jointX(actionTime);
    const y = jointY(visionTime);
    $('#joint-time-marker').setAttribute('cx', x);
    $('#joint-time-marker').setAttribute('cy', y);
    $('#joint-time-guides').setAttribute('d', `M64 ${y}H${x}V304`);
  }
  $('#denoise-progress').addEventListener('input', event => {
    setMotionPaused(true);
    const progress = Number(event.target.value) / 100;
    inferenceClock = progress * 6000;
    drawInference(progress);
  });
  drawInference(reducedMotion.matches ? 0.65 : 0);

  const methodObserver = new IntersectionObserver(entries => {
    methodVisible = entries[0].isIntersecting;
    explorer.classList.toggle('motion-offscreen', !methodVisible);
  }, { threshold: 0.05 });
  methodObserver.observe(explorer);
  let previousFrame;
  function animate(now) {
    const dt = previousFrame === undefined ? 0 : Math.min(now - previousFrame, 60);
    previousFrame = now;
    if (!motionPaused && methodVisible && !document.hidden) {
      animationClock += dt;
      if (activeMethod === 0) drawDensityMarker(0.05 + 0.9 * ((animationClock % 4600) / 4600));
      if (activeMethod === 2) {
        inferenceClock = (inferenceClock + dt) % 8200;
        drawInference(Math.min(1, inferenceClock / 6000));
      }
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // Each asset is already encoded at 4x. Keep playbackRate at the native 1x.
  const demoTabs = $$('[data-demo]');
  const demoPanels = $$('.demo-panel');
  const videos = $$('.demo-panel video');
  let activeDemo = 0;
  let demoVisible = false;
  const manuallyPaused = new WeakSet();
  const autoPausing = new WeakSet();
  function pauseVideo(video) {
    if (!video.paused) {
      autoPausing.add(video);
      video.pause();
    }
  }
  function loadVideo(video) {
    const source = $('source[data-src]', video);
    if (source) {
      source.src = source.dataset.src;
      source.removeAttribute('data-src');
      video.load();
    }
  }
  function playActiveVideo(explicit = false) {
    const video = videos[activeDemo];
    if (document.hidden || (!explicit && (reducedMotion.matches || manuallyPaused.has(video)))) return;
    loadVideo(video);
    video.play().catch(() => { /* Native controls remain available if autoplay is blocked. */ });
  }
  function selectDemo(index) {
    videos.forEach(pauseVideo);
    activeDemo = index;
    updateTabs(demoTabs, demoPanels, index);
    manuallyPaused.delete(videos[index]);
    loadVideo(videos[index]);
    if (demoVisible) playActiveVideo(true);
  }
  wireTabs(demoTabs, selectDemo);
  $$('[data-demo-link]').forEach(link => link.addEventListener('click', () => selectDemo(Number(link.dataset.demoLink))));
  videos.forEach(video => {
    video.addEventListener('pause', () => {
      if (autoPausing.has(video)) autoPausing.delete(video);
      else if (demoVisible && !document.hidden) manuallyPaused.add(video);
    });
    video.addEventListener('play', () => {
      manuallyPaused.delete(video);
      videos.forEach(other => { if (other !== video) pauseVideo(other); });
    });
  });
  const demoObserver = new IntersectionObserver(entries => {
    demoVisible = entries[0].isIntersecting;
    if (demoVisible) playActiveVideo();
    else videos.forEach(pauseVideo);
  }, { threshold: 0.2 });
  demoObserver.observe($('#demos'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) videos.forEach(pauseVideo);
    else if (demoVisible) playActiveVideo();
  });

  // Stored, matched qualitative examples from the paper's selected assets.
  $$('[data-example]').forEach(button => button.addEventListener('click', () => {
    const example = button.dataset.example;
    const name = example === 'robot' ? 'T-Rex robot' : 'EgoDex human';
    const alt = {
      current: `Current RGB observation from the selected ${name} example`,
      future: `Observed future RGB from the same ${name} example`,
      prediction: `Frozen-RAE reconstruction of predicted future DINO features, ${name} example`,
      reference: `Frozen-RAE reconstruction of ground-truth future DINO features, ${name} example`
    };
    Object.keys(alt).forEach(kind => {
      const img = $(`#forecast-${kind}`);
      img.src = `assets/images/${example}-${kind}.webp`;
      img.alt = alt[kind];
    });
    $$('[data-example]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));

  // Measurements from figures/scaling_data.json. Hours use a logarithmic x-axis.
  const scales = [3000, 10000, 30000];
  const measurements = {
    mse: { ours: [0.088, 0.054, 0.031], baseline: [0.090, 0.059, 0.039] },
    success: { ours: [58.6, 62.5, 66.0], baseline: [52.0, 54.4, 57.9] }
  };
  const svgNS = 'http://www.w3.org/2000/svg';
  function svgElement(tag, attributes, text) {
    const element = document.createElementNS(svgNS, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    if (text !== undefined) element.textContent = text;
    return element;
  }
  const charts = [];
  function createScalingChart(id, data, min, max, ticks, format, labelOffset = -15) {
    const svg = $(id);
    const x = value => 62 + (Math.log10(value) - Math.log10(3000)) * 384;
    const y = value => 232 - ((value - min) / (max - min)) * 195;
    const grid = svgElement('g', { class: 'chart-grid' });
    ticks.forEach(tick => {
      grid.appendChild(svgElement('line', { x1: 62, y1: y(tick), x2: 446, y2: y(tick) }));
      svg.appendChild(svgElement('text', { x: 50, y: y(tick) + 4, 'text-anchor': 'end', class: 'axis-label' }, format(tick)));
    });
    svg.appendChild(grid);
    scales.forEach((hours, i) => svg.appendChild(svgElement('text', { x: x(hours), y: 254, 'text-anchor': 'middle', class: 'axis-label' }, ['3k', '10k', '30k'][i])));
    svg.appendChild(svgElement('text', { x: 254, y: 280, 'text-anchor': 'middle', class: 'axis-label' }, 'Pretraining hours (log scale)'));
    const highlight = svgElement('line', { class: 'selected-scale', x1: x(30000), x2: x(30000), y1: 22, y2: 232 });
    svg.appendChild(highlight);
    ['baseline', 'ours'].forEach(series => {
      svg.appendChild(svgElement('path', { class: `scaling-${series}`, d: data[series].map((value, i) => `${i ? 'L' : 'M'}${x(scales[i])},${y(value)}`).join(' ') }));
      data[series].forEach((value, index) => {
        const point = svgElement('circle', { cx: x(scales[index]), cy: y(value), r: index === 2 ? 5.8 : 4.5, class: `chart-point ${series}`, 'data-index': index });
        point.appendChild(svgElement('title', {}, `${series === 'ours' ? 'EgoForesight' : 'Baseline'} at ${scales[index].toLocaleString('en-US')} hours: ${format(value)}`));
        svg.appendChild(point);
      });
    });
    const valueLabel = svgElement('text', { class: 'chart-value', x: x(30000), y: y(data.ours[2]) + labelOffset, 'text-anchor': 'middle' }, format(data.ours[2]));
    svg.appendChild(valueLabel);
    charts.push({ svg, x, y, highlight, valueLabel, data, format, labelOffset });
  }
  createScalingChart('#mse-chart', measurements.mse, 0.02, 0.10, [0.02, 0.04, 0.06, 0.08, 0.10], value => value.toFixed(3), 22);
  createScalingChart('#success-chart', measurements.success, 48, 70, [50, 55, 60, 65, 70], value => value.toFixed(1));
  function selectScale(index) {
    charts.forEach(({ svg, x, y, highlight, valueLabel, data, format, labelOffset }) => {
      highlight.setAttribute('x1', x(scales[index]));
      highlight.setAttribute('x2', x(scales[index]));
      valueLabel.setAttribute('x', x(scales[index]));
      valueLabel.setAttribute('y', y(data.ours[index]) + labelOffset);
      valueLabel.textContent = format(data.ours[index]);
      $$('.chart-point', svg).forEach(point => point.setAttribute('r', Number(point.dataset.index) === index ? 6 : 4));
    });
    $$('[data-scale]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.scale) === index)));
    const summary = $('#scale-summary');
    summary.replaceChildren();
    const hours = document.createElement('strong');
    hours.textContent = `${scales[index].toLocaleString('en-US')} hours`;
    summary.appendChild(hours);
    const makeSummary = (label, ours, baseline) => {
      const span = document.createElement('span');
      span.append(`${label}: `);
      const bold = document.createElement('b');
      bold.textContent = ours;
      span.append(bold, ` vs. ${baseline}`);
      summary.appendChild(span);
    };
    makeSummary('Action MSE', measurements.mse.ours[index].toFixed(3), measurements.mse.baseline[index].toFixed(3));
    makeSummary('Success', `${measurements.success.ours[index].toFixed(1)}%`, `${measurements.success.baseline[index].toFixed(1)}%`);
  }
  $$('[data-scale]').forEach(button => button.addEventListener('click', () => selectScale(Number(button.dataset.scale))));

  // Copy the displayed BibTeX so the citation and clipboard always agree.
  $('#copy-citation').addEventListener('click', async () => {
    const citation = $('#bibtex').textContent.trim();
    const button = $('#copy-citation');
    const status = $('#copy-status');
    let copied = false;
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(citation); copied = true; } catch (_) { /* Try the file:// fallback below. */ }
    }
    if (!copied) {
      const textarea = document.createElement('textarea');
      textarea.value = citation;
      textarea.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(textarea);
      textarea.select();
      try { copied = document.execCommand('copy'); } catch (_) { /* Offer manual selection. */ }
      textarea.remove();
      button.focus();
    }
    button.textContent = copied ? 'Copied ✓' : 'Select BibTeX';
    status.textContent = copied ? 'BibTeX copied to clipboard.' : 'Copy was unavailable. The citation is selected; use your browser’s copy command.';
    if (!copied) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents($('#bibtex'));
      selection.removeAllRanges();
      selection.addRange(range);
    }
    window.setTimeout(() => { button.textContent = 'Copy BibTeX'; }, 2500);
  });

  const navLinks = $$('.nav-links a');
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(link => {
        if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-15% 0px -60% 0px', threshold: 0 });
  ['method', 'demos', 'results'].forEach(id => sectionObserver.observe(document.getElementById(id)));
  // Clear the active navigation item in sections without a navigation link.
  ['.hero', '.idea-section', '.foresight-section', '.abstract-section', '.citation-section'].forEach(selector => sectionObserver.observe($(selector)));
})();
