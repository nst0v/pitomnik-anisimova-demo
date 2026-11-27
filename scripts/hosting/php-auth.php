<?php
declare(strict_types=1);

const NURSERY_SESSION_COOKIE = 'nursery_admin';
const NURSERY_SESSION_TTL = 28800;
const NURSERY_LOGIN_WINDOW = 900;
const NURSERY_LOGIN_ATTEMPTS = 10;
const NURSERY_LOGIN_FILES = 10000;

function nursery_json(int $status, $body, array $headers = []): void
{
    $json = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('Не удалось подготовить ответ сервера.', 500);
    }
    if (session_status() === PHP_SESSION_ACTIVE && !session_write_close()) {
        throw new RuntimeException('Не удалось сохранить сессию.', 500);
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    foreach ($headers as $name => $value) {
        $line = is_int($name) ? (string)$value : $name . ': ' . $value;
        if (str_contains($line, "\r") || str_contains($line, "\n")) {
            throw new RuntimeException('Некорректный заголовок ответа.', 500);
        }
        header($line, false);
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'HEAD') {
        echo $json;
    }
    exit;
}

function nursery_same_origin(): bool
{
    if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
        return false;
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') {
        return true;
    }
    $parts = parse_url($origin);
    if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])
        || !in_array(strtolower($parts['scheme']), ['http', 'https'], true)) {
        return false;
    }
    foreach (['user', 'pass', 'path', 'query', 'fragment'] as $field) {
        if (isset($parts[$field])) {
            return false;
        }
    }
    $scheme = strtolower($parts['scheme']);
    $host = strtolower($parts['host']);
    if (isset($parts['port']) && !(($scheme === 'http' && $parts['port'] === 80)
        || ($scheme === 'https' && $parts['port'] === 443))) {
        $host .= ':' . $parts['port'];
    }
    return $scheme . '://' . $host === $origin && $host === ($_SERVER['HTTP_HOST'] ?? '');
}

function nursery_read_json(int $limit = 4096): array
{
    if (!preg_match('~^application/json(?:\s*;|$)~i', $_SERVER['CONTENT_TYPE'] ?? '')) {
        throw new RuntimeException('Используйте формат JSON.', 415);
    }
    if ((float)($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) {
        throw new RuntimeException('Слишком большой запрос.', 413);
    }
    $raw = file_get_contents('php://input', false, null, 0, $limit + 1);
    if ($raw === false) {
        throw new RuntimeException('Не удалось прочитать данные запроса.', 400);
    }
    if (strlen($raw) > $limit) {
        throw new RuntimeException('Слишком большой запрос.', 413);
    }
    try {
        if (!(json_decode($raw, false, 512, JSON_THROW_ON_ERROR) instanceof stdClass)) {
            throw new RuntimeException('Не удалось прочитать данные запроса.', 400);
        }
        return json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        throw new RuntimeException('Не удалось прочитать данные запроса.', 400);
    }
}

function nursery_auth_bootstrap(string $shared, array $config): void
{
    if ($shared === '' || $shared[0] !== '/' || !is_string($config['password_hash'] ?? null)
        || (password_get_info($config['password_hash'])['algoName'] ?? 'unknown') === 'unknown') {
        throw new RuntimeException('Не настроен доступ администратора.', 500);
    }
    umask(0077);
    $sessions = rtrim($shared, '/') . '/sessions';
    if (!is_dir($sessions) && !mkdir($sessions, 0700, true) && !is_dir($sessions)) {
        throw new RuntimeException('Не удалось подготовить хранилище сессий.', 500);
    }
    if (!chmod($sessions, 0700)) {
        throw new RuntimeException('Не удалось защитить хранилище сессий.', 500);
    }
    if (session_status() === PHP_SESSION_ACTIVE) {
        throw new RuntimeException('Сессия уже запущена.', 500);
    }
    $GLOBALS['nursery_auth_settings'] = [
        'shared' => rtrim($shared, '/'),
        'sessions' => $sessions,
        'password_hash' => $config['password_hash'],
        'secure_cookies' => ($config['secure_cookies'] ?? true) === true,
    ];
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_cookies', '1');
    ini_set('session.use_trans_sid', '0');
    ini_set('session.gc_maxlifetime', (string)NURSERY_SESSION_TTL);
    session_name(NURSERY_SESSION_COOKIE);
    session_save_path($sessions);
    session_cache_limiter('');
    session_set_cookie_params([
        'lifetime' => NURSERY_SESSION_TTL,
        'path' => '/',
        'secure' => $GLOBALS['nursery_auth_settings']['secure_cookies'],
        'httponly' => true,
        'samesite' => 'Strict',
    ]);

    // Public content and anonymous session checks allocate neither cookie nor file.
    $candidate = $_COOKIE[NURSERY_SESSION_COOKIE] ?? '';
    if (!is_string($candidate) || !preg_match('/\A[a-f0-9]{64}\z/D', $candidate)
        || !is_file($sessions . '/sess_' . $candidate)) {
        return;
    }
    session_id($candidate);
    if (!session_start()) {
        throw new RuntimeException('Не удалось открыть сессию.', 500);
    }
    if (!nursery_auth_context()['authenticated']) {
        nursery_session_destroy(true);
    }
}

function nursery_auth_context(): array
{
    $valid = session_status() === PHP_SESSION_ACTIVE
        && ($_SESSION['authenticated'] ?? false) === true
        && is_int($_SESSION['expires_at'] ?? null)
        && $_SESSION['expires_at'] > time()
        && is_string($_SESSION['csrf_token'] ?? null)
        && preg_match('/\A[a-f0-9]{64}\z/D', $_SESSION['csrf_token']) === 1;
    return ['authenticated' => $valid, 'csrfToken' => $valid ? $_SESSION['csrf_token'] : null];
}

function nursery_authorize(): void
{
    $context = nursery_auth_context();
    if (!$context['authenticated']) {
        throw new RuntimeException('Войдите в кабинет ещё раз.', 401);
    }
    $supplied = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!nursery_same_origin() || !is_string($supplied)
        || preg_match('/\A[a-f0-9]{64}\z/D', $supplied) !== 1
        || !hash_equals($context['csrfToken'], $supplied)) {
        throw new RuntimeException('Обновите страницу и попробуйте сохранить ещё раз.', 403);
    }
}

