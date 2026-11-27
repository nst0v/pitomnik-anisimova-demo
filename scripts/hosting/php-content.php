<?php
declare(strict_types=1);

// Native shared-hosting equivalent of server/content.mjs. All data stays private.
function nursery_content_object(mixed $value, string $label = 'Данные'): array {
    if (!is_array($value) || ($value !== [] && array_is_list($value))) {
        throw new RuntimeException("$label: неверный формат.", 400);
    }
    return $value;
}

function nursery_content_length(string $value): int {
    return (int)preg_match_all('/./us', $value) + (int)preg_match_all('/[\x{10000}-\x{10FFFF}]/u', $value);
}

function nursery_content_trim(string $value): string {
    return preg_replace('/^[\s\p{Z}\x{FEFF}]+|[\s\p{Z}\x{FEFF}]+$/u', '', $value) ?? trim($value);
}

function nursery_content_text(mixed $value, string $label, int $maximum = 2000, bool $allowEmpty = false): string {
    if (!is_string($value) || nursery_content_length($value) > $maximum || (!$allowEmpty && nursery_content_trim($value) === '')) {
        throw new RuntimeException("Проверьте поле «{$label}».", 400);
    }
    return nursery_content_trim($value);
}

function nursery_content_integer(mixed $value, string $label, int $maximum = 999999): int {
    if ((!is_int($value) && !is_float($value)) || !is_finite((float)$value) || floor((float)$value) !== (float)$value || $value < 1 || $value > $maximum) {
        throw new RuntimeException("Проверьте поле «{$label}».", 400);
    }
    return (int)$value;
}

function nursery_content_price(mixed $value): int|float|null {
    if ($value !== null && ((!is_int($value) && !is_float($value)) || !is_finite((float)$value) || $value < 0 || $value > 10000000)) {
        throw new RuntimeException('Укажите цену от 0 до 10 000 000 рублей.', 400);
    }
    return $value;
}

function nursery_content_slug(mixed $value): string {
    if (!is_string($value) || strlen($value) > 160 || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $value)) {
        throw new RuntimeException('Неверный адрес статьи.', 400);
    }
    return $value;
}

function nursery_content_url(mixed $value, string $label, bool $image = false, bool $allowEmpty = false): string {
    $result = nursery_content_text($value, $label, 3000, $allowEmpty);
    if ($allowEmpty && $result === '') return $result;
    if (preg_match('/[\s\\\\\x00-\x1f]/u', $result)) throw new RuntimeException("Проверьте ссылку «{$label}».", 400);
    if (str_starts_with($result, './') && !str_contains(substr($result, 2), '..') && !preg_match('/%(?:2e|2f|5c)/i', $result)) {
        if (!$image || preg_match('~^\./(?:images|articles/images)/~', $result)) return $result;
    }
    $url = parse_url($result);
    if (is_array($url) && isset($url['host']) && $url['host'] !== ''
        && (strtolower($url['scheme'] ?? '') === 'https' || (!$image && strtolower($url['scheme'] ?? '') === 'http'))
        && (!isset($url['user']) || $url['user'] === '') && (!isset($url['pass']) || $url['pass'] === '')) return $result;
    throw new RuntimeException("Проверьте ссылку «{$label}».", 400);
}

function nursery_content_image(mixed $input): array {
    $value = nursery_content_object($input, 'Изображение');
    $result = ['src' => nursery_content_url($value['src'] ?? null, 'Изображение', true),
        'alt' => nursery_content_text($value['alt'] ?? '', 'Описание изображения', 1000, true),
        'sourceUrl' => nursery_content_url($value['sourceUrl'] ?? '', 'Источник изображения', false, true)];
    if (array_key_exists('attribution', $value)) {
        $credit = nursery_content_object($value['attribution'], 'Автор изображения');
        $result['attribution'] = ['author' => nursery_content_text($credit['author'] ?? null, 'Автор изображения', 300),
            'license' => nursery_content_text($credit['license'] ?? null, 'Лицензия', 300),
            'licenseUrl' => nursery_content_url($credit['licenseUrl'] ?? null, 'Лицензия')];
    }
    return $result;
}

