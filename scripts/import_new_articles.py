#!/usr/bin/env python3
"""Import the five owner-supplied Word 97 articles without rewriting their text.

Requires antiword (system package), not a new browser/app dependency. Set
ANTIWORD_BIN and ANTIWORDHOME for a locally unpacked antiword installation.
The document body is imported from DocBook paragraphs; obsolete catalogue
advertisements remain available in the unchanged downloadable originals.
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
from typing import Any
import urllib.request
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
AUTHOR = 'Геннадий Павлович Анисимов'
PHOTO_CONFIG = {
    'alfrediya.jpg': {
        'url': 'https://img-fotki.yandex.ru/get/4603/sem-ot-anis.2/0_3ae05_7d623470_L.jpg',
        'alt': 'Соцветие альфредии поникшей в саду Геннадия Павловича Анисимова',
    },
    'kandyk-bud.jpg': {
        'url': 'https://img-fotki.yandex.ru/get/4102/sem-ot-anis.0/0_1bc85_2a960151_L.jpg',
        'alt': 'Бутон кандыка сибирского пробивается сквозь снег',
    },
    'kandyk-flowers.jpg': {
        'url': 'https://img-fotki.yandex.ru/get/4101/sem-ot-anis.0/0_1bc9c_5c83ce52_L.jpg',
        'alt': 'Розово-лиловые цветки кандыка сибирского в саду автора',
    },
    'kupalnitsa.jpg': {
        'url': 'https://img-fotki.yandex.ru/get/6002/sem-ot-anis.2/0_4cece_109bbe4f_L.jpg',
        'alt': 'Ярко-оранжевые цветки купальницы азиатской в саду автора',
    },
}

ARTICLE_CONFIG = [
    {
        'sourceFile': 'Альфредия с фото.doc',
        'slug': 'zagadochnaya-alfrediya',
        'downloadName': 'zagadochnaya-alfrediya.doc',
        'title': 'Загадочная альфредия',
        'excerpt': 'Почему альфредию называют атаман-травой, как выглядит этот сибирский многолетник и как вырастить его из семян.',
        'category': 'Цветы и декоративные растения',
        'plantNumbers': [68],
        'coverPhoto': 'alfrediya.jpg',
    },
    {
        'sourceFile': 'Кат-Безвременник.doc.dot',
        'slug': 'bezvremennik',
        'downloadName': 'bezvremennik.dot',
        'title': 'Безвременник',
        'excerpt': 'Осеннее цветение безвременника великолепного: необычный цикл развития, посадка клубнелуковиц и уход в условиях Сибири.',
        'category': 'Цветы и декоративные растения',
        'plantNumbers': [171, 172],
        'coverPlantNumber': 171,
    },
    {
        'sourceFile': 'Кат-Кандык.doc',
        'slug': 'kandyk-sibirskiy',
        'downloadName': 'kandyk-sibirskiy.doc',
        'title': 'Кандык сибирский — самый ранний цветок',
        'excerpt': 'Знакомство с одним из первых весенних цветов: когда пересаживать луковицы, какое место выбрать и как кандык переносит заморозки.',
        'category': 'Цветы и декоративные растения',
        'plantNumbers': [183],
        'coverPhoto': 'kandyk-flowers.jpg',
    },
    {
        'sourceFile': 'Кат-Купальница.doc',
        'slug': 'kupalnitsa-aziatskaya',
        'downloadName': 'kupalnitsa-aziatskaya.doc',
        'title': 'Купальница азиатская',
        'excerpt': 'Сибирские «огоньки» в саду: выбор влажного места, посадка, подкормки, деление кустов и выращивание из семян.',
        'category': 'Цветы и декоративные растения',
        'plantNumbers': [40, 189],
        'coverPhoto': 'kupalnitsa.jpg',
    },
    {
        'sourceFile': 'Кат-Черемша.doc',
        'slug': 'sibirskaya-cheremsha',
        'downloadName': 'sibirskaya-cheremsha.doc',
        'title': 'Сибирская черемша',
        'excerpt': 'Чем лук победный отличается от медвежьего лука и как выращивать сибирскую черемшу в тени деревьев на своём участке.',
        'category': 'Пряные и овощные растения',
        'plantNumbers': [210],
        'coverPlantNumber': 210,
    },
]


def extract_doc_paragraphs(path: Path, antiword_bin: str | None = None) -> list[str]:
    """Return Word body paragraphs, preserving their order and original wording."""
    executable = antiword_bin or os.environ.get('ANTIWORD_BIN') or shutil.which('antiword')
    if not executable:
        raise RuntimeError('Install antiword or set ANTIWORD_BIN to its executable.')
    process = subprocess.run(
        [executable, '-m', 'UTF-8.txt', '-x', 'db', str(path)],
        check=True,
        capture_output=True,
        env=os.environ.copy(),
    )
    document = ET.fromstring(process.stdout)
    paragraphs = [re.sub(r'\s+', ' ', ''.join(node.itertext())).strip() for node in document.findall('.//chapter//para')]
    return [paragraph for paragraph in paragraphs if paragraph]


def article_body_paragraphs(paragraphs: list[str]) -> list[str]:
    """Keep the article body, omitting its title, photo-link notes and old ads."""
    body = []
    for paragraph in paragraphs[1:]:
        if paragraph.startswith('Всегда в ассортименте'):
            break
        if paragraph.startswith(('Фото ', 'http://', 'https://')):
            continue
        body.append(paragraph)
    return body


def read_plant_images(root: Path) -> dict[str, dict[str, Any]]:
    source = (root / 'src/data/plant-images.ts').read_text()
    start = source.index('{', source.index('export const'))
    return json.loads(source[start:].strip().rstrip(';'))


def ensure_author_photos(root: Path, refresh: bool = False) -> None:
    directory = root / 'public/articles/images'
    directory.mkdir(parents=True, exist_ok=True)
    for filename, photo in PHOTO_CONFIG.items():
        destination = directory / filename
        if destination.exists() and not refresh:
            continue
        request = urllib.request.Request(photo['url'], headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read()
        if not data.startswith(b'\xff\xd8\xff'):
            raise ValueError(f'Expected JPEG author photo: {photo["url"]}')
        destination.write_bytes(data)


def author_photo(filename: str) -> dict[str, str]:
    photo = PHOTO_CONFIG[filename]
    return {'src': './articles/images/' + filename, 'alt': photo['alt'], 'sourceUrl': photo['url']}


def import_new_articles(root: Path = ROOT, antiword_bin: str | None = None) -> list[dict[str, Any]]:
    images = read_plant_images(root)
    originals = root / 'public/articles/originals'
    originals.mkdir(parents=True, exist_ok=True)
    articles = []
    for config in ARTICLE_CONFIG:
        source = root / config['sourceFile']
        paragraphs = article_body_paragraphs(extract_doc_paragraphs(source, antiword_bin))
        if len(paragraphs) < 5:
            raise ValueError(f'Incomplete article extraction: {source.name}')
        blocks: list[dict[str, Any]] = [{'type': 'paragraph', 'text': paragraph} for paragraph in paragraphs]
        if config['slug'] == 'kandyk-sibirskiy':
            photo = author_photo('kandyk-bud.jpg')
            blocks.insert(3, {'type': 'image', **photo, 'text': 'Кандык пробивается сквозь снег. Фото Г. П. Анисимова.'})
        cover = author_photo(config['coverPhoto']) if config.get('coverPhoto') else images[str(config['coverPlantNumber'])]
        text = '\n'.join(paragraphs)
        article = {
            'slug': config['slug'],
            'title': config['title'],
            'excerpt': config['excerpt'],
            'category': config['category'],
            'plantNumbers': config['plantNumbers'],
            'blocks': blocks,
            'sourceFile': config['sourceFile'],
            'downloadUrl': './articles/originals/' + config['downloadName'],
            'origin': 'new',
            'author': AUTHOR,
            'coverImage': cover,
            'readingMinutes': max(1, math.ceil(len(text.split()) / 180)),
        }
        shutil.copyfile(source, originals / config['downloadName'])
        articles.append(article)
    output = root / 'src/data/new-articles.json'
    output.write_text(json.dumps(articles, ensure_ascii=False, indent=2) + '\n')
    return articles


def write_photo_credits(root: Path) -> None:
    lines = [
        '# Авторские фотографии к статьям',
        '',
        'Четыре фотографии Геннадия Павловича Анисимова загружены по ссылкам, указанным в предоставленных владельцем Word-статьях. Копии сохранены без изменения, авторские подписи на снимках оставлены.',
        '',
        '| Локальный файл | Источник |',
        '| --- | --- |',
    ]
    for filename, photo in PHOTO_CONFIG.items():
        lines.append(f'| [images/{filename}](images/{filename}) | [Авторский оригинал]({photo["url"]}) |')
    lines.extend(['', 'Для обложек статей о безвременнике и черемше используются уже имеющиеся изображения каталога. Их авторы и лицензии указаны в [общем списке фотографий](../IMAGE_CREDITS.md) и в данных обложек.', ''])
    (root / 'public/articles/IMAGE_CREDITS.md').write_text('\n'.join(lines))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--antiword', default=None)
    parser.add_argument('--refresh-photos', action='store_true')
    args = parser.parse_args()
    ensure_author_photos(args.root, args.refresh_photos)
    articles = import_new_articles(args.root, args.antiword)
    write_photo_credits(args.root)
    print(json.dumps([{'title': item['title'], 'paragraphs': sum(block['type'] == 'paragraph' for block in item['blocks']), 'readingMinutes': item['readingMinutes']} for item in articles], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
