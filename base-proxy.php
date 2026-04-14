<?php
header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: public, max-age=3600');

$github_raw_url = 'https://raw.githubusercontent.com/sharanvkt/batra-razorpay/main/base.js';
$cache_file     = __DIR__ . '/base.cache.js';
$cache_ttl      = 3600; // 1 hour

$is_stale = !file_exists($cache_file) || (time() - filemtime($cache_file) > $cache_ttl);

if ($is_stale) {
    $content = @file_get_contents($github_raw_url);
    if ($content !== false) {
        file_put_contents($cache_file, $content);
    }
}

if (file_exists($cache_file)) {
    readfile($cache_file);
} else {
    echo @file_get_contents($github_raw_url);
}
