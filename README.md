# Binary Signal Visualizer

An interactive line-encoding visualizer for digital communications. Enter a binary sequence and inspect its Unipolar, NRZ-L, NRZ-I, Manchester, B8ZS, or HDB3 waveform.

## Features

- TypeScript frontend with a reproducible Vite build.
- Correct AMI substitutions for B8ZS and HDB3.
- Catppuccin Latte, Frappé, Macchiato, and Mocha palettes.
- `Default · browser` follows `prefers-color-scheme`: Latte for light mode and Mocha for dark mode.
- Responsive waveform rendering with bit boundaries and signal levels.
- Selected palette is saved locally.

## Run locally

```sh
npm install
npm run dev
```

Create a production bundle with:

```sh
npm run build
```

## Encodings

| Encoding | Rule |
| --- | --- |
| Unipolar | `1` is +V; `0` is 0V |
| NRZ-L | `1` is −V; `0` is +V |
| NRZ-I | `1` changes the level; `0` holds it |
| Manchester | Every bit transitions at mid-bit |
| B8ZS | Replaces eight zeroes with `000VB0VB` |
| HDB3 | Replaces four zeroes with `000V` or `B00V` |
