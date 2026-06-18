# 🤖 JoyTelegram - Advanced Telegram Bot

<p align="center">
  <img src="src/thumbnail.jpg" alt="JoyTelegram" width="350" style="border-radius: 50%;">
</p>

<p align="center">
  <a href="https://github.com/Futaroukun/tele"><img src="https://img.shields.io/github/stars/Futaroukun/tele?style=for-the-badge" alt="Stars"></a>
  <a href="https://github.com/Futaroukun/tele/network/members"><img src="https://img.shields.io/github/forks/Futaroukun/tele?style=for-the-badge" alt="Forks"></a>
  <a href="https://github.com/Futaroukun/tele/issues"><img src="https://img.shields.io/github/issues/Futaroukun/tele?style=for-the-badge" alt="Issues"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-v24.x-green?style=for-the-badge&logo=node.js" alt="Node.js"></a>
</p>

---

**JoyTelegram** adalah bot Telegram berbasis Node.js yang dikembangkan dengan arsitektur modular (plugin-based) yang tangguh dan responsif. Dirancang dengan kemudahan penggunaan, efisiensi memori, serta kompatibilitas modul yang sangat fleksibel.

---

## 🌟 Fitur Unggulan (Key Features)

### 📝 1. Registrasi Akun Interaktif & Cerdas
* **Step-by-Step Wizard:** Pendaftaran terpadu menggunakan tombol interaktif (Inline Keyboards) untuk Name ➔ Gender ➔ Birthdate ➔ Confirmation.
* **Tanggal Lahir Permanen:** Umur dan tanggal lahir dikunci secara permanen di database. Sekali diisi tidak dapat diubah oleh user demi validitas data.
* **Smart Account Reset:** Jika user menghapus akun (`/unreg`), data tanggal lahir dan umur akan tetap tersimpan aman di database sehingga saat mendaftar kembali langkah pengisian umur otomatis dilewati secara instan.

### 🖼️ 2. Sticker & Sticker Pack Generator Otomatis
* **Pembuatan Cepat:** Kirim satu gambar untuk menjadikannya stiker berkualitas tinggi berformat WebP dengan ukuran yang disesuaikan secara otomatis.
* **Sticker Pack Otomatis:** Kirim 5+ gambar sekaligus, bot akan secara otomatis mengompilasi dan mengunggahnya menjadi sebuah **Sticker Pack Resmi Telegram** dan memberikan link akses langsung kepada Anda.
* **Debounce Engine:** Menggunakan sistem timer pintar, mendeteksi secara otomatis saat Anda selesai mengirim gambar (tanpa perlu mengetik perintah penutup).

### 💻 3. Konsol Developer & Fitur Owner Terintegrasi
* **Live JavaScript Eval (`>` & `=>`):** Mengevaluasi kode JavaScript langsung melalui obrolan chat dengan respon instan.
* **Dynamic Context Mapping:** Mengarahkan variabel `user` and `conn.user` secara otomatis ke pengirim pesan yang sedang di-reply. Mempermudah proses pengujian fitur spesifik ke user tertentu.
* **Direct Terminal/Shell Execution (`$`):** Jalankan perintah bash/terminal langsung dari ruang obrolan chat Anda.
* **Dynamic Plugin Controller (`/onplugin` / `/offplugin`):** Nyalakan atau matikan modul/plugin tertentu secara instan tanpa perlu me-restart server.
* **Auto-Supervisor Restart (`/restart`):** Dilengkapi dengan *process supervisor* tangguh yang menjaga bot tetap hidup dan dapat di-restart dengan aman dari dalam chat.

### ⚡ 4. Arsitektur Ringan & Cepat (ESM-Plugin Based)
* **Modular Codebase:** Setiap fitur dikembangkan secara terpisah di folder `plugins/`. Mempermudah penambahan fitur baru tanpa menyentuh kode inti.
* **Hot-Reload:** Perubahan pada file di folder `plugins/` akan dideteksi dan dimuat ulang secara otomatis tanpa perlu mematikan aplikasi.
* **Optimasi Gambar & Memori:** Memanfaatkan pustaka `sharp` untuk kompresi dan pemrosesan gambar berkinerja tinggi.

