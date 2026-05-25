# ProRemote

This app exists because the current ProPresenter Remote only works with Version 20 and above. This app works with any version that supports the following REST API endpoints:

## API endpoints used

| Purpose | Endpoint |
| ----------------------- | -------------------------------------------------------- |
| **Version** | |
| Version probe | `GET /version` |
| **Playlists** | |
| List playlists | `GET /v1/playlists` |
| Playlist contents | `GET /v1/playlist/{id}` |
| Focused playlist + item | `GET /v1/playlist/focused?chunked=false` |
| Focus playlist | `GET /v1/playlist/{id}/focus` |
| Trigger focused playlist item | `GET /v1/playlist/focused/trigger` |
| **Presentations** | |
| Presentation data | `GET /v1/presentation/{uuid}` |
| Active presentation | `GET /v1/presentation/active` |
| Active slide index | `GET /v1/presentation/slide_index` *(modern)* or `GET /v1/presentation/active/slide_index` *(legacy fallback)* |
| Slide thumbnail | `GET /v1/presentation/{uuid}/thumbnail/{index}?quality=` |
| **Triggers** | |
| Trigger slide | `GET /v1/presentation/{uuid}/{index}/trigger` |
| Trigger active presentation slide | `GET /v1/presentation/active/{index}/trigger` |
| Trigger playlist item | `GET /v1/playlist/{id}/{index}/trigger` |
| Next slide | `GET /v1/trigger/next` |
| Previous slide | `GET /v1/trigger/previous` |
| Clear slide layer | `GET /v1/clear/layer/slide` |

A mobile/tablet-friendly browser remote for [ProPresenter](https://renewedvision.com/propresenter/) built with **Svelte + Vite** and packaged as a native binary with **[phpacker](https://phpacker.dev/)**.

The Svelte SPA talks **directly** to ProPresenter's REST API ([openapi.propresenter.com](https://openapi.propresenter.com/)). PHP is only used as a tiny static-file server so the whole thing can be shipped as a single native binary.

## Features

- Browse playlists and their items
- Load a presentation and view a slide grid with **live thumbnails**
- Tap a slide to trigger it
- Big Prev / Next / Clear control bar (designed for fingers)
- Keyboard shortcuts: `→` / `Space` / `PgDn` → next, `←` / `PgUp` → previous, `Esc` → clear
- Responsive layout — works on phones, tablets and desktop
- Connection settings stored in `localStorage`

## Quick start (development)

```bash
npm install
npm run dev
```

This starts Vite at <http://localhost:5173>. Open Settings in the app and enter the IP and port of the computer running ProPresenter (default port: `50001`). Make sure **Allow Network Connections** is enabled in ProPresenter's *Preferences → Network*.

## Build the SPA

```bash
npm run build
```

This compiles the Svelte app into `public/`.

## Run via PHP (preview)

After building:

```bash
php -S 0.0.0.0:8000 app.php
```

Or just:

```bash
npm run serve
```

`app.php` serves every request itself (the same code path used inside the bundled phar), so no `-t docroot` is needed.

When it starts you'll see your local + LAN URLs and a **QR code** in the console — scan it with your phone.

## Package as a single native binary with phpacker

phpacker accepts a `.phar` as input, so we first bundle everything into a phar and then hand that to phpacker.

### 1. Build the SPA

```bash
npm run build
```

### 2. Build the phar

```bash
php -d phar.readonly=0 build-phar.php
```

This produces `proremote.phar` containing `app.php`, `vendor/qrcode.php` and the entire `public/` SPA. You can run it stand-alone:

```bash
php proremote.phar
```

### 3. Compile to a native binary

Install phpacker: <https://phpacker.dev/docs/installation/>

```bash
# Single platform (platforms: mac | linux | windows | all)
phpacker build mac arm --src=./proremote.phar
phpacker build windows x64 --src=./proremote.phar
phpacker build linux x64 --src=./proremote.phar

# All supported platforms
phpacker build all --src=./proremote.phar

# Custom output dir / PHP version
phpacker build all --src=./proremote.phar --dest=./build --php=8.3
```

The resulting binary is fully self-contained — no PHP install, no separate `public/` folder needed. Just run it:

```bash
./proremote
# or override the port / bind address
PORT=9000 HOST=0.0.0.0 ./proremote
```

## CORS

ProPresenter's API normally allows cross-origin requests. If your browser blocks them:
- Confirm the device can reach the host (`http://<host>:50001/version` in a browser).
- Update ProPresenter to a recent version — older builds had stricter CORS.
- As a fallback, host this app on the same machine running ProPresenter.

## Project structure

```
app.php              PHP entry point (used by phpacker / php -S)
vite.config.js       Vite config — builds client/ → public/
client/
  index.html
  src/
    App.svelte       Top-level shell, header, layout, key bindings
    main.js          Svelte bootstrap
    app.css          Global theme
    lib/
      api.js         ProPresenter REST client
      stores.js      Svelte stores (settings, current presentation, status)
    components/
      Settings.svelte    Modal: host/port/https
      Playlists.svelte   Sidebar: playlists + items
      SlideGrid.svelte   Slide thumbnails grid
      Controls.svelte    Big Prev / Clear / Next bar
public/              Built SPA (generated by `npm run build`)
```


See the full reference at <https://openapi.propresenter.com/>.
