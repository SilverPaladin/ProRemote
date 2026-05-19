<?php
/**
 * ProPresenter Remote — entry point.
 *
 * Runs in three contexts with the SAME code path:
 *   1. Plain PHP CLI:        php app.php
 *   2. Phar:                 php propresenter-remote.phar
 *   3. phpacker binary:      ./propresenter-remote (windows-x64.exe, etc.)
 *
 * Implements its own minimal HTTP server using stream_socket_server() rather
 * than re-exec'ing `php -S`, because the SAPI used inside the phpacker binary
 * (static-php-cli "micro") doesn't support the built-in web server.
 */

// APP_ROOT works for both real directories and phar:// streams.
define('APP_ROOT', __DIR__);

$port = (int)(getenv('PORT') ?: 8000);
$host = getenv('HOST') ?: '0.0.0.0';

if (!file_exists(APP_ROOT . '/public/index.html')) {
    fwrite(STDERR, "Missing public/index.html. Run `npm run build` first.\n");
    exit(1);
}

// Enable ANSI on legacy Windows consoles so the QR colors render
// (modern Windows 10+ Terminal honors the existing virtual-terminal flag).
if (stripos(PHP_OS_FAMILY, 'WIN') === 0 && function_exists('sapi_windows_vt100_support')) {
    @sapi_windows_vt100_support(STDOUT, true);
}

$lanIp    = detect_lan_ip() ?: '127.0.0.1';
$localUrl = "http://127.0.0.1:{$port}";
$lanUrl   = "http://{$lanIp}:{$port}";

echo "\n";
echo "  ProPresenter Remote\n";
echo "  -------------------\n";
echo "  Local:   {$localUrl}\n";
echo "  Network: {$lanUrl}\n";
echo "\n  Scan with your phone / tablet (same Wi-Fi):\n\n";
print_qr_ansi($lanUrl);
echo "\n  Press Ctrl+C to stop.\n\n";

// Best-effort: open default browser on the host machine.
// if (stripos(PHP_OS_FAMILY, 'WIN') === 0) {
//     @pclose(@popen("start \"\" \"{$localUrl}\"", 'r'));
// } elseif (PHP_OS_FAMILY === 'Darwin') {
//     @exec("open '{$localUrl}' > /dev/null 2>&1 &");
// } else {
//     @exec("xdg-open '{$localUrl}' > /dev/null 2>&1 &");
// }

run_server($host, $port);

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

/**
 * Minimal blocking HTTP/1.0 server that serves files from APP_ROOT/public.
 * Single-threaded; one request at a time. That's plenty for a personal LAN
 * remote — heavy traffic goes directly from the browser to ProPresenter.
 */
function run_server($host, $port) {
    $errno = 0; $errstr = '';
    $listen = @stream_socket_server("tcp://{$host}:{$port}", $errno, $errstr);
    if (!$listen) {
        fwrite(STDERR, "Failed to bind {$host}:{$port} — {$errstr}\n");
        exit(1);
    }
    while (true) {
        $conn = @stream_socket_accept($listen, -1, $peer);
        if (!$conn) continue;
        try {
            handle_request($conn);
        } catch (Throwable $e) {
            fwrite(STDERR, "Request error: " . $e->getMessage() . "\n");
        }
        @fclose($conn);
    }
}

function handle_request($conn) {
    stream_set_timeout($conn, 5);

    // Read request line + headers.
    $raw = '';
    while (!feof($conn)) {
        $line = @fgets($conn, 8192);
        if ($line === false) return;
        $raw .= $line;
        if ($line === "\r\n" || $line === "\n") break;
        if (strlen($raw) > 16384) return; // header bomb guard
    }
    if ($raw === '') return;

    if (!preg_match('#^(\S+)\s+(\S+)\s+HTTP/[\d.]+#', $raw, $m)) {
        send_response($conn, 400, [], 'Bad Request');
        return;
    }
    $uri = $m[2];
    $path = parse_url($uri, PHP_URL_PATH);
    if ($path === false || $path === null) $path = '/';

    // Decode percent-escapes and reject path traversal.
    $decoded = rawurldecode($path);
    $normalized = '/' . ltrim(str_replace('\\', '/', $decoded), '/');
    if (strpos($normalized, '/..') !== false) {
        send_response($conn, 400, [], 'Bad Request');
        return;
    }

    $candidate = APP_ROOT . '/public' . $normalized;
    $indexHtml = APP_ROOT . '/public/index.html';

    if ($normalized !== '/' && @is_file($candidate)) {
        send_file($conn, $candidate);
    } elseif (@is_file($indexHtml)) {
        send_file($conn, $indexHtml);
    } else {
        send_response($conn, 404, [], '404 Not Found');
    }
}

