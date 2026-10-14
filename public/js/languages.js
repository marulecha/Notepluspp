'use strict';
// Languages offered in the Language menu, with their CodeMirror mode and file extensions.

CodeMirror.defineSimpleMode('batch', {
  start: [
    { regex: /^\s*(?:rem\b|::).*/i, token: 'comment' },
    { regex: /"(?:[^"\\]|\\.)*"?/, token: 'string' },
    { regex: /\b(?:if|else|for|in|do|goto|call|exit|not|exist|defined|errorlevel|equ|neq|lss|leq|gtr|geq|set|setlocal|endlocal|echo|shift|pause|cls|cd|chdir|copy|del|dir|md|mkdir|move|rd|rmdir|ren|rename|start|title|type|pushd|popd|choice|color|errorlevel)\b/i, token: 'keyword' },
    { regex: /^\s*:\w+/, token: 'def' },
    { regex: /%~?[\w]*%?|!\w+!/, token: 'variable-2' },
    { regex: /@|[<>|&]/, token: 'operator' },
    { regex: /\b\d+\b/, token: 'number' },
  ],
  meta: { lineComment: 'REM ' },
});

const LANGUAGES = [
  { id: 'text', name: 'Normal Text', menu: 'None (Normal Text)', desc: 'Normal text file', mode: null, ext: ['txt', 'log', 'text'] },
  { id: 'asm', name: 'Assembly', desc: 'Assembly language source file', mode: { name: 'gas', architecture: 'x86' }, ext: ['asm', 's'] },
  { id: 'batch', name: 'Batch', desc: 'Batch file', mode: 'batch', ext: ['bat', 'cmd', 'nt'] },
  { id: 'c', name: 'C', desc: 'C source file', mode: 'text/x-csrc', ext: ['c', 'lex'] },
  { id: 'cs', name: 'C#', desc: 'C# source file', mode: 'text/x-csharp', ext: ['cs'] },
  { id: 'cpp', name: 'C++', desc: 'C++ source file', mode: 'text/x-c++src', ext: ['cpp', 'cxx', 'cc', 'h', 'hh', 'hpp', 'hxx', 'ino'] },
  { id: 'cmake', name: 'CMake', desc: 'CMake file', mode: 'cmake', ext: ['cmake'], names: ['cmakelists.txt'] },
  { id: 'coffee', name: 'CoffeeScript', desc: 'CoffeeScript file', mode: 'coffeescript', ext: ['coffee'] },
  { id: 'css', name: 'CSS', desc: 'Cascade Style Sheets File', mode: 'css', ext: ['css'] },
  { id: 'd', name: 'D', desc: 'D programming language', mode: 'd', ext: ['d'] },
  { id: 'diff', name: 'Diff', desc: 'Diff file', mode: 'diff', ext: ['diff', 'patch'] },
  { id: 'dockerfile', name: 'Dockerfile', desc: 'Dockerfile', mode: 'dockerfile', ext: ['dockerfile'], names: ['dockerfile'] },
  { id: 'erlang', name: 'Erlang', desc: 'Erlang file', mode: 'erlang', ext: ['erl', 'hrl'] },
  { id: 'fortran', name: 'Fortran (free form)', desc: 'Fortran free form source file', mode: 'fortran', ext: ['f', 'for', 'f90', 'f95', 'f2k'] },
  { id: 'fsharp', name: 'F#', desc: 'F# source file', mode: 'text/x-fsharp', ext: ['fs', 'fsx', 'fsi'] },
  { id: 'go', name: 'Go', desc: 'Go source file', mode: 'go', ext: ['go'] },
  { id: 'groovy', name: 'Groovy', desc: 'Groovy source file', mode: 'groovy', ext: ['groovy', 'gradle'] },
  { id: 'haskell', name: 'Haskell', desc: 'Haskell', mode: 'haskell', ext: ['hs', 'lhs'] },
  { id: 'html', name: 'HTML', desc: 'Hyper Text Markup Language file', mode: 'htmlmixed', ext: ['html', 'htm', 'shtml', 'shtm', 'xhtml', 'xht', 'hta'] },
  { id: 'ini', name: 'ini', desc: 'MS ini file', mode: 'properties', ext: ['ini', 'inf', 'url', 'wer', 'cfg', 'conf', 'editorconfig'], names: ['.gitconfig', '.editorconfig'] },
  { id: 'java', name: 'Java', desc: 'Java source file', mode: 'text/x-java', ext: ['java'] },
  { id: 'javascript', name: 'JavaScript', desc: 'JavaScript file', mode: 'javascript', ext: ['js', 'mjs', 'cjs', 'jsx', 'jsm'] },
  { id: 'json', name: 'JSON', desc: 'JSON file', mode: { name: 'javascript', json: true }, ext: ['json', 'jsonc', 'webmanifest'] },
  { id: 'julia', name: 'Julia', desc: 'Julia source file', mode: 'julia', ext: ['jl'] },
  { id: 'kotlin', name: 'Kotlin', desc: 'Kotlin source file', mode: 'text/x-kotlin', ext: ['kt', 'kts'] },
  { id: 'latex', name: 'LaTeX', desc: 'LaTeX file', mode: 'stex', ext: ['tex', 'sty', 'cls', 'ltx'] },
  { id: 'lisp', name: 'Lisp', desc: 'List Processing language file', mode: 'commonlisp', ext: ['lsp', 'lisp', 'cl'] },
  { id: 'lua', name: 'Lua', desc: 'Lua source File', mode: 'lua', ext: ['lua'] },
  { id: 'markdown', name: 'Markdown', desc: 'Markdown file', mode: 'markdown', ext: ['md', 'markdown', 'mdown', 'mkd'] },
  { id: 'matlab', name: 'Matlab', desc: 'Matrix Laboratory file', mode: 'octave', ext: ['m'] },
  { id: 'nsis', name: 'NSIS', desc: 'Nullsoft Scriptable Install System script file', mode: 'nsis', ext: ['nsi', 'nsh'] },
  { id: 'objc', name: 'Objective-C', desc: 'Objective-C source file', mode: 'text/x-objectivec', ext: ['mm'] },
  { id: 'ocaml', name: 'OCaml', desc: 'OCaml source file', mode: 'text/x-ocaml', ext: ['ml', 'mli'] },
  { id: 'pascal', name: 'Pascal', desc: 'Pascal source file', mode: 'pascal', ext: ['pas', 'pp', 'p', 'inc', 'lpr', 'dpr'] },
  { id: 'perl', name: 'Perl', desc: 'Perl source file', mode: 'perl', ext: ['pl', 'pm', 'plx'] },
  { id: 'php', name: 'PHP', desc: 'PHP Hypertext Preprocessor file', mode: 'application/x-httpd-php', ext: ['php', 'php3', 'php4', 'php5', 'phps', 'phpt', 'phtml'] },
  { id: 'powershell', name: 'PowerShell', desc: 'Windows PowerShell', mode: 'powershell', ext: ['ps1', 'psm1', 'psd1'] },
  { id: 'props', name: 'Properties', desc: 'Properties file', mode: 'properties', ext: ['properties', 'env'], names: ['.env'] },
  { id: 'python', name: 'Python', desc: 'Python file', mode: 'python', ext: ['py', 'pyw', 'pyi'] },
  { id: 'r', name: 'R', desc: 'R programming language', mode: 'r', ext: ['r', 'rdata', 'rds', 'rda'] },
  { id: 'ruby', name: 'Ruby', desc: 'Ruby file', mode: 'ruby', ext: ['rb', 'rbw', 'gemspec', 'rake'], names: ['gemfile', 'rakefile'] },
  { id: 'rust', name: 'Rust', desc: 'Rust file', mode: 'rust', ext: ['rs'] },
  { id: 'scala', name: 'Scala', desc: 'Scala source file', mode: 'text/x-scala', ext: ['scala', 'sc'] },
  { id: 'scheme', name: 'Scheme', desc: 'Scheme file', mode: 'scheme', ext: ['scm', 'smd', 'ss'] },
  { id: 'shell', name: 'Shell', desc: 'Unix script file', mode: 'shell', ext: ['sh', 'bsh', 'bash', 'zsh', 'ksh', 'csh', 'command'], names: ['.bashrc', '.zshrc', '.profile', '.bash_profile', '.zprofile'] },
  { id: 'smalltalk', name: 'Smalltalk', desc: 'Smalltalk file', mode: 'smalltalk', ext: ['st'] },
  { id: 'sql', name: 'SQL', desc: 'Structured Query Language file', mode: 'text/x-sql', ext: ['sql'] },
  { id: 'swift', name: 'Swift', desc: 'Swift file', mode: 'swift', ext: ['swift'] },
  { id: 'tcl', name: 'TCL', desc: 'Tool Command Language file', mode: 'tcl', ext: ['tcl'] },
  { id: 'toml', name: 'TOML', desc: "Tom's Obvious Minimal Language file", mode: 'toml', ext: ['toml'] },
  { id: 'typescript', name: 'TypeScript', desc: 'TypeScript file', mode: { name: 'javascript', typescript: true }, ext: ['ts', 'tsx', 'mts', 'cts'] },
  { id: 'vb', name: 'Visual Basic', desc: 'Visual Basic file', mode: 'vb', ext: ['vb', 'vbs', 'bas', 'frm', 'cls'] },
  { id: 'verilog', name: 'Verilog', desc: 'Verilog file', mode: 'verilog', ext: ['v', 'sv', 'vh', 'svh'] },
  { id: 'vhdl', name: 'VHDL', desc: 'VHSIC Hardware Description Language file', mode: 'vhdl', ext: ['vhd', 'vhdl', 'vho'] },
  { id: 'xml', name: 'XML', desc: 'eXtensible Markup Language file', mode: 'xml', ext: ['xml', 'xsl', 'xsd', 'xslt', 'svg', 'xaml', 'xul', 'kml', 'plist', 'csproj', 'vcxproj', 'resx', 'config', 'rss', 'atom', 'wsdl'] },
  { id: 'yaml', name: 'YAML', desc: "YAML Ain't Markup Language", mode: 'yaml', ext: ['yml', 'yaml'] },
];

