import CryptoKit
import Foundation

struct APIError: Error {
    let message: String
    var status = 400
}

// The file API the page calls under /api/. Same endpoints and JSON as server.js in browser mode.
enum FileAPI {
    typealias JSON = [String: Any]

    static func handle(method: String, name: String, query: [String: String], body: Data) -> Response {
        do {
            let post: JSON
            if method == "POST" {
                let parsed = body.isEmpty ? [:] : try? JSONSerialization.jsonObject(with: body)
                guard let object = parsed as? JSON else { throw APIError(message: "JSON required", status: 415) }
                post = object
            } else {
                post = [:]
            }
            switch (method, name) {
            case ("GET", "info"): return .json(info())
            case ("GET", "ls"): return .json(try list(query["path"]))
            case ("GET", "stat"): return .json(try stat(query))
            case ("GET", "read"): return .json(try read(query))
            case ("POST", "write"): return .json(try write(post))
            case ("POST", "rename"): return .json(try rename(post))
            case ("POST", "mkdir"): return .json(try mkdir(post))
            case ("GET", "session"): return readSession()
            case ("POST", "session"): return .json(try writeSession(body))
            case ("POST", "find"): return .json(try FileSearch.find(post))
            case ("POST", "replace"): return .json(try FileSearch.replace(post))
            case ("GET", "hash"): return .json(try hash(query))
            case ("POST", "reveal"): return .json(try reveal(post))
            default: return .error("Unknown endpoint", status: 404)
            }
        } catch let error as APIError {
            return .error(error.message, status: error.status)
        } catch {
            return .error(error.localizedDescription)
        }
    }

    // MARK: Endpoints

    private static func info() -> JSON {
        ["home": NSHomeDirectory(), "sep": "/", "platform": "darwin",
         "cwd": FileManager.default.currentDirectoryPath, "version": AppInfo.version]
    }

    private static func list(_ path: String?) throws -> JSON {
        let dir = try absPath(path ?? NSHomeDirectory())
        let names: [String]
        do { names = try FileManager.default.contentsOfDirectory(atPath: dir) } catch { throw fsError(error, dir) }
        var entries: [(name: String, dir: Bool, json: JSON)] = []
        for name in names {
            let full = (dir as NSString).appendingPathComponent(name)
            let st = try? FileStat(full)
            let isDir = st?.isDir ?? ((try? FileStat(full, followLinks: false))?.isDir ?? false)
            entries.append((name, isDir, [
                "name": name, "dir": isDir,
                "size": st != nil && !isDir ? st!.size : NSNull(),
                "mtime": st?.mtime ?? NSNull(),
                "hidden": name.hasPrefix("."),
            ]))
        }
        entries.sort { a, b in
            if a.dir != b.dir { return a.dir }
            return a.name.compare(b.name, options: [.caseInsensitive, .diacriticInsensitive, .numeric], locale: .current) == .orderedAscending
        }
        let parent = (dir as NSString).deletingLastPathComponent
        return ["path": dir, "parent": parent != dir ? parent : NSNull(), "entries": entries.map(\.json)]
    }

    private static func stat(_ q: [String: String]) throws -> JSON {
        let p = try absPath(q["path"])
        guard let st = try? FileStat(p) else { return ["exists": false] }
        return ["exists": true, "dir": st.isDir, "size": st.size, "mtime": st.mtime, "ctime": st.birthtime, "writable": access(p, W_OK) == 0]
    }

    private static func read(_ q: [String: String]) throws -> JSON {
        let p = try absPath(q["path"])
        let st = try FileStat(p)
        if st.isDir { throw APIError(message: "\(p) is a directory") }
        if st.size > 64 * 1024 * 1024 { throw APIError(message: "File is too big to be opened (\(st.size) bytes)") }
        let data = try readFile(p)
        let text: String, encoding: String
        if let chosen = q["encoding"], !chosen.isEmpty {
            (text, encoding) = (TextCodec.decode(data, as: chosen), chosen)
        } else {
            (text, encoding) = TextCodec.decode(data)
        }
        return ["path": p, "content": text, "encoding": encoding, "eol": TextCodec.detectEol(text) ?? NSNull(),
                "mtime": st.mtime, "size": st.size, "writable": access(p, W_OK) == 0]
    }