function send_file($conn, $path) {
    $body = @file_get_contents($path);
    if ($body === false) {
        send_response($conn, 500, [], 'Read error');
        return;
    }
    static $types = [
        'html' => 'text/html; charset=utf-8',
        'htm'  => 'text/html; charset=utf-8',
        'js'   => 'application/javascript; charset=utf-8',
        'mjs'  => 'application/javascript; charset=utf-8',
        'css'  => 'text/css; charset=utf-8',
        'json' => 'application/json; charset=utf-8',
        'svg'  => 'image/svg+xml',
        'png'  => 'image/png',
        'jpg'  => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif'  => 'image/gif',
        'ico'  => 'image/x-icon',
        'webp' => 'image/webp',
        'woff' => 'font/woff',
        'woff2'=> 'font/woff2',
        'ttf'  => 'font/ttf',
        'otf'  => 'font/otf',
        'map'  => 'application/json; charset=utf-8',
        'txt'  => 'text/plain; charset=utf-8',
    ];
    $ext  = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $mime = $types[$ext] ?? 'application/octet-stream';
    send_response($conn, 200, ['Content-Type' => $mime], $body);
}

function send_response($conn, $status, $headers, $body) {
    static $reasons = [
        200 => 'OK',
        400 => 'Bad Request',
        404 => 'Not Found',
        500 => 'Internal Server Error',
    ];
    $reason = $reasons[$status] ?? 'OK';
    $headers['Content-Length'] = (string)strlen($body);
    $headers['Connection']     = 'close';
    if (!isset($headers['Cache-Control'])) {
        $headers['Cache-Control'] = 'no-cache';
    }
    $out = "HTTP/1.0 {$status} {$reason}\r\n";
    foreach ($headers as $k => $v) {
        $out .= "{$k}: {$v}\r\n";
    }
    $out .= "\r\n" . $body;
    @fwrite($conn, $out);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Best-effort detection of the machine's LAN IP. Opens a UDP "connection" to a
 * public address (no packets are actually sent) so the OS picks the route's
 * source address — the IP other devices on the LAN can reach.
 */
function detect_lan_ip() {
    $sock = @stream_socket_client('udp://8.8.8.8:53', $errno, $errstr, 1, STREAM_CLIENT_CONNECT);
    if ($sock) {
        $name = @stream_socket_get_name($sock, false);
        @fclose($sock);
        if ($name && ($pos = strrpos($name, ':')) !== false) {
            $ip = substr($name, 0, $pos);
            if (filter_var($ip, FILTER_VALIDATE_IP) && $ip !== '0.0.0.0') {
                return $ip;
            }
        }
    }
    $host = gethostname();
    if ($host) {
        $ip = gethostbyname($host);
        if (filter_var($ip, FILTER_VALIDATE_IP) && !str_starts_with($ip, '127.')) {
            return $ip;
        }
    }
    return null;
}

/**
 * Render a URL as a QR code to STDOUT using ANSI background colors so it
 * scans on dark and light terminals alike.
 */
function print_qr_ansi($text) {
    require_once APP_ROOT . '/vendor/qrcode.php';
    $qr = QRCode::getMinimumQRCode($text, QR_ERROR_CORRECT_LEVEL_M);
    $n  = $qr->getModuleCount();
    $quiet = 2;
    $white = "\033[107m  \033[0m";
    $black = "\033[40m  \033[0m";
    $blankRow = str_repeat($white, $n + $quiet * 2);

    for ($i = 0; $i < $quiet; $i++) echo $blankRow . "\n";
    for ($r = 0; $r < $n; $r++) {
        echo str_repeat($white, $quiet);
        for ($c = 0; $c < $n; $c++) {
            echo $qr->isDark($r, $c) ? $black : $white;
        }
        echo str_repeat($white, $quiet) . "\n";
    }
    for ($i = 0; $i < $quiet; $i++) echo $blankRow . "\n";
}
