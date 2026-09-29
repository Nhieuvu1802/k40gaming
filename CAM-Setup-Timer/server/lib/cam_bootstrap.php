<?php
declare(strict_types=1);

function cam_config(): array {
    static $config;
    if ($config === null) $config = require __DIR__ . '/../config/config.local.php';
    return $config;
}

function cam_db(): PDO {
    static $pdo;
    if ($pdo instanceof PDO) return $pdo;
    $c = cam_config();
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['DB_HOST'], $c['DB_PORT'], $c['DB_NAME']);
    $pdo = new PDO($dsn, $c['DB_USER'], $c['DB_PASS'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    return $pdo;
}

function cam_security_headers(): void {
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self' https://vvn.freedev.app; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}

function cam_json(array $payload, int $status = 200): never {
    http_response_code($status); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit;
}

function cam_cors(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = cam_config()['ALLOWED_ORIGINS'] ?? [];
    if ($origin !== '') {
        if ($origin === 'null' || in_array($origin, $allowed, true)) header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS'); header('Access-Control-Allow-Headers: Content-Type, X-CAM-Sync-Key');
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') exit;
}

function cam_admin_login(string $user, string $password): bool {
    $c = cam_config();
    if (!hash_equals((string)$c['ADMIN_USER'], $user)) return false;
    $actual = hash_pbkdf2('sha256', $password, (string)$c['ADMIN_SALT'], (int)$c['ADMIN_ITERATIONS'], 64, false);
    return hash_equals((string)$c['ADMIN_HASH'], $actual);
}

function cam_require_admin(): void {
    if (empty($_SESSION['cam_admin'])) { header('Location: /admin/'); exit; }
}

function cam_csrf(): string {
    if (empty($_SESSION['cam_csrf'])) $_SESSION['cam_csrf'] = bin2hex(random_bytes(24));
    return (string)$_SESSION['cam_csrf'];
}

function cam_check_csrf(): void {
    if (!isset($_POST['csrf']) || !hash_equals(cam_csrf(), (string)$_POST['csrf'])) { http_response_code(403); exit('CSRF validation failed'); }
}

function cam_catalog(): array {
    cam_promote_due_changes();
    $pdo = cam_db();
    $products = [];
    foreach ($pdo->query('SELECT data_json,revision FROM cam_products ORDER BY name') as $row) { $item = json_decode($row['data_json'], true); if (is_array($item)) { $item['_revision']=(int)$row['revision']; $products[] = $item; } }
    $materials = ['paste'=>[], 'flux'=>[], 'passives'=>[], 'die'=>[], 'stencil'=>[]];
    foreach ($pdo->query('SELECT category,data_json FROM cam_materials ORDER BY category,pn') as $row) { $item=json_decode($row['data_json'],true); if (is_array($item)) $materials[$row['category']][]=$item; }
    $meta = $pdo->query('SELECT version,spec,updated_at FROM cam_catalog_meta WHERE id=1')->fetch() ?: ['version'=>1,'spec'=>'121-0087 Rev 174','updated_at'=>null];
    return ['version'=>(int)$meta['version'], 'module'=>'CAM', 'spec'=>$meta['spec'], 'updatedAt'=>$meta['updated_at'], 'products'=>$products, 'materials'=>$materials];
}

function cam_update_product(array $payload): array {
    $config=cam_config(); $required=(string)($config['SYNC_API_KEY']??'');
    $provided=(string)($_SERVER['HTTP_X_CAM_SYNC_KEY']??'');
    $origin=(string)($_SERVER['HTTP_ORIGIN']??''); $host=(string)($_SERVER['HTTP_HOST']??'');
    $originHost=$origin!=='' ? (string)(parse_url($origin,PHP_URL_HOST)??'') : '';
    $sameOrigin=$originHost!=='' && strcasecmp($originHost,preg_replace('/:\d+$/','',$host))===0;
    if ($required!=='' && !$sameOrigin && !hash_equals($required,$provided)) throw new RuntimeException('SYNC_AUTH');
    $id=trim((string)($payload['id']??'')); $fields=$payload['fields']??null;
    if ($id==='' || !is_array($fields)) throw new InvalidArgumentException('Dữ liệu cập nhật không hợp lệ.');
    $allowed=['name','family','testPlan','engineeringTestPlan','dpmsTestPlan','fluxPartNumber','pastePartNumber','proflowPartNumber','stencilPartNumber','capacitorInfo','fluxCenter','setupProcess','commonIssues','operatorTips'];
    $pdo=cam_db(); $pdo->beginTransaction();
    try {
        $stmt=$pdo->prepare('SELECT data_json,revision FROM cam_products WHERE id=? FOR UPDATE'); $stmt->execute([$id]); $row=$stmt->fetch();
        if(!$row) throw new InvalidArgumentException('Không tìm thấy sản phẩm.');
        $item=json_decode($row['data_json'],true)?:[];
        foreach($allowed as $field) if(array_key_exists($field,$fields)) $item[$field]=trim((string)$fields[$field]);
        $revision=(int)$row['revision']+1; $json=json_encode($item,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        $pdo->prepare('INSERT INTO cam_product_history(product_id,revision,data_json,changed_by,change_note) VALUES(?,?,?,?,?)')->execute([$id,(int)$row['revision'],$row['data_json'],'app-sync','Đồng bộ từ PWA/Android']);
        $pdo->prepare('UPDATE cam_products SET name=?,family=?,data_json=?,revision=?,updated_by=? WHERE id=?')->execute([$item['name']??'', $item['family']??'', $json,$revision,'app-sync',$id]);
        $pdo->exec('UPDATE cam_catalog_meta SET version=version+1 WHERE id=1'); $pdo->commit();
        $item['_revision']=$revision; return $item;
    } catch(Throwable $e) { if($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}

function cam_migrate(): void {
    static $done=false; if($done) return;
    cam_db()->exec("CREATE TABLE IF NOT EXISTS cam_pending_changes (pending_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, product_id VARCHAR(100) NOT NULL, proposed_json MEDIUMTEXT NOT NULL, base_revision INT UNSIGNED NOT NULL, status ENUM('testing','applied','cancelled','conflict') NOT NULL DEFAULT 'testing', effective_at DATETIME NOT NULL, created_by VARCHAR(100) NOT NULL DEFAULT 'admin', change_note VARCHAR(500) NOT NULL DEFAULT '', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, applied_at DATETIME NULL, INDEX idx_cam_pending_due (status,effective_at), INDEX idx_cam_pending_product (product_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    cam_apply_content_updates();
    $done=true;
}

function cam_apply_content_updates(): void {
    $seedPath=__DIR__.'/../data/catalog.seed.json'; if(!is_file($seedPath)) return;
    $seed=json_decode((string)file_get_contents($seedPath),true); if(!is_array($seed)) return;
    $pdo=cam_db();
    foreach($seed['products']??[] as $incoming) {
        $incomingRevision=(int)($incoming['contentRevision']??0); if($incomingRevision<1 || empty($incoming['id'])) continue;
        $stmt=$pdo->prepare('SELECT data_json,revision FROM cam_products WHERE id=?'); $stmt->execute([$incoming['id']]); $row=$stmt->fetch(); if(!$row) continue;
        $current=json_decode($row['data_json'],true)?:[]; if((int)($current['contentRevision']??0)>=$incomingRevision) continue;
        $merged=array_merge($current,$incoming); $revision=(int)$row['revision']+1;
        $pdo->prepare('INSERT INTO cam_product_history(product_id,revision,data_json,changed_by,change_note) VALUES(?,?,?,?,?)')->execute([$incoming['id'],(int)$row['revision'],$row['data_json'],'content-migration','Cập nhật nội dung setup đã xác minh']);
        $pdo->prepare('UPDATE cam_products SET name=?,family=?,flow=?,data_json=?,revision=?,updated_by=? WHERE id=?')->execute([$merged['name']??'', $merged['family']??'', $merged['flow']??'both',json_encode($merged,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$revision,'content-migration',$incoming['id']]);
        $pdo->exec('UPDATE cam_catalog_meta SET version=version+1 WHERE id=1');
    }
}

function cam_promote_due_changes(): void {
    cam_migrate(); $pdo=cam_db();
    $due=$pdo->query("SELECT * FROM cam_pending_changes WHERE status='testing' AND effective_at<=NOW() ORDER BY pending_id LIMIT 20")->fetchAll();
    foreach($due as $pending) {
        $pdo->beginTransaction();
        try {
            $stmt=$pdo->prepare('SELECT data_json,revision FROM cam_products WHERE id=? FOR UPDATE'); $stmt->execute([$pending['product_id']]); $current=$stmt->fetch();
            if(!$current || (int)$current['revision']!==(int)$pending['base_revision']) { $pdo->prepare("UPDATE cam_pending_changes SET status='conflict' WHERE pending_id=?")->execute([$pending['pending_id']]); $pdo->commit(); continue; }
            $item=json_decode($pending['proposed_json'],true)?:[]; $revision=(int)$current['revision']+1;
            $pdo->prepare('INSERT INTO cam_product_history(product_id,revision,data_json,changed_by,change_note) VALUES(?,?,?,?,?)')->execute([$pending['product_id'],(int)$current['revision'],$current['data_json'],$pending['created_by'],$pending['change_note']]);
            $pdo->prepare('UPDATE cam_products SET name=?,family=?,flow=?,data_json=?,revision=?,updated_by=? WHERE id=?')->execute([$item['name']??'', $item['family']??'', $item['flow']??'both', $pending['proposed_json'], $revision, $pending['created_by'], $pending['product_id']]);
            $pdo->prepare("UPDATE cam_pending_changes SET status='applied',applied_at=NOW() WHERE pending_id=?")->execute([$pending['pending_id']]);
            $pdo->exec('UPDATE cam_catalog_meta SET version=version+1 WHERE id=1'); $pdo->commit();
        } catch(Throwable $e) { if($pdo->inTransaction()) $pdo->rollBack(); }
    }
}

function cam_seed_if_empty(): void {
    $pdo=cam_db(); cam_migrate();
    if ((int)$pdo->query('SELECT COUNT(*) FROM cam_products')->fetchColumn() > 0) return;
    $seedPath=__DIR__.'/../data/catalog.seed.json'; if (!is_file($seedPath)) return;
    $data=json_decode((string)file_get_contents($seedPath),true); if (!is_array($data)) return;
    $pdo->beginTransaction();
    try {
        $p=$pdo->prepare('INSERT INTO cam_products(id,name,family,flow,data_json,updated_by) VALUES(?,?,?,?,?,?)');
        foreach($data['products']??[] as $item) $p->execute([$item['id'],$item['name'],$item['family']??'',$item['flow']??'both',json_encode($item,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),'seed']);
        $m=$pdo->prepare('INSERT INTO cam_materials(category,pn,data_json) VALUES(?,?,?)');
        foreach($data['materials']??[] as $category=>$items) foreach($items as $item) $m->execute([$category,$item['pn'],json_encode($item,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]);
        $pdo->commit();
    } catch(Throwable $e) { $pdo->rollBack(); throw $e; }
}
