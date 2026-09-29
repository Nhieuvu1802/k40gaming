<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/cam_bootstrap.php';
cam_cors();
$method=$_SERVER['REQUEST_METHOD']??'GET';
if ($method==='OPTIONS') exit;
try {
    cam_seed_if_empty();
    if($method==='GET') cam_json(cam_catalog());
    if($method==='POST') {
        $payload=json_decode((string)file_get_contents('php://input'),true);
        if(!is_array($payload) || ($payload['action']??'')!=='update_product') cam_json(['success'=>false,'error'=>'Invalid action'],400);
        cam_json(['success'=>true,'product'=>cam_update_product($payload),'catalog'=>cam_catalog()]);
    }
    cam_json(['success'=>false,'error'=>'Method not allowed'],405);
} catch(InvalidArgumentException $e) { cam_json(['success'=>false,'error'=>$e->getMessage()],400); }
catch(RuntimeException $e) { cam_json(['success'=>false,'error'=>$e->getMessage()==='SYNC_AUTH'?'Không có quyền đồng bộ.':'Không thể đồng bộ.'],403); }
catch(Throwable $e) { cam_json(['success'=>false,'error'=>'Database unavailable'],503); }
