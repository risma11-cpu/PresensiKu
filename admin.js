// ================================================================
// ADMIN.JS — Dashboard Admin
// ================================================================

const AUTO_REFRESH_MS = 15000;
const ACTIVITY_POLL_MS = 8000; // polling aktivitas terbaru, sesuai catatan: 5-10 detik
const TREND_REFRESH_MS = 60000;

const AState = {
    closedSesi: {}, // sesiId -> waktu ditutup (cegah data lama membuka kartu lagi)
    userData: null,
    mahasiswaData: [],
    todayAttendance: {}, // { nim: { waktu, status } }
    sesiAktif: null
};

const ACharts = {
    trend: null,
    donut: null,
    statistikTrend: null
};

const ADOM = {
    userNama: document.getElementById('userNama'),
    statusDot: document.getElementById('statusDot'),
    statusLabel: document.getElementById('statusLabel'),
    status: document.getElementById('status'),
    statTotal: document.getElementById('statTotal'),
    statHadir: document.getElementById('statHadir'),
    statBelum: document.getElementById('statBelum'),
    statPersen: document.getElementById('statPersen'),
    sesiCard: document.getElementById('sesiCard'),
    mhsLoading: document.getElementById('mhsLoading'),
    mhsTable: document.getElementById('mhsTable'),
    mhsBody: document.getElementById('mhsBody'),
    mhsCount: document.getElementById('mhsCount'),
    mhsKelasFilter: document.getElementById('mhsKelasFilter'),
    presensiLoading: document.getElementById('presensiLoading'),
    presensiTable: document.getElementById('presensiTable'),
    presensiBody: document.getElementById('presensiBody'),
    presensiCount: document.getElementById('presensiCount'),
    presensiTanggal: document.getElementById('presensiTanggal'),
    statSesiStatus: document.getElementById('statSesiStatus'),
    activityList: document.getElementById('activityList'),
    donutLegend: document.getElementById('donutLegend'),
    trendEmpty: document.getElementById('trendEmpty'),
    topGreeting: document.getElementById('topGreeting'),
    heroGreeting: document.getElementById('heroGreeting'),
    sideNav: document.getElementById('sideNav'),
    sideOverlay: document.getElementById('sideOverlay'),
    globalSearch: document.getElementById('globalSearch'),
    statTotalPertemuan: document.getElementById('statTotalPertemuan'),
    statRataKehadiran: document.getElementById('statRataKehadiran'),
    statistikTrendEmpty: document.getElementById('statistikTrendEmpty'),
    statistikLoading: document.getElementById('statistikLoading'),
    statistikTable: document.getElementById('statistikTable'),
    statistikBody: document.getElementById('statistikBody'),
    statistikPertemuanCount: document.getElementById('statistikPertemuanCount'),
    statistikAktifList: document.getElementById('statistikAktifList'),
    statistikPerhatianList: document.getElementById('statistikPerhatianList')
};

// ================================================================
// UTIL
// ================================================================
function showStatus(message, type = 'info', duration = 4000) {
    if (!ADOM.status) return;
    const iconMap = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-triangle-exclamation', info: 'fa-info-circle' };
    ADOM.status.innerHTML = `<i class="fas ${iconMap[type] || iconMap.info}"></i> ${message}`;
    ADOM.status.className = 'status ' + type;
    ADOM.status.style.display = 'flex';
    clearTimeout(ADOM.status._hideTimeout);
    if (type === 'success' || type === 'error') {
        ADOM.status._hideTimeout = setTimeout(() => { ADOM.status.style.display = 'none'; }, duration);
    }
}

function setConnectionStatus(status, message) {
    ADOM.statusDot.className = 'dot ' + status;
    ADOM.statusLabel.textContent = message;
}

function switchTab(name) {
    document.querySelectorAll('.side-link').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    const pt = document.getElementById('pageTitle');
    if (pt) pt.textContent = { dashboard: 'Dashboard', mahasiswa: 'Mahasiswa', statistik: 'Statistik', presensi: 'Riwayat Presensi', profil: 'Profil Admin' }[name] || 'Dashboard';
    toggleSidebar(false); // auto-tutup drawer di mobile setelah pilih menu
}

// ================================================================
// SIDEBAR (mobile drawer)
// ================================================================
function toggleSidebar(force) {
    const shouldOpen = typeof force === 'boolean' ? force : !ADOM.sideNav.classList.contains('open');
    ADOM.sideNav.classList.toggle('open', shouldOpen);
    ADOM.sideOverlay.classList.toggle('show', shouldOpen);
}

