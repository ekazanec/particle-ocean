# Capture scripts

How the animation at the top of the main README is made. No npm dependencies:
both scripts drive the system Chrome over the DevTools Protocol using Node's
built-in WebSocket (Node >= 22), and ffmpeg does the encoding.

```bash
# 1. record the demo, full viewport, 100 frames
node scripts/capture-hero.mjs https://agurov.com/ocean/ /tmp/po-frames sea-turtle

# 2. reframe every frame around the creature (see below)
node scripts/frame-follow.mjs /tmp/po-frames /tmp/po-follow

# 3. encode
ffmpeg -y -framerate 12.5 -i /tmp/po-follow/f%04d.png \
  -vf "fps=10,scale=640:-1:flags=lanczos,palettegen=max_colors=64:stats_mode=diff" /tmp/pal.png
ffmpeg -y -framerate 12.5 -i /tmp/po-follow/f%04d.png -i /tmp/pal.png \
  -lavfi "[0:v]trim=end_frame=75,fps=10,scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle" \
  -loop 0 assets/hero.gif
```

## Why the second step exists

A fixed crop cannot frame a creature that decides where to swim. The first
attempts either lost it off the edge or left it as a speck in the corner.
`frame-follow.mjs` instead finds the creature after the fact: it downsamples
each frame to 90x51, takes the centroid of the pixels brighter than the
backdrop, weights it toward the brightest core, fills the gaps where a
mid-morph frame is genuinely dark, smooths the path over a 19-frame window,
and crops around that. The result reads as a camera operator following the
animal.
