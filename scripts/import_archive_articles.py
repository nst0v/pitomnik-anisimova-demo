#!/usr/bin/env python3
"""Rebuild the 41 original author articles from their locally preserved Word files.

The source manifest retains every indexed botanical article from
https://sem-ot-anis.narod.ru/publ/. The two service entries are preserved
separately in src/data/archive-info.json and are not counted as articles.

Requires antiword. Run with --antiword /path/to/antiword if it is not on PATH.
No Python packages or network access are needed when the committed originals exist.
"""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'scripts/archive-article-sources.json'
OUTPUT = ROOT / 'src/data/archive-articles.json'
AUTHOR = 'Геннадий Павлович Анисимов'


def normalize(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip()


def repair_old_garlic_encoding(text: str) -> str:
    # The 2010 garlic document stores its Russian characters with an incorrect
    # font/code-page marker. Repair the reversible CP1251-as-Latin-1 encoding;
    # keep genuine Unicode punctuation untouched.
    return ''.join(
        bytes([ord(char)]).decode('cp1251', errors='replace')
        if ord(char) < 256 else char
        for char in text
    )


def extract_document(path: Path, antiword: str, archive_id: int) -> list[str]:
    env = os.environ.copy()
    adjacent_maps = Path(antiword).resolve().parent.parent / 'share/antiword'
    if adjacent_maps.is_dir():
        env.setdefault('ANTIWORDHOME', str(adjacent_maps))
    result = subprocess.run(
        [antiword, '-x', 'db', str(path)], check=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
    )
    book = ET.fromstring(result.stdout)
    chapters = book.findall('chapter')
    if not chapters:
        raise ValueError(f'No document body in {path}')
    # Some Word files style complete paragraphs as headings. In particular the
    # Mahonia article places nearly its whole text in sect1/title, not para.
    paragraphs = [
        normalize(''.join(node.itertext()))
        for chapter in chapters for node in chapter.iter()
        if node.tag in ('para', 'simpara', 'title')
    ]
    paragraphs = [text for text in paragraphs if text]
    if archive_id == 20:
        paragraphs = [repair_old_garlic_encoding(text) for text in paragraphs]
        paragraphs[0] = 'ЧЕСНОК ИЗ БУЛЬБОЧЕК'
    if sum(map(len, paragraphs)) < 2000:
        raise ValueError(f'Incomplete article extraction: {path}')
    return paragraphs


def comparison_key(text: str) -> str:
    return re.sub(r'[^\w]', '', text.casefold().replace('ё', 'е'))


def article_blocks(source: dict, paragraphs: list[str]) -> list[dict]:
    blocks = []
    title_key = comparison_key(source['title'])
    for index, text in enumerate(paragraphs):
        if re.match(r'^(?:Анисимов Геннадий Павлович|6340\d\d\s*[,;]|моб\.)', text):
            # Author and current contact details are rendered by the site. The
            # full unaltered Word download preserves the historical signature.
            break
        if index == 0 and comparison_key(text) == title_key:
            continue
        if 'img-fotki.yandex.ru/' in text or re.match(r'^Фото\b', text):
            continue  # Restored local images appear below the article text.
        # Mailing invitations are editorial footers, not growing instructions;
        # use the current catalogue and contacts in the site's article sidebar.
        if re.search(r'каталог|конверт', text, re.I) and re.match(
            r'^(?:Всем, кто|Семена .{0,80}вышлю|Охотно |К сожалению, семян|Советую и вам|Всегда в ассортименте)',
            text,
        ):
            continue
        is_heading = len(text) < 110 and (text.isupper() or index == 0)
        blocks.append({'type': 'heading' if is_heading else 'paragraph', 'text': text})
    if len(blocks) < 4:
        raise ValueError(f'Too few body paragraphs: {source["slug"]}')
    for image in source.get('images', []):
        blocks.append({'type': 'image', **image})
    return blocks


def build_archive(antiword: str) -> list[dict]:
    sources = json.loads(SOURCES.read_text())
    if {source['archiveId'] for source in sources} != set(range(2, 43)):
        raise ValueError('Archive must contain all 41 indexed botanical articles')
    articles = []
    for source in sources:
        path = ROOT / source['localDocument']
        if not path.read_bytes().startswith(bytes.fromhex('d0cf11e0a1b11ae1')):
            raise ValueError(f'Invalid preserved Word document: {path}')
        blocks = article_blocks(source, extract_document(path, antiword, source['archiveId']))
        words = sum(len(block.get('text', '').split()) for block in blocks)
        excerpt = normalize(source['excerpt'])
        if len(excerpt) > 260:
            excerpt = excerpt[:257].rsplit(' ', 1)[0].rstrip('.,;') + '…'
        article = {
            'slug': source['slug'],
            'title': source['title'],
            'excerpt': excerpt,
            'category': source['category'],
            'plantNumbers': source['plantNumbers'],
            'blocks': blocks,
            'sourceFile': source['sourceFile'],
            'downloadUrl': source['downloadUrl'],
            'sourceUrl': source['sourceUrl'],
            'originalDocumentUrl': source['originalDocumentUrl'],
            'origin': 'archive',
            'status': 'full',
            'author': AUTHOR,
            'readingMinutes': max(1, math.ceil(words / 200)),
        }
        if source.get('images'):
            article['coverImage'] = source['images'][0]
        articles.append(article)
    OUTPUT.write_text(json.dumps(articles, ensure_ascii=False, indent=2) + '\n')
    return articles


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--antiword', default=shutil.which('antiword'))
    args = parser.parse_args()
    if not args.antiword:
        parser.error('Install antiword or supply --antiword /path/to/antiword')
    articles = build_archive(args.antiword)
    print(f'Imported {len(articles)} complete archive articles into {OUTPUT}')


if __name__ == '__main__':
    main()
