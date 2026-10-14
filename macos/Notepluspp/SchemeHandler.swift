import Foundation
import WebKit

enum AppInfo {
    static let name = "Notepluspp"
    static var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "" }
    static let publicDir = Bundle.main.resourceURL!.appendingPathComponent("public").path
    // The same folder the Electron build used, so existing sessions carry over. Debug builds keep
    // their own, so running from Xcode can't overwrite the session of an installed copy.
    #if DEBUG
    private static let dataFolder = "\(name) Debug"
    #else
    private static let dataFolder = name
    #endif
    static let dataDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent(dataFolder).path
}

struct Response {
    var status = 200
    var headers: [String: String] = [:]
    var body = Data()

    static func json(_ object: Any, status: Int = 200) -> Response {
        let data = (try? JSONSerialization.data(withJSONObject: object, options: [.fragmentsAllowed])) ?? Data("{}".utf8)
        return Response(status: status, headers: ["Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"], body: data)
    }

    static func error(_ message: String, status: Int = 400) -> Response {
        json(["error": message], status: status)
    }

    static func text(_ message: String, status: Int) -> Response {
        Response(status: status, headers: ["Content-Type": "text/plain; charset=utf-8"], body: Data(message.utf8))
    }
}

// Serves notepluspp://app/. In the editor window it serves the UI from public/ and the file API
// under /api/. In preview windows it serves only /preview/<absolute path>, the local file as-is.
final class SchemeHandler: NSObject, WKURLSchemeHandler {
    enum Mode { case app, preview }

    static let scheme = "notepluspp"
    static let host = "app"
    static let baseURL = URL(string: "\(scheme)://\(host)/")!

    static func isAppURL(_ url: URL) -> Bool {
        url.scheme == scheme && url.host == host
    }

    static func isPreviewURL(_ url: URL) -> Bool {
        isAppURL(url) && url.path.hasPrefix("/preview/")
    }

    private let mode: Mode
    // Tasks WebKit hasn't stopped yet. Only touched on the main thread.
    private var running = Set<ObjectIdentifier>()
    private let queue = DispatchQueue(label: "Notepluspp.scheme", qos: .userInitiated, attributes: .concurrent)

    init(mode: Mode) {
        self.mode = mode
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let id = ObjectIdentifier(task)
        running.insert(id)
        let request = task.request
        let mode = self.mode
        queue.async {
            let response = Self.respond(to: request, mode: mode)
            DispatchQueue.main.async {
                guard self.running.remove(id) != nil, let url = request.url else { return }
                var headers = response.headers
                headers["Content-Length"] = String(response.body.count)
                task.didReceive(HTTPURLResponse(url: url, statusCode: response.status, httpVersion: "HTTP/1.1", headerFields: headers)!)
                task.didReceive(response.body)
                task.didFinish()
            }
        }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        running.remove(ObjectIdentifier(task))
    }

    private static func respond(to request: URLRequest, mode: Mode) -> Response {
        guard let url = request.url, isAppURL(url) else { return .text("Forbidden", status: 403) }
        let path = url.path

        if path.hasPrefix("/preview/") {
            guard mode == .preview else { return .text("Not found", status: 404) }
            // The sandbox gives the page its own opaque origin, as in browser mode.
            return StaticFiles.serve(root: "/", relative: String(path.dropFirst("/preview".count)),
                                     extraHeaders: ["Content-Security-Policy": "sandbox allow-scripts allow-forms allow-modals allow-popups"])
        }
        guard mode == .app else { return .text("Not found", status: 404) }

        if path.hasPrefix("/api/") {
            // Only the editor page may call the API, never a document it loaded.
            if let main = request.mainDocumentURL, !isAppURL(main) || isPreviewURL(main) {
                return .error("Cross-origin request refused", status: 403)
            }
            return FileAPI.handle(method: request.httpMethod ?? "GET", name: String(path.dropFirst("/api/".count)),
                                  query: queryItems(url), body: requestBody(request))
        }
        return StaticFiles.serve(root: AppInfo.publicDir, relative: path == "/" ? "index.html" : path, cache: true)
    }

    // Parses the query the way URLSearchParams writes it, with + for spaces.
    private static func queryItems(_ url: URL) -> [String: String] {
        var out: [String: String] = [:]
        guard let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedQuery else { return out }
        for pair in query.split(separator: "&") {
            let parts = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            func decode(_ s: Substring) -> String {
                s.replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? String(s)
            }
            out[decode(parts[0])] = parts.count > 1 ? decode(parts[1]) : ""
        }
        return out
    }

    private static func requestBody(_ request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        var data = Data()
        stream.open()
        defer { stream.close() }
        let size = 64 * 1024
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: size)
        defer { buffer.deallocate() }
        while stream.hasBytesAvailable {
            let n = stream.read(buffer, maxLength: size)
            if n <= 0 { break }
            data.append(buffer, count: n)
        }
        return data
    }
}

enum StaticFiles {
    private static let mime = [
        "html": "text/html; charset=utf-8", "htm": "text/html; charset=utf-8",
        "js": "text/javascript; charset=utf-8", "mjs": "text/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8", "json": "application/json; charset=utf-8",
        "svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "gif": "image/gif", "ico": "image/x-icon", "webp": "image/webp", "txt": "text/plain; charset=utf-8",
        "md": "text/plain; charset=utf-8", "xml": "text/xml; charset=utf-8", "pdf": "application/pdf",
        "woff": "font/woff", "woff2": "font/woff2", "mp4": "video/mp4", "mp3": "audio/mpeg", "wasm": "application/wasm",
    ]

    static func serve(root: String, relative: String, cache: Bool = false, extraHeaders: [String: String] = [:]) -> Response {
        let base = URL(fileURLWithPath: root, isDirectory: true).standardized
        var file = base.appendingPathComponent(relative).standardized
        let prefix = base.path.hasSuffix("/") ? base.path : base.path + "/"
        guard file.path.hasPrefix(prefix) else { return .text("Forbidden", status: 403) }
        var isDir: ObjCBool = false
        if FileManager.default.fileExists(atPath: file.path, isDirectory: &isDir), isDir.boolValue {
            file.appendPathComponent("index.html")
        }
        guard let data = FileManager.default.contents(atPath: file.path) else { return .text("Not found", status: 404) }
        var headers = extraHeaders
        headers["Content-Type"] = mime[file.pathExtension.lowercased()] ?? "application/octet-stream"
        headers["Cache-Control"] = cache ? "no-cache" : "no-store"
        return Response(status: 200, headers: headers, body: data)
    }
}
