import AppKit
import WebKit

// Routes a URL the page asked to open: local previews get an app window, web links go to the
// default browser.
enum Links {
    private static var previews: [PreviewWindowController] = []

    static func open(_ url: URL) {
        if SchemeHandler.isPreviewURL(url) {
            let controller = PreviewWindowController(url: url)
            controller.onClosed = { [weak controller] in previews.removeAll { $0 === controller } }
            previews.append(controller)
            controller.showWindow(nil)
        } else if ["http", "https", "mailto"].contains(url.scheme?.lowercased() ?? "") {
            NSWorkspace.shared.open(url)
        }
    }
}

// Shows a local HTML file with its relative assets. Its web view has a scheme handler that only
// serves files, with no /api, and a throwaway data store, so the file's scripts can run but can't
// reach the editor or the file API.
final class PreviewWindowController: NSWindowController, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
    var onClosed: (() -> Void)?
    private let webView: WKWebView
    private var titleObservation: NSKeyValueObservation?

    init(url: URL) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.setURLSchemeHandler(SchemeHandler(mode: .preview), forURLScheme: SchemeHandler.scheme)
        webView = WKWebView(frame: .zero, configuration: config)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1000, height: 750),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.contentView = webView
        window.isReleasedWhenClosed = false
        window.title = url.lastPathComponent
        window.center()
        super.init(window: window)
        window.delegate = self

        webView.navigationDelegate = self
        webView.uiDelegate = self
        titleObservation = webView.observe(\.title) { [weak window] view, _ in
            if let title = view.title, !title.isEmpty { window?.title = title }
        }
        webView.load(URLRequest(url: url))
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func windowWillClose(_ notification: Notification) {
        onClosed?()
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "about" || SchemeHandler.isPreviewURL(url) {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            if action.targetFrame?.isMainFrame != false { Links.open(url) }
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { Links.open(url) }
        return nil
    }
}