function nursery_content_product(array $input, array $existing = []): array {
    $value = array_replace($existing, nursery_content_object($input, 'Товар'));
    if (!in_array($value['category'] ?? null, ['annuals', 'perennials', 'useful', 'planting', 'catalog'], true)) {
        throw new RuntimeException('Выберите категорию товара.', 400);
    }
    if (!array_key_exists('price', $value)) throw new RuntimeException('Укажите цену от 0 до 10 000 000 рублей.', 400);
    $result = ['catalogNumber' => nursery_content_integer($value['catalogNumber'] ?? null, 'Номер товара'),
        'name' => nursery_content_text($value['name'] ?? null, 'Название товара', 500),
        'description' => nursery_content_text($value['description'] ?? null, 'Описание товара', 50000),
        'category' => $value['category'], 'unit' => nursery_content_text($value['unit'] ?? null, 'Единица продажи', 500),
        'price' => nursery_content_price($value['price']),
        'sourceUrl' => nursery_content_url($value['sourceUrl'] ?? '', 'Источник товара', false, true)];
    foreach (['latinName', 'note', 'priceNote', 'shippingNote'] as $field) {
        if (array_key_exists($field, $value)) $result[$field] = nursery_content_text($value[$field], $field, 10000, true);
    }
    foreach (['minimumQuantity', 'quantityStep'] as $field) {
        if (array_key_exists($field, $value)) $result[$field] = nursery_content_integer($value[$field], $field, 999);
    }
    foreach (['hidden', 'shippingIncluded'] as $field) {
        if (!array_key_exists($field, $value)) continue;
        if (!is_bool($value[$field])) throw new RuntimeException("Проверьте поле «{$field}».", 400);
        $result[$field] = $value[$field];
    }
    if (array_key_exists('priceTiers', $value)) {
        if (!is_array($value['priceTiers']) || !array_is_list($value['priceTiers']) || count($value['priceTiers']) > 20) {
            throw new RuntimeException('Проверьте цены за количество.', 400);
        }
        $result['priceTiers'] = [];
        $quantities = [];
        foreach ($value['priceTiers'] as $tier) {
            $tier = nursery_content_object($tier, 'Цена за количество');
            if (!array_key_exists('price', $tier)) throw new RuntimeException('Укажите цену от 0 до 10 000 000 рублей.', 400);
            $tierPrice = nursery_content_price($tier['price']);
            if ($tierPrice === null) throw new RuntimeException('Укажите цену за количество.', 400);
            $quantity = nursery_content_integer($tier['minQuantity'] ?? null, 'Количество', 999);
            if (in_array($quantity, $quantities, true)) throw new RuntimeException('Количество в ценах не должно повторяться.', 400);
            $quantities[] = $quantity;
            $result['priceTiers'][] = ['minQuantity' => $quantity, 'price' => $tierPrice];
        }
    }
    if (array_key_exists('image', $value)) $result['image'] = nursery_content_image($value['image']);
    return $result;
}

