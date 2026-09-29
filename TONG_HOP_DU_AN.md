# TỔNG HỢP DỰ ÁN — SPEC121-0087
> Cập nhật: 2026-09-29 | Cleaned: xóa deploy-backup, APK cũ, dist, zip, debug files

---

## 1. TỔNG QUAN CẤU TRÚC

```
spec121-0087/
├── CAM-Setup-Timer/                   ← ★ DỰ ÁN CHÍNH — PWA + Android
│   ├── index.html, app.js, style.css, sw.js, products.js
│   ├── server/                        ← Backend PHP/MySQL
│   │   ├── config/config.local.php    ← DB + admin credentials
│   │   ├── lib/cam_bootstrap.php      ← Core (DB, auth, CORS)
│   │   ├── api/catalog.php            ← GET/POST catalog
│   │   ├── api/health.php             ← Health check
│   │   ├── api/install.php            ← DB installer
│   │   ├── admin/index.php            ← Admin CRUD
│   │   └── database/cam_schema.sql    ← MySQL schema
│   ├── site/                          ← Deploy #1: Netlify
│   ├── android-app/                   ← Deploy #2: Android APK
│   └── CAM-Setup-Timer-v1.22.apk      ← Latest APK
├── .deploy-staging/                   ← Deploy #3: InfinityFree
├── deployment.local.env               ← FTP + admin credentials
├── PRODUCT/                           ← Tài liệu sản phẩm
└── picture/                           ← Ảnh/video line
```

---

## 2. TẤT CẢ LINKS & URL

### 2.1 Production URLs

| URL | Loại | Mô tả |
|-----|------|-------|
| `https://vvn.freedev.app` | Hosting chính | InfinityFree — PHP backend + PWA |
| `https://vvn.freedev.app/api/catalog.php` | API | GET catalog; POST update product |
| `https://vvn.freedev.app/api/health.php` | Health check | DB status, product count |
| `https://vvn.freedev.app/admin/` | Admin dashboard | CRUD products/materials |
| `https://vvn.freedev.app/?app=android` | Android entry | WebView URL mặc định |
| `https://cool-daffodil-1226c0.netlify.app` | Netlify PWA | Static PWA frontend |

### 2.2 Internal Links (trong HTML content)
| URL | Vị trí | Mô tả |
|-----|--------|-------|
| `http://mms-ss.intel.com` | rules page | MMS/MTP — Hệ thống vé sự cố Intel |

### 2.3 CORS Origins (config.local.php)
```php
'ALLOWED_ORIGINS' => [
    'http://localhost:8080',                          // Dev
    'http://127.0.0.1:8080',                         // Dev alt
    'https://cool-daffodil-1226c0.netlify.app',      // Netlify production
],
```

### 2.4 Local
| URL | Mô tả |
|-----|-------|
| `http://localhost:8080` | Dev: `python -m http.server 8080` |

---

## 3. TẤT CẢ TÀI KHOẢN & MẬT KHẨU

### 3.1 FTP — InfinityFree

| Field | Value |
|-------|-------|
| Host | `ftpupload.net` |
| Username | `if0_42828937` |
| Password | `Vugiahan1909` |
| Port | `21` |
| Path | `/htdocs` |

### 3.2 Admin Web

| Field | Value |
|-------|-------|
| URL | `https://vvn.freedev.app/admin/` |
| Username | `admin` |
| Password | `CamAdmin-29ok` |

### 3.3 PBKDF2 Hash (PHP Auth)

| Field | Value |
|-------|-------|
| Algo | PBKDF2-SHA256, 210000 iter |
| Password | `CamAdmin-29ok` |
| Hash | `5453388869b71c6a...75dadda` |
| Salt | `9ad1702985dd659f...171cf02` |

### 3.4 MySQL

| Field | Value |
|-------|-------|
| Host | `localhost` |
| Port | `3306` |
| DB | `cam_setup` |
| User | `cam_user` |
| Password | *(rỗng — cần điền production)* |
| SYNC_API_KEY | `lxvU3KIaf1WMmZwzABDiFJpdtNhqTjX4bPcVY5Ro2nykseH8` |

---

## 4. CÁC COMPONENT & CÁCH SỬ DỤNG

### 4.1 ★ CAM Setup Timer (PWA)
- **Path:** `CAM-Setup-Timer/`
- **Run:** `python -m http.server 8080`
- **Tech:** Vanilla JS, PWA offline-first, SW cache `v35`

### 4.2 ★ Android APK
- **Path:** `CAM-Setup-Timer/android-app/`
- **Build:** `.\gradlew.bat assembleDebug`
- **Output:** `android-app/app/build/outputs/apk/debug/app-debug.apk`
- **Latest:** `CAM-Setup-Timer-v1.22.apk`
- **Behavior:** Online → `vvn.freedev.app` → fail → offline fallback

### 4.3 ★ Backend PHP/MySQL
- **Path:** `CAM-Setup-Timer/server/`
- **Deploy:** FTP upload lên `vvn.freedev.app/htdocs/`
- **Endpoints:** GET/POST `/api/catalog.php`, GET `/api/health.php`, GET `/api/install.php`

### 4.4 ★ Netlify Deploy (PWA only)
- **Path:** `CAM-Setup-Timer/site/`
- **Config:** `netlify.toml` + `_headers` + `_redirects`
- **No backend** — gọi API `vvn.freedev.app` qua CORS

### 4.5 ★ .deploy-staging (Full Stack)
- **Path:** `.deploy-staging/`
- **Mirror** của `CAM-Setup-Timer/` + `server/` → FTP upload

---

