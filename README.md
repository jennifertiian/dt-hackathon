# homeroom ✿

**Find your people in a big school.** Every day you get a 3×3 grid of "locker neighbors" matched on something you have in common. Peek inside their lockers to get a glimpse of who they are, and leave a low-stakes note if someone catches your eye. If they accept, a DM opens up.

Built for DiversaTech's *Build Something AI Cannot Do Alone @ Cal* hackathon.

![Hallway with today's locker neighbors](exports/hallway_with_lockers_mockup.png)

## Try the prototype

Open `index.html` in a browser. It's a single self-contained file (all pixel art is baked in), so no install or server is needed. It plays best on a laptop-sized screen.

The prototype covers the first flow:

1. **Hallway:** today's 8 locker neighbors plus your own locker in the middle. Hover a locker and Mochi the hall cat tells you whose it is.
2. **Open a locker:** the door swings open. The owner's profile card is pinned inside the door, and their items sit in the locker.
3. **Hover items:** each photo, sticker or object shows the owner's description in a video-game dialogue box.
4. **Like or leave a note:** a lined-paper note with quick-start compliments drawn from that locker.
5. **Send:** an envelope animation, then the note shows up under mailbox → sent.
6. **Mailbox:** accept a received note to open a DM.

The edit button is a placeholder for the next flow (making your own locker). All people in the prototype are made-up examples.

## Repo layout

```
index.html                 built prototype (generated, open this)
src/index.template.html    page source: layout, styles, interactions, example data
art/                       pixel-art generators (Python + Pillow)
  hallway.py               hallway background (480×270)
  assets.py                locker skins, big doors, interiors, items, avatars, icons
  locker_tile.py           seamless 64px locker tile
  locker_standalone.py     standalone 64px locker sprite
  build.py                 bakes art/assets into src → index.html
  assets/                  generated sprites
exports/                   full-size PNGs for slides and Figma
```

## Editing

- **Change neighbors, items or descriptions:** edit the `PEOPLE` list in `src/index.template.html`, then run `python3 art/build.py`.
- **Redraw the art:** from `art/`, run
  ```sh
  pip install pillow
  python3 assets.py                                  # sprites → art/assets/
  NOCLOCK=1 python3 hallway.py hallway_noclock       # background used by the page
  python3 build.py                                   # → ../index.html
  ```
  `python3 hallway.py hallway` makes the version with the wall clock.

Everything is drawn at 1 art pixel = 1 stage pixel on a 480×270 stage, then scaled to fit the window with `image-rendering: pixelated`. At 1920×1080, locker tiles are 256 px and the 3×3 grid starts at (576, 168).

## Palette

Soft sage, cream and warm wood, with deep warm-brown outlines (`#6e4a3c`) instead of black. Lockers use 6-step ramps (blue, pink, mint, butter, lavender), defined in `art/assets.py`.
