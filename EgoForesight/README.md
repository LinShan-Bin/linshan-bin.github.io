# EgoForesight project page

Standalone HTML, CSS, and JavaScript for the existing GitHub Pages site. No build step or package installation is required. The page lives at `/EgoForesight/` alongside `/CLAP/`.

## Preview

From the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/EgoForesight/`. The page can also be opened directly from `index.html`; all interactive data and media are local, with no fetch dependency. Google Fonts are optional; system fonts are provided as fallbacks. Equations use native MathML and the locally bundled STIX Two Math font.

## Content and provenance

- Title and authors follow the manuscript's current `arxiv_frontmatter.tex`. This includes the updated Loopeva affiliations, which differ from the earlier supplied PDF.
- Method text and equations follow `sections/03_method.tex`. The reliability density is the actual Beta density with `alpha = 0.5 + (1 - q) * 2.5`. The teacher/student diagram distinguishes EMA parameter updates (student to teacher) from feature distillation (deeper teacher to earlier student). Image corruption is schematic.
- The joint corruption heatmap follows `sections/07_appendix.tex`: vision time is uniform, `g ~ Beta(alpha, 2)`, and action time is `vision + (1 - vision) * g`. Bin probabilities are integrated from the conditional CDF with 8-point quadrature. Colors represent mean bin density on a `log(1 + density)` scale, capped at 16. The 2% clean-future boundary component is explicitly omitted. The animated inference path follows `vision = action^1.5`; it is a time schedule, not a model rollout. Reliability controls are shared between Methods 1 and 3.
- `assets/figures/method.webp` is a web rendition of the supplied `figures/pipeline_page1.pdf`.
- The two-stage pretraining strip uses eight original frames selected from the manuscript's `figures/pretraining_assets/`, with the four S1 sources labeled and four internal egocentric examples for S2. Frames are resized without cropping and displayed with `object-fit: contain`. `assets/figures/pretraining-sources.json` records the source filenames; `pretraining-data.webp` preserves the complete paper figure, including the task-word cloud, behind the full-figure link.
- The qualitative examples retain the paper-selected `trex_9_30` and `egodex_235149_13` cases and the exact shared `(0, 32, 320, 224)` crop. The prediction/reference reconstructions now come from the **2026-09-23 LayerNorm-corrected Studio exports**, not the stale `qualitative_forecast_assets/` paper/PPT copies. Before frozen RAEv2 decoding, both pooled GT and predicted DINO features receive `(policy_tokens - beta) / gamma`, undoing the policy encoder's final LayerNorm affine transform to match the decoder's feature space. Original RGB, cached feature tensors, sample identity, decoder weights, and crop are unchanged; no prediction was rerun, no RGB was substituted, and no post-hoc color adjustment was applied. Reconstructions are encoded as lossless WebP. `assets/images/forecast-sources.json` records normalization/decoder provenance, feature/source/output hashes, and the shared crop without private checkpoint paths.
- Scaling measurements follow `figures/scaling_data.json`; benchmark averages follow `tables/robocasa_results.tex`. The matched scaling baseline and the published DIAL comparison are described separately.
- The three displayed real-world success rates follow `figures/real_world_scores.tex`, with 20 evaluation trials and 100 post-training demonstrations per task. No three-task average is substituted for the paper's full evaluation.

## Static asset cache versions

`index.html` includes a `?v=` query parameter on the CSS and JavaScript URLs, using the first 12 characters of each file's SHA-256 hash. This gives updated assets a new browser-cache key instead of allowing new HTML to reuse an older stylesheet or script. Cloudflare must include query strings in its cache key for this to also distinguish edge-cache entries; the versioned URLs were checked against the current site.

Whenever `style.css` or `app.js` changes, update its matching `?v=` value before publishing. Compute the values from this directory with `shasum -a 256 style.css app.js`. This does not disable caching or require re-uploading the film. Purging Cloudflare alone does not clear files already cached in visitors' browsers.

The four qualitative reconstruction URLs use `-lnfix-<sha256-prefix>.webp` filenames, so they do not depend on a CDN honoring query strings. The original unversioned filenames contain corrected compatibility copies for older HTML/JS. The initial Robot images in `index.html` and both examples in `app.js` must match `forecast-sources.json`.

To regenerate only these web assets, use Python with Pillow and a corrected source directory containing both case folders, their four PNGs, `sample.json`, and `visualization.json`:

```sh
python3 scripts/export_forecast_assets.py /path/to/qualitative_forecasts_corrected
python3 -m unittest discover -s scripts -p 'test_*.py' -v
```

The exporter verifies source hashes and rejects legacy visualizations without the expected LayerNorm correction before writing either case. If exported filenames change, update the HTML/JS references and the JavaScript cache hash before running the tests. Do not regenerate from the old paper/PPT assets; the decoder fix did not automatically rewrite those files. This web-only export does not edit the manuscript or PPT.

## Featured film

The page opens with a viewport-height film section before the project navigation and hero. It uses the corrected source-first rebuild from `promo_v2/final/`: H.264 and HEVC Main10 MP4s, copied without further re-encoding. Each is strictly under 80,000,000 bytes. The film is approximately 2:59 long (4,295 frames), 1920×1080 at 24 fps, with unchanged AAC narration/music and embedded English subtitles. The method prediction now uses the same validated final-LN correction as the forecast section. Building and staging are local operations; publishing requires a separate Git push. `assets/posters/egoforesight-film.jpg` is a frame from the film.

The film autoplays inline and muted while the opening section is mostly visible, with a prominent **Play with sound** pill at the lower-right of the opening screen. Its translucent dark background, gold outline, and play icon follow the supplied visual reference. The video occupies the entire viewport: neither a top toolbar nor a bottom control row reserves any screen space. The translucent sound button and scroll cue float over the video, above the native control area. The rest of the transparent overlay does not intercept pointer input. The button stays in sync with native mute/volume changes, and becomes **Mute sound** after audio is enabled. The video uses `object-fit: contain`: it fits the available screen without cropping the film or its embedded subtitles, with letterboxing where needed. Native pause, seeking, volume, and fullscreen controls remain available. No audio starts without a visitor's action.

Visitors can scroll down normally at any time or select **Scroll to the project**. The film plays once at its original speed; when it ends while the intro is still in view, the page scrolls to the project hero below the sticky navigation. It does not pull back visitors who have already moved into the page, and returning to a completed film does not automatically replay it. Playback pauses when the intro is mostly out of view or the tab is in the background. Manual pauses and reduced-motion preferences are respected, including instant rather than animated entry for reduced motion. The redundant three-thumbnail demo strip has been removed from the hero; all three real-world videos remain in the dedicated demo section below.

### Multi-codec delivery and fallbacks

- `film-sources.js` and `assets/videos/film-sources.json` are generated by
  `promo_v2/scripts/stage_delivery.py --codecs h264 hevc --include-clean --stage-site`. They contain inspected
  RFC6381 codec strings, actual average/peak bitrates, sizes and SHA256 hashes.
  The HTML and video URLs are cache-pinned to those exact local files.
- H.264 High 4.1 / 8-bit 4:2:0 is always the HTML and no-JavaScript fallback.
  Without JavaScript, native controls remain usable; automatic playback is
  owned by the viewport observer so H.264 cannot race source selection.
  The current modern alternative is HEVC Main10 (`hvc1`, not `hev1`). AV1 Main 10-bit is supported by the player but is not part of this release; the slow AV1 job was stopped to prioritize delivery speed.
  All use BT.709 SDR, AAC 48 kHz stereo and progressive-download `faststart`.
- `film-player.js` first checks `canPlayType` and then performs bounded,
  decode-free `MediaCapabilities.decodingInfo` probes with measured bitrate
  headroom. Only **supported, smooth and powerEfficient** candidates qualify;
  among them it chooses the smallest visually checked file. Missing APIs,
  rejected calls, unknown efficiency and a 1-second timeout all retain H.264.
  `powerEfficient` is the browser's estimate, not proof of hardware decoding.
- The player monitors actual playback quality. Two >5% dropped-frame windows
  during visible, well-buffered playback trigger a one-way H.264 switch.
  Startup, seeking, background tabs, network starvation, too-small samples and
  reset counters are excluded. Codec/media errors and a 12-second load timeout
  also fall back once. It does not retry between codecs in a loop.
- Fallback keeps current position, mute/volume, speed and the user's play/pause
  intent. An internal source-load pause is not treated as a manual pause. It
  never wakes an offscreen film, overrides a new manual pause or enables sound.
  A sound/native-play gesture during capability probing cancels the upgrade so
  audio-unlocking remains in that gesture. The other demo players are unchanged.
- Only one selected source loads for playback (the H.264 HTML fallback may have
  prefetched metadata). No UA sniffing, software-decoder benchmark, remote API,
  MSE, external player dependency, or three-stream preload is used.

Run `node --test scripts/test_film_player.cjs` for capability/fallback/state tests.
Available-browser checks supplement these tests; they do not establish hardware
support for every device. Exact delivery and QA reports are retained in the
local `promo_v2/final/` and `promo_v2/qa/hq/` directories.

## Demo videos

Only Bottle opening, Handover, and Syringe transfer are included. The source named `screw.MOV` contains the syringe-transfer task. The pick-and-place recording is intentionally excluded.

All three MP4s are already encoded at **4× original speed**. Do not additionally set `playbackRate = 4` in the browser. Output is 1920×1080, 30 fps, H.264 High 4.1, yuv420p, CRF 21, slow preset, no audio, and faststart. The iPhone HLG / BT.2020 source is tone-mapped to BT.709 SDR.

| Source | Output | Original → output duration | Original → output size |
| --- | --- | --- | --- |
| `bottle.MOV` | `bottle-4x.mp4` | 77.768 → 19.433 s | 88.76 → 7.87 MB |
| `handover.MOV` | `handover-4x.mp4` | 37.100 → 9.267 s | 45.42 → 4.11 MB |
| `screw.MOV` | `screw-4x.mp4` | 75.200 → 18.800 s | 85.92 → 7.71 MB |

Detailed encoding parameters, byte counts, timings, and poster selections are recorded in `assets/videos/manifest.json`. Total video size is 19.69 MB, down 91.06% from 220.11 MB. Each output was completely decoded for verification; durations match 4× within one output frame, and the MP4 metadata precedes the media payload.

## Release links

- The arXiv resource links to `https://arxiv.org/abs/2610.31845`. The BibTeX uses `@article`, surname-first author names, and `journal={arXiv preprint arXiv:2610.31845}`. Title, author order, and year were checked against the arXiv record on 2026-10-26. The copy button reads the displayed BibTeX as its single source of truth.
- Code links to `https://github.com/LinShan-Bin/EgoForesight`. The repository is currently private; the owner confirmed this is the permanent URL, so the link remains active ahead of public release.
- The Hugging Face collection URL is retained from the manuscript. It could not be independently checked because the remote request timed out.
- Canonical and Open Graph URLs are configured for `https://lin-shan.com/EgoForesight/`.

## Interaction and accessibility

Method and demo tabs support arrow keys, Home, and End. Reliability and denoising sliders support keyboard input. Animations can be paused and respect `prefers-reduced-motion`; offscreen animation work is skipped. Only the selected, visible demo clip plays, and inactive demo clips load on demand; the featured film uses the separate playback controls described above. The page supports system/light/dark themes, narrow screens, image descriptions, a skip link, native video controls, and accessible data tables.

## Math font

`assets/fonts/STIXTwoMath-Regular.ttf` is the unmodified [STIX Two Math font distributed by Google Fonts](https://github.com/google/fonts/tree/main/ofl/stixtwomath). Its SIL Open Font License and copyright notice are included in `assets/fonts/OFL.txt`. No external math-rendering script is required.
