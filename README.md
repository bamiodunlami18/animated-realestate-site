# Lumière Residence — Animated Real-Estate Hero

A static, dependency-free hero section for a luxury property listing. The camera angle blends continuously with the cursor: the further you move in a direction, the more of that view shows.

| Cursor | View |
| --- | --- |
| Centre (default) | Street elevation (`front.jpg`) |
| Left | Side perspective (`left.jpg`) |
| Up | Aerial overview (`aerial.jpg`) |
| Right | Corner residence (`right.jpg`) |

Also works with the left/right arrow keys, and by dragging sideways on touch devices.

## Scroll: through the front door

Scrolling down walks the camera into the front door. The living room appears inside the door frame, the doorway grows to fill the screen, and the room settles to its normal exposure before its copy and feature hotspots fade in. The door's position in `front.jpg` is set in `DOOR` in `script.js`, and the scroll length is the `.journey` height in `styles.css`.

Open `index.html` in a browser, or serve the folder with any static server (e.g. `npx serve .`).
