# TỔNG HỢP DỰ ÁN — SPEC121-0087

> Cập nhật: 2026-09-30 · CAM Setup Timer v36 · Android v1.23

## 1. Trạng thái hiện tại

Dự án đã được hợp nhất thành một hệ thống gồm PWA, Android WebView và backend PHP/MySQL. Người dùng có thể tìm SKU/ProductGroup/Test Plan/PN, mở tab Setup của đúng sản phẩm, xem vật liệu và trình tự vận hành, sau đó chuyển thẳng sang timer hoặc bộ tính Die.

- Catalog: 22 sản phẩm, 5 loại Paste.
- Cache PWA: `cam-setup-timer-v36`.
- APK mới nhất: `CAM-Setup-Timer-v1.23.apk`.
- Source of truth: `CAM-Setup-Timer/`.
- Bốn bản frontend đã đồng bộ: source, `.deploy-staging`, `site/`, Android assets.

## 2. Cấu trúc

```text
spec121-0087/
├── CAM-Setup-Timer/
│   ├── index.html, app.js, style.css, products.js, sw.js
│   ├── server/
│   │   ├── api/catalog.php, health.php, install.php
│   │   ├── admin/index.php
│   │   ├── lib/cam_bootstrap.php
│   │   ├── data/catalog.seed.json
│   │   └── database/cam_schema.sql
│   ├── site/                         # Netlify frontend
│   ├── android-app/                  # Android wrapper
│   └── CAM-Setup-Timer-v1.23.apk
├── .deploy-staging/                  # InfinityFree mirror
├── deployment.local.env              # thông tin deploy, không commit
├── PRODUCT/                          # ảnh Product Info Center
└── picture/                          # tài liệu/ảnh/video vận hành
```

## 3. URL vận hành

| URL | Chức năng |
|---|---|
| `https://vvn.freedev.app` | PWA chính + backend |
| `https://vvn.freedev.app/api/catalog.php` | GET catalog, POST cập nhật product |
| `https://vvn.freedev.app/api/health.php` | trạng thái database |
| `https://vvn.freedev.app/admin/` | quản trị catalog |
| `https://cool-daffodil-1226c0.netlify.app` | frontend dự phòng Netlify |

Thông tin FTP, MySQL và mật khẩu quản trị được giữ trong `deployment.local.env` và `server/config/config.local.php`; không ghi mật khẩu rõ trong tài liệu tổng hợp hoặc JavaScript public.

## 4. Luồng người dùng đã hoàn thiện

1. Nhập tên sản phẩm, alias, Test Plan hoặc PN vào tìm kiếm.
2. Kết quả sản phẩm mở thẳng `Sản phẩm CAM → Setup`, không chuyển sang hướng dẫn chung.
3. Màn hình Setup hiển thị Test Plan, vật liệu/PN, tụ/feeder/nozzle, cân Flux, trình tự vận hành, lỗi thường gặp, RLT/Buy-off, loss code và tham số tính toán.
4. Nút nhanh mở Timer Paste, Timer Flux, tính Die hoặc hướng dẫn đầy đủ.
5. Khi chọn product, `dieFullSize` và `substratesPerCarrier` tự điền vào bộ tính Die/Coupon.

### V2V/VLV

V2V có revision nội dung riêng: Test Plan `71VLVFW_DCP`, Flux `D56162-002`, Paste tím `G17793-002`, Proflow tím `197532`, Stencil `1356-00`, tụ/feeder `A31095-020 | A31095-021` và quy trình DEK/DGX → AX5/AXX → ASF → GSC.

## 5. Tính toán và theo dõi

- Paste: thaw/sit, kệ 7 ngày, setup 12/24 giờ, Proflow 72 giờ, mở nắp, stencil, substrate và J58633 18 giờ.
- Flux: pot life, mở nắp, substrate, điều kiện Prompted.
- Passives: PN, lot, hạn, install, feeder và MSL.
- Die: Mother Lot, Kill F1–F4, Die sống, Coupon, lịch sử và checklist.
- Passdown: checklist và lịch sử ca.
- Dashboard: timer hoạt động, trạng thái vật liệu, product đang chọn và thao tác nhanh.

## 6. Đồng bộ nhiều thiết bị

