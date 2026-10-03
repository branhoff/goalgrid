#!/usr/bin/env python3
"""Print habit-hooks findings JSON for structural smells in C sources.

Usage: c_structure.py [--max-function-lines N] [--max-params N]
                      [--max-nesting N] FILE...

Smell names reuse the habit-hooks vocabulary so the core guides apply.
"""

import argparse
import bisect
import json
import re
import sys

WHY_MARKERS = re.compile(
    r"\b(because|so that|otherwise|workaround|note|must|avoid|reserved|unlike|since|"
    r"never|always|only|not|cannot|can't|without|instead|unless|hack|todo|fixme)\b",
    re.IGNORECASE,
)
CONTROL_KEYWORDS = {"if", "for", "while", "switch", "else", "do"}


def blank_out(text):
    """Replace comments, strings and char literals with spaces, keeping newlines."""
    out, i, n = [], 0, len(text)
    while i < n:
        two = text[i : i + 2]
        if two == "//":
            j = text.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i))
            i = j
        elif two == "/*":
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(re.sub(r"[^\n]", " ", text[i:j]))
            i = j
        elif text[i] in "\"'":
            quote, j = text[i], i + 1
            while j < n and text[j] != quote:
                j += 2 if text[j] == "\\" else 1
            j = min(j + 1, n)
            out.append(quote + " " * (j - i - 2) + quote if j - i >= 2 else quote)
            i = j
        else:
            out.append(text[i])
            i += 1
    return blank_preprocessor("".join(out))


def blank_preprocessor(code):
    """Blank #directives (including backslash continuations), keeping line numbers."""
    lines, in_directive = code.split("\n"), False
    for index, line in enumerate(lines):
        if in_directive or line.lstrip().startswith("#"):
            in_directive = line.rstrip().endswith("\\")
            lines[index] = " " * len(line)
    return "\n".join(lines)


def param_count(header):
    inner = header[header.index("(") + 1 : header.rindex(")")].strip()
    if inner in ("", "void"):
        return 0
    depth, commas = 0, 0
    for ch in inner:
        depth += ch in "(["
        depth -= ch in ")]"
        commas += ch == "," and depth == 0
    return commas + 1


def open_function(header, line):
    header = header.strip()
    named = re.search(r"(\w+)\s*\(", header)
    if header.endswith(")") and named and named.group(1) not in CONTROL_KEYWORDS:
        return {"name": named.group(1), "start": line, "params": param_count(header), "deepest": 0}
    return None


def functions(code):
    """Yield (name, start_line, end_line, params, deepest_control_nesting) per definition."""
    line_starts = [m.end() for m in re.finditer("\n", code)]
    depth, func, start = 0, None, 0
    for match in re.finditer(r"[{};]", code):
        char, pos = match.group(), match.start()
        line = bisect.bisect_right(line_starts, pos) + 1
        if char == "{":
            if depth == 0:
                func = open_function(code[start:pos], line)
            elif func and is_control_block(code[start:pos]):
                func["deepest"] = max(func["deepest"], depth)
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0 and func:
                yield func["name"], func["start"], line, func["params"], func["deepest"]
                func = None
        start = pos + 1


def is_control_block(header):
    header = header.strip()
    return bool(re.match(r"(if|for|while|switch)\b.*\)$|else\b|do$", header, re.S))


def words(text):
    parts = re.findall(r"[A-Za-z][a-z0-9]*", text.replace("_", " "))
    return {p.lower() for p in parts if len(p) >= 3}


def narrating_comments(lines):
    for index, raw in enumerate(lines):
        stripped = raw.strip()
        continues_block = index > 0 and lines[index - 1].strip().startswith("//")
        if not stripped.startswith("//") or continues_block or WHY_MARKERS.search(stripped):
            continue
        following = next((text for text in lines[index + 1 :] if text.strip()), "")
        comment_words = words(stripped[2:])
        if (
            0 < len(comment_words) <= 8
            and len(comment_words & words(following)) / len(comment_words) >= 0.5
        ):
            yield index + 1


def scan(path, limits):
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    lines = text.splitlines()
    found = []
    for name, start, end, params, deepest in functions(blank_out(text)):
        where = f"{path}:{name}"
        if end - start + 1 > limits.max_function_lines:
            found.append(
                (
                    "oversized-function",
                    where,
                    start,
                    f"{end - start + 1} lines (max {limits.max_function_lines})",
                )
            )
        if params > limits.max_params:
            found.append(
                (
                    "too-many-parameters",
                    where,
                    start,
                    f"{params} parameters (max {limits.max_params})",
                )
            )
        if deepest > limits.max_nesting:
            found.append(
                ("deep-nesting", where, start, f"nesting {deepest} (max {limits.max_nesting})")
            )
    for line in narrating_comments(lines):
        found.append(
            ("non-essential-comment", f"{path}:{line}", line, "comment restates the next line")
        )
    return found


def run(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-function-lines", type=int, default=40)
    parser.add_argument("--max-params", type=int, default=4)
    parser.add_argument("--max-nesting", type=int, default=3)
    parser.add_argument("files", nargs="*")
    args = parser.parse_args(argv)

    grouped = {}
    for path in args.files:
        for smell, key, line, message in scan(path, args):
            grouped.setdefault(smell, []).append(
                {"key": key, "details": {"file": path, "line": line, "content": message}}
            )
    return [
        {"smell": smell, "details": {}, "issues": sorted(issues, key=lambda issue: issue["key"])}
        for smell, issues in sorted(grouped.items())
    ]


def main():
    json.dump(run(sys.argv[1:]), sys.stdout)


if __name__ == "__main__":
    main()
