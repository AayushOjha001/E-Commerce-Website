# Design direction

Read this before touching any UI. It is the output of the `frontend-design` skill's planning pass,
kept here because every agent session starts cold.

**Subject:** a small online shop for well-made everyday gear: audio, computers, phones, kitchen kit,
wearables. **Audience:** people comparing a handful of considered purchases, not bargain-hunting
through thousands of listings. **The page's job:** make the shop feel like a real place with real
stock, then get out of the way of buying.

## The one bold idea: the shop has shelves

Every product is a **single-ink line drawing on a flat colour field**, like a two-colour printed
mail-order catalogue. On the home page each department is a coloured band whose bottom edge is a
shelf, and its products stand on it. That is where all the boldness goes. Everything else is quiet.

Drawings are SVGs in `public/images/products/`: transparent background, `viewBox="0 0 600 600"`,
sitting on the baseline at `y=540` so they stand on a shelf. The tile behind supplies the colour.

## Tokens (defined in `src/app/globals.css`)

| Token | Value | Role |
|---|---|---|
| `paper` | `#F3F5F6` | Page background. Cool, deliberately not cream. |
| `ink` | `#16233F` | Text and drawing lines. A printer's blue-black, never `#111`. |
| `cobalt` | `#2340D3` | The one action colour: primary buttons, links, focus. |
| `marigold` | `#F5C543` | Audio field |
| `sky` | `#B5D5F2` | Computers field |
| `coral` | `#F4A79D` | Phones field |
| `mint` | `#94D1AE` | Home & Kitchen field |
| `lilac` | `#CBBBF2` | Wearables field |

Colour encodes the department, everywhere. Unknown categories hash onto the same five fields
(`src/lib/department.ts`), so an admin-created category still gets a colour.

Semantic red/green for errors and stock are separate from the department fields.

**Type:** Archivo only, using its width axis: **Expanded Black** for display, normal width for body.
One family, two clearly different voices. Prices use tabular figures.

**Layout:** full-bleed colour fields flush against each other. Text left-aligned. Product tiles are
flat colour with text set directly on the colour.

**Theme:** light only, on purpose. A printed catalogue has one paper stock.

## Checked against the generic defaults

- Not cream/serif/terracotta, not near-black/acid-green, not broadsheet hairlines.
- **Revised:** the first draft gave tiles thick ink outlines. Together with pastel fields that is
  neo-brutalism, its own template. So UI chrome has **no outlines and no offset shadows**. Only the
  drawings carry ink lines.
- No rounded-card-with-soft-shadow kit. Tiles are colour fields, not cards. Radius appears only on
  controls (`6px`), by role.
- No all-caps eyebrows, no middle-dot meta strings, no monospace labels, no `→` on links, no fade-up
  entrances, no emoji.

## Motion

Only in response to an action: cart count updating, a line item leaving, a pending button. One hover
treatment: a drawing lifts a few pixels off its shelf. Respect `prefers-reduced-motion`.

## Words

Sentence case. Buttons say exactly what happens ("Add to cart", "Place order"). Errors say what went
wrong and how to fix it. Empty states say what to do next. No marketing filler, and never claim
anything the data does not back up.

## Quality floor

Responsive to 360px, visible keyboard focus, AA contrast, every form control labelled, loading,
empty and error states on every data view. Check rendered pages with a real browser before calling
a UI task done.