function nursery_content_article(array $input, array $existing = []): array {
    $value = array_replace($existing, nursery_content_object($input, 'Статья'));
    $slug = nursery_content_slug($value['slug'] ?? null);
    if (!isset($value['blocks']) || !is_array($value['blocks']) || !array_is_list($value['blocks']) || count($value['blocks']) === 0 || count($value['blocks']) > 2000) {
        throw new RuntimeException('Напишите текст статьи.', 400);
    }
    $blocks = [];
    foreach ($value['blocks'] as $block) {
        $block = nursery_content_object($block, 'Текст статьи');
        $type = $block['type'] ?? null;
        if ($type === 'paragraph' || $type === 'heading') {
            $blocks[] = ['type' => $type, 'text' => nursery_content_text($block['text'] ?? null, 'Текст статьи', 100000)];
        } elseif ($type === 'list' && isset($block['items']) && is_array($block['items']) && array_is_list($block['items']) && count($block['items']) > 0 && count($block['items']) <= 500) {
            $blocks[] = ['type' => 'list', 'items' => array_map(fn($item) => nursery_content_text($item, 'Текст списка', 20000), $block['items'])];
        } elseif ($type === 'image') {
            $image = ['type' => 'image', 'src' => nursery_content_url($block['src'] ?? null, 'Изображение в статье', true),
                'alt' => nursery_content_text($block['alt'] ?? '', 'Описание изображения', 1000, true)];
            foreach (['caption', 'text'] as $field) if (array_key_exists($field, $block)) {
                $image[$field] = nursery_content_text($block[$field], 'Подпись изображения', 2000, true);
            }
            if (array_key_exists('sourceUrl', $block)) $image['sourceUrl'] = nursery_content_url($block['sourceUrl'], 'Источник изображения');
            $blocks[] = $image;
        } else throw new RuntimeException('Проверьте текст статьи.', 400);
    }
    $body = implode(' ', array_map(fn($block) => $block['text'] ?? (isset($block['items']) ? implode(' ', $block['items']) : ''), $blocks));
    if (nursery_content_trim($body) === '') throw new RuntimeException('Напишите текст статьи.', 400);
    preg_match_all('/./us', $body, $characters);
    $excerpt = '';
    $excerptLength = 0;
    foreach ($characters[0] as $character) {
        $excerptLength += nursery_content_length($character);
        if ($excerptLength > 200) break;
        $excerpt .= $character;
    }
    $result = ['slug' => $slug, 'title' => nursery_content_text($value['title'] ?? null, 'Название статьи', 500),
        'excerpt' => nursery_content_text($value['excerpt'] ?? $excerpt, 'Краткое описание', 3000),
        'category' => nursery_content_text($value['category'] ?? 'Советы садоводу', 'Раздел статьи', 200),
        'author' => nursery_content_text($value['author'] ?? 'Геннадий Павлович Анисимов', 'Автор статьи', 300),
        'origin' => ($value['origin'] ?? null) === 'archive' ? 'archive' : 'new', 'contentStatus' => 'full',
        'contentUrl' => './api/content/articles/' . $slug, 'readingMinutes' => max(1, (int)ceil(count(preg_split('/\s+/u', $body)) / 180)),
        'plantNumbers' => [], 'blocks' => $blocks];
    if (array_key_exists('plantNumbers', $value)) {
        if (!is_array($value['plantNumbers']) || !array_is_list($value['plantNumbers']) || count($value['plantNumbers']) > 1000) throw new RuntimeException('Проверьте связанные товары.', 400);
        $result['plantNumbers'] = array_values(array_unique(array_map(fn($number) => nursery_content_integer($number, 'Номер связанного товара'), $value['plantNumbers']), SORT_NUMERIC));
    }
    foreach (['sourceUrl', 'downloadUrl', 'originalDocumentUrl'] as $field) {
        if (array_key_exists($field, $value) && $value[$field] !== '') $result[$field] = nursery_content_url($value[$field], $field);
    }
    if (array_key_exists('sourceFile', $value)) $result['sourceFile'] = nursery_content_text($value['sourceFile'], 'Исходный документ', 500, true);
    if (array_key_exists('coverImage', $value)) $result['coverImage'] = nursery_content_image($value['coverImage']);
    if (array_key_exists('featured', $value)) {
        if (!is_bool($value['featured'])) throw new RuntimeException('Проверьте настройку избранной статьи.', 400);
        $result['featured'] = $value['featured'];
    }
    return $result;
}

function nursery_content_load(string $file): array {
    if (!file_exists($file)) return ['products' => [], 'articles' => [], 'hiddenArticles' => []];
    $raw = file_get_contents($file);
    if ($raw === false) throw new RuntimeException('Content storage unavailable.', 500);
    $value = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($value)) throw new RuntimeException('Invalid saved content.', 500);
    foreach (['products', 'articles', 'hiddenArticles'] as $key) {
        if (!isset($value[$key]) || !is_array($value[$key]) || !array_is_list($value[$key])) throw new RuntimeException('Invalid saved content.', 500);
    }
    return array_intersect_key($value, array_flip(['products', 'articles', 'hiddenArticles']));
}

function nursery_content_find(array $rows, string $key, mixed $identifier): array {
    foreach ($rows as $row) {
        if (!is_array($row) || !array_key_exists($key, $row)) continue;
        if ($row[$key] === $identifier || ($key === 'catalogNumber' && (is_int($identifier) || is_float($identifier)) && (float)$row[$key] === (float)$identifier)) return $row;
    }
    return [];
}

