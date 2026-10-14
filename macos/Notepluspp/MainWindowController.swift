import AppKit
import WebKit

// The editor window. It shows the page from public/ through the notepluspp:// scheme, which also
// answers the page's /api calls, so the page runs unchanged from browser mode.
final class MainWindowController: NSWindowController, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    var onClosed: (() -> Void)?

    private let webView: EditorWebView
    private var loaded = false
    private var closing = false
    private var pendingFiles: [String] = []
    private var titleObservation: NSKeyValueObservation?
    private var printer: PagePrinter?

    // Gives the page what a browser tab doesn't have: clipboard reads without a permission
    // prompt, and native printing.
    private static let bridgeScript = """
    window.desktop = {
      readClipboard: () => window.webkit.messageHandlers.desktop.postMessage({ op: 'readClipboard' }),
      print: (html) => window.webkit.messageHandlers.desktop.postMessage({ op: 'print', html }),
    };
    """

    init() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(SchemeHandler(mode: .app), forURLScheme: SchemeHandler.scheme)
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        if #available(macOS 12.3, *) { config.preferences.isElementFullscreenEnabled = true }
        config.userContentController.addUserScript(WKUserScript(source: Self.bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = EditorWebView(frame: .zero, configuration: config)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = AppInfo.name
        window.minSize = NSSize(width: 600, height: 400)
        window.center()
        window.setFrameAutosaveName("MainWindow")
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.contentView = webView
        window.isReleasedWhenClosed = false
        super.init(window: window)
        window.delegate = self

        config.userContentController.addScriptMessageHandler(WeakMessageHandler(self), contentWorld: .page, name: "desktop")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        #if DEBUG
        if #available(macOS 13.3, *) { webView.isInspectable = true }
        #endif
        webView.onFileDrop = { [weak self] files in self?.open(files: files) }
        titleObservation = webView.observe(\.title) { [weak window] view, _ in
            let title = view.title ?? ""
            window?.title = title.isEmpty ? AppInfo.name : title
        }
        webView.load(URLRequest(url: SchemeHandler.baseURL))
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    var webViewHasFocus: Bool {
        guard let responder = window?.firstResponder as? NSView else { return false }
        return responder.isDescendant(of: webView)
    }

    // Brings the window forward. Until the page has loaded, the window stays hidden so it doesn't
    // flash white on launch; didFinish shows it.
    func present() {
        if loaded { window?.makeKeyAndOrderFront(nil) }
    }

    func open(files: [String]) {
        if loaded { files.forEach(openInPage) } else { pendingFiles.append(contentsOf: files) }
    }

    func run(command id: String) {
        webView.callAsyncJavaScript("runCommand(id)", arguments: ["id": id], in: nil, in: .page)
    }

    // Asks the page whether the window may close. It saves the session, or asks about unsaved
    // tabs when session restore is off.
    func askPageToClose(_ done: @escaping (Bool) -> Void) {
        guard loaded else { done(true); return }
        webView.callAsyncJavaScript("return await beforeAppClose()", arguments: [:], in: nil, in: .page) { result in
            if case .success(let value) = result, let ok = value as? Bool { done(ok) } else { done(true) }
        }
    }

    private func openInPage(_ path: String) {
        let script = """
        while (typeof App === 'undefined' || !App.ready) await new Promise((r) => setTimeout(r, 50));
        await openFile(path);
        """
        webView.callAsyncJavaScript(script, arguments: ["path": path], in: nil, in: .page)
    }

    // MARK: NSWindowDelegate

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if closing { return true }
        askPageToClose { [weak self] ok in
            guard let self, ok else { return }
            self.closing = true
            self.window?.close()
        }
        return false
    }

    func windowWillClose(_ notification: Notification) {
        onClosed?()
    }

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !loaded else { return }
        loaded = true
        window?.makeKeyAndOrderFront(nil)
        pendingFiles.forEach(openInPage)
        pendingFiles.removeAll()
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "about" || (SchemeHandler.isAppURL(url) && !SchemeHandler.isPreviewURL(url)) {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            Links.open(url)
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        loaded = false
        webView.load(URLRequest(url: SchemeHandler.baseURL))
    }

    // MARK: WKUIDelegate

    // "Launch in browser" previews open in their own window. Other links go to the default browser.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { Links.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.beginSheetModal(for: window!) { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    // MARK: WKScriptMessageHandlerWithReply

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.webView === webView, let body = message.body as? [String: Any] else {
            replyHandler(nil, "Bad message")
            return
        }
        switch body["op"] as? String {
        case "readClipboard":
            replyHandler(NSPasteboard.general.string(forType: .string) ?? "", nil)
        case "print":
            guard let window, let html = body["html"] as? String else { replyHandler(nil, "Nothing to print"); return }
            printer = PagePrinter(html: html, window: window) { [weak self] in self?.printer = nil }
            replyHandler(true, nil)
        default:
            replyHandler(nil, "Unknown request")
        }
    }
}

// WKUserContentController keeps its message handlers alive, which would keep the window alive.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandlerWithReply {
    weak var target: WKScriptMessageHandlerWithReply?
    init(_ target: WKScriptMessageHandlerWithReply) { self.target = target }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard let target else { replyHandler(nil, "Window closed"); return }
        target.userContentController(controller, didReceive: message, replyHandler: replyHandler)
    }
}

// Opens files dropped from Finder by path. The page alone would only see their contents.
final class EditorWebView: WKWebView {
    var onFileDrop: (([String]) -> Void)?

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        let urls = sender.draggingPasteboard.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] ?? []
        let files = urls.filter { !$0.hasDirectoryPath }.map(\.path)
        if files.isEmpty { return super.performDragOperation(sender) }
        onFileDrop?(files)
        return true
    }
}

// Prints HTML the page built. The page's own iframe printing doesn't work in WKWebView.
final class PagePrinter: NSObject, WKNavigationDelegate {
    private let webView: WKWebView
    private weak var window: NSWindow?
    private let done: () -> Void

    init(html: String, window: NSWindow, done: @escaping () -> Void) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.defaultWebpagePreferences.allowsContentJavaScript = false
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 1000), configuration: config)
        self.window = window
        self.done = done
        super.init()
        webView.navigationDelegate = self
        webView.loadHTMLString(html, baseURL: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let window else { done(); return }
        let info = NSPrintInfo.shared.copy() as! NSPrintInfo
        info.isHorizontallyCentered = false
        info.isVerticallyCentered = false
        let op = webView.printOperation(with: info)
        op.view?.frame = webView.bounds
        op.runModal(for: window, delegate: self, didRun: #selector(printDone), contextInfo: nil)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { done() }

    @objc private func printDone() { done() }
}
