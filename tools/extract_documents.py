#!/usr/bin/env python3
"""Extract ordered DOCX structure and page-scoped PDF text without exporting data.

The script is intentionally generic. It writes only to the caller-provided private
directory; no source content is embedded in the public application or logs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import pdfplumber
from lxml import etree
from PIL import Image


NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "v": "urn:schemas-microsoft-com:vml",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def paragraph_text(node: etree._Element) -> str:
    parts: list[str] = []
    for item in node.xpath(".//w:t | .//w:tab | .//w:br", namespaces=NS):
        local = etree.QName(item).localname
        if local == "t":
            parts.append(item.text or "")
        elif local == "tab":
            parts.append("\t")
        else:
            parts.append("\n")
    return "".join(parts).strip()


def node_hyperlinks(node: etree._Element, relationships: dict[str, dict[str, str]]) -> list[dict[str, str]]:
    links: list[dict[str, str]] = []
    for hyperlink in node.xpath(".//w:hyperlink", namespaces=NS):
        rid = hyperlink.get(f"{{{NS['r']}}}id")
        relationship = relationships.get(rid or "", {})
        links.append(
            {
                "text": paragraph_text(hyperlink),
                "relationshipId": rid or "",
                "target": relationship.get("target", ""),
            }
        )
    return links


def node_images(node: etree._Element, relationships: dict[str, dict[str, str]]) -> list[dict[str, str]]:
    images: list[dict[str, str]] = []
    for blip in node.xpath(".//a:blip | .//v:imagedata", namespaces=NS):
        rid = blip.get(f"{{{NS['r']}}}embed") or blip.get(f"{{{NS['r']}}}id")
        relationship = relationships.get(rid or "", {})
        doc_props = blip.xpath("ancestor::w:drawing[1]//wp:docPr[1]", namespaces=NS)
        description = ""
        title = ""
        if doc_props:
            description = doc_props[0].get("descr", "")
            title = doc_props[0].get("title", "")
        images.append(
            {
                "relationshipId": rid or "",
                "target": relationship.get("target", ""),
                "description": description,
                "title": title,
            }
        )
    return images


def paragraph_record(
    node: etree._Element,
    relationships: dict[str, dict[str, str]],
    location: str,
) -> dict[str, Any]:
    styles = node.xpath("./w:pPr/w:pStyle/@w:val", namespaces=NS)
    return {
        "location": location,
        "text": paragraph_text(node),
        "style": styles[0] if styles else None,
        "hyperlinks": node_hyperlinks(node, relationships),
        "images": node_images(node, relationships),
    }


def cell_record(
    cell: etree._Element,
    relationships: dict[str, dict[str, str]],
    location: str,
) -> dict[str, Any]:
    paragraphs = [
        paragraph_record(paragraph, relationships, f"{location}.paragraph[{index}]")
        for index, paragraph in enumerate(cell.xpath("./w:p", namespaces=NS), start=1)
    ]
    grid_span = cell.xpath("./w:tcPr/w:gridSpan/@w:val", namespaces=NS)
    v_merge = cell.xpath("./w:tcPr/w:vMerge/@w:val", namespaces=NS)
    has_v_merge = bool(cell.xpath("./w:tcPr/w:vMerge", namespaces=NS))
    nested_tables = [
        table_record(table, relationships, f"{location}.nestedTable[{index}]")
        for index, table in enumerate(cell.xpath("./w:tbl", namespaces=NS), start=1)
    ]
    return {
        "location": location,
        "text": "\n".join(item["text"] for item in paragraphs if item["text"]),
        "gridSpan": int(grid_span[0]) if grid_span else 1,
        "verticalMerge": (v_merge[0] if v_merge else "continue") if has_v_merge else None,
        "paragraphs": paragraphs,
        "nestedTables": nested_tables,
    }


def table_record(
    table: etree._Element,
    relationships: dict[str, dict[str, str]],
    location: str,
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for row_index, row in enumerate(table.xpath("./w:tr", namespaces=NS), start=1):
        cells = [
            cell_record(cell, relationships, f"{location}.row[{row_index}].cell[{cell_index}]")
            for cell_index, cell in enumerate(row.xpath("./w:tc", namespaces=NS), start=1)
        ]
        rows.append({"index": row_index, "cells": cells})
    return {
        "location": location,
        "rows": rows,
        "rowCount": len(rows),
        "maxCellCount": max((len(row["cells"]) for row in rows), default=0),
    }


def extract_relationships(archive: zipfile.ZipFile, rels_path: str) -> dict[str, dict[str, str]]:
    rels = etree.fromstring(archive.read(rels_path))
    result: dict[str, dict[str, str]] = {}
    for rel in rels.xpath("./pr:Relationship", namespaces=NS):
        result[rel.get("Id", "")] = {
            "type": rel.get("Type", ""),
            "target": rel.get("Target", ""),
            "targetMode": rel.get("TargetMode", ""),
        }
    return result


def iter_table_paragraphs(table: dict[str, Any]) -> Iterable[dict[str, Any]]:
    for row in table["rows"]:
        for cell in row["cells"]:
            yield from cell["paragraphs"]
            for nested in cell["nestedTables"]:
                yield from iter_table_paragraphs(nested)


def iter_block_paragraphs(blocks: Iterable[dict[str, Any]]) -> Iterable[dict[str, Any]]:
    for block in blocks:
        if block["type"] == "paragraph":
            yield block
        else:
            yield from iter_table_paragraphs(block)


def image_metadata(path: Path, archive_name: str) -> dict[str, Any]:
    width = None
    height = None
    try:
        with Image.open(path) as image:
            width, height = image.size
    except Exception:
        pass
    return {
        "archiveName": archive_name,
        "filename": path.name,
        "sha256": sha256_file(path),
        "bytes": path.stat().st_size,
        "mimeType": mimetypes.guess_type(path.name)[0] or "application/octet-stream",
        "width": width,
        "height": height,
    }


def extract_docx(source: Path, output_dir: Path) -> dict[str, Any]:
    media_dir = output_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        relationships = extract_relationships(archive, "word/_rels/document.xml.rels")
        document = etree.fromstring(archive.read("word/document.xml"))
        media: list[dict[str, Any]] = []
        for archive_name in sorted(name for name in archive.namelist() if name.startswith("word/media/")):
            destination = media_dir / Path(archive_name).name
            with archive.open(archive_name) as source_handle, destination.open("wb") as destination_handle:
                shutil.copyfileobj(source_handle, destination_handle)
            media.append(image_metadata(destination, archive_name))

        body = document.find("w:body", namespaces=NS)
        if body is None:
            raise ValueError("DOCX has no document body")
        blocks: list[dict[str, Any]] = []
        paragraph_index = 0
        table_index = 0
        for child in body:
            local = etree.QName(child).localname
            if local == "p":
                paragraph_index += 1
                blocks.append(
                    {
                        "type": "paragraph",
                        **paragraph_record(child, relationships, f"paragraph[{paragraph_index}]"),
                    }
                )
            elif local == "tbl":
                table_index += 1
                blocks.append(
                    {"type": "table", **table_record(child, relationships, f"table[{table_index}]")}
                )

        headers: list[dict[str, Any]] = []
        for header_name in sorted(name for name in archive.namelist() if name.startswith("word/header") and name.endswith(".xml")):
            rels_name = f"word/_rels/{Path(header_name).name}.rels"
            header_relationships = extract_relationships(archive, rels_name) if rels_name in archive.namelist() else {}
            header_xml = etree.fromstring(archive.read(header_name))
            header_paragraphs = [
                paragraph_record(paragraph, header_relationships, f"{header_name}.paragraph[{index}]")
                for index, paragraph in enumerate(header_xml.xpath(".//w:p", namespaces=NS), start=1)
            ]
            headers.append(
                {
                    "filename": header_name,
                    "relationships": header_relationships,
                    "paragraphs": header_paragraphs,
                }
            )

    body_paragraphs = list(iter_block_paragraphs(blocks))
    header_paragraphs = [paragraph for header in headers for paragraph in header["paragraphs"]]
    all_paragraphs = body_paragraphs + header_paragraphs
    hyperlink_count = sum(len(paragraph["hyperlinks"]) for paragraph in all_paragraphs)
    image_reference_count = sum(len(paragraph["images"]) for paragraph in all_paragraphs)
    total_table_count = len(document.xpath(".//w:tbl", namespaces=NS))
    return {
        "source": {"filename": source.name, "sha256": sha256_file(source)},
        "stats": {
            "paragraphBlocks": paragraph_index,
            "topLevelTables": table_index,
            "tables": total_table_count,
            "mediaFiles": len(media),
            "imageReferences": image_reference_count,
            "hyperlinks": hyperlink_count,
        },
        "relationships": relationships,
        "media": media,
        "blocks": blocks,
        "headers": headers,
    }


def extract_pdf(source: Path) -> dict[str, Any]:
    pages: list[dict[str, Any]] = []
    with pdfplumber.open(source) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text(x_tolerance=2, y_tolerance=3, layout=True) or ""
            links = []
            for annotation in page.annots or []:
                uri = annotation.get("uri") or annotation.get("URI")
                if uri:
                    links.append(str(uri))
            pages.append(
                {
                    "page": index,
                    "width": float(page.width),
                    "height": float(page.height),
                    "text": text.rstrip(),
                    "links": sorted(set(links)),
                }
            )
    return {
        "source": {"filename": source.name, "sha256": sha256_file(source)},
        "stats": {
            "pages": len(pages),
            "pagesWithText": sum(bool(page["text"].strip()) for page in pages),
            "links": sum(len(page["links"]) for page in pages),
        },
        "pages": pages,
    }


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--docx", type=Path, required=True)
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    docx_data = extract_docx(args.docx, args.output / "docx")
    pdf_data = extract_pdf(args.pdf)
    write_json(args.output / "docx-structure.json", docx_data)
    write_json(args.output / "pdf-pages.json", pdf_data)
    summary = {"docx": docx_data["stats"], "pdf": pdf_data["stats"]}
    write_json(args.output / "extraction-summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