function nursery_session_destroy(bool $clearCookie): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        $_SESSION = [];
        if (!session_destroy()) {
            throw new RuntimeException('Не удалось завершить сессию.', 500);
        }
    }
    session_id('');
    unset($_COOKIE[NURSERY_SESSION_COOKIE]);
    if ($clearCookie) {
        setcookie(NURSERY_SESSION_COOKIE, '', [
            'expires' => 1,
            'path' => '/',
            'secure' => $GLOBALS['nursery_auth_settings']['secure_cookies'],
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
    }
}

function nursery_new_session(): array
{
    nursery_session_destroy(false);
    do {
        $id = bin2hex(random_bytes(32));
    } while (file_exists($GLOBALS['nursery_auth_settings']['sessions'] . '/sess_' . $id));
    session_id($id);
    // Strict mode is relaxed only to create this server-generated random ID.
    if (!session_start(['use_strict_mode' => false])) {
        throw new RuntimeException('Не удалось начать сессию.', 500);
    }
    $_SESSION = [
        'authenticated' => true,
        'csrf_token' => bin2hex(random_bytes(32)),
        'expires_at' => time() + NURSERY_SESSION_TTL,
    ];
    return nursery_auth_context();
}

/** @return array{0: resource, 1: array} */
function nursery_login_lock(): array
{
    $directory = $GLOBALS['nursery_auth_settings']['shared'] . '/login-attempts';
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Не удалось проверить попытки входа.', 500);
    }
    $guard = fopen($directory . '/.lock', 'c+b');
    if ($guard === false || !flock($guard, LOCK_EX)) {
        throw new RuntimeException('Не удалось проверить попытки входа.', 500);
    }
    $handle = false;
    try {
        $file = $directory . '/' . hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown')) . '.json';
        if (!is_file($file)) {
            $files = glob($directory . '/*.json');
            if ($files === false) {
                throw new RuntimeException('Не удалось проверить попытки входа.', 500);
            }
            if (count($files) >= NURSERY_LOGIN_FILES) {
                foreach ($files as $existing) {
                    $expired = fopen($existing, 'r+b');
                    if ($expired !== false) {
                        if (flock($expired, LOCK_EX | LOCK_NB)) {
                            $stat = fstat($expired);
                            if ($stat !== false && $stat['mtime'] < time() - NURSERY_LOGIN_WINDOW) {
                                unlink($existing);
                            }
                        }
                        fclose($expired);
                    }
                }
                if (count(glob($directory . '/*.json') ?: []) >= NURSERY_LOGIN_FILES) {
                    header('Retry-After: 60');
                    throw new RuntimeException('Слишком много попыток входа. Попробуйте позже.', 429);
                }
            }
        }
        $handle = fopen($file, 'c+b');
        if ($handle === false || !flock($handle, LOCK_EX)) {
            throw new RuntimeException('Не удалось проверить попытки входа.', 500);
        }
        $raw = stream_get_contents($handle, 4097);
        if ($raw === false || strlen($raw) > 4096) {
            throw new RuntimeException('Не удалось проверить попытки входа.', 500);
        }
        $state = $raw === '' ? [] : json_decode($raw, true);
        if (!is_array($state)) {
            throw new RuntimeException('Не удалось проверить попытки входа.', 500);
        }
        if (!is_int($state['reset_at'] ?? null) || $state['reset_at'] <= time()) {
            $state = ['count' => 0, 'reset_at' => time() + NURSERY_LOGIN_WINDOW];
        }
        if (!is_int($state['count'] ?? null) || $state['count'] < 0) {
            throw new RuntimeException('Не удалось проверить попытки входа.', 500);
        }
        return [$handle, $state];
    } catch (Throwable $error) {
        if (is_resource($handle)) {
            fclose($handle);
        }
        throw $error;
    } finally {
        flock($guard, LOCK_UN);
        fclose($guard);
    }
}