function scrollToSesi() {
    const el = document.getElementById('sesiCard');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function handleGlobalSearch() {
    const q = ADOM.globalSearch.value;
    switchTab('mahasiswa');
    const mhsSearchInput = document.getElementById('mhsSearch');
    if (mhsSearchInput) {
        mhsSearchInput.value = q;
        renderMahasiswaTable();
    }
}

function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ================================================================
// INIT
// ================================================================
async function init() {
    const userData = await requireAuth('admin');
    if (!userData) return;

    AState.userData = userData;
    const namaDepan = (userData.nama || '-').split(' ')[0];
    ADOM.userNama.textContent = userData.nama || '-';
    document.getElementById('pNama').textContent = userData.nama || '-';
    document.getElementById('pEmail').textContent = userData.email || '-';
    if (ADOM.topGreeting) ADOM.topGreeting.textContent = `Halo, ${namaDepan} 👋 Pantau presensi mahasiswa dengan mudah.`;
    const emailEl = document.getElementById('userEmail'); if (emailEl) emailEl.textContent = userData.email || '-';
    const avEl = document.getElementById('topAvatar'); if (avEl) avEl.textContent = (namaDepan[0] || 'A').toUpperCase();
    if (ADOM.heroGreeting) ADOM.heroGreeting.textContent = `Selamat datang kembali, ${namaDepan} 👋`;

    setConnectionStatus('online', 'Terhubung');
    ADOM.presensiTanggal.value = todayStr();

    initCharts();

    await Promise.all([loadStats(), loadActiveSesi(), loadMahasiswa(), loadRiwayatPresensi()]);
    loadRekapKehadiran(); // gak perlu ditunggu bareng, jalan sendiri setelah data mahasiswa siap
    loadTrendChart();
    loadStatistik();

    setInterval(loadStats, AUTO_REFRESH_MS);
    setInterval(loadActiveSesi, AUTO_REFRESH_MS);
    setInterval(loadRekapKehadiran, AUTO_REFRESH_MS * 4); // rekap gak perlu sesering itu
    setInterval(pollTodayAttendance, ACTIVITY_POLL_MS); // aktivitas terbaru — polling, bukan realtime sebenarnya
    setInterval(loadTrendChart, TREND_REFRESH_MS);
    setInterval(loadStatistik, AUTO_REFRESH_MS * 4);
    setInterval(tickTimer, 1000);
}

// ================================================================
// STATISTIK
// ================================================================
async function loadStats() {
    try {
        const result = await apiGetAuth('get_dashboard_stats');
        if (!result.success) throw new Error(result.message || 'Gagal memuat statistik');

        const d = result.data;
        ADOM.statTotal.textContent = d.totalMahasiswa;
        ADOM.statHadir.textContent = d.hadirHariIni;
        ADOM.statBelum.textContent = d.belumHariIni;
        ADOM.statPersen.textContent = d.persentaseKehadiran + '%';
        updateDonutChart(d.hadirHariIni, d.belumHariIni);
    } catch (error) {
        console.warn('Gagal memuat statistik:', error.message);
    }
}

// ================================================================
// SESI PRESENSI
// ================================================================
async function loadActiveSesi() {
    try {
        const result = await apiGetAuth('get_active_sesi');
        if (!result.success) throw new Error(result.message || 'Gagal memuat sesi');
        let sesi = result.data || null;
        // Abaikan data lama dari server untuk sesi yang barusan ditutup di sini
        const closedAt = sesi && AState.closedSesi[sesi.sesiId];
        if (closedAt && Date.now() - closedAt < 10 * 60 * 1000) sesi = null;
        AState.sesiAktif = sesi;
        await renderSesiCard();
    } catch (error) {
        console.warn('Gagal memuat sesi aktif:', error.message);
    }
}

async function renderSesiCard() {
    const sesi = AState.sesiAktif;

    if (ADOM.statSesiStatus) {
        ADOM.statSesiStatus.textContent = sesi ? 'Aktif' : 'Nonaktif';
        ADOM.statSesiStatus.parentElement.classList.toggle('active-glow', !!sesi);
    }

    if (!sesi) {
        ADOM.sesiCard.className = 'sesi-card kosong';
        ADOM.sesiCard.innerHTML = `
            <p style="margin-bottom:12px;">Belum ada sesi presensi aktif.</p>
            <div class="form-buka-sesi" style="text-align:left;">
                <div class="input-field">
                    <i class="fas fa-book"></i>
                    <input type="text" id="mkSesiInput" placeholder="Mata kuliah (opsional, default RPL 2)">
                </div>
                <button class="qr-input-group button" style="width:100%; justify-content:center;" onclick="createSesi()">
                    <i class="fas fa-play"></i> Buka Sesi Presensi
                </button>
            </div>
        `;
        return;
    }

    const qrText = JSON.stringify({ sesiId: sesi.sesiId });
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrText)}`;

    ADOM.sesiCard.className = 'sesi-card aktif';
    ADOM.sesiCard.innerHTML = `
        <div class="sesi-title"><i class="fas fa-broadcast-tower"></i> Sesi Aktif</div>
        <div class="sesi-mk">${sesi.mataKuliah || '-'}</div>
        <div class="sesi-meta">Dibuka ${sesi.waktuDibuat || ''} &bull; oleh ${sesi.dosen || '-'}</div>
        <div class="sesi-qr-box">
            <img src="${qrUrl}" alt="QR Sesi">
            <div class="sesi-id-code">${sesi.sesiId}</div>
        </div>
        <div class="section-title" style="margin-top:14px;"><i class="fas fa-user-check"></i> Sudah Presensi (<span id="sesiHadirCount">-</span>)</div>
        <div class="hadir-mini-list" id="sesiHadirList"><div class="small-muted">Memuat...</div></div>
        <button class="btn-end-sesi" onclick="endSesi('${sesi.sesiId}')">
            <i class="fas fa-stop"></i> Tutup Sesi
        </button>
    `;

    loadSesiAttendance(sesi.sesiId);
}

async function createSesi() {
    const mkInput = document.getElementById('mkSesiInput');
    const mataKuliah = mkInput ? mkInput.value.trim() : '';

    try {
        const result = await apiPostAuth('create_sesi', mataKuliah ? { mataKuliah } : {});
        if (!result.success) {
            showStatus(result.message || 'Gagal membuka sesi', 'error');
            return;
        }
        showStatus('Sesi presensi dibuka', 'success');
        if (result.data && AState.closedSesi) delete AState.closedSesi[result.data.sesiId];
        AState.sesiAktif = result.data;
        renderSesiCard();
        loadStats();
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
}

async function endSesi(sesiId) {
    if (!confirm('Tutup sesi presensi ini?')) return;
    try {
        const result = await apiPostAuth('end_sesi', { sesiId });
        if (!result.success) {
            showStatus(result.message || 'Gagal menutup sesi', 'error');
            return;
        }
        showStatus('Sesi presensi ditutup', 'success');
        AState.closedSesi[sesiId] = Date.now();
        AState.sesiAktif = null;
        renderSesiCard();
        loadStats();
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
}

async function loadSesiAttendance(sesiId) {
    try {
        const result = await apiGetAuth('get_sesi_attendance', { sesiId });
        const list = document.getElementById('sesiHadirList');
        const countEl = document.getElementById('sesiHadirCount');
        if (!result.success || !list || !countEl) return;

        const data = result.data || [];
        countEl.textContent = data.length;

        if (data.length === 0) {
            list.innerHTML = '<div class="small-muted">Belum ada yang presensi.</div>';
            return;
        }

        list.innerHTML = data.map(r => `
            <div class="hadir-mini-item">
                <span class="nama">${r.nama} <span class="small-muted">(${r.nim})</span></span>
                <span class="waktu">${r.waktu}</span>
            </div>
        `).join('');
    } catch (error) {
        console.warn('Gagal memuat daftar hadir sesi:', error.message);
    }
}

// ================================================================
// DAFTAR MAHASISWA
// ================================================================
async function loadMahasiswa() {
    ADOM.mhsLoading.style.display = 'block';
    ADOM.mhsTable.style.display = 'none';

    try {
        const [mhsResult, hadirResult] = await Promise.all([
            apiGet('get_all'),
            apiGet('get_today_attendance')
        ]);

        if (!mhsResult.success) throw new Error(mhsResult.message || 'Gagal memuat data mahasiswa');

        AState.mahasiswaData = (mhsResult.data || []).map(row => {
            const norm = {};
            Object.keys(row || {}).forEach(k => { norm[k.toString().trim().toLowerCase()] = row[k]; });
            return {
                nim: String(norm.nim ?? '').trim(),
                nama: (norm.nama ?? '').toString().trim(),
                kelas: (norm.kelas ?? '').toString().trim(),
                jurusan: (norm.jurusan ?? '').toString().trim()
            };
        }).filter(m => m.nim !== '');

        AState.todayAttendance = {};
        if (hadirResult.success) {
            (hadirResult.data || []).forEach(item => { AState.todayAttendance[item.nim] = item; });
        }
        renderActivityFeed();

        // Isi filter kelas
        const kelasSet = [...new Set(AState.mahasiswaData.map(m => m.kelas).filter(Boolean))];
        ADOM.mhsKelasFilter.innerHTML = '<option value="">Semua Kelas</option>' +
            kelasSet.map(k => `<option value="${k}">${k}</option>`).join('');

        const sb = document.getElementById('sideMhsCount');
        if (sb) { sb.textContent = AState.mahasiswaData.length; sb.style.display = 'inline-block'; }

        renderMahasiswaTable();
    } catch (error) {
        ADOM.mhsLoading.innerHTML = `<i class="fas fa-triangle-exclamation state-icon"></i><strong>Gagal memuat data</strong><p>${error.message}</p>`;
    }
}

function renderMahasiswaTable() {
    const search = (document.getElementById('mhsSearch').value || '').toLowerCase().trim();
    const kelasFilter = ADOM.mhsKelasFilter.value;

    const filtered = AState.mahasiswaData.filter(m => {
        const matchSearch = !search || m.nim.toLowerCase().includes(search) || m.nama.toLowerCase().includes(search);
        const matchKelas = !kelasFilter || m.kelas === kelasFilter;
        return matchSearch && matchKelas;
    });

    ADOM.mhsCount.textContent = filtered.length + ' mahasiswa';

    if (filtered.length === 0) {
        ADOM.mhsLoading.innerHTML = '<i class="fas fa-inbox state-icon"></i>Tidak ada data cocok';
        ADOM.mhsLoading.style.display = 'block';
        ADOM.mhsTable.style.display = 'none';
        return;
    }

    ADOM.mhsBody.innerHTML = filtered.map(m => {
        const hadir = Object.prototype.hasOwnProperty.call(AState.todayAttendance, m.nim);
        return `
            <tr>
                <td><strong>${m.nim}</strong></td>
                <td>${m.nama}</td>
                <td>${m.kelas}</td>
                <td><span class="status-pill ${hadir ? 'hadir' : 'belum'}"><i class="fas fa-circle"></i> ${hadir ? 'Hadir' : 'Belum'}</span></td>
            </tr>
        `;
    }).join('');

    ADOM.mhsLoading.style.display = 'none';
    ADOM.mhsTable.style.display = 'table';
}

// ================================================================
// RIWAYAT PRESENSI (ADMIN)
// ================================================================
function resetFilterTanggal() {
    ADOM.presensiTanggal.value = todayStr();
    loadRiwayatPresensi();
}

async function loadRiwayatPresensi() {
    ADOM.presensiLoading.style.display = 'block';
    ADOM.presensiTable.style.display = 'none';

    try {
        const tanggal = ADOM.presensiTanggal.value || '';
        const result = await apiGetAuth('get_all_attendance', tanggal ? { tanggal } : {});
        if (!result.success) throw new Error(result.message || 'Gagal memuat riwayat');

        const data = result.data || [];
        ADOM.presensiCount.textContent = data.length + ' data';

        if (data.length === 0) {
            ADOM.presensiLoading.innerHTML = '<i class="fas fa-inbox state-icon"></i>Tidak ada data presensi untuk tanggal ini';
            return;
        }

        ADOM.presensiBody.innerHTML = data.map(r => `
            <tr>
                <td>${r.waktu}</td>
                <td><strong>${r.nim}</strong></td>
                <td>${r.nama}</td>
                <td>${r.kelas}</td>
                <td><span class="status-pill hadir"><i class="fas fa-circle"></i> ${r.status}</span></td>
            </tr>
        `).join('');

        ADOM.presensiLoading.style.display = 'none';
        ADOM.presensiTable.style.display = 'table';
    } catch (error) {
        ADOM.presensiLoading.innerHTML = `<i class="fas fa-triangle-exclamation state-icon"></i><strong>Gagal memuat data</strong><p>${error.message}</p>`;
    }
}

// ================================================================
// REKAP KEHADIRAN — paling aktif vs sering absen (semua waktu)
// ================================================================
async function loadRekapKehadiran() {
    const elAktif = document.getElementById('rekapAktifList');
    const elAbsen = document.getElementById('rekapAbsenList');
    if (!elAktif || !elAbsen) return;

    try {
        // Ambil SEMUA riwayat presensi (tanpa filter tanggal)
        const result = await apiGetAuth('get_all_attendance');
        if (!result.success) throw new Error(result.message || 'Gagal memuat rekap');

        const semuaPresensi = result.data || [];

        // totalSesi = jumlah tanggal unik yang pernah ada presensi
        // (dipakai sebagai perkiraan jumlah pertemuan yang sudah berlangsung)
        const totalSesi = new Set(semuaPresensi.map(r => r.tanggal)).size;

        // Hitung jumlah hadir per NIM
        const hadirPerNim = {};
        semuaPresensi.forEach(r => {
            hadirPerNim[r.nim] = (hadirPerNim[r.nim] || 0) + 1;
        });

        if (totalSesi === 0 || AState.mahasiswaData.length === 0) {
            elAktif.innerHTML = '<div class="small-muted">Belum ada data presensi.</div>';
            elAbsen.innerHTML = '<div class="small-muted">Belum ada data presensi.</div>';
            return;
        }

        const rekap = AState.mahasiswaData.map(m => {
            const hadir = hadirPerNim[m.nim] || 0;
            const persen = Math.round((hadir / totalSesi) * 100);
            return { nim: m.nim, nama: m.nama || m.nim, hadir, persen };
        });

        const paginAktif = [...rekap].sort((a, b) => b.persen - a.persen).slice(0, 5);
        const paginAbsen = [...rekap].sort((a, b) => a.persen - b.persen).slice(0, 5);

        renderRekapList(elAktif, paginAktif, totalSesi);
        renderRekapList(elAbsen, paginAbsen, totalSesi);
    } catch (error) {
        elAktif.innerHTML = `<div class="small-muted">Gagal memuat: ${error.message}</div>`;
        elAbsen.innerHTML = '';
    }
}

function renderRekapList(container, items, totalSesi) {
    if (items.length === 0) {
        container.innerHTML = '<div class="small-muted">Belum ada data.</div>';
        return;
    }
    container.innerHTML = items.map(it => `
        <div class="rank-item">
            <div class="rank-row">
                <span class="rank-name">${it.nama}</span>
                <span class="rank-pct">${it.hadir}/${totalSesi} &bull; ${it.persen}%</span>
            </div>
            <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${it.persen}%;"></div></div>
        </div>
    `).join('');
}

// ================================================================
// AKTIVITAS TERBARU — polling ringan (bukan realtime sebenarnya)
// ================================================================
async function pollTodayAttendance() {
    try {
        const result = await apiGet('get_today_attendance');
        if (!result.success) return;
        AState.todayAttendance = {};
        (result.data || []).forEach(item => { AState.todayAttendance[item.nim] = item; });
        renderActivityFeed();
        // sinkronkan status pill di tabel mahasiswa juga, kalau sedang dibuka
        if (AState.mahasiswaData.length) renderMahasiswaTable();
    } catch (error) {
        console.warn('Gagal polling aktivitas:', error.message);
    }
}

function renderActivityFeed() {
    if (!ADOM.activityList) return;

    const namaByNim = {};
    AState.mahasiswaData.forEach(m => { namaByNim[m.nim] = m; });

    const items = Object.keys(AState.todayAttendance).map(nim => {
        const rec = AState.todayAttendance[nim];
        const mhs = namaByNim[nim];
        return {
            nim,
            waktu: rec.waktu || '',
            status: rec.status || 'Hadir',
            nama: (mhs && mhs.nama) || rec.nama || nim,
            kelas: (mhs && mhs.kelas) || rec.kelas || '-'
        };
    }).sort((a, b) => String(b.waktu).localeCompare(String(a.waktu)));

    if (items.length === 0) {
        ADOM.activityList.innerHTML = '<div class="small-muted">Belum ada aktivitas presensi hari ini.</div>';
        return;
    }

    const nc = document.getElementById('notifCount');
    if (nc) { nc.textContent = items.length > 99 ? '99+' : items.length; nc.style.display = 'block'; }

    const tints = ['#f8c9c9', '#cdeccb', '#cfd3f7', '#fde6b8', '#cfe9f5'];
    ADOM.activityList.innerHTML = items.slice(0, 8).map((it, i) => {
        const ini = String(it.nama).trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
        return `
        <div class="arow">
            <div class="av" style="background:${tints[i % tints.length]};">${ini}</div>
            <div class="tx"><b>${it.nama}</b><small>${it.kelas} &bull; <strong>${it.waktu}</strong></small></div>
            <span class="badge ok">${it.status}</span>
        </div>`;
    }).join('');
}

// ================================================================
// GRAFIK — Chart.js, murni dari data backend (tidak ada data dummy)
// ================================================================
function initCharts() {
    if (typeof Chart === 'undefined') return;

    const trendCtx = document.getElementById('trendChart');
    if (trendCtx) {
        ACharts.trend = new Chart(trendCtx, {
            type: 'line',
            data: { labels: [], datasets: [{
                label: '% Kehadiran',
                data: [],
                borderColor: 'hsl(217, 91%, 60%)',
                backgroundColor: 'hsla(217, 91%, 60%, 0.12)',
                tension: 0.35,
                fill: true,
                pointRadius: 3
            }] },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } }
            }
        });
    }

    const donutCtx = document.getElementById('donutChart');
    if (donutCtx) {
        ACharts.donut = new Chart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: ['Hadir', 'Belum Hadir'],
                datasets: [{
                    data: [0, 0],
                    backgroundColor: ['hsl(152, 68%, 42%)', 'hsl(210, 40%, 90%)'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                cutout: '68%',
                plugins: { legend: { display: false } }
            }
        });
    }

    const statistikTrendCtx = document.getElementById('statistikTrendChart');
    if (statistikTrendCtx) {
        ACharts.statistikTrend = new Chart(statistikTrendCtx, {
            type: 'bar',
            data: { labels: [], datasets: [{
                label: '% Kehadiran',
                data: [],
                backgroundColor: 'hsl(217, 91%, 60%)',
                borderRadius: 6,
                maxBarThickness: 34
            }] },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } }
            }
        });
    }
}

function updateDonutChart(hadir, belum) {
    const total = (hadir || 0) + (belum || 0);
    const pct = total ? (hadir / total) * 100 : 0;
    const g = document.getElementById('gaugeHadir');
    if (g) { g.setAttribute('stroke-dasharray', `${pct} 100`); g.style.opacity = pct > 0 ? 1 : 0; }

    if (ADOM.donutLegend) {
        ADOM.donutLegend.innerHTML = `
            <span><i style="background:#217a52;"></i>Hadir (${hadir || 0})</span>
            <span><i class="hatch"></i>Belum (${belum || 0})</span>
        `;
    }
    if (!ACharts.donut) return;
    ACharts.donut.data.datasets[0].data = [hadir || 0, belum || 0];
    ACharts.donut.update();
}

async function loadTrendChart() {
    try {
        const result = await apiGetAuth('get_all_attendance');
        if (!result.success) throw new Error(result.message || 'Gagal memuat tren');
        const rows = result.data || [];
        renderDashExtras(rows);

        if (!ACharts.trend) return;
        const totalMhs = AState.mahasiswaData.length;
        if (rows.length === 0 || totalMhs === 0) return;
        const perTanggal = groupByTanggal(rows);
        const tanggalList = Object.keys(perTanggal).sort().slice(-10);
        ACharts.trend.data.labels = tanggalList;
        ACharts.trend.data.datasets[0].data = tanggalList.map(t => Math.round((perTanggal[t].size / totalMhs) * 100));
        ACharts.trend.update();
    } catch (error) {
        console.warn('Gagal memuat tren kehadiran:', error.message);
    }
}

function groupByTanggal(rows) {
    const per = {};
    rows.forEach(r => {
        if (!r.tanggal) return;
        if (!per[r.tanggal]) per[r.tanggal] = new Set();
        per[r.tanggal].add(r.nim);
    });
    return per;
}

// ================================================================
// WIDGET DASHBOARD BARU — kapsul mingguan & daftar pertemuan
// ================================================================
function renderDashExtras(rows) {
    const totalMhs = AState.mahasiswaData.length;
    const per = groupByTanggal(rows);

    // Kapsul mingguan (Min–Sab minggu berjalan)
    const caps = document.getElementById('weekCaps');
    if (caps) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        const hari = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        const days = hari.map((h, i) => {
            const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
            const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            return { h, n: per[key] ? per[key].size : 0 };
        });
        const max = Math.max(...days.map(d => d.n), 0);
        caps.innerHTML = days.map(d => {
            const pct = totalMhs ? Math.round((d.n / totalMhs) * 100) : 0;
            const height = d.n ? Math.max(56, (d.n / (max || 1)) * 100) : 56;
            const cls = d.n === 0 ? 'off' : (d.n === max ? 'v1' : (pct >= 50 ? 'v2' : 'v3'));
            return `<div class="cap-col">
                ${d.n && d.n === max ? `<span class="cap-tip">${pct}%</span>` : ''}
                <div class="cap ${cls}" style="height:${height}%;" title="${d.n} hadir"></div>
                <small>${d.h}</small></div>`;
        }).join('');
    }

    // Daftar pertemuan terakhir
    const pl = document.getElementById('pertemuanList');
    if (pl) {
        const list = Object.keys(per).sort().reverse().slice(0, 5);
        pl.innerHTML = list.length ? list.map(t => `
            <div class="pitem"><div class="pico"><i class="fas fa-calendar-check"></i></div>
            <div><b>${t}</b><small>${per[t].size}${totalMhs ? '/' + totalMhs : ''} mahasiswa hadir</small></div></div>`).join('')
            : '<div class="small-muted">Belum ada data pertemuan.</div>';
    }
}

// ================================================================
// TIMER DURASI SESI — dihitung dari waktuDibuat sesi aktif
// ================================================================
function tickTimer() {
    const el = document.getElementById('timerText');
    const lb = document.getElementById('timerLabel');
    if (!el) return;
    const sesi = AState.sesiAktif;
    let t = sesi ? Date.parse(String(sesi.waktuDibuat || '').replace(' ', 'T')) : NaN;
    if (!sesi || isNaN(t)) {
        el.textContent = '--:--:--';
        if (lb) lb.textContent = sesi ? (sesi.mataKuliah || 'Sesi aktif') : 'Tidak ada sesi aktif';
        return;
    }
    const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    const p = n => String(n).padStart(2, '0');
    el.textContent = `${p(Math.floor(sec / 3600))}:${p(Math.floor(sec / 60) % 60)}:${p(sec % 60)}`;
    if (lb) lb.textContent = sesi.mataKuliah || 'Sesi aktif';
}

function stopSesiFromTimer() {
    if (AState.sesiAktif) endSesi(AState.sesiAktif.sesiId);
    else showStatus('Tidak ada sesi aktif untuk ditutup', 'warning');
}

// ================================================================
// AKSI TAMBAHAN — refresh, scroll, ekspor CSV, shortcut
// ================================================================
function scrollToActivity() {
    const el = document.getElementById('activityCard');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function refreshAll() {
    showStatus('Memuat ulang data...', 'info');
    Promise.all([loadStats(), loadActiveSesi(), loadMahasiswa(), loadRiwayatPresensi()])
        .then(() => { loadRekapKehadiran(); loadTrendChart(); loadStatistik(); showStatus('Data diperbarui', 'success'); });
}

function exportRekapCSV() {
    if (!AState.mahasiswaData.length) { showStatus('Data mahasiswa belum dimuat', 'warning'); return; }
    const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = [['NIM', 'Nama', 'Kelas', 'Status Hari Ini', 'Waktu'].map(esc).join(',')];
    AState.mahasiswaData.forEach(m => {
        const rec = AState.todayAttendance[m.nim];
        lines.push([m.nim, m.nama, m.kelas, rec ? (rec.status || 'Hadir') : 'Belum', rec ? rec.waktu : ''].map(esc).join(','));
    });
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rekap-presensi-' + todayStr() + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
}

document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (ADOM.globalSearch) ADOM.globalSearch.focus();
    }
});

document.addEventListener('DOMContentLoaded', init);

// ================================================================
// STATISTIK — rekap per pertemuan, tren, kehadiran tinggi & perlu perhatian
// Semua dihitung dari get_all_attendance + get_all (tanpa data dummy)
// ================================================================
async function loadStatistik() {
    if (ADOM.statistikLoading) {
        ADOM.statistikLoading.style.display = 'block';
        ADOM.statistikTable.style.display = 'none';
    }

    try {
        const result = await apiGetAuth('get_all_attendance');
        if (!result.success) throw new Error(result.message || 'Gagal memuat statistik');

        const rows = result.data || [];
        const totalMhs = AState.mahasiswaData.length;

        // Kelompokkan per tanggal: nim unik yang hadir
        const perTanggal = {};
        rows.forEach(r => {
            if (!r.tanggal) return;
            if (!perTanggal[r.tanggal]) perTanggal[r.tanggal] = new Set();
            perTanggal[r.tanggal].add(r.nim);
        });
        const tanggalList = Object.keys(perTanggal).sort();
        const totalPertemuan = tanggalList.length;

        if (ADOM.statTotalPertemuan) ADOM.statTotalPertemuan.textContent = totalPertemuan;

        if (totalPertemuan === 0 || totalMhs === 0) {
            if (ADOM.statistikTrendEmpty) ADOM.statistikTrendEmpty.style.display = 'block';
            const canvasEl = document.getElementById('statistikTrendChart');
            if (canvasEl) canvasEl.style.display = 'none';
            if (ADOM.statRataKehadiran) ADOM.statRataKehadiran.textContent = '0%';
            if (ADOM.statistikLoading) {
                ADOM.statistikLoading.innerHTML = '<i class="fas fa-inbox state-icon"></i>Belum ada data presensi';
            }
            if (ADOM.statistikAktifList) ADOM.statistikAktifList.innerHTML = '<div class="small-muted">Belum ada data.</div>';
            if (ADOM.statistikPerhatianList) ADOM.statistikPerhatianList.innerHTML = '<div class="small-muted">Belum ada data.</div>';
            return;
        }

        // Chart tren per pertemuan (bar), tampilkan 15 pertemuan terakhir
        const shownTanggal = tanggalList.slice(-15);
        const dataPersen = shownTanggal.map(t => Math.round((perTanggal[t].size / totalMhs) * 100));
        if (ACharts.statistikTrend) {
            ACharts.statistikTrend.data.labels = shownTanggal;
            ACharts.statistikTrend.data.datasets[0].data = dataPersen;
            ACharts.statistikTrend.update();
        }
        if (ADOM.statistikTrendEmpty) ADOM.statistikTrendEmpty.style.display = 'none';
        const canvasEl2 = document.getElementById('statistikTrendChart');
        if (canvasEl2) canvasEl2.style.display = 'block';

        // Rata-rata kehadiran keseluruhan (rata-rata persentase antar pertemuan)
        const allPersen = tanggalList.map(t => (perTanggal[t].size / totalMhs) * 100);
        const rataRata = Math.round(allPersen.reduce((a, b) => a + b, 0) / allPersen.length);
        if (ADOM.statRataKehadiran) ADOM.statRataKehadiran.textContent = rataRata + '%';

        // Tabel rekap per pertemuan (terbaru dulu)
        if (ADOM.statistikPertemuanCount) ADOM.statistikPertemuanCount.textContent = totalPertemuan + ' pertemuan';
        if (ADOM.statistikBody) {
            ADOM.statistikBody.innerHTML = [...tanggalList].reverse().map(t => {
                const hadir = perTanggal[t].size;
                const persen = Math.round((hadir / totalMhs) * 100);
                const persenClass = persen < 60 ? 'persen-low' : '';
                return `
                    <tr>
                        <td>${t}</td>
                        <td>${hadir}</td>
                        <td>${totalMhs}</td>
                        <td class="${persenClass}">${persen}%</td>
                    </tr>
                `;
            }).join('');
        }
        if (ADOM.statistikLoading) ADOM.statistikLoading.style.display = 'none';
        if (ADOM.statistikTable) ADOM.statistikTable.style.display = 'table';

        // Kehadiran tinggi vs perlu perhatian, per mahasiswa
        const hadirPerNim = {};
        rows.forEach(r => { hadirPerNim[r.nim] = (hadirPerNim[r.nim] || 0) + 1; });

        const rekapMhs = AState.mahasiswaData.map(m => {
            const hadir = hadirPerNim[m.nim] || 0;
            const persen = Math.round((hadir / totalPertemuan) * 100);
            return { nama: m.nama || m.nim, hadir, persen };
        });

        const tinggi = [...rekapMhs].sort((a, b) => b.persen - a.persen).slice(0, 5);
        const perhatian = [...rekapMhs].sort((a, b) => a.persen - b.persen).slice(0, 5);

        if (ADOM.statistikAktifList) renderRekapList(ADOM.statistikAktifList, tinggi, totalPertemuan);
        if (ADOM.statistikPerhatianList) renderRekapList(ADOM.statistikPerhatianList, perhatian, totalPertemuan);

    } catch (error) {
        console.warn('Gagal memuat statistik:', error.message);
        if (ADOM.statistikLoading) {
            ADOM.statistikLoading.innerHTML = `<i class="fas fa-triangle-exclamation state-icon"></i><strong>Gagal memuat data</strong><p>${error.message}</p>`;
            ADOM.statistikLoading.style.display = 'block';
        }
    }
}
