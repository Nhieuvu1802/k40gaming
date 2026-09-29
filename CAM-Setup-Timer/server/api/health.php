<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/cam_bootstrap.php';
cam_cors();
try { cam_seed_if_empty(); $count=(int)cam_db()->query('SELECT COUNT(*) FROM cam_products')->fetchColumn(); cam_json(['success'=>true,'service'=>'CAM Product API','database'=>'online','products'=>$count,'time'=>gmdate('c')]); }
catch(Throwable $e) { cam_json(['success'=>false,'service'=>'CAM Product API','database'=>'offline'],503); }