function nursery_login_write($handle, array $state): void
{
    $json = json_encode($state);
    if ($json === false || !rewind($handle) || !ftruncate($handle, 0)
        || fwrite($handle, $json) !== strlen($json) || !fflush($handle)) {
        throw new RuntimeException('Не удалось сохранить попытку входа.', 500);
    }
}

function nursery_auth_handle(string $path): bool
{
    if (!in_array($path, ['/api/admin/session', '/api/admin/login', '/api/admin/logout'], true)) {
        return false;
    }
    $expected = $path === '/api/admin/session' ? 'GET' : 'POST';
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $expected) {
        nursery_json(405, ['error' => 'Этот способ запроса не поддерживается.'], ['Allow' => $expected]);
    }
    if ($expected === 'POST' && !nursery_same_origin()) {
        nursery_json(403, ['error' => 'Запрос с другого сайта запрещён.']);
    }
    if ($path === '/api/admin/session') {
        $context = nursery_auth_context();
        nursery_json(200, $context['authenticated'] ? $context : ['authenticated' => false]);
    }
    if ($path === '/api/admin/logout') {
        nursery_authorize();
        nursery_session_destroy(true);
        nursery_json(200, ['authenticated' => false]);
    }

    [$handle, $state] = nursery_login_lock();
    try {
        if ($state['count'] >= NURSERY_LOGIN_ATTEMPTS) {
            header('Retry-After: ' . max(1, $state['reset_at'] - time()));
            throw new RuntimeException('Слишком много попыток входа. Попробуйте позже.', 429);
        }
        $state['count']++;
        nursery_login_write($handle, $state);
        $body = nursery_read_json();
        if (!is_string($body['password'] ?? null) || strlen($body['password']) > 256) {
            throw new RuntimeException('Введите пароль.', 400);
        }
        if (!password_verify($body['password'], $GLOBALS['nursery_auth_settings']['password_hash'])) {
            throw new RuntimeException('Неверный пароль. Попробуйте ещё раз.', 401);
        }
        nursery_login_write($handle, ['count' => 0, 'reset_at' => time() + NURSERY_LOGIN_WINDOW]);
        $context = nursery_new_session();
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
    nursery_json(200, $context);
}
