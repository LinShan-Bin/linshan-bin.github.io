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
- The qualitative examples are the paper-selected `trex_9_30` and `egodex_235149_13` cases. Current RGB, future RGB, predicted-feature reconstruction, and reference-feature reconstruction all use the exact shared `(0, 32, 320, 224)` crop from `qualitative_forecast_assets/selection.json`. No future RGB is substituted for a prediction.
- Scaling measurements follow `figures/scaling_data.json`; benchmark averages follow `tables/robocasa_results.tex`. The matched scaling baseline and the published DIAL comparison are described separately.
- The three displayed real-world success rates follow `figures/real_world_scores.tex`, with 20 evaluation trials and 100 post-training demonstrations per task. No three-task average is substituted for the paper's full evaluation.

## Videos

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

Method and demo tabs support arrow keys, Home, and End. Reliability and denoising sliders support keyboard input. Animations can be paused and respect `prefers-reduced-motion`; offscreen animation work is skipped. Only the selected, visible video plays, and inactive clips load on demand. The page supports system/light/dark themes, narrow screens, image descriptions, a skip link, native video controls, and accessible data tables.

## Math font

`assets/fonts/STIXTwoMath-Regular.ttf` is the unmodified [STIX Two Math font distributed by Google Fonts](https://github.com/google/fonts/tree/main/ofl/stixtwomath). Its SIL Open Font License and copyright notice are included in `assets/fonts/OFL.txt`. No external math-rendering script is required.
