# CAM Setup Timer

Ứng dụng Android/PWA chạy offline dành cho CAM Module.

## Chức năng

- Dashboard gọn dạng lưới 2 cột: Paste, Flux, Passives, Die, Hirata và MTP; active timers; Passdown nhanh.
- Hướng dẫn đọc nhanh theo luồng máy: Setup Tụ, Setup Die, Setup Tụ + Die; gồm điều kiện Introduce lot Tụ sau AX5, NMS/MNS thứ nhất và BTU/OXI; lot Die phải có feeder đồng bộ trên SC (không Unknown), qua hết AX5 và Slip Lot xong mới RLT vào Grohmann/GSC.
- Note vận hành: luồng DEK/DGX, AX5/AXX, ASF/Asymtek, GSC/Grohmann; an toàn mở cửa GSC và các ghi nhớ tại line.
- Bảng RLT/Buy-off: cắm Tụ 2/2 carrier; cắm Die 4/6 carrier; Tụ + Die RLT 2 carrier sau DEK và 6 carrier sau AX5. Mỗi Buy-off 6 carrier qua Grohmann phải chia 3 carrier vào Grohmann 1 và 3 carrier vào Grohmann 2.
- Paste Timer: chỉ chì trắng/Proflow đen và chì tím/Proflow tím; setup lại 24h/12h; Proflow hết hạn 72 giờ từ ON TOOL; Paste sau mở nắp hết hạn 6 ngày; riêng J58633-001 tự tính hạn 18 giờ từ ON TOOL.
- Flux Timer: chọn nhanh số giờ Pot life còn lại và tự tính giờ hết hạn; lưu tên ghi trên ống trước ON TOOL, mở nắp 36h, substrate 3h, kiểm tra Prompted `≥⅔ + pot life ≥12h`.
- Passives: hạn reel, MSL, feeder position.
- Tính Die dạng chọn nhanh: Mother Lot, Kill/Die sống và Coupon; phép tính Die Kill nhận riêng F1–F4, tự cộng tổng Kill rồi tính Die sống. Chỉ hiện phép tính đang dùng, hỗ trợ chọn dữ liệu đã biết và thu gọn lịch sử/checklist. Ngoài ra có Die lot, ATPO, substrate 599, sơ đồ vị trí cân Flux từ 3-up đến 36-up (số 1 ở hàng dưới, đếm trái sang phải).
- Máy Hirata: checklist đầu ca, chạy lot/đổi cart, trạng thái HMI, alarm và ba chế độ dừng máy; các phần chi tiết mở/đóng theo tình huống.
- Mở MTP: chọn mức Đỏ/Vàng, 3 category MMS, 6 bước tạo/theo dõi vé và danh sách thông tin cần chuẩn bị.
- Passdown: checklist 10 điểm, lưu lịch sử.
- Rules: cấm Tụ/Die/cả hai; loss code CAM CJ34/CJ20 dừng tool ở 1 unit, CJ26/CJ27/CJ21 dừng tool ở 3 unit; định nghĩa/web ER; setting conversion AX5; trigger mở MTP, chuỗi tài liệu, severity pyramid và 8 bước Setup SC.
- Dữ liệu lưu bằng `localStorage` và timer cập nhật mỗi giây.

## Cài APK v1.23

File cài đặt mới: `CAM-Setup-Timer-v1.23.apk`.

1. Chép APK sang điện thoại.
2. Mở APK và cho phép **Cài ứng dụng không rõ nguồn gốc** nếu Android hỏi.
3. Chọn **Cài đặt**.

APK hiện tại được ký bằng Android Debug certificate để cài trực tiếp và dùng nội bộ. Gỡ ứng dụng sẽ xóa dữ liệu đã lưu trên điện thoại.

## Build lại APK

Mở thư mục `android-app` bằng Android Studio, hoặc chạy trong PowerShell:

```powershell
cd android-app
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat assembleDebug
```

APK được tạo tại:

```text
android-app/app/build/outputs/apk/debug/app-debug.apk
```

Task `syncWebAssets` tự động chép `index.html`, `style.css`, `app.js` và icon mới nhất vào APK trước mỗi lần build.

## Chạy dưới dạng PWA

```powershell
python -m http.server 8080
```

Mở `http://localhost:8080`. Khi triển khai bằng HTTPS, Chrome Android có thể dùng **Add to Home Screen**.

> Ứng dụng là công cụ hỗ trợ thao tác. Luôn đối chiếu Spec/TCR/SC đang có hiệu lực trước khi chạy máy.
