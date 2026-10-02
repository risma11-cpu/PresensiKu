// ================================================================
// MAHASISWA.JS — Dashboard Mahasiswa
// ================================================================

const AUTO_REFRESH_MS = 15000; // cek sesi aktif & status tiap 15 detik

const MState = {
    userData: null,
    html5QrCode: null,
    scannerRunning: false,
    isProcessing: false,
    sesiAktif: null
};

const MDOM = {
    userNama: document.getElementById('userNama'),
    statusDot: document.getElementById('statusDot'),
    statusLabel: document.getElementById('statusLabel'),
    status: document.getElementById('status'),
    todayStatusCard: document.getElementById('todayStatusCard'),
    todayStatusValue: document.getElementById('todayStatusValue'),
    todayStatusTime: document.getElementById('todayStatusTime'),
    sesiCard: document.getElementById('sesiCard'),
    scannerArea: document.getElementById('scannerArea'),
    scannerControls: document.getElementById('scannerControls'),
    scanStatusText: document.getElementById('scanStatusText'),
    qrResultImage: document.getElementById('qrResultImage'),
    qrInfo: document.getElementById('qrInfo'),
    riwayatLoading: document.getElementById('riwayatLoading'),
    riwayatTable: document.getElementById('riwayatTable'),
    riwayatBody: document.getElementById('riwayatBody')
};

// ================================================================
// UTIL
// ================================================================
function showStatus(message, type = 'info', duration = 4000) {
    if (!MDOM.status) return;
    const iconMap = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-triangle-exclamation', info: 'fa-info-circle' };
    MDOM.status.innerHTML = `<i class="fas ${iconMap[type] || iconMap.info}"></i> ${message}`;
    MDOM.status.className = 'status ' + type;
    MDOM.status.style.display = 'flex';
    clearTimeout(MDOM.status._hideTimeout);
    if (type !== 'info') {
        MDOM.status._hideTimeout = setTimeout(() => { MDOM.status.style.display = 'none'; }, duration);
    }
}

function setConnectionStatus(status, message) {
    MDOM.statusDot.className = 'dot ' + status;
    MDOM.statusLabel.textContent = message;
}

function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    const pt = document.getElementById('pageTitle');
    if (pt) pt.textContent = { beranda: 'Beranda', qr: 'QR Saya', riwayat: 'Riwayat Presensi', profil: 'Profil' }[name] || 'Beranda';
    if (typeof toggleSidebar === 'function') toggleSidebar(false);
    if (name !== 'beranda' && MState.scannerRunning) cancelSesiScan();
}

// ================================================================
// INIT
// ================================================================
async function init() {
    const userData = await requireAuth('mahasiswa');
    if (!userData) return; // requireAuth sudah redirect kalau gagal

    MState.userData = userData;
    injectManualStyles();
    renderProfile(userData);
    generateIdentityQR(userData);

    setConnectionStatus('online', 'Terhubung');

    await Promise.all([loadTodayStatus(), loadActiveSesi(), loadRiwayat()]);

    const pollIfIdle = fn => () => { if (!document.hidden && !MState.isProcessing) fn(); };
    setInterval(pollIfIdle(loadActiveSesi), AUTO_REFRESH_MS);
    setInterval(pollIfIdle(loadTodayStatus), 60000);
}

function renderProfile(u) {
    MDOM.userNama.textContent = u.nama || '-';
    document.getElementById('pNama').textContent = u.nama || '-';
    document.getElementById('pNim').textContent = u.nim || '-';
    document.getElementById('pKelas').textContent = u.kelas || '-';
    document.getElementById('pJurusan').textContent = u.jurusan || '-';
    document.getElementById('pMataKuliah').textContent = u.mataKuliah || '-';
    document.getElementById('pEmail').textContent = u.email || '-';
    const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setT('userEmail', u.email || '-');
    const _av = document.getElementById('topAvatar'); if (_av) _av.innerHTML = avatarMahasiswaImg(u.nim, u.nama);
    setT('mStatKelas', u.kelas || '-');
    setT('mStatJurusan', u.jurusan || '-');
}

