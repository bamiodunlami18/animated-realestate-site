# Lumière Residence — Scroll Video Tour

A static, dependency-free landing page for a luxury property listing. The page opens on the tour video's first frame with the listing's intro centred over it; scrolling plays the video tour frame by frame.

Run it with any static server (e.g. `npx serve .`) and open the printed address.

## Scroll: video tour

Scrolling down plays the property tour video in step with the scroll: scroll down to move forward, up to go back, stop to pause on a frame. The intro copy lifts away on the video's opening street shot, then centred room captions (each with a short description and calls to action) and the room list on the right follow the playhead. Clicking a room jumps to it.

- Videos: `assets/video/tour-1600.mp4` (desktop) and `tour-960.mp4` (phones), re-encoded with a keyframe every 10 frames and no audio so seeking is smooth. The page downloads the whole file before scrubbing.
- Captions: the `.cap` blocks in `index.html`; `data-start` / `data-end` are seconds in the video.
- Speed: the `.journey` height in `styles.css` sets how much scrolling the full tour takes (taller = slower).
- Fetching the video needs a web server (`npx serve .`); opened straight from disk it falls back to streaming, which scrubs less smoothly.

To re-encode a new tour video:

```bash
ffmpeg -i source.mp4 -an -vf scale=1600:-2 -c:v libx264 -preset slow -crf 27 -g 10 -bf 0 -pix_fmt yuv420p -movflags +faststart assets/video/tour-1600.mp4
ffmpeg -i source.mp4 -an -vf scale=960:-2  -c:v libx264 -preset slow -crf 26 -g 10 -bf 0 -pix_fmt yuv420p -movflags +faststart assets/video/tour-960.mp4
```
