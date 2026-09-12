"""Supply UUID-matched dSYMs for Xcode's code-free static-framework stubs.

Actual SDK code is statically linked into the app. Never manufacture symbols for
a real executable: only Xcode stubs with zero-sized sections and no symbols qualify.
Run after archiving, before export. Privacy manifests and signed binaries stay intact.
"""
import os
from pathlib import Path
import re
import subprocess
import sys


def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT)


def uuids(path):
    return set(re.findall(r"UUID: ([A-F0-9-]+) \(([^)]+)\)",
                          run("xcrun", "dwarfdump", "--uuid", str(path))))


def main():
    archive = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ["ARCHIVE_PATH"])
    if not (archive / "Products/Applications").is_dir():
        raise RuntimeError(f"Not an archive: {archive}")
    for framework in sorted((archive / "Products/Applications").glob("*.app/Frameworks/*.framework")):
        binary = framework / framework.stem
        dsym = archive / "dSYMs" / (framework.name + ".dSYM")
        if not binary.is_file():
            continue
        if dsym.exists():
            if not uuids(binary) or uuids(dsym) != uuids(binary):
                raise RuntimeError(f"Existing dSYM UUID mismatch: {dsym}")
            continue
        commands = run("xcrun", "otool", "-l", str(binary))
        sections = re.findall(r"^\s+size (0x[0-9a-fA-F]+)$", commands, re.MULTILINE)
        symbols = run("xcrun", "nm", "-j", str(binary))
        # Static-framework stubs have LC_ID_DYLIB pointing at swbuild.tmp,
        # zero section bytes, and nm explicitly reports no symbols.
        if not ("swbuild.tmp." in commands and sections
                and all(int(size, 16) == 0 for size in sections)
                and "no symbols" in symbols):
            raise RuntimeError(f"Missing vendor dSYM for real code: {framework.name}")
        expected = uuids(binary)
        if not expected:
            raise RuntimeError(f"No UUID: {binary}")
        run("xcrun", "dsymutil", str(binary), "-o", str(dsym))
        if uuids(dsym) != expected:
            raise RuntimeError(f"UUID mismatch: {dsym}")
        print(f"Matched code-free stub dSYM: {framework.name}")


if __name__ == "__main__":
    main()
