# Drowsy Driver Alert

A simple web app that watches a driver's eyes through the phone camera and plays a loud, high-pitched alarm when the eyes stay closed for too long.

**Live demo:** https://YOUR-LINK-HERE
**Author:** YOUR NAME

> This is an academic prototype. It is not a certified safety device and is no substitute for taking a break when tired.

## How it works

1. The browser opens the front camera.
2. MediaPipe Face Landmarker finds 468 points on the face, including six points around each eye.
3. The app computes the **Eye Aspect Ratio (EAR)**, the eye's height divided by its width:

   ```
   EAR = ( |p2-p6| + |p3-p5| ) / ( 2 × |p1-p4| )
   ```

   Open eyes give roughly 0.25 to 0.35. Closed eyes drop below about 0.15.
4. If the EAR stays below the threshold (`0.2`) for 1.5 seconds, the driver is considered sleepy. A normal blink lasts well under that.
5. The app turns the eye outline red and plays a repeating 2200 Hz beep, generated with the Web Audio API, until the eyes open.

## Privacy

Everything runs on the device. No video or image is uploaded or stored.

## Project structure

```
index.html   page structure
style.css    styling
app.js       camera, face detection, drowsiness logic, alarm
```

## Run locally

The camera only works on `localhost` or HTTPS, so do not open `index.html` by double-clicking it. Start a small local server in the project folder:

```bash
npx serve .
```

or

```bash
python -m http.server 8000
```

Then open the address it prints (for example `http://localhost:3000`) in Chrome and allow the camera.

## Deploy

The project is a static site, so any static host works (Netlify, GitHub Pages, Cloudflare Pages). These hosts provide HTTPS automatically, which phones require for camera access.

## Settings you can tune

In `app.js`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `EAR_THRESHOLD` | `0.2` | Below this value the eye counts as closed |
| `CLOSED_MS` | `1500` | How long the eyes must stay closed before the alarm (milliseconds) |

Glasses and camera angle change the EAR, so adjust `EAR_THRESHOLD` to sit about halfway between your open-eye and closed-eye readings.

## Known limitations

- Needs an internet connection on first load (libraries come from `cdn.jsdelivr.net`, the model from `storage.googleapis.com`).
- Detection stops if the phone screen turns off or the tab goes to the background. Keep the screen on. A screen wake lock is planned.
- Accuracy drops with steep side angles, poor lighting, or sunglasses.
- Looking down at the dashboard lowers the EAR and may cause false alarms.
- On iPhone, the ringer switch can mute web audio.

## Roadmap

- Screen wake lock
- Automated tests for the EAR and drowsiness logic
- Security headers (CSP) and self-hosted libraries
- SEO and installable app (PWA)

## Built with

- HTML, CSS, JavaScript
- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) (Face Landmarker)
- Web Audio API
