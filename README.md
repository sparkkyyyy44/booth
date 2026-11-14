# Booth: free photo booth for iPad

A photo booth that runs in Safari. Everything is free: no App Store, no Apple fee, no subscription.

## 1. Put it online (one time, about 10 minutes, easiest on a laptop)

1. Make a free account at **github.com**.
2. Click **+ → New repository**. Name it `booth`, set it to **Public**, and click **Create repository**.
3. Click **uploading an existing file**.
   - **Upload 1:** drag in the 8 files: `index.html`, `app.js`, `qrcode.js`, `sw.js`, `manifest.json`, `fonts.css`, `icon-512.png` and `README.md`. Click **Commit changes**.
   - **Upload 2:** click **Add file → Upload files** and drag in the whole **`fonts` folder**. Click **Commit changes**. Two uploads are needed because GitHub takes at most 100 files at a time.
4. Go to **Settings → Pages**. Under "Branch", pick **main** and **/(root)**, then click **Save**.
5. Wait 1–2 minutes. Your booth is at **https://YOUR-USERNAME.github.io/booth/**

**Updating later:** upload the changed files again. They replace the old ones.

## 2. Install it on the iPad

Open your link in **Safari**, then tap **Share → Add to Home Screen**. Always open the booth from that icon: it runs full-screen and works offline.

## 3. The design editor

It works like Canva:

- **Left bar:** Layout, Frame, Text, Elements, Background, Photos.
- **Click or tap anything** on the design to select it. A toolbar appears on top with font, size, color, bold, italic, uppercase, alignment, spacing, **Effects**, transparency, position, duplicate and delete.
- **Drag** to move. Pull a **corner** to resize, and use the **round handle** to rotate. A pink line shows when something is centered.
- **Double-click or double-tap text** to type right on the design.
- **Fonts:** 65 built-in fonts (script, serif, sans, display, handwritten), with search. They work offline.
- **Effects:** Shadow, Lift, Hollow, Outline, Glow and Neon, each with its own color and size controls.
- **Elements:** shapes and stickers.
- **Frame:** upload a frame you made in Canva. The panel shows the exact Canva size and photo positions, and **Download Canva guide** gives you a template image.
- **Adjust frame:** after uploading, tap **Move & resize on the design** (or **Adjust frame** in the top toolbar). Drag the frame to move it, pull a corner to resize it, or choose **Fill page / Fit whole image / Stretch**. Tap **Done** when finished.
- **Layout → Space for text & designs:** blank bands (in inches) at the top, bottom, left or right for your messages and frame art, plus an edge margin. By default, strips and 4×6 prints get 0.5 in at the top and 1.5 in at the bottom, and landscape prints get 1.5 in on the right.
- **Undo/redo** buttons are at the top. On a laptop you can also use ⌘Z, ⌘D (duplicate), Delete, and the arrow keys to nudge.

## 4. Creator mode (only you): ready-made designs

1. **Settings → 🔒 Creator mode**, then choose a passcode.
2. **＋ New ready-made design** opens the editor.
3. On any text, the toolbar shows **Locked / Guests can edit**. Unlock the words friends should change, like family names. Everything else stays locked.
4. **Publish designs → Make library.json**, then upload `library.json` to your GitHub repository. Everyone gets the designs within a minute or two.
5. Tap **Lock** when you're done.

To turn one of your own designs into a ready-made one, unlock Creator mode, go to the home screen, and tap **🎨 Copy to Creator mode** on the design's card. It shows up as a draft that you can publish.

## 5. Everyone else

- **＋ New event:** pick a design and name the event. Tap the highlighted words on the design to type your own.
- **My own designs:** anyone can make their own design with the full editor. It stays on their device.

## 6. At the event

- Tap **Start ▶**. Guests tap the screen, there's a countdown, and the photos are taken.
- **Share / AirDrop / Save** opens the share sheet. AirDrop works without internet.
- **Exit:** hold ✕ for 2 seconds, or enter your PIN if you set one.
- Turn on **Guided Access** (Settings → Accessibility), keep the iPad plugged in, and set Auto-Lock to Never.
- **Afterwards:** go to **Gallery → Save / share all** or **Download all (ZIP)**.

## 7. Optional: QR codes (free Cloudinary)

1. Sign up at cloudinary.com and copy your **Cloud name**.
2. In Cloudinary, go to **Settings → Upload → Upload presets → Add**. Set Signing mode to **Unsigned**, leave Folder empty, turn off "Use filename", and save.
3. In the booth's **Settings**, paste both values, then tap **Test upload**.

## Print sizes

| Layout | Canva size |
|---|---|
| 1×4, 1×3, 1×2 strip (2×6 in) | 600 × 1800 px |
| 2×2 grid (4×6 in) | 1200 × 1800 px |
| 4×6 · 2 stacked (4×6 in) | 1200 × 1800 px |
| 6×4 · 2 side by side (6×4 in) | 1800 × 1200 px |
| Single photo (6×4 in) | 1800 × 1200 px |

Fonts are from Google Fonts (SIL Open Font License), so they're free to use.
