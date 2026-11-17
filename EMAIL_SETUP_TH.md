# คู่มือตั้งค่าระบบอีเมล TDA Project Tracker

ระบบส่งอีเมลใช้ Firebase Cloud Functions (รุ่นที่ 2) และ Gmail SMTP โดยอีเมลจะแสดงชื่อผู้ส่งเป็น **TDA Project Tracker** และส่งถึง **pisit.seub@gmail.com**

## ระบบจะแจ้งเตือนเมื่อใด

1. มีพนักงานส่งโครงการใหม่ — ส่งอีเมลแจ้งหัวหน้า
2. มีการเปลี่ยนสถานะโครงการ — ส่งอีเมลแจ้งหัวหน้า
3. ทุกวันเวลา 09:00 น. (เวลาไทย) — ส่งสรุปโครงการที่เลยกำหนดและยังไม่เคยแจ้งสำหรับวันกำหนดส่งนั้น

การแก้ชื่อโครงการหรือรายละเอียดอย่างเดียวจะไม่ส่งอีเมล ส่วนการแจ้งเตือนโครงการเกินกำหนดจะส่งครั้งเดียวต่อโครงการและวันกำหนดส่ง เพื่อไม่ให้ส่งซ้ำทุกวัน

## ขั้นตอนตั้งค่าครั้งแรก

### ขั้นที่ 1: เตรียม Gmail สำหรับเป็นผู้ส่ง

ใช้ Gmail ที่คุณหรือแผนกควบคุมได้และได้รับอนุญาตให้ใช้ส่งเมลระบบ อาจสร้างบัญชีแยกสำหรับระบบก็ได้ ไม่จำเป็นต้องใช้บัญชีของหัวหน้าเป็นผู้ส่ง

1. เข้าสู่ระบบ Gmail ที่จะใช้เป็นผู้ส่ง
2. เปิดหน้า Google Account Security: https://myaccount.google.com/security
3. เปิด **การยืนยันแบบ 2 ขั้นตอน (2-Step Verification)**
4. ไปที่หน้า App Passwords: https://myaccount.google.com/apppasswords
5. สร้าง App Password ตั้งชื่อว่า `TDA Project Tracker`
6. คัดลอกรหัส 16 ตัวเก็บไว้ชั่วคราว และอย่าส่งรหัสนี้ในแชตหรือใส่ใน GitHub

หมายเหตุ: Google จะแสดงเมนู App Passwords เมื่อบัญชีรองรับและเปิด 2-Step Verification แล้ว หากไม่พบเมนู อาจเป็นเพราะนโยบายความปลอดภัยของบัญชี ให้หยุดก่อนและแจ้งผมเพื่อเลือกวิธี OAuth หรือผู้ให้บริการอีเมลอื่น

### ขั้นที่ 2: เปิดแพ็กเกจ Firebase Blaze

Cloud Functions และงานตรวจสอบตามเวลาต้องใช้แพ็กเกจ Blaze (คิดค่าบริการตามการใช้งาน)

1. เปิด https://console.firebase.google.com/project/tda-tracke/usage/details
2. ตรวจสอบโปรเจกต์ให้เป็น `tda-tracke`
3. อัปเกรดเป็น Blaze และผูกบัญชีสำหรับเรียกเก็บเงิน
4. ตั้ง Budget Alert ใน Google Cloud ก่อนเปิดใช้งานจริง

Budget Alert เป็นการแจ้งเตือนค่าใช้จ่าย ไม่ใช่การจำกัดค่าใช้จ่ายสูงสุด โปรดตรวจสอบราคาและการเรียกเก็บเงินก่อนยืนยัน

### ขั้นที่ 3: เตรียมคอมพิวเตอร์

ติดตั้ง Node.js รุ่น 22 จาก https://nodejs.org/ และติดตั้ง Git หากยังไม่มี จากนั้นเปิด PowerShell แล้วรัน:

```powershell
npm install -g firebase-tools
firebase login
git clone https://github.com/tda-tracker/tda-tracke.git
cd tda-tracke
npm install --prefix functions
```

ถ้าเคยดาวน์โหลดโปรเจกต์ไว้แล้ว ให้เปิด PowerShell ในโฟลเดอร์โปรเจกต์นั้นแทนการ clone ซ้ำ

### ขั้นที่ 4: บันทึกข้อมูลผู้ส่งอย่างปลอดภัยใน Firebase

รันคำสั่งทีละบรรทัด:

```powershell
firebase functions:secrets:set SMTP_USER --project tda-tracke
firebase functions:secrets:set SMTP_APP_PASSWORD --project tda-tracke
```

เมื่อระบบถามค่า:
- `SMTP_USER`: ใส่อีเมล Gmail ที่ใช้เป็นผู้ส่ง
- `SMTP_APP_PASSWORD`: ใส่ App Password 16 ตัว (เอาช่องว่างออก)

ข้อมูลเหล่านี้จะถูกเก็บเป็น Firebase Secrets ไม่ต้องแก้ไฟล์ `firebase-config.js` และห้าม commit รหัสผ่านลง GitHub

### ขั้นที่ 5: Deploy ระบบส่งอีเมล

จากโฟลเดอร์หลักของโปรเจกต์ รัน:

```powershell
firebase deploy --only functions --project tda-tracke
```

การ deploy ครั้งแรกอาจถามให้เปิดใช้ Google Cloud APIs หรือสร้าง service account ให้อ่านรายละเอียดก่อนกดยืนยัน

### ขั้นที่ 6: ทดสอบ

1. เปิดเว็บ TDA Project Tracker และเข้าสู่ระบบด้วยบัญชีพนักงานทดสอบ
2. เพิ่มโครงการใหม่ — กล่องเมลหัวหน้าควรได้รับอีเมล **New project submitted**
3. เปลี่ยนสถานะโครงการ — กล่องเมลหัวหน้าควรได้รับอีเมล **Project status changed**
4. ทดสอบแจ้งเตือนเกินกำหนดโดยเพิ่มโครงการทดสอบที่กำหนดส่งเป็นวันก่อนหน้าและสถานะยังไม่เสร็จ ระบบจะตรวจตามรอบ 09:00 น. เวลาไทย
5. ตรวจกล่อง Spam/Junk และ Cloud Functions Logs หากไม่พบอีเมล

## ข้อควรรู้ก่อนนำไปใช้จริง

- Gmail SMTP พร้อม App Password เหมาะกับการทดลองระบบภายในปริมาณไม่มาก แต่ Gmail ไม่ได้ออกแบบมาสำหรับงานส่งอีเมลอัตโนมัติปริมาณสูง และอาจบล็อกการเข้าสู่ระบบที่ดูผิดปกติ
- หากนำไปใช้จริงในองค์กรเป็นระยะยาว ควรพิจารณาผู้ให้บริการ Transactional Email พร้อมโดเมนที่องค์กรยืนยันแล้ว หรือ Gmail OAuth ที่ฝ่าย IT อนุมัติ
- หาก App Password รั่วไหล ให้เพิกถอนจาก Google Account และตั้งค่า Firebase Secret ใหม่ทันที
- โค้ดใน GitHub ยังไม่ทำให้ระบบส่งเมลเองจนกว่าจะตั้งค่า Secrets และ Deploy Cloud Functions สำเร็จ