function toggleSidebar(force) {
    const nav = document.getElementById('sideNav'), ov = document.getElementById('sideOverlay');
    if (!nav) return;
    const open = typeof force === 'boolean' ? force : !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    if (ov) ov.classList.toggle('show', open);
}

function updateMhsStats(data) {
    const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setT('mStatTotal', data.length);
    if (data.length) {
        const last = [...data].sort((a, b) => String(b.tanggal + b.waktu).localeCompare(String(a.tanggal + a.waktu)))[0];
        setT('mStatLast', last.tanggal);
        setT('mStatLastMk', (last.mataKuliah || '-') + ' • ' + (last.waktu || ''));
    }
}

// ================================================================
// STATUS HARI INI (dari riwayat — cari entri tanggal hari ini)
// ================================================================
async function loadTodayStatus() {
    try {
        const result = await apiGetAuth('get_student_attendance', { nim: MState.userData.nim });
        if (!result.success) throw new Error(result.message || 'Gagal memuat status');

        const today = new Date();
        const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
        const todayEntry = (result.data || []).find(r => r.tanggal === todayStr);

        if (todayEntry) {
            MDOM.todayStatusCard.className = 'today-status hadir';
            MDOM.todayStatusValue.innerHTML = '<i class="fas fa-circle-check"></i> Sudah Hadir';
            MDOM.todayStatusTime.textContent = todayEntry.mataKuliah + ' • ' + todayEntry.waktu;
        } else {
            MDOM.todayStatusCard.className = 'today-status belum';
            MDOM.todayStatusValue.innerHTML = '<i class="fas fa-circle-question"></i> Belum Hadir';
            MDOM.todayStatusTime.textContent = 'Menunggu sesi presensi dibuka';
        }
    } catch (error) {
        console.warn('Gagal memuat status hari ini:', error.message);
    }
}

// ================================================================
// SESI AKTIF
// ================================================================
let lastRenderedSesiId; // undefined = belum pernah render

function injectManualStyles() {
    if (document.getElementById('manualSesiStyle')) return;
    const st = document.createElement('style');
    st.id = 'manualSesiStyle';
    st.textContent = `
        .sesi-manual { margin-top: 14px; padding-top: 14px; border-top: 1px dashed rgba(0,0,0,.18); }
        .sesi-manual p { font-size: 13px; opacity: .7; margin: 0 0 8px; }
        .sesi-manual-row { display: flex; gap: 8px; }
        .sesi-manual-row input { flex: 1; min-width: 0; padding: 12px 16px; border: 1px solid rgba(0,0,0,.12); border-radius: 999px; font: inherit; font-size: 14px; background: #f4f5f2; text-transform: uppercase; }
        .sesi-manual-row button { padding: 0 22px; border: 0; border-radius: 999px; background: hsl(var(--primary, 150 60% 25%)); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
        .sesi-manual-row button:disabled { opacity: .6; cursor: not-allowed; }
        .scanner-area { max-width: 320px; margin-left: auto; margin-right: auto; }
        .scanner-overlay .scan-frame { width: 75% !important; height: auto !important; aspect-ratio: 1 / 1; }
        .btn-foto-qr { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 10px; padding: 12px; border: 1.5px solid hsl(var(--primary, 150 60% 25%)); border-radius: 999px; color: hsl(var(--primary, 150 60% 25%)); font-weight: 600; font-size: 14px; cursor: pointer; }
    `;
    document.head.appendChild(st);
}

async function scanFromFoto(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file || MState.isProcessing) return;
    if (!MState.sesiAktif) {
        showStatus('Tidak ada sesi presensi aktif', 'warning');
        return;
    }

    MState.isProcessing = true;
    showStatus('Membaca QR dari foto...', 'info');
    let text = '';
    try {
        const reader = new Html5Qrcode('qr-file-reader', {
            verbose: false,
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
        });
        text = await reader.scanFile(file, false);
        try { reader.clear(); } catch (e) {}
    } catch (err) {
        MState.isProcessing = false;
        showStatus('QR tidak terbaca di foto. Ulangi: QR harus memenuhi layar dan tidak buram, atau ketik kodenya.', 'error', 8000);
        return;
    }
    await processPresensiSesi(text);
}

