<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/cam_bootstrap.php';
header('Content-Type: text/plain; charset=utf-8');
try {
    $pdo=cam_db();
    $sql=(string)file_get_contents(__DIR__.'/../database/cam_schema.sql');
    foreach(array_filter(array_map('trim',preg_split('/;\s*(?:\r?\n|$)/',$sql))) as $statement) $pdo->exec($statement);
    cam_seed_if_empty();
    echo "CAM database installed. Products: ".(int)$pdo->query('SELECT COUNT(*) FROM cam_products')->fetchColumn();
} catch(Throwable $e) { http_response_code(500); echo 'Install failed: '.$e->getMessage(); }

