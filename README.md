# Torrent Action

This GitHub action allows you to generate and publish torrent files for your release assets, which is useful when the files are large. Initial seeding is performed using the corresponding GitHub release assets as webseeds.

## Usage

There are two modes, [local](#local) and [remote](#remote).

- In local mode, you will specify which files need torrents generated. This works faster as there's less upload/download involved.
- In remote mode, every generated asset gets a corresponding torrent file. Parameters `files` and `onefile` are ignored.

Parameters

| name      | default              | description                                                        |
| --------- | -------------------- | ------------------------------------------------------------------ |
| `token`   | required             | Set to `${{ secrets.GITHUB_TOKEN }}`                               |
| `local`   | `true`               | Search files locally or download existing release assets.          |
| `files`   | required, if `local` | List of files to create torrents for. One per line, globs allowed. |
| `onefile` | `false`              | Create a single torrent containing all listed `files`.             |

### Local

Files are searched locally, torrents are generated for them, and then everything is released together.

Example

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

        # Create torrents first
      - name: Create torrents
        uses: devopsx/action-torrent@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          files: |
            dist/index.js
            src/*

        # And then upload torrents together with corresponding assets
      - name: Release
        uses: softprops/action-gh-release@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          name: ${{ github.ref_name }}
          fail_on_unmatched_files: true
          files: | # same as above, but with addition of torrents/* directory
            dist/index.js
            src/*
            torrents/*
```

### Remote

The release is generated first, then every asset is downloaded, a corresponding torrent file is created and uploaded. Parameters `files` and `onefile` are ignored.

This is a bit slower, as there's an extra download cycle, but may be preferable in some use cases.

Example

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

        # Create a release first
      - name: Release
        uses: softprops/action-gh-release@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          name: ${{ github.ref_name }}
          fail_on_unmatched_files: true
          files: |
            dist/index.js
            src/*

        # Download release assets, create and upload a torrent file for each one
      - name: Release torrents
        uses: devopsx/action-torrent@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          local: false
```

## P.S.

I would add magnet links, but GitHub doesn't render them.

## P.P.S.

GitHub/Microsoft, if you'd like to thank me for the gazillibytes of traffic saved, you have my contact info :).
