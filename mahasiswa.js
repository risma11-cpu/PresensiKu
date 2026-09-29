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
    if (type === 'success' || type === 'error') {
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
    renderProfile(userData);
    generateIdentityQR(userData);

    setConnectionStatus('online', 'Terhubung');

    await Promise.all([loadTodayStatus(), loadActiveSesi(), loadRiwayat()]);

    setInterval(loadActiveSesi, AUTO_REFRESH_MS);
    setInterval(loadTodayStatus, AUTO_REFRESH_MS);
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
async function loadActiveSesi() {
    try {
        const result = await apiGetAuth('get_active_sesi');
        if (!result.success) throw new Error(result.message || 'Gagal memuat sesi');

        MState.sesiAktif = result.data || null;
        renderSesiCard();
    } catch (error) {
        console.warn('Gagal memuat sesi aktif:', error.message);
    }
}

function renderSesiCard() {
    const sesi = MState.sesiAktif;
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
        <div class="sesi-meta">Dibuka oleh ${sesi.dosen || '-'} &bull; ${sesi.waktuDibuat || ''}</div>
        <button class="btn-presensi" id="btnMulaiScan" onclick="startSesiScan()">
            <i class="fas fa-qrcode"></i> Scan QR Sesi Sekarang
        </button>
    `;
}

// ================================================================
// SCAN QR SESI -> PRESENSI
// ================================================================
function startSesiScan() {
    if (!MState.sesiAktif) {
        showStatus('Tidak ada sesi presensi aktif', 'warning');
        return;
    }
    MDOM.scannerArea.style.display = 'block';
    MDOM.scannerControls.style.display = 'flex';

    const readerElement = document.getElementById('qr-reader');
    readerElement.innerHTML = '';

    try {
        MState.html5QrCode = new Html5Qrcode('qr-reader', {
            verbose: false,
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
        });

        const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };

        MState.html5QrCode.start({ facingMode: 'environment' }, config, onSesiScanSuccess, () => {})
            .then(() => {
                MState.scannerRunning = true;
                MDOM.scanStatusText.textContent = 'Arahkan ke QR Sesi';
            })
            .catch(() => {
                MState.html5QrCode.start({ facingMode: 'user' }, config, onSesiScanSuccess, () => {})
                    .then(() => { MState.scannerRunning = true; })
                    .catch((err2) => {
                        showStatus('Gagal akses kamera: ' + err2.message, 'error');
                        cancelSesiScan();
                    });
            });
    } catch (error) {
        showStatus('Gagal inisialisasi scanner', 'error');
        cancelSesiScan();
    }
}

function cancelSesiScan() {
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

function onSesiScanSuccess(decodedText) {
    if (MState.isProcessing) return;
    MState.isProcessing = true;

    if (MState.html5QrCode && MState.scannerRunning) {
        MState.html5QrCode.stop().then(() => { MState.scannerRunning = false; }).catch(() => {});
    }

    processPresensiSesi(decodedText);
}

async function processPresensiSesi(qrData) {
    try {
        let sesiId = '';
        try {
            const parsed = JSON.parse(qrData);
            sesiId = parsed.sesiId || '';
        } catch (e) {
            sesiId = qrData.trim();
        }

        if (!sesiId) {
            showStatus('QR tidak valid', 'error');
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
        showStatus('Error: ' + error.message, 'error');
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