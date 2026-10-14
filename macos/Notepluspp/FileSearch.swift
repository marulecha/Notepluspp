import Foundation
import JavaScriptCore

// Find in Files and Replace in Files. The page sends JavaScript regular expressions, so matching
// runs in JavaScriptCore to give the same results as the editor's own Find. Swift walks the folder
// and reads, decodes and writes the files.
enum FileSearch {
    private static let maxFiles = 50_000
    private static let maxHits = 20_000
    private static let maxFileSize: Int64 = 20 * 1024 * 1024

    private static let script = #"""
    function makeFilter(filters) {
      const parts = String(filters || '*.*').split(/[\s;,]+/).filter(Boolean);
      const toRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      const inc = [], exc = [];
      for (const p of parts) {
        if (p.startsWith('!')) exc.push(toRe(p.slice(1)));
        else inc.push(p === '*.*' ? /.*/ : toRe(p));
      }
      if (!inc.length) inc.push(/.*/);
      return (name) => inc.some((r) => r.test(name)) && !exc.some((r) => r.test(name));
    }

    function compile(source, flags) {
      return new RegExp(source, flags.includes('g') ? flags : flags + 'g');
    }

    function lineStarts(text) {
      const starts = [0];
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c === 10) starts.push(i + 1);
        else if (c === 13) { if (text.charCodeAt(i + 1) === 10) i++; starts.push(i + 1); }
      }
      return starts;
    }

    function lineOf(starts, idx) {
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= idx) lo = mid; else hi = mid - 1;
      }
      return lo;
    }

    // Returns the matching lines, each with the column ranges of its matches.
    function searchText(text, re, maxHits) {
      re.lastIndex = 0;
      let m, starts = null, hits = 0;
      const lines = [];
      while (hits < maxHits && (m = re.exec(text))) {
        if (m[0].length === 0) re.lastIndex++;
        if (!starts) starts = lineStarts(text);
        const ln = lineOf(starts, m.index);
        const ls = starts[ln];
        let le = ln + 1 < starts.length ? starts[ln + 1] : text.length;
        while (le > ls && (text[le - 1] === '\n' || text[le - 1] === '\r')) le--;
        const prev = lines[lines.length - 1];
        const col = m.index - ls;
        const end = Math.min(col + m[0].length, le - ls);
        if (prev && prev.line === ln) prev.ranges.push([col, end]);
        else lines.push({ line: ln, text: text.slice(ls, Math.min(le, ls + 1000)), ranges: [[col, end]] });
        hits++;
      }
      return { hits, lines };
    }

    // Applies a JS-style replacement string ($1, $&, $$) given String.replace callback args.
    function expandJsReplacement(rep, args) {
      let groups = args[args.length - 1];
      const hasNamed = typeof groups === 'object' && groups !== null;
      const caps = args.slice(0, hasNamed ? -3 : -2);
      if (!hasNamed) groups = null;
      return rep.replace(/\$(\$|&|\d{1,2}|<([^>]+)>)/g, (all, tok, name) => {
        if (tok === '$') return '$';
        if (tok === '&') return caps[0];
        if (name !== undefined) return groups && groups[name] != null ? groups[name] : '';
        const n = parseInt(tok, 10);
        return n < caps.length ? (caps[n] == null ? '' : caps[n]) : all;
      });
    }

    function replaceText(text, re, replacement) {
      let count = 0;
      const out = text.replace(re, (...args) => { count++; return expandJsReplacement(replacement, args); });
      return { count, changed: count > 0 && out !== text, text: out };
    }
    """#

    // One context per request: JSContext isn't safe to share across the scheme handler's threads.
    private final class Engine {
        let context = JSContext()!
        let regex: JSValue
        let accepts: JSValue

        init(_ body: FileAPI.JSON) throws {
            context.evaluateScript(script)
            regex = context.objectForKeyedSubscript("compile").call(withArguments: [body["source"] as? String ?? "", body["flags"] as? String ?? ""])
            try Engine.check(context)
            accepts = context.objectForKeyedSubscript("makeFilter").call(withArguments: [body["filters"] as? String ?? "*.*"])
            try Engine.check(context)
        }

        func call(_ name: String, _ args: [Any]) throws -> [String: Any] {
            let result = context.objectForKeyedSubscript(name).call(withArguments: args)
            try Engine.check(context)
            return result?.toDictionary() as? [String: Any] ?? [:]
        }

        private static func check(_ context: JSContext) throws {
            if let exception = context.exception {
                context.exception = nil
                throw APIError(message: exception.toString())
            }
        }
    }

    static func find(_ body: FileAPI.JSON) throws -> FileAPI.JSON {
        let engine = try Engine(body)
        let files = try listFiles(body, engine)
        var results: [FileAPI.JSON] = []
        var hits = 0
        for file in files {
            if hits >= maxHits { break }
            guard let text = readText(file)?.text else { continue }
            let found = try engine.call("searchText", [text, engine.regex, maxHits - hits])
            let lines = found["lines"] as? [[String: Any]] ?? []
            let n = (found["hits"] as? NSNumber)?.intValue ?? 0
            hits += n
            if !lines.isEmpty { results.append(["path": file, "hits": n, "lines": lines]) }
        }
        return ["searched": files.count, "hits": hits, "results": results]
    }

    static func replace(_ body: FileAPI.JSON) throws -> FileAPI.JSON {
        let engine = try Engine(body)
        let files = try listFiles(body, engine)
        let replacement = body["replacement"] as? String ?? ""
        var count = 0, changed = 0
        for file in files {
            guard let (text, encoding) = readText(file) else { continue }
            let result = try engine.call("replaceText", [text, engine.regex, replacement])
            guard result["changed"] as? Bool == true, let out = result["text"] as? String else { continue }
            do { try TextCodec.encode(out, encoding).write(to: URL(fileURLWithPath: file)) } catch { continue }
            count += (result["count"] as? NSNumber)?.intValue ?? 0
            changed += 1
        }
        return ["count": count, "files": changed, "searched": files.count]
    }

    private static func listFiles(_ body: FileAPI.JSON, _ engine: Engine) throws -> [String] {
        let dir = try FileAPI.absPath(body["dir"] as? String)
        var out: [String] = []
        walk(dir, hidden: body["hidden"] as? Bool ?? false, subfolders: body["subfolders"] as? Bool ?? true, accepts: engine.accepts, into: &out)
        return out
    }

    // Symlinks are skipped, as Node's readdir with file types does in browser mode.
    private static func walk(_ dir: String, hidden: Bool, subfolders: Bool, accepts: JSValue, into out: inout [String]) {
        guard let names = try? FileManager.default.contentsOfDirectory(atPath: dir).sorted() else { return }
        for name in names {
            if out.count >= maxFiles { return }
            if !hidden && name.hasPrefix(".") { continue }
            let full = (dir as NSString).appendingPathComponent(name)
            guard let st = try? FileStat(full, followLinks: false) else { continue }
            if st.isDir {
                if subfolders { walk(full, hidden: hidden, subfolders: subfolders, accepts: accepts, into: &out) }
            } else if st.isFile && accepts.call(withArguments: [name]).toBool() {
                out.append(full)
            }
        }
    }

    private static func readText(_ file: String) -> (text: String, encoding: String)? {
        guard let st = try? FileStat(file), st.size <= maxFileSize,
              let data = try? Data(contentsOf: URL(fileURLWithPath: file)),
              !TextCodec.isBinary(data) else { return nil }
        return TextCodec.decode(data)
    }
}
