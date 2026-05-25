<?php
/**
 * Build proremote.phar from app.php + public/ + vendor/.
 *
 * Run AFTER `npm run build` (which produces public/).
 *
 * Requires php.ini setting: phar.readonly = Off
 * If you hit "creating archive disabled by ini setting", run:
 *   php -d phar.readonly=0 build-phar.php
 */

$root = __DIR__;
$pharFile = $root . '/proremote.phar';
$entry = 'app.php';

if (ini_get('phar.readonly')) {
    fwrite(STDERR, "phar.readonly is On. Re-run with:  php -d phar.readonly=0 build-phar.php\n");
    exit(1);
}

if (!is_file($root . '/public/index.html')) {
    fwrite(STDERR, "public/index.html missing. Run `npm run build` first.\n");
    exit(1);
}
if (!is_file($root . '/' . $entry)) {
    fwrite(STDERR, "$entry not found.\n");
    exit(1);
}
if (!is_file($root . '/vendor/qrcode.php')) {
    fwrite(STDERR, "vendor/qrcode.php missing.\n");
    exit(1);
}

if (file_exists($pharFile)) unlink($pharFile);

$phar = new Phar($pharFile, 0, basename($pharFile));
$phar->startBuffering();

// Whitelist exactly the files we want bundled.
$paths = [];
$paths[] = $root . '/' . $entry;
$paths[] = $root . '/vendor/qrcode.php';

$rii = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($root . '/public', FilesystemIterator::SKIP_DOTS)
);
foreach ($rii as $f) {
    if ($f->isFile()) $paths[] = $f->getPathname();
}

foreach ($paths as $abs) {
    $rel = ltrim(str_replace('\\', '/', substr($abs, strlen($root))), '/');
    $phar->addFile($abs, $rel);
}

// Stub: dispatch to app.php for both CLI and web SAPIs.
$stub = <<<'PHP'
#!/usr/bin/env php
<?php
Phar::mapPhar('proremote.phar');
require 'phar://proremote.phar/app.php';
__HALT_COMPILER();
PHP;
$phar->setStub($stub);

$phar->stopBuffering();

$count = count($paths);
$size = number_format(filesize($pharFile) / 1024, 1);
echo "Built {$pharFile}  ({$count} files, {$size} KB)\n";
echo "\nNext:\n";
echo "  php proremote.phar                    # run directly\n";
echo "  phpacker build all --src=./proremote.phar\n";
