<?php
declare(strict_types=1);

// The public entrypoint contains no credentials or writable application data.
ini_set('display_errors', '0');
$uri = $_SERVER['REQUEST_URI'] ?? '';
$path = parse_url($uri, PHP_URL_PATH);
if (!is_string($path) || !preg_match('~\A(?:/site-content\.json|/api/[A-Za-z0-9_./%-]+)\z~D', $path)
    || preg_match('~(?:%00|%0a|%0d|%2f|%5c|%2e|\.\.)~i', $path)
    || str_contains($uri, "\r") || str_contains($uri, "\n")) {
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'HEAD') {
        echo json_encode(['error' => 'Страница не найдена.'], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

try {
    $app = getenv('NURSERY_APP_ROOT') ?: '/var/www/u3568610/data/apps/sem-ot-anis';
    $release = realpath($app . '/current');
    if ($release === false) {
        throw new RuntimeException('Application release is missing.');
    }
    $shared = $app . '/shared';
    require $release . '/scripts/hosting/php-auth.php';
    require $release . '/scripts/hosting/php-content.php';
    $config = json_decode((string)file_get_contents($shared . '/php-config.json'), true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($config) || !isset($config['password_hash'], $config['secure_cookies'])) {
        throw new RuntimeException('Private application configuration is invalid.');
    }
    nursery_auth_bootstrap($shared, $config);
    if (nursery_auth_handle($path)) {
        exit;
    }
    if (nursery_content_handle($path, $shared, $release)) {
        exit;
    }
    nursery_json(404, ['error' => 'Страница не найдена.']);
} catch (Throwable $error) {
    $status = (int)$error->getCode();
    if ($status < 400 || $status > 499) {
        $status = 500;
        error_log('Nursery API: ' . get_class($error));
    }
    $message = $status === 500 ? 'Не удалось выполнить запрос. Попробуйте позже.' : $error->getMessage();
    if (function_exists('nursery_json')) {
        nursery_json($status, ['error' => $message]);
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'HEAD') {
        echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    }
}