async function submitKodeManual() {
    if (MState.isProcessing) return;
    const input = document.getElementById('inputKodeSesi');
    const btn = document.getElementById('btnKirimKode');
    const kode = input ? input.value.trim().toUpperCase() : '';

    if (!MState.sesiAktif) {
        showStatus('Tidak ada sesi presensi aktif', 'warning');
        return;
    }
    if (!kode) {
        showStatus('Masukkan kode sesi dulu', 'warning');
        return;
    }

    MState.isProcessing = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
    try {
        await processPresensiSesi(kode);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Kirim'; }
    }
}

async function loadActiveSesi() {
    try {
        const result = await apiGetAuth('get_active_sesi');
        if (!result.success) throw new Error(result.message || 'Gagal memuat sesi');

        MState.sesiAktif = result.data || null;
        const newId = MState.sesiAktif ? MState.sesiAktif.sesiId : null;
        if (newId !== lastRenderedSesiId) renderSesiCard();
    } catch (error) {
        console.warn('Gagal memuat sesi aktif:', error.message);
    }
}

function parseSesiTime(sesi) {
    const m = String((sesi && sesi.sesiId) || '').match(/^SES-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
    if (m) return new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    const d = new Date(sesi && sesi.waktuDibuat);
    return (isNaN(d) || d.getFullYear() < 2000) ? null : d;
}

function formatWaktuSesi(sesi) {
    const d = parseSesiTime(sesi);
    if (!d) return '';
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderSesiCard() {
    const sesi = MState.sesiAktif;
    lastRenderedSesiId = sesi ? sesi.sesiId : null;
    if (!sesi) {
        MDOM.sesiCard.className = 'sesi-card kosong';
        MDOM.sesiCard.innerHTML = '<i class="fas fa-circle-info"></i> Belum ada sesi presensi aktif saat ini.';
        if (MState.scannerRunning) cancelSesiScan();
        return;
    }

    MDOM.sesiCard.className = 'sesi-card aktif';
    MDOM.sesiCard.innerHTML = `
        <div class="sesi-title"><i class="fas fa-broadcast-tower"></i> Sesi Presensi Aktif</div>
        <div class="sesi-mk">${sesi.mataKuliah || '-'}</div>
        <div class="sesi-meta">Dibuka oleh ${sesi.dosen || '-'} &bull; ${formatWaktuSesi(sesi)}</div>
        <button class="btn-presensi" id="btnMulaiScan" onclick="startSesiScan()">
            <i class="fas fa-qrcode"></i> Scan QR Sesi Sekarang
        </button>
        <div class="sesi-manual">
            <p>Kamera bermasalah? Masukkan kode sesi yang tampil di layar dosen:</p>
            <div class="sesi-manual-row">
                <input type="text" id="inputKodeSesi" placeholder="SES-TTTTBBHH-JJMMDD" autocomplete="off" autocapitalize="characters" spellcheck="false" onkeydown="if (event.key === 'Enter') submitKodeManual();">
                <button type="button" id="btnKirimKode" onclick="submitKodeManual()">Kirim</button>
            </div>
            <label class="btn-foto-qr" for="inputFotoQr"><i class="fas fa-camera"></i> Foto QR pakai kamera HP</label>
            <input type="file" id="inputFotoQr" accept="image/*" capture="environment" style="display:none" onchange="scanFromFoto(this)">
            <div id="qr-file-reader" style="display:none"></div>
        </div>
    `;
}

// ================================================================
// SCAN QR SESI -> PRESENSI
// ================================================================
let scannerStarting = false;

function cameraErrorMessage(err) {
    const text = err && err.message ? (err.name + ' ' + err.message) : String(err || '');
    if (/Html5Qrcode.*(not defined|undefined)|ReferenceError/i.test(text))
        return 'Library scanner belum termuat. Cek internet lalu muat ulang halaman.';
    if (/NotAllowed|permission|denied/i.test(text))
        return 'Izin kamera ditolak. Ketuk ikon gembok di address bar → Izin → Kamera → Izinkan, lalu muat ulang halaman.';
    if (/NotFound|no camera|requested device not found/i.test(text))
        return 'Kamera tidak ditemukan di perangkat ini.';
    if (/NotReadable|in use|could not start|Starting videoinput failed/i.test(text))
        return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi.';
    if (!window.isSecureContext)
        return 'Kamera hanya bisa jalan lewat HTTPS.';
    return 'Gagal akses kamera: ' + text;
}

async function startSesiScan() {
    if (!MState.sesiAktif) {
        showStatus('Tidak ada sesi presensi aktif', 'warning');
        return;
    }
    if (MState.scannerRunning || scannerStarting) return;
    scannerStarting = true;

    MDOM.scannerArea.style.display = 'block';
    MDOM.scannerControls.style.display = 'flex';

    const readerElement = document.getElementById('qr-reader');
    const box = Math.max(180, Math.min(260, Math.floor((readerElement.clientWidth || 300) * 0.72)));
    const baseCfg = { fps: 10, qrbox: { width: box, height: box }, disableFlip: false };
    const attempts = [
        { cam: { facingMode: { ideal: 'environment' } }, cfg: baseCfg },
        { cam: { facingMode: 'environment' }, cfg: baseCfg },
        { cam: { facingMode: 'user' }, cfg: baseCfg }
    ];
    let lastErr = null;

    for (const { cam, cfg } of attempts) {
        try {
            readerElement.innerHTML = '';
            MState.html5QrCode = new Html5Qrcode('qr-reader', {
                verbose: false,
                formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
            });
            await MState.html5QrCode.start(cam, cfg, onSesiScanSuccess, () => {});
            MState.scannerRunning = true;
            MDOM.scanStatusText.textContent = 'Arahkan ke QR Sesi';
            scannerStarting = false;
            clearTimeout(MState.scanHintTimer);
            MState.scanHintTimer = setTimeout(() => {
                if (MState.scannerRunning && !MState.isProcessing) {
                    showStatus('Belum terbaca? Atur jarak HP 20–30 cm dari layar, atau pakai tombol Foto QR / ketik kode sesi.', 'warning', 7000);
                }
            }, 12000);
            return;
        } catch (err) {
            lastErr = err;
            console.warn('Kamera gagal:', cam, err);
            try { MState.html5QrCode.clear(); } catch (e) {}
            if (/NotAllowed|permission|denied/i.test(String(err && err.name ? err.name + err.message : err))) break;
        }
    }

    scannerStarting = false;
    MState.html5QrCode = null;
    showStatus(cameraErrorMessage(lastErr), 'error', 9000);
    cancelSesiScan();
}

function cancelSesiScan() {
    clearTimeout(MState.scanHintTimer);
    if (MState.html5QrCode && MState.scannerRunning) {
        MState.html5QrCode.stop().then(() => {
            MState.html5QrCode.clear();
            MState.html5QrCode = null;
            MState.scannerRunning = false;
        }).catch(() => {});
    } else {
        MState.scannerRunning = false;
    }
    MDOM.scannerArea.style.display = 'none';
    MDOM.scannerControls.style.display = 'none';
}

// Ambil sesiId dari isi QR: JSON {"sesiId":"SES-..."} atau teks "SES-..." langsung.
// Hasil kosong = bukan QR sesi.
function extractSesiId(qrData) {
    const raw = String(qrData == null ? '' : qrData).trim();
    if (!raw) return '';
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return String(parsed.sesiId || '').trim();
    } catch (e) { /* bukan JSON */ }
    return /^SES-/i.test(raw) ? raw.toUpperCase() : '';
}

let lastBukanSesiHint = 0;

async function onSesiScanSuccess(decodedText) {
    if (MState.isProcessing) return;

    // QR kosong / QR lain: abaikan, kamera tetap menyala (jangan tampilkan error)
    const sesiId = extractSesiId(decodedText);
    if (!sesiId) {
        const now = Date.now();
        if (String(decodedText || '').trim() && now - lastBukanSesiHint > 4000) {
            lastBukanSesiHint = now;
            showStatus('Itu bukan QR sesi presensi. Arahkan ke QR di layar dosen.', 'warning', 3000);
        }
        return;
    }

    MState.isProcessing = true;

    // Matikan kamera sampai benar-benar berhenti, baru kirim presensi
    try {
        if (MState.html5QrCode && MState.scannerRunning) {
            await MState.html5QrCode.stop();
        }
    } catch (e) { /* abaikan */ }
    MState.scannerRunning = false;

    processPresensiSesi(sesiId);
}

function describeError(e) {
    if (!e) return 'tidak diketahui';
    if (typeof e === 'string') return e;
    return e.message || e.name || String(e);
}

async function processPresensiSesi(qrData) {
    try {
        const sesiId = extractSesiId(qrData);

        if (!sesiId) {
            showStatus('Kode sesi tidak valid. Contoh: SES-20260929-210814', 'error');
            MState.isProcessing = false;
            cancelSesiScan();
            return;
        }

        showStatus('Memproses presensi...', 'info', 5000);

        const result = await apiPostAuth('presensi_sesi', { sesiId });

        if (!result.success) {
            showStatus(result.message || 'Gagal menyimpan presensi', result.alreadyPresent ? 'warning' : 'error');
        } else {
            showStatus('Presensi berhasil dicatat!', 'success');
            loadTodayStatus();
        }
    } catch (error) {
        console.error('Presensi gagal:', error);
        showStatus('Error: ' + describeError(error), 'error', 8000);
    } finally {
        MState.isProcessing = false;
        setTimeout(cancelSesiScan, 1500);
    }
}

// ================================================================
// QR IDENTITAS (bukan untuk presensi — cuma identitas)
// ================================================================
function generateIdentityQR(u) {
    const qrData = { nim: u.nim, nama: u.nama, kelas: u.kelas, jurusan: u.jurusan, tipe: 'identitas' };
    const qrText = JSON.stringify(qrData);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrText)}`;

    MDOM.qrResultImage.src = qrUrl;
    MDOM.qrInfo.innerHTML = `<strong>${u.nim}</strong> &bull; ${u.nama}<br>${u.kelas || '-'} &bull; ${u.jurusan || '-'}`;
}

function downloadIdentityQR() {
    const link = document.createElement('a');
    link.download = `qr-identitas-${MState.userData.nim}.png`;
    link.href = MDOM.qrResultImage.src;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ================================================================
// RIWAYAT PRESENSI
// ================================================================
async function loadRiwayat() {
    MDOM.riwayatLoading.style.display = 'block';
    MDOM.riwayatTable.style.display = 'none';

    try {
        const result = await apiGetAuth('get_student_attendance', { nim: MState.userData.nim });
        if (!result.success) throw new Error(result.message || 'Gagal memuat riwayat');

        const data = result.data || [];
        updateMhsStats(data);
        if (data.length === 0) {
            MDOM.riwayatLoading.innerHTML = '<i class="fas fa-inbox state-icon"></i>Belum ada riwayat presensi';
            return;
        }

        MDOM.riwayatBody.innerHTML = data.map(r => `
            <tr>
                <td>${r.tanggal}</td>
                <td>${r.waktu}</td>
                <td>${r.mataKuliah}</td>
                <td><span class="status-pill hadir"><i class="fas fa-circle"></i> ${r.status}</span></td>
            </tr>
        `).join('');

        MDOM.riwayatLoading.style.display = 'none';
        MDOM.riwayatTable.style.display = 'table';
    } catch (error) {
        MDOM.riwayatLoading.innerHTML = `<i class="fas fa-triangle-exclamation state-icon"></i><strong>Gagal memuat riwayat</strong><p>${error.message}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', init);
// ================================================================
// TEMA GELAP / TERANG
// ================================================================
function toggleTheme() {
  const body = document.body;
  const isDark = body.classList.toggle('theme-dark');
  localStorage.setItem('themeMode', isDark ? 'dark' : 'light');

  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
  }
}

function initTheme() {
  const saved = localStorage.getItem('themeMode') || 'light';
  const isDark = saved === 'dark';
  document.body.classList.toggle('theme-dark', isDark);

  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.addEventListener('click', toggleTheme);
  }
});
