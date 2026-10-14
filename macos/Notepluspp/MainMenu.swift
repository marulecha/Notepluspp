import AppKit

// The macOS menu bar. Items with a command id run the page's command; the rest are standard
// AppKit actions sent to the first responder, so the system clipboard works in the editor and
// in dialogs.
enum MainMenu {
    static func build(target: AppDelegate) -> NSMenu {
        let name = AppInfo.name
        func cmd(_ title: String, _ id: String, _ key: String = "", _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let item = NSMenuItem(title: title, action: #selector(AppDelegate.runPageCommand(_:)), keyEquivalent: key)
            item.keyEquivalentModifierMask = mods
            item.representedObject = id
            item.target = target
            return item
        }
        func std(_ title: String, _ action: Selector, _ key: String = "", _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
            item.keyEquivalentModifierMask = mods
            return item
        }
        func menu(_ title: String, _ items: [NSMenuItem]) -> NSMenuItem {
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            let sub = NSMenu(title: title)
            items.forEach(sub.addItem)
            item.submenu = sub
            return item
        }

        let services = NSMenuItem(title: "Services", action: nil, keyEquivalent: "")
        services.submenu = NSMenu(title: "Services")
        NSApp.servicesMenu = services.submenu

        let appMenu = menu(name, [
            cmd("About \(name)", "help.about"),
            .separator(),
            cmd("Settings...", "settings.prefs", ","),
            .separator(),
            services,
            .separator(),
            // Cmd+H belongs to Replace, as Ctrl+H does in Notepad++.
            std("Hide \(name)", #selector(NSApplication.hide(_:))),
            std("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
            std("Show All", #selector(NSApplication.unhideAllApplications(_:))),
            .separator(),
            std("Quit \(name)", #selector(NSApplication.terminate(_:)), "q"),
        ])

        let fileMenu = menu("File", [
            cmd("New", "file.new", "n"),
            cmd("Open...", "file.open", "o"),
            cmd("Reopen Closed Tab", "file.restoreClosed", "t", [.command, .shift]),
            .separator(),
            cmd("Save", "file.save", "s"),
            cmd("Save As...", "file.saveAs", "s", [.command, .option]),
            cmd("Save All", "file.saveAll", "s", [.command, .shift]),
            .separator(),
            cmd("Close Tab", "file.close", "w"),
            std("Close Window", #selector(NSWindow.performClose(_:)), "w", [.command, .shift]),
        ])

        let editMenu = menu("Edit", [
            cmd("Undo", "edit.undo", "z"),
            cmd("Redo", "edit.redo", "z", [.command, .shift]),
            .separator(),
            std("Cut", #selector(NSText.cut(_:)), "x"),
            std("Copy", #selector(NSText.copy(_:)), "c"),
            std("Paste", #selector(NSText.paste(_:)), "v"),
            std("Select All", #selector(NSText.selectAll(_:)), "a"),
            .separator(),
            cmd("Find...", "search.find", "f"),
            cmd("Replace...", "search.replace", "h"),
            cmd("Find in Files...", "search.fif", "f", [.command, .shift]),
        ])

        let viewMenu = menu("View", [
            cmd("Zoom In", "view.zoomIn", "="),
            cmd("Zoom Out", "view.zoomOut", "-"),
            cmd("Actual Size", "view.zoomReset", "0"),
            .separator(),
            std("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]),
        ])

        let windowMenu = menu("Window", [
            std("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"),
            std("Zoom", #selector(NSWindow.performZoom(_:))),
            .separator(),
            std("Bring All to Front", #selector(NSApplication.arrangeInFront(_:))),
        ])
        NSApp.windowsMenu = windowMenu.submenu

        let helpMenu = menu("Help", [cmd("About \(name)", "help.about")])
        NSApp.helpMenu = helpMenu.submenu

        let main = NSMenu(title: "Main")
        [appMenu, fileMenu, editMenu, viewMenu, windowMenu, helpMenu].forEach(main.addItem)
        return main
    }
}
