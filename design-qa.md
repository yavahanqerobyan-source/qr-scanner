# Design QA

## Reference

- Source image: `C:\Users\yareb\AppData\Local\Temp\codex-clipboard-33a3ccc9-8d0e-4b26-bb0a-a6aa0a7ce1ca.png`

## Checked Prototype

- Desktop screenshot: `C:\Users\yareb\OneDrive\Рабочий стол\Сайт Гладкая\tmp\qa\final-desktop.png`
- Mobile screenshot: `C:\Users\yareb\OneDrive\Рабочий стол\Сайт Гладкая\tmp\qa\final-mobile.png`

## Pass Notes

- Hero rebuilt as a full-bleed premium composition with portrait/background, transparent header, large serif heading, botanical divider, quote, signature, and one primary CTA.
- Old hero card/facts/media elements are hidden in the reference-matched hero.
- Desktop check at `1680x945`: no console errors, no horizontal overflow.
- Mobile check at `390x844`: no console errors, no horizontal overflow, readable hero text.
- Problems block check at `1680x945`: no overlap between the intro text and the right-side problem grid.
- Booking modal check at `1680x945` and `390x844`: modal opens, selected tariff is passed into the form, no console errors, no horizontal overflow.
- Email draft check: the generated mail body includes the lead title and submitted contact data.

## Residual Difference

- The portrait scene is a generated design asset based on the reference composition. Replace `assets/hero-scene.png` with the real high-resolution doctor photo/background if exact identity matching is required.