const LANG_BY_ID = Object.fromEntries(LANGUAGES.map((l) => [l.id, l]));

function detectLanguage(fileName, firstLine) {
  const name = basename(fileName || '').toLowerCase();
  for (const l of LANGUAGES) if (l.names && l.names.includes(name)) return l.id;
  const ext = extname(name);
  if (ext) for (const l of LANGUAGES) if (l.ext.includes(ext)) return l.id;
  if (firstLine && firstLine.startsWith('#!')) {
    if (/python/.test(firstLine)) return 'python';
    if (/node|deno|bun/.test(firstLine)) return 'javascript';
    if (/ruby/.test(firstLine)) return 'ruby';
    if (/perl/.test(firstLine)) return 'perl';
    if (/(ba|z|k|c)?sh\b/.test(firstLine)) return 'shell';
  }
  if (firstLine && /^\s*<\?xml/.test(firstLine)) return 'xml';
  if (firstLine && /^\s*<!doctype html/i.test(firstLine)) return 'html';
  return 'text';
}

// Function List rules: each regex's first capture group is the function name.
const FUNC_RULES = (() => {
  const cKeywords = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'else', 'do', 'new', 'delete', 'throw', 'function', 'typeof', 'with', 'elif']);
  const clike = [{ re: /^[ \t]*(?:[\w:<>,*&~\[\]]+[ \t*&]+)+([A-Za-z_~][\w:~]*)\s*\([^;{}]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:override\s*)?\{?\s*$/, skip: cKeywords }];
  const js = [
    { re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/ },
    { re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/ },
    { re: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, kind: 'class' },
    { re: /^\s*(?:(?:public|private|protected|static|async|get|set|override|readonly)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^={]+)?\{\s*$/, skip: cKeywords },
    { re: /^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/ },
  ];
  return {
    javascript: js, typescript: js,
    c: clike, cpp: clike, cs: clike, java: clike, objc: clike, d: clike, kotlin: [{ re: /^\s*(?:\w+\s+)*fun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(\w+)/ }, { re: /^\s*(?:\w+\s+)*class\s+(\w+)/, kind: 'class' }],
    python: [{ re: /^\s*(?:async\s+)?def\s+(\w+)/ }, { re: /^\s*class\s+(\w+)/, kind: 'class' }],
    php: [{ re: /^\s*(?:(?:public|private|protected|static|abstract|final)\s+)*function\s+&?(\w+)/ }, { re: /^\s*(?:abstract\s+|final\s+)?class\s+(\w+)/, kind: 'class' }],
    ruby: [{ re: /^\s*def\s+(?:self\.)?([\w?!=]+)/ }, { re: /^\s*(?:class|module)\s+([\w:]+)/, kind: 'class' }],
    go: [{ re: /^func\s+(?:\([^)]*\)\s*)?(\w+)/ }, { re: /^type\s+(\w+)\s+struct/, kind: 'class' }],
    rust: [{ re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+(\w+)/ }, { re: /^\s*(?:pub\s+)?(?:struct|enum|trait|impl)\s+(?:<[^>]*>\s*)?(\w+)/, kind: 'class' }],
    shell: [{ re: /^\s*(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\s*\)\s*\{?/ }, { re: /^\s*function\s+([A-Za-z_][\w-]*)/ }],
    batch: [{ re: /^\s*:(\w+)/ }],
    lua: [{ re: /^\s*(?:local\s+)?function\s+([\w.:]+)/ }],
    perl: [{ re: /^\s*sub\s+(\w+)/ }],
    swift: [{ re: /^\s*(?:\w+\s+)*func\s+(\w+)/ }, { re: /^\s*(?:\w+\s+)*(?:class|struct|enum|protocol)\s+(\w+)/, kind: 'class' }],
    scala: [{ re: /^\s*(?:\w+\s+)*def\s+(\w+)/ }, { re: /^\s*(?:\w+\s+)*(?:class|object|trait)\s+(\w+)/, kind: 'class' }],
    powershell: [{ re: /^\s*function\s+([\w-]+)/i }],
    vb: [{ re: /^\s*(?:(?:public|private|friend|protected|shared|overrides)\s+)*(?:sub|function)\s+(\w+)/i }],
    pascal: [{ re: /^\s*(?:procedure|function)\s+([\w.]+)/i }],
    sql: [{ re: /^\s*create\s+(?:or\s+replace\s+)?(?:procedure|function|view|table|trigger)\s+([\w.\[\]"`]+)/i }],
    markdown: [{ re: /^(#{1,6}\s+.+)$/ }],
    ini: [{ re: /^\s*\[([^\]]+)\]/ }],
    props: [{ re: /^\s*\[([^\]]+)\]/ }],
    toml: [{ re: /^\s*\[+([^\]]+)\]+/ }],
    erlang: [{ re: /^([a-z]\w*)\s*\(/ }],
    haskell: [{ re: /^([a-z_]\w*)\s*::/ }],
    r: [{ re: /^\s*([\w.]+)\s*(?:<-|=)\s*function\b/ }],
    julia: [{ re: /^\s*function\s+([\w.!]+)/ }],
    groovy: [{ re: /^\s*(?:def|void|\w+)\s+(\w+)\s*\([^)]*\)\s*\{/, skip: cKeywords }],
  };
})();
