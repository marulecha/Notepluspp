import Foundation

// Encoding ids shared with the page: utf8, utf8bom, utf16le, utf16be, ansi.
// "ansi" is Latin-1: each byte is one character, as Node's latin1 does in browser mode.
enum TextCodec {
    static func decode(_ data: Data) -> (text: String, encoding: String) {
        let b = [UInt8](data.prefix(3))
        if b.count >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF {
            return (String(decoding: data.dropFirst(3), as: UTF8.self), "utf8bom")
        }
        if b.count >= 2 && b[0] == 0xFF && b[1] == 0xFE { return (utf16(data.dropFirst(2), bigEndian: false), "utf16le") }
        if b.count >= 2 && b[0] == 0xFE && b[1] == 0xFF { return (utf16(data.dropFirst(2), bigEndian: true), "utf16be") }
        if let text = String(data: data, encoding: .utf8) { return (text, "utf8") }
        return (latin1(data), "ansi")
    }

    // Decodes with a caller-chosen encoding (Encoding > Encode in ...), dropping a matching BOM.
    static func decode(_ data: Data, as encoding: String) -> String {
        func has(_ bom: [UInt8]) -> Bool { data.starts(with: bom) }
        switch encoding {
        case "ansi": return latin1(data)
        case "utf16le": return utf16(data.dropFirst(has([0xFF, 0xFE]) ? 2 : 0), bigEndian: false)
        case "utf16be": return utf16(data.dropFirst(has([0xFE, 0xFF]) ? 2 : 0), bigEndian: true)
        default: return String(decoding: data.dropFirst(has([0xEF, 0xBB, 0xBF]) ? 3 : 0), as: UTF8.self)
        }
    }

    static func encode(_ text: String, _ encoding: String) -> Data {
        switch encoding {
        case "utf8bom": return Data([0xEF, 0xBB, 0xBF]) + Data(text.utf8)
        case "utf16le": return Data([0xFF, 0xFE]) + Data(text.utf16.flatMap { [UInt8($0 & 0xFF), UInt8($0 >> 8)] })
        case "utf16be": return Data([0xFE, 0xFF]) + Data(text.utf16.flatMap { [UInt8($0 >> 8), UInt8($0 & 0xFF)] })
        case "ansi": return Data(text.utf16.map { UInt8(truncatingIfNeeded: $0) })
        default: return Data(text.utf8)
        }
    }

    static func detectEol(_ text: String) -> String? {
        let units = text.utf16
        guard let i = units.firstIndex(where: { $0 == 10 || $0 == 13 }) else { return nil }
        if units[i] == 10 { return "\n" }
        let next = units.index(after: i)
        return next < units.endIndex && units[next] == 10 ? "\r\n" : "\r"
    }

    static func isBinary(_ data: Data) -> Bool {
        if data.starts(with: [0xFF, 0xFE]) || data.starts(with: [0xFE, 0xFF]) { return false }
        return data.prefix(8000).contains(0)
    }

    private static func latin1(_ data: Data) -> String {
        String(data: data, encoding: .isoLatin1) ?? ""
    }

    // A trailing odd byte is dropped, and unpaired surrogates become U+FFFD.
    private static func utf16(_ data: Data, bigEndian: Bool) -> String {
        let bytes = [UInt8](data)
        var units = [UInt16]()
        units.reserveCapacity(bytes.count / 2)
        var i = 0
        while i + 1 < bytes.count {
            let hi = bigEndian ? bytes[i] : bytes[i + 1]
            let lo = bigEndian ? bytes[i + 1] : bytes[i]
            units.append(UInt16(hi) << 8 | UInt16(lo))
            i += 2
        }
        return String(decoding: units, as: UTF16.self)
    }
}