function nursery_content_handle(string $path, string $shared, string $release): bool {
    $public = $path === '/site-content.json';
    $article = str_starts_with($path, '/api/content/articles/');
    $mutation = in_array($path, ['/api/admin/products', '/api/admin/articles', '/api/admin/article-visibility'], true);
    if (!$public && !$article && !$mutation) return false;
    $file = $shared . '/content/content.json';
    try {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if ($public || $article) {
            if ($method !== 'GET' && $method !== 'HEAD') throw new RuntimeException('Этот запрос не поддерживается.', 405);
            $content = nursery_content_load($file);
            if ($public) nursery_json(200, $content);
            $slug = nursery_content_slug(substr($path, strlen('/api/content/articles/')));
            $found = nursery_content_find($content['articles'], 'slug', $slug);
            if (!$found || in_array($slug, $content['hiddenArticles'], true)) throw new RuntimeException('Статья не найдена.', 404);
            nursery_json(200, $found);
        }
        nursery_authorize();
        if ($method !== 'POST') throw new RuntimeException('Этот запрос не поддерживается.', 405);
        $input = nursery_read_json(1024 * 1024);
        $directory = dirname($file);
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('Storage unavailable.', 500);
        chmod($directory, 0700);
        $lock = fopen($directory . '/content.lock', 'c');
        if ($lock === false) throw new RuntimeException('Storage lock unavailable.', 500);
        chmod($directory . '/content.lock', 0600);
        $temporary = null;
        try {
            if (!flock($lock, LOCK_EX)) throw new RuntimeException('Storage lock unavailable.', 500);
            $content = nursery_content_load($file);
            $baseProducts = json_decode(file_get_contents($release . '/src/data/catalog-2027.json'), true, 512, JSON_THROW_ON_ERROR);
            $baseArticles = json_decode(file_get_contents($release . '/src/data/article-index.json'), true, 512, JSON_THROW_ON_ERROR);
            if ($path === '/api/admin/products') {
                $number = $input['catalogNumber'] ?? null;
                $existing = nursery_content_find($content['products'], 'catalogNumber', $number) ?: nursery_content_find($baseProducts, 'catalogNumber', $number);
                $product = nursery_content_product($input, $existing);
                $content['products'] = array_values(array_filter($content['products'], fn($row) => $row['catalogNumber'] !== $product['catalogNumber']));
                $content['products'][] = $product;
                usort($content['products'], fn($a, $b) => $a['catalogNumber'] <=> $b['catalogNumber']);
            } elseif ($path === '/api/admin/articles') {
                if (array_key_exists('hidden', $input) && !is_bool($input['hidden'])) throw new RuntimeException('Укажите, показывать ли статью на сайте.', 400);
                $slug = $input['slug'] ?? null;
                $existing = nursery_content_find($content['articles'], 'slug', $slug) ?: nursery_content_find($baseArticles, 'slug', $slug);
                $value = nursery_content_article($input, $existing);
                $content['articles'] = array_values(array_filter($content['articles'], fn($row) => $row['slug'] !== $value['slug']));
                $content['articles'][] = $value;
                if (array_key_exists('hidden', $input)) {
                    $content['hiddenArticles'] = array_values(array_filter($content['hiddenArticles'], fn($item) => $item !== $value['slug']));
                    if ($input['hidden']) $content['hiddenArticles'][] = $value['slug'];
                }
            } else {
                $slug = nursery_content_slug($input['slug'] ?? null);
                if (!array_key_exists('hidden', $input) || !is_bool($input['hidden'])) throw new RuntimeException('Укажите, показывать ли статью на сайте.', 400);
                if (!nursery_content_find($content['articles'], 'slug', $slug) && !nursery_content_find($baseArticles, 'slug', $slug)) throw new RuntimeException('Статья не найдена.', 404);
                $content['hiddenArticles'] = array_values(array_filter($content['hiddenArticles'], fn($item) => $item !== $slug));
                if ($input['hidden']) $content['hiddenArticles'][] = $slug;
            }
            $payload = json_encode($content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n";
            $temporary = $directory . '/.content-' . bin2hex(random_bytes(12)) . '.tmp';
            $previous = umask(0077);
            try { $output = fopen($temporary, 'x'); } finally { umask($previous); }
            if ($output === false) throw new RuntimeException('Storage write unavailable.', 500);
            try {
                chmod($temporary, 0600);
                for ($written = 0, $length = strlen($payload); $written < $length; $written += $chunk) {
                    $chunk = fwrite($output, substr($payload, $written));
                    if ($chunk === false || $chunk === 0) throw new RuntimeException('Storage write failed.', 500);
                }
                if (!fflush($output)) throw new RuntimeException('Storage flush failed.', 500);
            } finally { fclose($output); }
            if (!rename($temporary, $file)) throw new RuntimeException('Storage commit failed.', 500);
            $temporary = null;
        } finally {
            if ($temporary !== null && is_file($temporary)) unlink($temporary);
            flock($lock, LOCK_UN);
            fclose($lock);
        }
        nursery_json(200, ['content' => $content]);
    } catch (Throwable $error) {
        $status = $error instanceof RuntimeException && $error->getCode() >= 400 && $error->getCode() < 500 ? $error->getCode() : 500;
        nursery_json($status, ['error' => $status === 500 ? 'Не удалось сохранить данные. Попробуйте ещё раз.' : $error->getMessage()]);
    }
    return true;
}
