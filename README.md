<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-wordmark-dark.svg">
    <img src="public/logo-wordmark.svg" width="520" alt="Notepluspp logo: a purple chameleon on a stack of pads, next to the word Noteplus{}{}">
  </picture>
</p>

<h1 align="center">Notepluspp</h1>

<div align="center">

**Its official name is Noteplus-$`\color{#9b59d0}\textsf{\textbf{PadPad}}`$, said "note plus $`\color{#9b59d0}\textsf{\textbf{pad pad}}`$".**

</div>

Notepluspp is a copy of Notepad++ for macOS. Notepad++ only runs on Windows, and its developers don't make a Mac version, so this app recreates it for the Mac. It has the same menus, toolbar, tabs and keyboard shortcuts as Notepad++.

Notepluspp is an independent project. It is not affiliated with or endorsed by the Notepad++ project or its author.

![Notepluspp editing a JavaScript file](docs/screenshot.png)

## Download

Get the latest `Notepluspp-<version>.dmg` from the [Releases page](../../releases/latest). The same file runs on Apple silicon and Intel Macs with macOS 12 or later.

Open the `.dmg` and drag Notepluspp into Applications.

### First launch

Notepluspp is free, and it isn't signed through Apple's paid developer program. macOS blocks unsigned apps the first time you open them. To allow it:

1. Double-click Notepluspp in Applications. macOS says it can't verify the app. Click Done.
2. Open System Settings, then Privacy & Security.
3. Scroll to the Security section. Next to the message about Notepluspp, click Open Anyway, then confirm.

You only do this once. If macOS instead says the app "is damaged", run this in Terminal and open it again:

    xattr -dr com.apple.quarantine /Applications/Notepluspp.app

When you first open a file in Documents, Desktop or Downloads, macOS asks whether Notepluspp may access that folder. Click Allow.

## Features

- Tabs, with unsaved text kept between launches.
- Syntax highlighting and code folding for 56 languages, plus word and function auto-completion.
- Find, Replace, Mark, and Find in Files across a folder, with regular expressions.
- Column mode, multi-cursor editing and the column editor.
- Line operations: sort, remove duplicates, join, split, move, trim.
- Bookmarks, a function list, a document list and a folder workspace panel.
- Macro recording and playback.
- Encoding conversion, and line-ending conversion between Windows, Unix and Mac formats.
- Dark mode, themes, and a shortcut mapper.

On macOS, Cmd works wherever Notepad++ uses Ctrl. Cmd+S saves, Cmd+F finds, Cmd+W closes the tab.

You can open files from Finder with Open With, by dropping them on the Dock icon, or by dropping them on the window. The app saves its session in `~/Library/Application Support/Notepluspp`.

## Build from source

Notepluspp is a native Swift app. You need Xcode 15 or later.

    git clone https://github.com/marulecha/Notepluspp.git
    cd Notepluspp
    open macos/Notepluspp.xcodeproj

In Xcode, press Cmd+R to build and run. To build from Terminal instead:

    xcodebuild -project macos/Notepluspp.xcodeproj -scheme Notepluspp -configuration Release build

Builds from source use the Debug configuration by default, and Debug builds keep their session in `~/Library/Application Support/Notepluspp Debug`. They don't touch the session of an installed copy.

### Browser mode

You can also run the editor in your browser. This needs Node.js 18 or later, and no `npm install`.

    npm start

This serves the editor at http://localhost:7777. The server listens on 127.0.0.1 only, and session data goes to `data/session.json`. You can open a file directly with `http://localhost:7777/?open=/path/to/file&line=12`. The browser keeps Cmd+N, Cmd+W and Cmd+T for itself, so use Ctrl+N and Ctrl+W there.

### Releases

Pushing a version tag builds the app on GitHub Actions and attaches the files to a new release:

    git tag v1.0.0
    git push origin v1.0.0

The workflow builds one universal app for Apple silicon and Intel, and signs it ad hoc, without a developer identity. If you fork the project and have an Apple Developer ID, you can sign and notarize the build in the workflow, which skips the first-launch steps above.

## Layout

- `macos/Notepluspp/` is the Swift app. It opens a window with a WKWebView, the macOS system web view, and shows the editor UI from `public/` through a `notepluspp://` URL scheme. The same scheme answers the page's `/api/` calls, so the page runs unchanged from browser mode. The app also builds the menu bar, opens files from Finder and the Dock, and prints.
  - `FileAPI.swift` reads, writes and lists files and stores the session. `TextCodec.swift` handles the text encodings.
  - `FileSearch.swift` runs Find in Files and Replace in Files. Matching runs in JavaScriptCore, so the regular expressions behave exactly as they do in the editor.
  - `PreviewWindowController.swift` shows "Launch in browser" previews in their own window. Their web view has no file API.
- `server.js` serves the same UI and API for browser mode.
- `public/js/` is the editor UI, built on CodeMirror 5. `public/cm/` is CodeMirror 5.65.21.
- `build/brand/make.py` generates the artwork from `build/brand/mascot.svg` and the Fredoka font. `build/icon.svg` and `public/favicon.svg` are the app icon, `public/logo.svg` is the mark in the About dialog, and `public/logo-wordmark.svg` is the README header, with `public/logo-wordmark-dark.svg` for GitHub's dark theme. `build/icon.png` is the 1024px render of `build/icon.svg`. After changing it, run `macos/make-icon.sh` to rebuild the app's `AppIcon.icns`.

## License

Notepluspp uses the MIT license. See [LICENSE](LICENSE).

It builds on [CodeMirror 5](https://codemirror.net/5/), which uses the MIT license. The lettering in the logo is drawn from [Fredoka](https://github.com/hafontia/Fredoka-One), which uses the SIL Open Font License.
