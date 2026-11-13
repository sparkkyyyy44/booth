# Booth: free photo booth for iPad

A photo booth that runs in Safari. Everything is free: no App Store, no Apple developer fee, no subscription.

## 1. Put it online for free (one time, ~10 minutes)

The camera only works on a secure `https://` page, so the files need a free home. GitHub Pages works well:

1. Make a free account at **github.com**.
2. Tap **+ → New repository**. Name it `booth`, set it to **Public**, and tap **Create repository**.
3. Tap **uploading an existing file**. Upload all the files from this folder: `index.html`, `app.js`, `qrcode.js`, `sw.js`, `manifest.json` and `icon-512.png`. On an iPad, unzip first in the Files app. Tap **Commit changes**.
4. Go to **Settings → Pages**. Under "Branch", pick **main** and **/(root)**, then tap **Save**.
5. Wait 1–2 minutes. Your booth is now at **https://YOUR-USERNAME.github.io/booth/**

To update the app later, upload the changed file to the same repository again.

## 2. Install it on the iPad

1. Open your link in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. **Always open the booth from that home screen icon.** It runs full-screen, works without internet after the first launch, and keeps your photos. The home screen app and the Safari tab store photos separately.
4. The first time you start a booth, tap **Allow** for the camera.

## 3. Creator mode (only you): make and publish designs

There are no built-in designs. Every design comes from you.

1. Open **Settings → 🔒 Creator mode**. The first time, choose a passcode. Only you should know it.
2. Tap **+ New design**, name it, and pick the layout. Only you decide layouts.
3. **Using a Canva design:**
   1. Tap **Get Canva guide** and save the image.
   2. In Canva, choose **Custom size** and enter the exact pixels shown. For a 1×4 strip that's 600 × 1800.
   3. Add the guide image and stretch it to fill the page. Design around the grey photo boxes.
   4. Delete the guide image, **Download → PNG**, then tap **Upload background**. If your design already has the words on it, set Text position to **No text**.

   You can also build a design right in the app with colors, patterns, fonts, borders and stickers.
   **Text anywhere:** tap **＋ Add text box**, type your words (press return for a new line), and drag the box anywhere on the preview. You can set the font, color, size, rotation, alignment, bold, italic, transparency, shadow, outline and glow for each box. Tick **Let people change these words** on a box to let friends re-word it for their event, for example family names. Their wording keeps your position and style.
   Tip: to keep text off the photos, set **Title area** to Bottom or Top, clear the title lines, and drag your text boxes into that empty space.
4. Choose whether people may change the **text lines** (title, second line, date). Untick it to lock the design completely.
5. Tap **Test booth ▶** to try it, then **Save**. Saved designs are drafts and only you can see them.
6. **Publish:** in Creator mode, tap **Publish designs → Make library.json → Save to Files**. On github.com, open your `booth` repository, tap **Add file → Upload files**, upload `library.json` (it replaces the old one), and tap **Commit changes**. Within 1–2 minutes, everyone who opens your link gets the new designs.
7. Tap **Lock** when you're done. That way, anyone who borrows your iPad can't edit your designs.

Why this is safe: your friends' copies of the app read your designs from `library.json` on your GitHub site. Only your GitHub account can change that file. Friends can't open Creator mode without your passcode, and nothing they do on their own iPad changes what anyone else sees.

To edit your designs on another device, open Creator mode there, enter your passcode, and tap **Copy published designs into drafts**.

## 4. What everyone else (and you) does at an event

1. Tap **+ New event**, give it a name like "Cruz Family Christmas Party", and pick one of your designs.
2. If the design allows it, change the words (title lines and any text boxes the creator unlocked). You can also set the countdown, the auto-return time, mirroring, beeps, and the start-button text. Nothing else can be changed.

### Anyone can make their own designs

Below their events on the home screen, everyone has **My own designs → ＋ Create my own design**:

1. Name the design and pick a layout.
2. Tap **Upload background** to use any frame image: a Canva PNG, a photo, anything. **Get Canva guide** shows where the photos will go.
3. Add **text boxes** anywhere. For each one you can set the font, size, color, rotation, alignment, bold, italic, transparency, shadow, outline (color and thickness) and glow (color and size).
4. Add stickers and photo borders, and adjust the margins.
5. Tap **Save**, then **Use** to make an event from the design.

Personal designs stay on that iPad only. They never change your published designs and never get published. Your ready-made designs stay locked: other people can only change the words you've unlocked.

## 5. Running the booth at the event

- Tap **Start ▶**. Guests tap the screen, there's a countdown, photos are taken, and the finished strip appears.
- **Share / AirDrop / Save** opens the iPad share sheet. AirDrop works **without internet**.
- **To exit:** hold the ✕ in the corner for 2 seconds. If you set a PIN in Settings, you'll enter that instead.
- Tip: turn on **Guided Access** (Settings → Accessibility) so guests can't leave the app. Keep the iPad plugged in, and set Auto-Lock to Never.

## 6. After the event

Open the **Gallery**, pick the event, and tap **Save / share all** (to Photos or AirDrop) or **Download all (ZIP)** (to the Files app). Back up your photos after every event. They live only on the iPad.

## 7. Optional: QR codes so guests download their own photo (free)

1. Make a free account at **cloudinary.com**. No credit card is needed.
2. Copy your **Cloud name** from the dashboard.
3. Go to **Settings (gear) → Upload → Upload presets → Add upload preset**:
   - Signing mode: **Unsigned**
   - Leave **Folder** empty and turn **off** "Use filename"
   - Save, and copy the preset name.
4. In the booth's **Settings**, paste both values, then tap **Test upload**. It should say ✅ Works.
5. When you publish, keep **Include my QR settings** ticked. QR codes will then work on your friends' iPads too, with their photos going to your free account.

How it works when there's no internet: the QR code still appears right away. The photo waits on the iPad and uploads automatically when the iPad is back online. The guest's link starts working at that point, and you can also tap **Upload pending** in the Gallery. Without Cloudinary set up, the QR code is hidden and you use AirDrop or save instead.

## Print sizes (for when you get a printer)

| Layout | Size | Pixels (300 dpi) |
|---|---|---|
| 1×4, 1×3, 1×2 strip | 2×6 in | 600×1800 |
| 2 strips on 4×6 (cut in half) | 4×6 in | 1200×1800 |
| 2×2 grid | 4×6 in | 1200×1800 |
| Single photo | 6×4 in | 1800×1200 |