---

## 📂 Struktur Folder
```bash
JoyTelegram/
├── function/           # Modul utilitas pembantu (Button parser, Cooldown, dll)
├── plugins/            # Direktori seluruh fitur/modul/perintah (Plugins)
│   ├── info-daftar.js  # Sistem registrasi
│   ├── info-ping.js    # Cek ping & spesifikasi sistem
│   ├── main-menu.js    # Sistem menu dinamis dengan tombol
│   ├── owner-exec.js   # Konsol eval, exec, & shell executor
│   ├── owner-plug.js   # Pengaktif/nonaktifkan modul
│   ├── owner-restart.js# Pengontrol restart sistem
│   └── sticker.js      # Pembuat stiker & sticker pack
├── src/                # Aset media (Font, Gambar, Qr, dll)
├── handler.js          # Pengelola pesan masuk (Message Handler)
├── main.js             # File inisialisasi awal & koneksi Telegraf
├── settings.js         # Konfigurasi token & daftar Owner
└── start.js            # Proses Supervisor / Auto-restarter
```

---

## 🚀 Instalasi & Menjalankan Bot

### Persyaratan
* [Node.js](https://nodejs.org/) versi 18 ke atas (Direkomendasikan v20+)
* [Git](https://git-scm.com/)

### Langkah-Langkah

1. **Clone Repositori**
   ```bash
   git clone https://github.com/Futaroukun/tele.git
   cd tele
   ```

2. **Instal Dependensi**
   ```bash
   npm install
   ```

3. **Konfigurasi Kredensial**
   Buka file `settings.js` dan atur Token Bot Telegram serta ID Owner Anda:
   ```javascript
   // settings.js
   global.owner = ["ID_TELEGRAM_ANDA"];
   global.telegramToken = "TOKEN_BOT_TELEGRAM_ANDA";
   ```

4. **Jalankan Bot**
   * **Mode Standar (Dengan Auto-Restart / Supervisor):**
     ```bash
     npm start
     ```
   * **Mode PM2 (Direkomendasikan untuk Production 24/7):**
     ```bash
     pm2 start start.js --name "joy-telegram"
     ```

---

## 📝 Daftar Perintah Utama (Main Commands)

| Perintah | Deskripsi | Akses |
| :--- | :--- | :--- |
| `/start` | Memulai bot / Membuka Menu Utama | Semua |
| `/menu` | Menampilkan menu utama dengan tombol interaktif | Semua |
| `/daftar` | Memulai proses registrasi akun | Semua |
| `/unreg` | Menghapus pendaftaran akun (tetap menyimpan umur) | Terdaftar |
| `/ping` | Menampilkan status sistem dan latency bot | Semua |
| `/stiker` | Mengaktifkan sesi pembuat stiker (Kirim gambar) | Semua |
| `>` | Mengevaluasi kode JavaScript (Synchronous) | Owner |
| `=>` | Mengevaluasi kode JavaScript (Asynchronous / return) | Owner |
| `$` | Menjalankan perintah terminal/shell | Owner |
| `/onplugin` | Mengaktifkan plugin tertentu | Owner |
| `/offplugin` | Menonaktifkan plugin tertentu | Owner |
| `/restart` | Melakukan restart terhadap proses bot | Owner |

---

## 🤝 Kontribusi

Kontribusi selalu terbuka! Silakan lakukan fork pada repositori ini, buat branch baru, lakukan perubahan, lalu kirimkan Pull Request (PR).

*Terima kasih telah menggunakan **JoyTelegram**! Jika bermanfaat, jangan ragu memberikan bintang ⭐ di repositori ini.*
