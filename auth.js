// ================================================================
// AUTH.JS — Helper autentikasi & session, dipakai bersama semua halaman
// (login.html, mahasiswa.html, admin.html)
// ================================================================

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxUPMX5pjBduZr0yXFhiZlDXgPA3fs5gTnxhZ5-aBDJrBtPwLL1LKigK1UhChT4GSku/exec';
const SESSION_KEY = 'presensi_session'; // { token, role, userData }

// ================================================================
// SESSION STORAGE (localStorage)
// ================================================================
function saveSession(token, role, userData) {
    const session = { token, role, userData, savedAt: Date.now() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
}

function getSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

function getToken() {
    const s = getSession();
    return s ? s.token : null;
}

function getRole() {
    const s = getSession();
    return s ? s.role : null;
}

// ================================================================
// API HELPERS
// ================================================================
// Apps Script bisa "tidur" (cold start) dan butuh 10-30 dtk untuk request pertama,
// jadi batas waktu dinaikkan dan request aman-diulang otomatis 1x kalau timeout.
const API_TIMEOUT_MS = 35000;

function isRetryableError(e) {
    const m = String((e && (e.name + ' ' + e.message)) || '').toLowerCase();
    return m.includes('timeout') || m.includes('timed out') || m.includes('abort') || m.includes('failed to fetch') || m.includes('networkerror');
}

async function apiGet(action, params = {}) {
    const qs = new URLSearchParams({ action, ...params });
    const run = async () => {
        const response = await fetch(`${WEB_APP_URL}?${qs.toString()}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(API_TIMEOUT_MS)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    };
    try { return await run(); }
    catch (e) { if (isRetryableError(e)) return run(); throw e; }
}

// retry=true hanya untuk aksi yang aman diulang (mis. login), BUKAN signup/presensi
async function apiPost(action, body = {}, retry = false) {
    const run = async () => {
        const response = await fetch(WEB_APP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, ...body }),
            signal: AbortSignal.timeout(API_TIMEOUT_MS)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    };
    try { return await run(); }
    catch (e) { if (retry && isRetryableError(e)) return run(); throw e; }
}

// Versi yang otomatis menyisipkan token dari session ke setiap request
async function apiGetAuth(action, params = {}) {
    const token = getToken();
    return apiGet(action, { ...params, token: token || '' });
}

async function apiPostAuth(action, body = {}) {
    const token = getToken();
    return apiPost(action, { ...body, token: token || '' });
}

// ================================================================
// LOGIN / SIGNUP / LOGOUT
// ================================================================
async function doLogin(email, password) {
    const result = await apiPost('login', { email, password }, true);
    if (result.success) {
        saveSession(result.token, result.role, result.userData);
    }
    return result;
}

async function doSignup(email, password, nim) {
    return apiPost('signup', { email, password, nim });
}

async function doLogout() {
    const token = getToken();
    try {
        if (token) await apiPost('logout', { token });
    } catch (e) {
        // Tetap lanjut hapus session lokal walau request logout gagal
    }
    clearSession();
    window.location.href = 'login.html';
}

// ================================================================
// GUARD — dipanggil di awal setiap halaman dashboard
// Cek token ke server (verify_token), bukan cuma percaya localStorage.
// requiredRole: 'admin' | 'mahasiswa' | null (null = boleh role apa saja asal login)
// Return userData kalau valid, atau redirect ke login.html kalau tidak.
// ================================================================
async function requireAuth(requiredRole = null) {
    const session = getSession();
    if (!session || !session.token) {
        window.location.href = 'login.html';
        return null;
    }

    try {
        const result = await apiGet('verify_token', { token: session.token });
        if (!result.success) {
            clearSession();
            window.location.href = 'login.html';
            return null;
        }

        // Sinkronkan session lokal dengan data terbaru dari server
        saveSession(session.token, result.userData.role, result.userData);

        if (requiredRole && result.userData.role !== requiredRole) {
            // Role tidak sesuai halaman ini -> lempar ke dashboard yang benar
            redirectByRole(result.userData.role);
            return null;
        }

        return result.userData;
    } catch (e) {
        // Gagal cek ke server (offline dsb) -> jangan langsung logout paksa,
        // tapi tetap larang render kalau tidak ada data session sama sekali
        console.warn('Gagal verifikasi token:', e.message);
        if (requiredRole && session.role !== requiredRole) {
            redirectByRole(session.role);
            return null;
        }
        return session.userData;
    }
}

function redirectByRole(role) {
    if (role === 'admin') {
        window.location.href = 'admin.html';
    } else if (role === 'mahasiswa') {
        window.location.href = 'mahasiswa.html';
    } else {
        window.location.href = 'login.html';
    }
}

// Bangunkan Apps Script di latar belakang saat halaman login dibuka,
// supaya saat user menekan Login server sudah siap (hasilnya diabaikan).
if (/login\.html$|\/$/.test(location.pathname)) {
    try { fetch(WEB_APP_URL + '?action=ping', { mode: 'no-cors' }).catch(() => {}); } catch (e) {}
}