- Catalog máy chủ là nguồn dữ liệu dùng chung.
- Khi online, sửa product từ website cùng domain được ghi vào MySQL ngay.
- Khi offline, thay đổi được giữ trong `productOverrides` và tự gửi lại khi có mạng.
- App tải lại catalog khi online, khi quay lại tab và theo chu kỳ 30 giây.
- Sự kiện `storage` đồng bộ các tab trong cùng trình duyệt.
- `SYNC_API_KEY` bảo vệ yêu cầu ghi từ origin bên ngoài; yêu cầu ghi cùng domain không làm lộ key trong frontend.
- Backend lưu revision và lịch sử trong `cam_product_history`.

## 7. Database production

Production dùng MySQL InfinityFree, không dùng các giá trị mẫu `localhost/cam_setup/cam_user`. Runtime config thật được giữ trên server và đã xác nhận có đủ host, database, username và password.

Các bảng: `cam_catalog_meta`, `cam_products`, `cam_materials`, `cam_product_history`, `cam_pending_changes`.

Migration `contentRevision` tự nâng dữ liệu sản phẩm đã có trong database, nên cập nhật seed không còn bị bỏ qua khi bảng không rỗng.

## 8. Giao diện và cache

- Sidebar desktop không còn che dashboard.
- Menu được gom nhóm: Sản phẩm CAM, Tính toán và Chức năng khác.
- Mobile giữ bottom navigation và menu trượt.
- `index.html` và `sw.js` dùng `no-store`; JS/CSS có version query.
- Service Worker dùng network-first cho script/style/worker và cache offline cho tài nguyên khác.
- Bản hiện tại dùng đồng nhất `?v=36` và cache `v36`.

## 9. Các bản cần đồng bộ

| Bản | Đường dẫn |
|---|---|
| Source | `CAM-Setup-Timer/` |
| InfinityFree | `.deploy-staging/` |
| Netlify | `CAM-Setup-Timer/site/` |
| Android offline | `CAM-Setup-Timer/android-app/app/src/main/assets/` |

File bắt buộc: `index.html`, `app.js`, `style.css`, `products.js`, `sw.js`, `manifest.webmanifest`. Backend đồng bộ riêng từ `server/` sang `.deploy-staging/api`, `lib` và `data`.

## 10. Kiểm thử bản 2026-09-30

- `node --check app.js`: đạt.
- `node --check sw.js`: đạt.
- `node check-products.js`: đạt, 22 products và 5 paste.
- JSON seed parse: đạt.
- Gradle `assembleDebug --rerun-tasks`: BUILD SUCCESSFUL.
- APK v1.23 đã tạo thành công.
- Bốn bản frontend đã được đồng bộ trước khi build.

PHP CLI chưa được cài trên máy phát triển nên chưa chạy `php -l`. Cần xác nhận backend bằng `/api/health.php` sau mỗi lần deploy.

## 11. Thay đổi mới nhất

### v36 — 2026-09-30

- Hoàn thiện thẻ Setup theo product: flow, vật liệu, vận hành, loss code và tham số tính toán.
- Sửa tìm kiếm để mở đúng tab Setup của sản phẩm.
- Thêm quy trình V2V riêng và migration database theo `contentRevision`.
- Sửa layout desktop và nhóm lại sidebar.
- Đổi nút chỉnh product thành “Lưu và đồng bộ”.
- Sửa xác thực đồng bộ: same-origin ghi database, external origin vẫn cần Sync API Key.
- Đồng nhất cache/version lên v36.
- Build Android v1.23.
- Loại mật khẩu rõ khỏi tài liệu tổng hợp.

## 12. Thành phần không cần cài

Không cần cài WordPress, Joomla hoặc ứng dụng Softaculous khác. Chúng không giúp PWA CAM và có thể tạo thêm bề mặt bảo mật hoặc xung đột document root. Stack cần thiết đã đủ: HTML/CSS/JavaScript + Service Worker + PHP + MySQL.

InfinityFree từng báo `Account stuck in processing — Affected: Hosting Platform`. Khi trạng thái này xuất hiện, FTP vẫn có thể nhận file nhưng website/CDN có thể phục vụ bản cũ tới khi nền tảng xử lý xong. Đây là trạng thái hạ tầng bên ngoài.

## 13. Quy trình phát hành

```text
Sửa source CAM-Setup-Timer/
  → chạy syntax/catalog tests
  → bump version index/app/sw
  → sync .deploy-staging + site + Android assets
  → build APK
  → FTP deploy .deploy-staging
  → kiểm tra /api/health.php và tìm thử V2V
```
