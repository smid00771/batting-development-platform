Award typography uses unmodified font files from the Google Fonts repository:

- Anton Regular: `https://github.com/google/fonts/blob/main/ofl/anton/Anton-Regular.ttf`, exposed to the renderer as Club Display. License: Club-Display-OFL.txt.
- Barlow SemiBold: `https://github.com/google/fonts/blob/main/ofl/barlow/Barlow-SemiBold.ttf`, exposed as Club Sans. License: Club-Sans-OFL.txt.
- Kaushan Script Regular: `https://github.com/google/fonts/blob/main/ofl/kaushanscript/KaushanScript-Regular.ttf`, exposed as Club Brush. License: Club-Brush-OFL.txt.

The files are embedded in `social-award-font-data.js` so the existing static/demo packaging can load them on demand without a third-party font request. Each original SIL Open Font License notice is retained here. The runtime aliases do not alter the font binaries.
