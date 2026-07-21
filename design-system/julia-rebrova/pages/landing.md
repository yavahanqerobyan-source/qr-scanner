# Landing page override

The generated master is a useful structural baseline, but its monochrome/blue palette conflicts with the explicit brief for calm pastel tones. This page therefore overrides the visual tokens while preserving the master requirements for spacious density, restrained motion, accessible contrast, and editorial craft.

## Direction

- **Concept:** an artist's quiet studio and an unfinished portrait built up in oil, layer over layer.
- **Signature:** a large custom oil study on the hero canvas — stacked pigment washes over primed linen with the construction drawing still showing beneath the paint. The finishing marks (naples highlight, cheek madder, lead-white impasto) build in as the page scrolls, so the portrait is literally painted "слой за слоем". It is illustrative UI, not presented as Julia's finished artwork. The three subject cards use the same technique in miniature.
- **Palette:** porcelain `#F4EFEB`, paper `#FBF8F4`, ink `#29252A`, muted ink `#615A60`, powder rose `#D6B2AA`, deep madder `#9D514A` (emphasis + italic voice), sage `#B8C0B2`, old gold `#765536`.
- **Academic pigment set (for the painted artwork only):** raw umber `#4A3626`, hair `#5C4632`, terre verte `#79856A`, ochre `#C78F57`, flesh `#E2B590`, madder lake `#9C4C46`, naples yellow `#ECD39A`, lead white `#F8F0E1`. Softness comes from gradient stops, not blur filters, to keep the sticky hero cheap to composite.
- **Display type:** Prata (locally hosted Cyrillic) for major titles only.
- **Editorial voice:** Old Standard TT for Julia's italic voice, quotations, folios, captions, and signatures. Its Russian book character ties the interface to academic portraiture rather than generic fashion-luxury styling.
- **Body and utility:** Golos Text for readable contemporary Cyrillic, navigation, forms, and commercial information.
- **Typography rule:** never synthesize italic or use a system font as the intended face; fallbacks exist only for loading failure.
- **Atelier details:** artwork panels carry restrained study labels (`Этюд I–III`), while package panels form a quiet Roman-numeral triptych. These details encode the painter's process instead of decorating generic cards.
- **Catalogue navigation:** desktop uses a fixed folio index with active chapter and reading progress. It gives the long landing page the rhythm of a private exhibition catalogue without taking over mobile navigation.
- **Commercial composition:** pricing packages form a rigorously aligned triptych. The featured package becomes the visual centre through its paper surface, restrained shadow and tonal contrast rather than a staggered layout.
- **Artist's voice:** the approach chapter closes with a marginal atelier note — a short first-person principle set like an annotation in a working catalogue.
- **Commitments:** between the process and the prices sits a three-column reassurance strip (approve the sketch before the canvas, fixed price, unlimited sketch revisions). Each promise is marked with a small pigment swatch — madder, terre verte, gold — so the palette itself carries the structure rather than decorative numbering. Every claim restates something already true elsewhere on the page; no invented guarantees.
- **Motion:** one restrained reveal system using opacity and translate only, 240-400ms, fully disabled for reduced motion.
- **Components:** fine rules, shallow radii, no generic floating-card dashboard treatment.

## Page structure

Hero -> credentials -> artistic philosophy -> commission subjects -> five-step process -> three commitments -> price packages and estimator -> source-photo guidance -> FAQ -> request builder.
