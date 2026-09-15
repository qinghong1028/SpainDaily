#!/usr/bin/env python3
"""Create a SpainDaily encrypted package without logging the password.

The password is read from an environment variable named by --password-env.
The plaintext staging directory and output package should both remain outside Git.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import struct
import tempfile
import zipfile
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

MAGIC = b"SPAINDAILY1\n"
ITERATIONS = 310_000


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--trip-json", type=Path, required=True)
    parser.add_argument("--attachments-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--password-env", default="SPAINDAILY_PACKAGE_PASSWORD")
    return parser.parse_args()


def derive(password: str, salt: bytes) -> bytes:
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS).derive(password.encode("utf-8"))


def main():
    args = arguments()
    password = os.environ.get(args.password_env)
    if not password:
        raise SystemExit(f"Missing password environment variable: {args.password_env}")
    if len(password) < 8:
        raise SystemExit("Password must contain at least 8 characters")
    trip = json.loads(args.trip_json.read_text(encoding="utf-8"))
    if trip.get("schemaVersion") != 1:
        raise SystemExit("Only schemaVersion 1 is supported")
    attachment_rows = trip.get("attachments", [])
    with tempfile.NamedTemporaryFile(suffix=".zip") as temporary:
        with zipfile.ZipFile(temporary.name, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr("trip.json", json.dumps(trip, ensure_ascii=False, separators=(",", ":")))
            for row in attachment_rows:
                relative = Path(row["path"])
                if relative.is_absolute() or ".." in relative.parts or relative.parts[0] != "attachments":
                    raise SystemExit(f"Unsafe attachment path: {relative}")
                source = args.attachments_root / relative.relative_to("attachments")
                if not source.is_file():
                    raise SystemExit(f"Missing attachment: {source}")
                payload = source.read_bytes()
                digest = hashlib.sha256(payload).hexdigest()
                if digest != row["sha256"] or len(payload) != row["size"]:
                    raise SystemExit(f"Attachment manifest mismatch: {source.name}")
                archive.writestr(relative.as_posix(), payload)
        zipped = Path(temporary.name).read_bytes()
    salt, iv = os.urandom(16), os.urandom(12)
    header = {
        "packageFormat": 1,
        "schemaVersion": 1,
        "kdf": {"name": "PBKDF2", "hash": "SHA-256", "iterations": ITERATIONS, "salt": base64.b64encode(salt).decode("ascii")},
        "cipher": {"name": "AES-GCM", "iv": base64.b64encode(iv).decode("ascii")},
        "payloadSha256": hashlib.sha256(zipped).hexdigest(),
        "createdAt": trip.get("createdAt"),
        "kind": "trip",
    }
    header_bytes = json.dumps(header, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ciphertext = AESGCM(derive(password, salt)).encrypt(iv, zipped, header_bytes)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(MAGIC + struct.pack(">I", len(header_bytes)) + header_bytes + ciphertext)
    print(json.dumps({"output": str(args.output), "bytes": args.output.stat().st_size, "attachments": len(attachment_rows), "sha256": hashlib.sha256(args.output.read_bytes()).hexdigest()}, indent=2))


if __name__ == "__main__":
    main()
