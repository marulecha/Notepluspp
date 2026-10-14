import AppKit

// Owns the single editor window and the menu bar. Files opened from Finder, the Dock or the
// command line (AppKit turns path arguments into openFiles calls) go to the window, which hands
// them to the page once it has loaded.
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: MainWindowController?
    private var pendingFiles: [String] = []
    private var launched = false

    func applicationWillFinishLaunching(_ notification: Notification) {
        NSApp.mainMenu = MainMenu.build(target: self)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        launched = true
        showWindow()
    }

    func application(_ sender: NSApplication, openFiles filenames: [String]) {
        if !launched {
            pendingFiles.append(contentsOf: filenames)
        } else {
            showWindow()
            window?.open(files: filenames)
        }
        sender.reply(toOpenOrPrint: .success)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { showWindow() }
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    // The page decides whether the app may quit: it saves the session, or asks about unsaved
    // tabs when session restore is off.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let window else { return .terminateNow }
        window.askPageToClose { ok in
            sender.reply(toApplicationShouldTerminate: ok)
        }
        return .terminateLater
    }

    private func showWindow() {
        if window == nil {
            let controller = MainWindowController()
            controller.onClosed = { [weak self] in self?.window = nil }
            window = controller
            controller.open(files: pendingFiles)
            pendingFiles.removeAll()
        }
        window?.present()
    }

    // Menu items tagged with a page command id run that command, the same as the page's own menus.
    @objc func runPageCommand(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String else { return }
        // The page already handles its shortcuts. When a key press reaches the menu, the page has
        // seen it and chose not to act, for example because a text field in a dialog has focus.
        // Undo and Redo then go to that text field.
        if NSApp.currentEvent?.type == .keyDown, window?.webViewHasFocus == true {
            if id == "edit.undo" { NSApp.sendAction(Selector(("undo:")), to: nil, from: sender) }
            if id == "edit.redo" { NSApp.sendAction(Selector(("redo:")), to: nil, from: sender) }
            return
        }
        if window == nil { showWindow() }
        window?.run(command: id)
    }
}
