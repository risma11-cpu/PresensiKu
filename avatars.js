// ================================================================
// AVATARS.JS — avatar kartun cewek/cowok (SVG, tanpa file gambar)
// Dipakai admin.html & mahasiswa.html. Muat SEBELUM admin.js / mahasiswa.js.
// ================================================================

// DAFTAR_MAHASISWA & ADMIN_GENDER ada di file daftar-mahasiswa.js (muat file itu juga)

// ---------- 1) Tebakan gender dari nama (cadangan kalau NIM belum di daftar) ----------
const NAMA_P = ['siti','nur','putri','dewi','sri','ayu','rina','fitri','indah','lestari','wulan','sari','ratna','anisa','aisyah','nabila','nabilah','rahma','dinda','salsabila','citra','maya','novi','yuni','intan','mega','tiara','nia','lia','rani','widya','amelia','zahra','kartika','permata','bunga','melati','nadia','khairunnisa','fatimah','laila','tika','desi','ika','rizka'];
const NAMA_L = ['muhammad','mohammad','muhamad','m','ahmad','budi','andi','rizki','rian','fajar','dimas','agus','bayu','hendra','ilham','zikrul','rafi','raffi','fauzan','arif','dika','adi','eko','joko','rudi','yusuf','ali','abdul','aditya','reza','dani','fikri','naufal'];

function guessGender(nama) {
    const words = String(nama || '').toLowerCase().split(/\s+/).filter(Boolean);
    for (const w of words) {
        if (NAMA_P.includes(w) || /(wati|ningsih|yanti|rini|sari|ani)$/.test(w)) return 'P';
        if (NAMA_L.includes(w)) return 'L';
    }
    return 'L';
}

function genderOf(nim, nama) {
    return DAFTAR_MAHASISWA[String(nim || '').trim()] || guessGender(nama);
}

// ---------- 2) Generator avatar ----------
const _SKIN = ['#f6d5b8', '#e9b98f', '#d49a6a', '#b9774a'];
const _HAIR = ['#2b1b12', '#4a2c1a', '#1c1c1c', '#5a3520'];
const _HIJAB = ['#2f6f57', '#b9a3d6', '#e8b4b8', '#f2d7a0', '#8fb9d9'];
const _SHIRT = ['#217a52', '#14432e', '#5fbd8f', '#f0b429', '#6b7bd6'];
const _BG = ['#f8c9c9', '#cdeccb', '#cfd3f7', '#fde6b8', '#cfe9f5'];

function _hash(s) {
    let h = 2166136261; s = String(s);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}
const _pick = (a, h, n) => a[(h >>> n) % a.length];

function avatarSVG(gender, seed, opt = {}) {
    const h = _hash(seed), skin = _pick(_SKIN, h, 0), bg = _pick(_BG, h, 3), shirt = _pick(_SHIRT, h, 5);
    const hair = _pick(_HAIR, h, 2), ink = '#2a1a12';
    let back = '', front = '', neck = true, glasses = !!opt.glasses;

    if (gender === 'P') {
        const style = opt.style != null ? opt.style : (h >>> 7) % 3;   // 0 panjang, 1 bob, 2 hijab
        if (style === 2) {
            const hc = _pick(_HIJAB, h, 4); neck = false;
            back = `<path d="M23 58Q20 18 50 17Q80 18 77 58Q78 84 62 92H38Q22 84 23 58Z" fill="${hc}"/>`;
            front = `<path d="M31 47Q34 30 50 30Q66 30 69 47Q60 40 50 40Q40 40 31 47Z" fill="${hc}"/>`;
        } else if (style === 1) {
            back = `<path d="M27 50Q25 20 50 19Q75 20 73 50L72 66Q50 62 28 66Z" fill="${hair}"/>`;
            front = `<path d="M30 46Q33 27 50 27Q67 27 70 46Q58 33 44 38Q36 40 30 46Z" fill="${hair}"/>`;
        } else {
            back = `<path d="M26 54Q23 18 50 18Q77 18 74 54L77 86Q50 94 23 86Z" fill="${hair}"/>`;
            front = `<path d="M30 46Q33 26 50 26Q67 26 70 46Q58 32 44 37Q36 40 30 46Z" fill="${hair}"/>`;
        }
    } else {
        const curly = (h >>> 7) % 3 === 1;
        front = curly
            ? `<g fill="${hair}"><circle cx="35" cy="34" r="8"/><circle cx="45" cy="28" r="9"/><circle cx="56" cy="28" r="9"/><circle cx="66" cy="34" r="8"/><circle cx="31" cy="44" r="6"/><circle cx="69" cy="44" r="6"/></g>`
            : `<path d="M30 47Q28 23 50 23Q72 23 70 47Q65 35 50 35Q35 35 30 47Z" fill="${hair}"/>`;
        if ((h >>> 9) % 3 === 0) glasses = true;
    }

    const eyes = `<circle cx="42" cy="52" r="2.3" fill="${ink}"/><circle cx="58" cy="52" r="2.3" fill="${ink}"/>`;
    const smile = `<path d="M43 61Q50 68 57 61" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    const blush = `<circle cx="37" cy="59" r="3.2" fill="#f28b82" opacity=".35"/><circle cx="63" cy="59" r="3.2" fill="#f28b82" opacity=".35"/>`;
    const glass = glasses ? `<g stroke="${ink}" stroke-width="1.8" fill="none"><circle cx="42" cy="52" r="6.5"/><circle cx="58" cy="52" r="6.5"/><path d="M48.5 52h3"/></g>` : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<rect width="100" height="100" fill="${bg}"/>` +
        `<path d="M14 100Q16 76 50 74Q84 76 86 100Z" fill="${shirt}"/>` + back +
        (neck ? `<rect x="43" y="62" width="14" height="16" rx="5" fill="${skin}"/>` : '') +
        `<ellipse cx="50" cy="50" rx="19" ry="22" fill="${skin}"/>` + front + blush + eyes + glass + smile + `</svg>`;
}

function avatarURI(gender, seed, opt) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(avatarSVG(gender, seed, opt));
}
// Avatar mahasiswa (otomatis cewek/cowok sesuai daftar / nama)
function avatarMahasiswaURI(nim, nama) { return avatarURI(genderOf(nim, nama), nim || nama); }
function avatarMahasiswaImg(nim, nama) { return `<img alt="" src="${avatarMahasiswaURI(nim, nama)}">`; }
// Avatar admin: cewek, rambut panjang
function avatarAdminImg() { return `<img alt="" src="${avatarURI(ADMIN_GENDER, 'admin', { style: 0 })}">`; }

// Style agar gambar mengisi lingkaran avatar
(function () {
    const st = document.createElement('style');
    st.textContent = '.top-avatar,.av{overflow:hidden}.top-avatar img,.av img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}';
    document.head.appendChild(st);
})();