    private static func write(_ body: JSON) throws -> JSON {
        let p = try absPath(body["path"] as? String)
        let content = body["content"] as? String ?? ""
        let encoding = body["encoding"] as? String ?? "utf8"
        do {
            try FileManager.default.createDirectory(atPath: (p as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
            // In place, not atomic, so links, permissions and the file's identity stay as they were.
            try TextCodec.encode(content, encoding).write(to: URL(fileURLWithPath: p))
        } catch { throw fsError(error, p) }
        let st = try FileStat(p)
        return ["path": p, "mtime": st.mtime, "size": st.size]
    }

    private static func rename(_ body: JSON) throws -> JSON {
        let from = try absPath(body["from"] as? String), to = try absPath(body["to"] as? String)
        if FileManager.default.fileExists(atPath: to) { throw APIError(message: "\(to) already exists") }
        if Darwin.rename(from, to) != 0 { throw posixError(errno, from) }
        return ["path": to]
    }

    private static func mkdir(_ body: JSON) throws -> JSON {
        let p = try absPath(body["path"] as? String)
        do { try FileManager.default.createDirectory(atPath: p, withIntermediateDirectories: true) } catch { throw fsError(error, p) }
        return ["path": p]
    }

    private static var sessionFile: String { (AppInfo.dataDir as NSString).appendingPathComponent("session.json") }

    private static func readSession() -> Response {
        guard let data = FileManager.default.contents(atPath: sessionFile),
              (try? JSONSerialization.jsonObject(with: data)) is JSON else { return .json([:]) }
        return Response(status: 200, headers: ["Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"], body: data)
    }

    // Writes to a temporary file and renames it, so a crash never leaves half a session.
    private static func writeSession(_ body: Data) throws -> JSON {
        try FileManager.default.createDirectory(atPath: AppInfo.dataDir, withIntermediateDirectories: true)
        let tmp = sessionFile + ".\(UUID().uuidString).tmp"
        try body.write(to: URL(fileURLWithPath: tmp))
        if Darwin.rename(tmp, sessionFile) != 0 {
            let code = errno
            unlink(tmp)
            throw posixError(code, sessionFile)
        }
        return ["ok": true]
    }

    private static func hash(_ q: [String: String]) throws -> JSON {
        let data = try readFile(try absPath(q["path"]))
        let digest: [UInt8]
        switch q["algo"] {
        case "md5": digest = Array(Insecure.MD5.hash(data: data))
        case "sha1": digest = Array(Insecure.SHA1.hash(data: data))
        case "sha256": digest = Array(SHA256.hash(data: data))
        case "sha512": digest = Array(SHA512.hash(data: data))
        default: throw APIError(message: "Unknown algorithm")
        }
        return ["hash": digest.map { String(format: "%02x", $0) }.joined()]
    }

    // Shows a file in Finder, or opens Terminal at its folder. No user-supplied commands.
    private static func reveal(_ body: JSON) throws -> JSON {
        let p = try absPath(body["path"] as? String)
        var isDir: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: p, isDirectory: &isDir)
        let dir = exists && isDir.boolValue ? p : (p as NSString).deletingLastPathComponent
        let args: [String]
        if body["how"] as? String == "terminal" { args = ["-a", "Terminal", dir] }
        else { args = exists ? ["-R", p] : [dir] }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        process.arguments = args
        try? process.run()
        process.waitUntilExit()
        return ["ok": true]
    }

    // MARK: Helpers

    static func absPath(_ path: String?) throws -> String {
        guard var p = path, !p.isEmpty else { throw APIError(message: "Missing path") }
        if p == "~" || p.hasPrefix("~/") { p = NSHomeDirectory() + p.dropFirst() }
        let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
        return URL(fileURLWithPath: p, relativeTo: cwd).standardized.path
    }

    static func readFile(_ path: String) throws -> Data {
        do { return try Data(contentsOf: URL(fileURLWithPath: path)) } catch { throw fsError(error, path) }
    }

    static func posixError(_ code: Int32, _ path: String) -> APIError {
        APIError(message: "\(String(cString: strerror(code))): \(path)", status: code == ENOENT ? 404 : 400)
    }

    private static func fsError(_ error: Error, _ path: String) -> APIError {
        if let posix = (error as NSError).userInfo[NSUnderlyingErrorKey] as? NSError, posix.domain == NSPOSIXErrorDomain {
            return posixError(Int32(posix.code), path)
        }
        return APIError(message: error.localizedDescription)
    }
}

// stat(2), following symlinks like Node's fs.stat unless told otherwise.
struct FileStat {
    let isDir: Bool
    let isFile: Bool
    let size: Int64
    let mtime: Double
    let birthtime: Double

    init(_ path: String, followLinks: Bool = true) throws {
        var st = stat()
        let call: (UnsafePointer<CChar>, UnsafeMutablePointer<stat>) -> Int32 = followLinks ? stat : lstat
        let result = call(path, &st)
        if result != 0 { throw FileAPI.posixError(errno, path) }
        let type = st.st_mode & S_IFMT
        isDir = type == S_IFDIR
        isFile = type == S_IFREG
        size = Int64(st.st_size)
        func ms(_ t: timespec) -> Double { Double(t.tv_sec) * 1000 + Double(t.tv_nsec) / 1_000_000 }
        mtime = ms(st.st_mtimespec)
        birthtime = ms(st.st_birthtimespec)
    }
}