## 5. MỤC ĐÃ XÓA (2026-09-29)

| # | Item | Lý do | Status |
|---|------|-------|--------|
| 1 | `deploy-backup/` | Draws API cũ (laptopvvn.vercel.app), không liên quan CAM | ✅ ĐÃ XÓA |
| 2 | 21 APK v1.0→v1.21 | Chỉ giữ v1.22 | ✅ ĐÃ XÓA (~200MB) |
| 3 | `CAM-Setup-Timer-PWA.zip` | Đã có `site/` folder | ✅ ĐÃ XÓA |
| 4 | `dist/` | Build output legacy | ✅ ĐÃ XÓA |
| 5 | `_css.txt`, `_js.txt` | Debug artifact | ✅ ĐÃ XÓA |
| 6 | `laptopvvn.vercel.app` trong ALLOWED_ORIGINS | Dự án khác, không liên quan | ✅ ĐÃ XÓA |

---

## 6. MỤC CÓ THỂ ĐỒNG BỘ

### 6.1 ★★★ 3 COPY SYNC (BẮT BUỘC)

| # | Vị trí | Purpose |
|---|--------|---------|
| 1 | `CAM-Setup-Timer/` | **Source of truth** |
| 2 | `.deploy-staging/` | Mirror → FTP upload |
| 3 | `android-app/.../assets/` | Android offline fallback |

### 6.2 ★★ Thêm Netlify (4 COPY)

| # | Vị trí | Deploy |
|---|--------|--------|
| 4 | `CAM-Setup-Timer/site/` | Netlify |

### 6.3 Files cần sync

| File | Sync khi nào |
|------|-------------|
| `app.js` | Mỗi edit |
| `style.css` | Mỗi edit |
| `sw.js` | Mỗi edit + bump version 5 nơi |
| `index.html` | Mỗi edit |
| `products.js` | Khi thêm/sửa sản phẩm |
| `manifest.webmanifest` | Hiếm |
| `server/` | Khi sửa backend |

### 6.4 SW Version Sync Locations
1. `CAM-Setup-Timer/sw.js` → `const CACHE = 'cam-setup-timer-vXX'`
2. `.deploy-staging/sw.js`
3. `android-app/.../assets/sw.js`
4. `site/sw.js`
5. + `sw.js?v=XX` trong `app.js` (4 copies)

---

## 7. KẾT NỐI GIỮA CÁC DỰ ÁN

### 7.1 ★★★ PWA ↔ Backend PHP — ĐÃ KẾT NỐI
- PWA fetch catalog từ `vvn.freedev.app/api/catalog.php` mỗi 10 phút
- `pushProductEdit()` POST updates lên backend
- Merge catalog offline (products.js) + remote

### 7.2 ★★ PWA ↔ Android WebView — ĐÃ KẾT NỐI
- Android mở online → fail → offline fallback
- Assets sync từ source

### 7.3 ★★ PWA ↔ Netlify — ĐÃ KẾT NỐI ✅
- URL: `https://cool-daffodil-1226c0.netlify.app`
- Static PWA gọi backend qua CORS (ALLOWED_ORIGINS đã thêm)

### 7.4 ★ Admin ↔ PWA — CHƯA HOÀN THIỆN
- Admin CRUD có sẵn
- `SYNC_API_KEY` chưa điền

### 7.5 ★ GitHub ↔ FTP — CHƯA TỰ ĐỘNG
- Manual deploy hiện tại
- Thiếu CI/CD

---

## 8. HÀNH ĐỘNG CÒN LẠI

| # | Hành động | Ưu tiên |
|---|-----------|---------|
| 1 | **Điền `DB_PASS`** trong config.local.php (production) | 🔴 Cao |
| 2 | **Git commit + push** | 🔴 Cao |
| 3 | **Deploy Netlify** từ `site/` + thêm domain vào ALLOWED_ORIGINS | ✅ Hoàn thành |
| 4 | **Setup GitHub Actions → FTP deploy** | 🟢 Thấp |

### Đã hoàn thành (2026-09-29)
- ✅ Xóa `deploy-backup/` (draws API cũ)
- ✅ Xóa 21 APK v1.0→v1.21 (~200MB)
- ✅ Xóa `CAM-Setup-Timer-PWA.zip`, `dist/`, `_css.txt`, `_js.txt`
- ✅ Xóa `laptopvvn.vercel.app` khỏi ALLOWED_ORIGINS
- ✅ Fix `.gitignore` — thêm picture/, PRODUCT.rar, *.apk, prompts, check-products.js
- ✅ `SYNC_API_KEY` = `lxvU3KIaf1WMmZwzABDiFJpdtNhqTjX4bPcVY5Ro2nykseH8`
- ✅ CORS: localhost:8080 + `https://cool-daffodil-1226c0.netlify.app`
- ✅ Sync 3 copy (app.js, style.css, sw.js, products.js, index.html — MD5 match)

---

## 9. DATABASE SCHEMA

```sql
cam_catalog_meta   — 1 row: version, spec, updated_at
cam_products       — id, name, family, flow, data_json, revision
cam_materials      — category(paste/flux/passives/die/stencil), pn, data_json
cam_product_history — audit: product_id, revision, data_json, changed_by
cam_pending_changes — staging: product_id, proposed_json, status, effective_at
```

---

## 10. DEPLOYMENT FLOW

```
LOCAL EDIT (CAM-Setup-Timer/)
    ↓ sync 3 copies
    ├──→ site/ → Netlify deploy
    ├──→ .deploy-staging/ → FTP → vvn.freedev.app
    └──→ android-app/.../assets/ → Gradle → APK
```
