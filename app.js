const APP_PASSWORD_SECRET = "mbohraroh";

// Client 1: Untuk data_jamaah, data_generus, dan fasilitas_kelompok
const SUPABASE_URL_UTAMA = "https://xijlyydfogbkcctlycsb.supabase.co";
const SUPABASE_ANON_KEY_UTAMA = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpamx5eWRmb2dia2NjdGx5Y3NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzAxODYsImV4cCI6MjA5NzcwNjE4Nn0.JwqYXWEt2yiLioI1o9qZ3KRrak2rtzO1Tp0eN7AuAm4";
const supabaseUtama = supabase.createClient(SUPABASE_URL_UTAMA, SUPABASE_ANON_KEY_UTAMA);

// Client 2: Khusus untuk absensi
const SUPABASE_URL_ABSENSI = "https://gttavghryoadthnvwthd.supabase.co";
const SUPABASE_ANON_KEY_ABSENSI = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0dGF2Z2hyeW9hZHRobnZ3dGhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDI5NDQsImV4cCI6MjA5NjQ3ODk0NH0.0O7I9EqSaiQq8_LKMJS9U-XDuitY6sPfYQVtBsJAeas";
const supabaseAbsensi = supabase.createClient(SUPABASE_URL_ABSENSI, SUPABASE_ANON_KEY_ABSENSI);

// State Pengguna & Role Sesi Aplikasi
let currentUser = {
    role: null, // 'DEVELOPER' atau 'OPERATOR'
    desa: null,
    kelompok: null
};

let globalCache = {
    jamaah: [],
    generus: [],
    sarpras: [],
    absensi: [],
    isLoaded: false
};

let currentMode = "DAFTAR";
let activeSectionId = 'home';
let activeRekapSubTab = "STATUS_KESELURUHAN";
let activeAbsensiSubTab = "INPUT";

window.allOperatorsCache = [];
window.activeOperatorDataset = [];
window.activeStatusDataset = [];
window.activeKelompokDataset = [];
window.activeDisabilitasDataset = [];
window.currentGroupJamaahData = [];

function showDataLoading(message = "Mengambil data...") {
    const overlay = document.getElementById('dataFetchOverlay');
    const subtext = document.getElementById('dataFetchSubtext');
    if (subtext) subtext.textContent = message;
    if (overlay) overlay.classList.add('active');
}

function hideDataLoading() {
    const overlay = document.getElementById('dataFetchOverlay');
    if (overlay) overlay.classList.remove('active');
}

async function fetchAllRows(client, tableName, selectColumns = '*') {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        let query = client.from(tableName).select(selectColumns);

        const { data: pageData, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;

        if (pageData && pageData.length > 0) {
            allData = allData.concat(pageData);
        }

        if (!pageData || pageData.length < pageSize) {
            hasMore = false;
        } else {
            page++;
        }
    }

    // KHUSUS OPERATOR:
    // Tabel data_jamaah dan data_generus dibiarkan memuat seluruh data 
    // agar menu 'Status Jamaah' dapat menghitung total keseluruhan secara akurat.
    // Menu lain (seperti daftar anggota di 'Rekap Per Klp' dan 'Database') 
    // sudah otomatis memfilter data berdasarkan kelompok operator masing-masing.

    return allData;
}

// Fungsi untuk menghapus cache lokal saat ada data yang diubah/disimpan
function invalidateAppCache() {
    localStorage.removeItem('sdc_cache_version');
    globalCache.isLoaded = false;
}

async function preloadAllApplicationData() {
    if (globalCache.isLoaded) return;

    // 1. Muat dari cache lokal terlebih dahulu agar aplikasi terbuka secara instan
    try {
        const cachedJamaah = localStorage.getItem('sdc_cache_jamaah');
        if (cachedJamaah) {
            globalCache.jamaah = JSON.parse(cachedJamaah);
            globalCache.generus = JSON.parse(localStorage.getItem('sdc_cache_generus') || '[]');
            globalCache.sarpras = JSON.parse(localStorage.getItem('sdc_cache_sarpras') || '[]');
            globalCache.absensi = JSON.parse(localStorage.getItem('sdc_cache_absensi') || '[]');
            globalCache.jadwal = JSON.parse(localStorage.getItem('sdc_cache_jadwal') || '[]');
            globalCache.isLoaded = true;

            // 2. Jalankan sinkronisasi otomatis di background secara diam-diam
            backgroundSyncData();
            return;
        }
    } catch (e) {
        console.warn("Gagal membaca cache lokal:", e);
    }

    // Jika belum ada cache sama sekali, ambil langsung dari server
    await fetchAndStoreAllData();
}

// Fungsi sinkronisasi otomatis di latar belakang (Background Sync)
async function backgroundSyncData() {
    try {
        const [dataJamaah, dataGenerus, dataSarpras, dataAbsensi, dataJadwal] = await Promise.all([
            fetchAllRows(supabaseUtama, 'data_jamaah', '*'),
            fetchAllRows(supabaseUtama, 'data_generus', '*').catch(() => []),
            fetchAllRows(supabaseUtama, 'fasilitas_kelompok', '*').catch(() => []),
            fetchAllRows(supabaseAbsensi, 'absensi_sdc', '*').catch(() => []),
            fetchAllRows(supabaseUtama, 'jadwal_kegiatan', '*').catch(() => [])
        ]);

        globalCache.jamaah = dataJamaah || [];
        globalCache.generus = dataGenerus || [];
        globalCache.sarpras = dataSarpras || [];
        globalCache.absensi = dataAbsensi || [];
        globalCache.jadwal = dataJadwal || [];

        // Perbarui Local Storage dengan data paling fresh dari server
        localStorage.setItem('sdc_cache_jamaah', JSON.stringify(globalCache.jamaah));
        localStorage.setItem('sdc_cache_generus', JSON.stringify(globalCache.generus));
        localStorage.setItem('sdc_cache_sarpras', JSON.stringify(globalCache.sarpras));
        localStorage.setItem('sdc_cache_absensi', JSON.stringify(globalCache.absensi));
        localStorage.setItem('sdc_cache_jadwal', JSON.stringify(globalCache.jadwal));

        // Jika pengguna sedang membuka menu Rekap atau Absensi, refresh tampilannya secara otomatis
        if (activeSectionId === 'rekap') {
            switchTabRekap(activeRekapSubTab);
        } else if (activeSectionId === 'absensi' && activeAbsensiSubTab === 'REKAP') {
            loadRekapAbsensi();
        }
    } catch (err) {
        console.warn("Background sync gagal (menggunakan data cache):", err);
    }
}

async function fetchAndStoreAllData() {
    showDataLoading("Memuat database ...");
    try {
        const [dataJamaah, dataGenerus, dataSarpras, dataAbsensi, dataJadwal] = await Promise.all([
            fetchAllRows(supabaseUtama, 'data_jamaah', '*'),
            fetchAllRows(supabaseUtama, 'data_generus', '*').catch(() => []),
            fetchAllRows(supabaseUtama, 'fasilitas_kelompok', '*').catch(() => []),
            fetchAllRows(supabaseAbsensi, 'absensi_sdc', '*').catch(() => []),
            fetchAllRows(supabaseUtama, 'jadwal_kegiatan', '*').catch(() => [])
        ]);

        globalCache.jamaah = dataJamaah || [];
        globalCache.generus = dataGenerus || [];
        globalCache.sarpras = dataSarpras || [];
        globalCache.absensi = dataAbsensi || [];
        globalCache.jadwal = dataJadwal || [];
        globalCache.isLoaded = true;

        localStorage.setItem('sdc_cache_jamaah', JSON.stringify(globalCache.jamaah));
        localStorage.setItem('sdc_cache_generus', JSON.stringify(globalCache.generus));
        localStorage.setItem('sdc_cache_sarpras', JSON.stringify(globalCache.sarpras));
        localStorage.setItem('sdc_cache_absensi', JSON.stringify(globalCache.absensi));
        localStorage.setItem('sdc_cache_jadwal', JSON.stringify(globalCache.jadwal));
    } catch (err) {
        showCustomModal("Peringatan", "Gagal memuat beberapa data dari server.", "⚠️");
    } finally {
        hideDataLoading();
    }
}

const SECTION_THEMES = {
    absensi: {
        btnGradient: 'from-fuchsia-600 to-pink-600 hover:from-fuchsia-700 hover:to-pink-700',
        iconBgModal: 'bg-gradient-to-br from-fuchsia-100 to-pink-100 text-fuchsia-600',
        borderColorModal: 'rgba(217, 70, 239, 0.4)',
        pickerThemeClass: 'theme-absensi',
        pickerTitleClass: 'text-fuchsia-800'
    },
    sarpras: {
        btnGradient: 'from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700',
        iconBgModal: 'bg-gradient-to-br from-teal-100 to-emerald-100 text-teal-600',
        borderColorModal: 'rgba(20, 184, 166, 0.4)',
        pickerThemeClass: 'theme-sarpras',
        pickerTitleClass: 'text-teal-800'
    },
    rekap: {
        btnGradient: 'from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700',
        iconBgModal: 'bg-gradient-to-br from-amber-100 to-orange-100 text-amber-600',
        borderColorModal: 'rgba(245, 158, 11, 0.4)',
        pickerThemeClass: 'theme-rekap',
        pickerTitleClass: 'text-amber-800'
    },
    default: {
        btnGradient: 'from-indigo-600 to-fuchsia-600 hover:from-indigo-700 hover:to-fuchsia-700',
        iconBgModal: 'bg-gradient-to-br from-indigo-100 to-fuchsia-100 text-indigo-600',
        borderColorModal: 'rgba(255, 255, 255, 0.6)',
        pickerThemeClass: '',
        pickerTitleClass: 'text-indigo-800'
    }
};

function getCurrentTheme() {
    return SECTION_THEMES[activeSectionId] || SECTION_THEMES.default;
}

const getIntVal = id => parseInt(document.getElementById(id)?.value, 10) || 0;

function formatRupiahInput(input) {
    let numberString = input.value.replace(/[^0-9]/g, '');
    if (numberString === '') {
        input.value = '';
        return;
    }
    input.value = parseInt(numberString, 10).toLocaleString('id-ID');
}

function toggleAuthRegisterView(showReg = null) {
    const loginForm = document.getElementById('authForm');
    const regForm = document.getElementById('authRegForm');
    const titleEl = document.getElementById('authTitle');
    const subtitleEl = document.getElementById('authSubtitle');
    const toggleBtn = document.getElementById('btnToggleAuthMode');
    const iconBox = document.getElementById('authIconBox');

    const shouldShowReg = showReg !== null ? showReg : loginForm.classList.contains('hidden') === false;

    if (shouldShowReg) {
        loginForm.classList.add('hidden');
        regForm.classList.remove('hidden');
        titleEl.textContent = "Buat Password";
        subtitleEl.textContent = "Daftarkan password kelompok secara mandiri";
        toggleBtn.textContent = "🔑 Sudah Memiliki Password? Login Sekarang";
        iconBox.textContent = "📝";
        
        const regDesa = document.getElementById('regDesa');
        if (regDesa && regDesa.options.length <= 1) {
            regDesa.innerHTML = '<option value="">-- Pilih Desa --</option>';
            Object.keys(dataWilayah).forEach(d => regDesa.add(new Option(d, d)));
        }
    } else {
        regForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        titleEl.textContent = "Akses Terkunci";
        subtitleEl.textContent = "Masukkan kata sandi untuk mengakses aplikasi";
        toggleBtn.textContent = "🔑 Registrasi Password";
        iconBox.textContent = "🔒";
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const inputEl = document.getElementById('appPasswordInput');
    const inputVal = inputEl.value.trim();
    const errEl = document.getElementById('authErrorMsg');
    const successEl = document.getElementById('authSuccessMsg');
    const btn = document.getElementById('authSubmitBtn');
    const btnText = document.getElementById('authBtnText');
    const spinner = document.getElementById('authBtnSpinner');
    const iconBox = document.getElementById('authIconBox');

    errEl.classList.add('hidden');
    successEl.classList.add('hidden');

    inputEl.disabled = true;
    btn.disabled = true;
    spinner.classList.remove('hidden');
    btnText.textContent = "Verifikasi Sandi...";

    try {
        if (inputVal === APP_PASSWORD_SECRET) {
            currentUser = { role: 'DEVELOPER', desa: null, kelompok: null };
            sessionStorage.setItem('userSession', JSON.stringify(currentUser));
        } else {
            const { data: opData, error } = await supabaseUtama
                .from('password_kelompok')
                .select('*')
                .eq('password_kelompok', inputVal)
                .maybeSingle();

            if (error || !opData) {
                throw new Error("Password salah atau tidak terdaftar!");
            }

            currentUser = {
                role: 'OPERATOR',
                desa: opData.desa,
                kelompok: opData.kelompok
            };
            sessionStorage.setItem('userSession', JSON.stringify(currentUser));			
        }

        // --- KIRIM LOG KE SUPABASE SAAT BERHASIL LOGIN ---
        await recordOperatorLog(
            "LOGIN", 
            currentUser.role === 'DEVELOPER' 
                ? "Developer masuk ke sistem (Full Access)" 
                : `Operator Kelompok ${currentUser.kelompok} (${currentUser.desa}) login`
        );

        spinner.classList.add('hidden');
        btnText.textContent = currentUser.role === 'DEVELOPER' ? "Akses Dev Diterima" : `Operator ${currentUser.kelompok}`;
        btn.className = "w-full py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg flex items-center justify-center gap-2 transition duration-300 transform scale-105";
        iconBox.className = "w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto text-4xl shadow-inner transition-colors duration-300";
        iconBox.textContent = "🔓";
        successEl.textContent = `✅ Login Sebagai ${currentUser.role === 'DEVELOPER' ? 'Developer (Full Access)' : 'Operator (' + currentUser.kelompok + ')'}`;
        successEl.classList.remove('hidden');

        setTimeout(async () => {
            const modal = document.getElementById('authModal');
            modal.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(async () => {
                modal.classList.add('hidden');
                await preloadAllApplicationData();
                applyRoleRestrictionsUI();
				checkOperatorMonthlyAttendance();
            }, 400);
        }, 600);

    } catch (err) {
        inputEl.disabled = false;
        btn.disabled = false;
        spinner.classList.add('hidden');
        btnText.textContent = "Buka Aplikasi";
        errEl.textContent = `⚠️ ${err.message || "Password salah! Silakan coba lagi."}`;
        errEl.classList.remove('hidden');
        inputEl.value = "";
        inputEl.focus();
    }
}

// Pastikan fungsi pencatatan log ini ada di app.js
async function recordOperatorLog(aksi, keterangan) {
    try {
        await supabaseUtama.from('operator_logs').insert([{
            desa: currentUser.desa || 'Admin',
            kelompok: currentUser.kelompok || 'Developer',
            aksi: aksi,
            keterangan: keterangan
        }]);
    } catch (err) {
        console.warn("Gagal mencatat log:", err);
    }
}

function handleLogout() {
    showCustomModal(
        "Konfirmasi Keluar",
        "Apakah Anda yakin ingin keluar dari sesi aplikasi?",
        `<svg class="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`,
        () => {
            sessionStorage.removeItem('userSession');
            window.location.reload();
        },
        true
    );
}

async function handleRegisterOperatorPassword(e) {
    e.preventDefault();
    const desa = document.getElementById('regDesa').value;
    const kelompok = document.getElementById('regKelompok').value;
    const pass1 = document.getElementById('regPasswordInput').value.trim();
    const pass2 = document.getElementById('regPasswordConfirmInput').value.trim();

    if (!desa || !kelompok) {
        showCustomModal("Peringatan", "Silakan pilih Desa dan Kelompok terlebih dahulu!", "⚠️");
        return;
    }

    if (pass1 !== pass2) {
        showCustomModal("Peringatan", "Konfirmasi password tidak cocok!", "⚠️");
        return;
    }

    if (pass1.length < 4) {
        showCustomModal("Peringatan", "Password minimal 4 karakter!", "⚠️");
        return;
    }

    showDataLoading("Mendaftarkan password kelompok...");

    try {
        const { data: existingGroup, error: checkGroupErr } = await supabaseUtama
            .from('password_kelompok')
            .select('*')
            .eq('desa', desa)
            .eq('kelompok', kelompok)
            .maybeSingle();

        if (existingGroup) {
            throw new Error(`Kelompok ${kelompok} (${desa}) sudah memiliki password. Silakan hubungi Developer jika lupa password.`);
        }

        const { data: duplicatePass, error: checkPassErr } = await supabaseUtama
            .from('password_kelompok')
            .select('*')
            .eq('password_kelompok', pass1)
            .maybeSingle();

        if (duplicatePass) {
            throw new Error("Password ini sudah digunakan oleh kelompok lain. Silakan buat kombinasi password yang berbeda!");
        }

        const { error: insertErr } = await supabaseUtama
            .from('password_kelompok')
            .insert([{ desa: desa, kelompok: kelompok, password_kelompok: pass1 }]);

        if (insertErr) throw insertErr;

        showCustomModal(
            "Registrasi Berhasil", 
            `Password untuk Kelompok ${kelompok} berhasil dibuat! Silakan login menggunakan password tersebut.`, 
            "🎉",
            () => {
                toggleAuthRegisterView(false);
                document.getElementById('appPasswordInput').value = pass1;
                document.getElementById('appPasswordInput').focus();
            }
        );

    } catch (err) {
        showCustomModal("Gagal Registrasi", err.message || "Gagal menyimpan password kelompok.", "❌");
    } finally {
        hideDataLoading();
    }
}

function autoFillSarprasOperator() {
    if (!currentUser || currentUser.role !== 'OPERATOR' || !currentUser.desa || !currentUser.kelompok) return;
    if (!globalCache || !globalCache.sarpras) return;

    const data = globalCache.sarpras.find(s => s.desa === currentUser.desa && s.kelompok === currentUser.kelompok);

    if (data) {
        const editIdEl = document.getElementById('edit_sarpras_id');
        const desaEl = document.getElementById('sarp_desa');
        const kelompokEl = document.getElementById('sarp_kelompok');

        if (editIdEl) editIdEl.value = data.id || '';
        if (desaEl) desaEl.value = data.desa || currentUser.desa;

        if (kelompokEl) {
            kelompokEl.innerHTML = `<option value="${currentUser.kelompok}">${currentUser.kelompok}</option>`;
            kelompokEl.value = currentUser.kelompok;
            kelompokEl.disabled = true;
            kelompokEl.classList.remove('bg-slate-100/50', 'text-slate-400');
        }

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val ?? 0;
        };

        const statusEl = document.getElementById('sarp_status_tanah');
        if (statusEl) statusEl.value = data.status_tanah || '';

        setVal('sarp_sub', data.jumlah_sub_kelompok);
        setVal('sarp_masjid', data.jumlah_masjid);
        setVal('sarp_aula', data.jumlah_aula);
        setVal('sarp_km_pria', data.km_pria);
        setVal('sarp_km_wanita', data.km_wanita);
        setVal('sarp_km_mt', data.km_mt);
        setVal('sarp_km_tamu', data.km_tamu);

        const btn = document.getElementById('sarpBtn');
        if (btn) btn.textContent = "Perbarui Data Sarpras";
    }
}

function applyRoleRestrictionsUI() {
    if (currentUser.role !== 'OPERATOR') return;

    const opDesa = currentUser.desa;
    const opKelompok = currentUser.kelompok;

    // 1. Tambahkan exportDesa dan exportKelompok ke dalam daftar yang dikunci
    const pairs = [
        { desaId: 'desa', kelompokId: 'kelompok' },
        { desaId: 'searchDesa', kelompokId: 'searchKelompok' },
        { desaId: 'abs_desa', kelompokId: 'abs_kelompok' },
        { desaId: 'sarp_desa', kelompokId: 'sarp_kelompok' },
        { desaId: 'exportDesa', kelompokId: 'exportKelompok' } // <-- Tambahan untuk Ekspor
    ];

    pairs.forEach(({ desaId, kelompokId }) => {
        const dEl = document.getElementById(desaId);
        const kEl = document.getElementById(kelompokId);

        if (dEl && kEl) {
            dEl.value = opDesa;
            dEl.disabled = true;

            kEl.innerHTML = `<option value="${opKelompok}">${opKelompok}</option>`;
            kEl.value = opKelompok;
            kEl.disabled = true;
            kEl.classList.remove('bg-slate-100/50', 'text-slate-400');
        }
    });

    // 2. Kunci pilihan "Mode Export" agar operator hanya bisa mengekspor Per Kelompok
    const exportScopeEl = document.getElementById('exportScopeMode');
    if (exportScopeEl) {
        exportScopeEl.value = 'KELOMPOK';
        exportScopeEl.disabled = true;
    }

    if (document.getElementById('searchKelompok')) {
        fetchAutoJamaahList(opDesa, opKelompok);
    }

    const btnSarprasDashboard = document.querySelector("button[onclick=\"showSection('sarpras')\"]");
    if (btnSarprasDashboard) {
        btnSarprasDashboard.classList.add('hidden');
    }

    const btnRekapDashboard = document.querySelector("button[onclick=\"showSection('rekap')\"]");
    if (btnRekapDashboard) {
        btnRekapDashboard.style.gridColumn = "1 / -1";
        btnRekapDashboard.style.justifySelf = "center";
        btnRekapDashboard.style.width = "100%";
        btnRekapDashboard.style.maxWidth = "320px";
    }

    const tabRekapSarpras = document.getElementById('tabRekapSarpras');
    if (tabRekapSarpras) {
        tabRekapSarpras.classList.add('hidden');
    }
}

function initScrollDetectors() {
    document.querySelectorAll('.table-vertical-scroll').forEach(container => {
        let ticking = false;
        container.addEventListener('scroll', function() {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    if (container.scrollLeft > 10) {
                        container.classList.add('is-scrolled');
                    } else {
                        container.classList.remove('is-scrolled');
                    }
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    });
}

const rawDataWilayah = {
    "Bandardawung": ["Bandardawung Barat", "Bandardawung Timur", "Dawung Atas", "Dawung Bawah", "Dawung Tengah", "Gamping", "Gondang Barat", "Gondang Tengah", "Gondang Timur", "Ngasem", "Pelas Barat", "Pelas Timur"],
    "Karanglo Selatan": ["Blimbing 1", "Blimbing 2", "Blimbing 3", "Jabalkanil", "Karanglo", "Pedan Selatan", "Pedan Utara"],
    "Karanglo Utara": ["Cepogo", "Dukuh", "Pandeyan", "Plombokan", "Sadakan Kidul 1", "Sadakan Kidul 2", "Sadakan Lor", "Sekuwung"],
    "Krangean": ["Gondang Boma", "Gondosuli", "Krangean Selatan", "Krangean Utara", "Nglegok Atas", "Nglegok Bawah", "Ngreso", "Somokado", "Tawang 1", "Tawang 2", "Watusambang"]
};

const dataWilayah = {};
Object.keys(rawDataWilayah).sort().forEach(key => {
    dataWilayah[key] = rawDataWilayah[key].sort();
});

function toTitleCase(str) { 
    if (!str) return '';
    return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase()); 
}

function toggleNoHpInput(statusValue) {
    const boxNoHp = document.getElementById('boxNoHpOperator');
    const noHpInput = document.getElementById('no_hp');
    if (statusValue === 'Operator') {
        boxNoHp.classList.remove('hidden');
        noHpInput.required = true;
    } else {
        boxNoHp.classList.add('hidden');
        noHpInput.required = false;
        noHpInput.value = '';
    }
}

function toggleDisabilitasOptionsForm() {
    const isDis = document.getElementById('is_disabilitas').checked;
    const wrap = document.getElementById('wrapperKategoriDisabilitas');
    if (isDis) {
        wrap.classList.remove('hidden');
        wrap.classList.add('animate-fade-in-up');
    } else {
        wrap.classList.add('hidden');
        resetDisabilitasCheckboxes();
    }
}

function resetDisabilitasCheckboxes() {
    document.querySelectorAll('input[name="kategori_disabilitas"]').forEach(cb => cb.checked = false);
}

function getSelectedKategoriDisabilitasForm() {
    return Array.from(document.querySelectorAll('input[name="kategori_disabilitas"]:checked')).map(cb => cb.value);
}

window.addEventListener('popstate', (event) => {
    const centerPicker = document.getElementById('centerPickerModal');
    if (centerPicker && !centerPicker.classList.contains('hidden')) {
        closeCenterPicker(false);
        return;
    }

    const belumAbsenModal = document.getElementById('belumAbsenModal');
    if (belumAbsenModal && !belumAbsenModal.classList.contains('hidden')) {
        closeModal('belumAbsenModal', false);
        return;
    }

    const exportModal = document.getElementById('exportJamaahModal');
    if (exportModal && exportModal.classList.contains('active')) {
        closeModal('exportJamaahModal', false);
        return;
    }

    const statusModal = document.getElementById('statusDetailModal');
    if (statusModal && statusModal.classList.contains('active')) {
        closeModal('statusDetailModal', false);
        return;
    }

    const disModal = document.getElementById('disabilitasDetailModal');
    if (disModal && disModal.classList.contains('active')) {
        closeModal('disabilitasDetailModal', false);
        return;
    }

    const klpModal = document.getElementById('kelompokDetailModal');
    if (klpModal && klpModal.classList.contains('active')) {
        closeKelompokDetailModal();
        return;
    }

    const opModal = document.getElementById('operatorDetailModal');
    if (opModal && opModal.classList.contains('active')) {
        closeModal('operatorDetailModal', false);
        return;
    }

    const customModal = document.getElementById('customModal');
    if (customModal && customModal.classList.contains('active')) {
        closeModal('customModal', false);
        return;
    }

    if (event.state && event.state.section) {
        switchSectionView(event.state.section);
    } else {
        switchSectionView('home');
    }
});

function showSection(target, pushHistory = true) {
    if (currentUser.role === 'OPERATOR' && target === 'sarpras') {
        showCustomModal(
            "Fitur Dalam Pemeliharaan", 
            "Fitur Sarpras saat ini belum dapat diakses oleh Operator karena masih dalam tahap pembaruan data sistem.", 
            "🛠️"
        );
        return;
    }

    if (pushHistory) {
        history.pushState({ section: target }, '', '#' + target);
    }
    switchSectionView(target);
}

function switchSectionView(target) {
    if (currentUser.role === 'OPERATOR' && target === 'sarpras') {
        showSection('home', false);
        return;
    }

    const sections = {
        'home': document.getElementById('mainDashboard'),
        'database': document.getElementById('sectionDatabase'),
        'absensi': document.getElementById('sectionAbsensi'),
        'sarpras': document.getElementById('sectionSarpras'),
        'rekap': document.getElementById('sectionRekap'),
        'jadwal': document.getElementById('sectionJadwal')
    };

    // ATUR VISIBILITAS LOGO & JUDUL (Hanya tampil di Home)
    const headerBranding = document.getElementById('mainHeaderBranding');
    if (headerBranding) {
        if (target === 'home') {
            headerBranding.classList.remove('hidden');
        } else {
            headerBranding.classList.add('hidden');
        }
    }

    const targetSection = sections[target];
    if (!targetSection) return;

    Object.keys(sections).forEach(secKey => {
        if (secKey !== target && sections[secKey]) {
            sections[secKey].classList.remove('section-active');
            sections[secKey].classList.add('hidden');
        }
    });

    targetSection.classList.remove('hidden');
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            targetSection.classList.add('section-active');
        });
    });

    activeSectionId = target;

    if (target === 'home') {
        checkOperatorMonthlyAttendance();
    } // <-- PERBAIKAN: Tutup kurung kurawal ditambahkan di sini

    if (target === 'database') {
        if (currentMode !== 'UPDATE') switchMode('DAFTAR');
    } else if (target === 'absensi') {
        switchTabAbsensi(activeAbsensiSubTab || 'INPUT');
        setupYearFilter();
        populateKegiatanFilter();
    } else if (target === 'sarpras') {
        const formSarp = document.getElementById('formSarpras');
        if (formSarp) formSarp.classList.remove('hidden');
        autoFillSarprasOperator(); 
    } else if (target === 'rekap') {
        const secSarp = document.getElementById('sectionSarpras');
        if (secSarp) secSarp.classList.add('hidden');
        switchTabRekap(activeRekapSubTab || 'STATUS_KESELURUHAN');
    } else if (target === 'jadwal') {
        loadJadwalKegiatan();
    }
}

function openModal(id, pushHistory = true) {
    const el = document.getElementById(id);
    if (!el) return;

    if (pushHistory) {
        history.pushState({ modal: id, section: activeSectionId }, '', '#' + id);
    }
    
    // Pastikan class 'hidden' dari Tailwind dihapus terlebih dahulu
    el.classList.remove('hidden');

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.classList.add('active');
            // Menangani efek fade-in untuk modal khusus seperti centerPicker/belumAbsenModal
            el.classList.remove('opacity-0');
            const card = el.querySelector('#belumAbsenModalCard') || el.firstElementChild;
            if (card) {
                card.classList.remove('scale-90', 'opacity-0');
                card.classList.add('scale-100', 'opacity-100');
            }
        });
    });
}

function closeModal(id, backHistory = true) {
    const el = document.getElementById(id);
    if (!el) return;

    el.classList.remove('active');
    el.classList.add('opacity-0');

    const card = el.querySelector('#belumAbsenModalCard') || el.firstElementChild;
    if (card) {
        card.classList.remove('scale-100', 'opacity-100');
        card.classList.add('scale-90', 'opacity-0');
    }
    
    setTimeout(() => {
        el.classList.add('hidden');
    }, 350); // Disesuaikan dengan durasi transisi CSS

    if (backHistory && window.history.state && (window.history.state.modal === id || window.history.state.modalOpen === id)) {
        window.history.back();
    }
}

function closeKelompokDetailModal() {
    const el = document.getElementById('kelompokDetailModal');
    if (!el) return;
    
    el.classList.remove('active');
    setTimeout(() => {
        el.classList.add('hidden');
    }, 300);

    switchTabRekap('REKAP_KELOMPOK');
}

function autoCapitalize(inputElement) {
    let start = inputElement.selectionStart;
    let end = inputElement.selectionEnd;
    let value = inputElement.value;
    let capitalized = toTitleCase(value);
    if (inputElement.value !== capitalized) {
        inputElement.value = capitalized;
        inputElement.setSelectionRange(start, end);
    }
}

function hitungUmurOtomatis() {
    const tgl = document.getElementById('tgl_lahir_tgl').value;
    const bln = document.getElementById('tgl_lahir_bln').value;
    const thn = document.getElementById('tgl_lahir_thn').value;
    const badgeUmur = document.getElementById('displayUmur');
    const valUmur = document.getElementById('umurVal');
    const statusSelect = document.getElementById('status');

    if (tgl && bln && thn) {
        const birthDate = new Date(`${thn}-${bln}-${tgl}`);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }

        if (!isNaN(age) && age >= 0) {
            valUmur.textContent = age;
            badgeUmur.classList.remove('hidden');

            // --- OTOMATISASI STATUS MANULA (60 TAHUN KE ATAS) ---
            if (age >= 60 && statusSelect) {
                statusSelect.value = "Manula";
                toggleNoHpInput("Manula"); // Menyesuaikan tampilan form nomor HP
            }

            return age;
        }
    }
    badgeUmur.classList.add('hidden');
    return null;
}

window.addEventListener('DOMContentLoaded', async () => {
    history.replaceState({ section: 'home' }, '', '#home');
    initDateDropdowns();
    initDesaDropdowns();
    initScrollDetectors();
    switchSectionView('home');

    const savedSession = sessionStorage.getItem('userSession');
    const authModal = document.getElementById('authModal');

    if (savedSession) {
        currentUser = JSON.parse(savedSession);
        authModal.classList.add('hidden');
        await preloadAllApplicationData();
        applyRoleRestrictionsUI();
		checkOperatorMonthlyAttendance();
    }

    setTimeout(() => {
        const loader = document.getElementById('loadingScreen');
        if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => {
                if (!savedSession) {
                    document.getElementById('appPasswordInput').focus();
                }
            }, 400);
        }
    }, 1200);
});

function initDesaDropdowns() {
    const dropdownPairs = [
        { desa: 'desa', kelompok: 'kelompok' },
        { desa: 'searchDesa', kelompok: 'searchKelompok' },
        { desa: 'exportDesa', kelompok: 'exportKelompok' },
        { desa: 'abs_desa', kelompok: 'abs_kelompok' },
        { desa: 'sarp_desa', kelompok: 'sarp_kelompok' },
        { desa: 'regDesa', kelompok: 'regKelompok' }
    ];

    dropdownPairs.forEach(({ desa, kelompok }) => {
        const sel = document.getElementById(desa);
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Pilih Desa --</option>';
        Object.keys(dataWilayah).forEach(d => sel.add(new Option(d, d)));
        bindDropdown(desa, kelompok);
    });

    ['filterDesaRekap', 'filterDesaAbsensi'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">Semua Desa</option>';
        Object.keys(dataWilayah).forEach(d => sel.add(new Option(d, d)));
    });
}

function initDateDropdowns() {
    const tglSel = document.getElementById('tgl_lahir_tgl');
    const thnSel = document.getElementById('tgl_lahir_thn');
    const absTglSel = document.getElementById('abs_tgl');
    const absThnSel = document.getElementById('abs_thn');

    if (tglSel) tglSel.innerHTML = '';
    if (thnSel) thnSel.innerHTML = '';
    if (absTglSel) absTglSel.innerHTML = '';
    if (absThnSel) absThnSel.innerHTML = '';

    for (let i = 1; i <= 31; i++) {
        const val = i < 10 ? `0${i}` : `${i}`;
        if (tglSel) tglSel.add(new Option(val, val));
        if (absTglSel) absTglSel.add(new Option(val, val));
    }

    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= currentYear - 100; y--) {
        if (thnSel) thnSel.add(new Option(y, y));
    }

    for (let y = currentYear + 1; y >= currentYear - 5; y--) {
        if (absThnSel) absThnSel.add(new Option(y, String(y)));
    }

    setAbsensiDateDefault();
}

function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function setAbsensiDateDefault(dateStr = null) {
    const targetDate = dateStr || getTodayDateString();
    const parts = targetDate.split('-');
    if (parts.length !== 3) return;

    const thnEl = document.getElementById('abs_thn');
    const blnEl = document.getElementById('abs_bln');
    const tglEl = document.getElementById('abs_tgl');

    if (thnEl && !Array.from(thnEl.options).some(o => o.value === parts[0])) {
        thnEl.add(new Option(parts[0], parts[0]));
    }
    if (thnEl) thnEl.value = parts[0];
    if (blnEl) blnEl.value = parts[1];
    if (tglEl) tglEl.value = parts[2];
}

function bindDropdown(desaId, kelompokId) {
    const dEl = document.getElementById(desaId);
    if (!dEl) return;
    dEl.addEventListener('change', function() {
        const klp = document.getElementById(kelompokId);
        if (!klp) return;
        klp.innerHTML = '<option value="">-- Pilih Kelompok --</option>';
        
        if(this.value && dataWilayah[this.value]) {
            klp.disabled = false;
            klp.classList.remove('bg-slate-100/50', 'text-slate-400');
            dataWilayah[this.value].forEach(k => klp.add(new Option(k, k)));
        } else {
            klp.disabled = true;
            klp.classList.add('bg-slate-100/50', 'text-slate-400');
        }

        if (desaId === 'searchDesa') {
            document.getElementById('autoJamaahListContainer').classList.add('hidden');
            if (currentMode === 'UPDATE') {
                document.getElementById('formJamaah').classList.add('hidden');
            }
        }
    });
}

function showCustomModal(title, message, icon = '💡', onOk = null, showCancel = false, onCancel = null) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('modalIcon').innerHTML = icon;
    
    const iconBox = document.getElementById('modalIcon');
    const card = document.getElementById('customModalCard');
    const theme = getCurrentTheme();

    iconBox.className = `w-16 h-16 ${theme.iconBgModal} rounded-3xl flex items-center justify-center mx-auto text-3xl font-bold shadow-inner`;
    card.style.borderColor = theme.borderColorModal;

    const actionsDiv = document.getElementById('modalActions');
    actionsDiv.innerHTML = '';

    if (showCancel) {
        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'w-1/2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-all';
        btnCancel.textContent = 'Batal';
        btnCancel.onclick = () => {
            closeCustomModal();
            if (onCancel) onCancel();
        };
        actionsDiv.appendChild(btnCancel);
    }

    const btnOk = document.createElement('button');
    btnOk.type = 'button';
    btnOk.className = showCancel 
        ? `w-1/2 py-3 bg-gradient-to-r ${theme.btnGradient} text-white rounded-xl text-sm font-bold transition-all shadow-md` 
        : `w-full py-3 bg-gradient-to-r ${theme.btnGradient} text-white rounded-xl text-sm font-bold transition-all shadow-lg hover:-translate-y-0.5`;
    btnOk.textContent = showCancel ? 'Ya, Lanjutkan' : 'OK';
    
    btnOk.onclick = () => {
        closeCustomModal();
        if (onOk) onOk();
    };
    actionsDiv.appendChild(btnOk);

    openModal('customModal');
}

function closeCustomModal() {
    closeModal('customModal');
}

function switchMode(mode, keepSearchFilters = false) {
    currentMode = mode;
    const searchSec = document.getElementById('searchSection');
    const formJamaah = document.getElementById('formJamaah');
    const btnSubmit = document.getElementById('submitJamaahBtn');
    const statusSelect = document.getElementById('status');

    const currentDesa = document.getElementById('desa').value;
    const currentKelompok = document.getElementById('kelompok').value;

    formJamaah.reset();
    document.getElementById('edit_jamaah_id').value = "";
    document.getElementById('displayUmur').classList.add('hidden');
    toggleNoHpInput(statusSelect.value);
    document.getElementById('is_disabilitas').checked = false;
    toggleDisabilitasOptionsForm();

    if (!keepSearchFilters) {
        document.getElementById('autoJamaahListContainer').classList.add('hidden');
        document.getElementById('searchDesa').value = "";
        const searchKlp = document.getElementById('searchKelompok');
        searchKlp.innerHTML = '<option value="">-- Pilih Desa Dulu --</option>';
        searchKlp.disabled = true;
        searchKlp.classList.add('bg-slate-100/50', 'text-slate-400');
    }

    let mpOption = statusSelect.querySelector('option[value="Meninggal / Sambung Luar Daerah"]');
    
    if (mode === "UPDATE") {
        document.getElementById('tabUpdate').className = "py-2.5 text-xs font-bold rounded-xl bg-indigo-600 text-white shadow-md transition-all duration-300";
        document.getElementById('tabDaftar').className = "py-2.5 text-xs font-bold rounded-xl text-indigo-800 hover:bg-indigo-200/50 transition-all duration-300";
        searchSec.classList.remove('hidden');
        formJamaah.classList.add('hidden');
        btnSubmit.textContent = "Perbarui Data Jamaah";

        if (!mpOption) {
			const opt = document.createElement('option');
			opt.value = "Meninggal / Sambung Luar Daerah";
			opt.textContent = "Meninggal / Sambung Luar Daerah";
			// Tambahkan class khusus teks merah
			opt.className = "text-red-600 font-extrabold bg-red-50";
			statusSelect.appendChild(opt);
		}
    } else {
        document.getElementById('tabDaftar').className = "py-2.5 text-xs font-bold rounded-xl bg-indigo-600 text-white shadow-md transition-all duration-300";
        document.getElementById('tabUpdate').className = "py-2.5 text-xs font-bold rounded-xl text-indigo-800 hover:bg-indigo-200/50 transition-all duration-300";
        searchSec.classList.add('hidden');
        formJamaah.classList.remove('hidden');
        btnSubmit.textContent = "Simpan Data Jamaah";

        if (mpOption) {
            mpOption.remove();
        }

        if (currentDesa) {
            const desaEl = document.getElementById('desa');
            const kelompokEl = document.getElementById('kelompok');
            
            desaEl.value = currentDesa;
            kelompokEl.innerHTML = '<option value="">-- Pilih Kelompok --</option>';
            if (dataWilayah[currentDesa]) {
                dataWilayah[currentDesa].forEach(k => kelompokEl.add(new Option(k, k)));
            }
            kelompokEl.disabled = false;
            kelompokEl.classList.remove('bg-slate-100/50', 'text-slate-400');
            kelompokEl.value = currentKelompok;
        }
    }

    if (currentUser.role === 'OPERATOR') {
        applyRoleRestrictionsUI();
    }
}

document.getElementById('searchKelompok').addEventListener('change', function() {
    const desa = document.getElementById('searchDesa').value;
    fetchAutoJamaahList(desa, this.value);
    if (currentMode === 'UPDATE') {
        document.getElementById('formJamaah').classList.add('hidden');
    }
});

function selectJamaahToForm(j) {
    document.getElementById('edit_jamaah_id').value = j.id;
    document.getElementById('nama').value = j.nama;
    document.getElementById('jenis_kelamin').value = j.jenis_kelamin;
    document.getElementById('tempat_lahir').value = j.tempat_lahir;

    // Set tanggal lahir dulu agar umur bisa dihitung
    if(j.tanggal_lahir) {
        const parts = j.tanggal_lahir.split('-');
        if(parts.length === 3) {
            document.getElementById('tgl_lahir_thn').value = parts[0];
            document.getElementById('tgl_lahir_bln').value = parts[1];
            document.getElementById('tgl_lahir_tgl').value = parts[2];
            
            // Hitung umur & otomatiskan status Manula jika umur >= 60
            hitungUmurOtomatis(); 
        }
    }

    document.getElementById('desa').value = j.desa;
    
    const elKlp = document.getElementById('kelompok');
    elKlp.innerHTML = '<option value="">-- Pilih Kelompok --</option>';
    if (dataWilayah[j.desa]) {
        dataWilayah[j.desa].forEach(k => elKlp.add(new Option(k, k)));
    }
    elKlp.disabled = false;
    elKlp.classList.remove('bg-slate-100/50', 'text-slate-400');
    elKlp.value = j.kelompok;

    // Jika status dari DB diset, atau secara otomatis berubah lewat hitungUmurOtomatis()
    const stVal = j.status || "Menikah";
    const statusSelect = document.getElementById('status');
    
    // Jika umur di bawah 60, pakai status asli dari DB
    const currentAge = hitungUmurOtomatis();
    if (!currentAge || currentAge < 60) {
        statusSelect.value = stVal;
    }
    
    toggleNoHpInput(statusSelect.value);
    document.getElementById('no_hp').value = j.no_hp || '';

    document.getElementById('is_disabilitas').checked = j.is_disabilitas ? true : false;
    toggleDisabilitasOptionsForm();
    resetDisabilitasCheckboxes();
    if(j.is_disabilitas && j.kategori_disabilitas) {
        let katList = Array.isArray(j.kategori_disabilitas) ? j.kategori_disabilitas : j.kategori_disabilitas.split(',');
        katList.forEach(k => {
            const cb = document.querySelector(`input[name="kategori_disabilitas"][value="${k.trim()}"]`);
            if(cb) cb.checked = true;
        });
    }

    if (currentUser.role === 'OPERATOR') {
        applyRoleRestrictionsUI();
    }

    document.getElementById('formJamaah').classList.remove('hidden');
    document.getElementById('formJamaah').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('formJamaah').addEventListener('submit', async function(e) {
    e.preventDefault();

    const editId = document.getElementById('edit_jamaah_id').value;
    const statusValue = document.getElementById('status').value;
    const desaEl = document.getElementById('desa');
    const kelompokEl = document.getElementById('kelompok');
    
    const savedDesa = desaEl.value;
    const savedKelompok = kelompokEl.value;

    if (currentMode === "UPDATE" && statusValue === "Meninggal / Sambung Luar Daerah") {
        if (!editId) {
            showCustomModal("Peringatan", "Silakan cari dan pilih data terlebih dahulu.", "⚠️");
            return;
        }

        showCustomModal(
            "Konfirmasi Penghapusan",
            "Data ini akan dihapus permanen dari database. Lanjutkan?",
            "🗑️",
            async () => {
                const currentDesa = document.getElementById('searchDesa').value;
                const currentKelompok = document.getElementById('searchKelompok').value;
                
                showDataLoading("Menghapus data jamaah...");
                try {
                    const { error } = await supabaseUtama.from('data_jamaah').delete().eq('id', editId);
                    if (error) {
                        showCustomModal("Gagal Hapus", error.message, "❌");
                    } else {
						
						invalidateAppCache();
						
                        globalCache.jamaah = globalCache.jamaah.filter(j => String(j.id) !== String(editId));
                        switchMode('UPDATE', true);
                        if (currentDesa && currentKelompok) fetchAutoJamaahList(currentDesa, currentKelompok);
                    }
                } finally {
                    hideDataLoading();
                }
            },
            true
        );
        return;
    }

    const tgl = document.getElementById('tgl_lahir_tgl').value;
    const bln = document.getElementById('tgl_lahir_bln').value;
    const thn = document.getElementById('tgl_lahir_thn').value;
    const fullDate = `${thn}-${bln}-${tgl}`;
    const calculatedAge = hitungUmurOtomatis();

    const isDis = document.getElementById('is_disabilitas').checked;
    const katDis = isDis ? getSelectedKategoriDisabilitasForm() : [];

    const payload = {
        nama: toTitleCase(document.getElementById('nama').value.trim()),
        no_hp: statusValue === 'Operator' ? document.getElementById('no_hp').value.trim() : null,
        jenis_kelamin: document.getElementById('jenis_kelamin').value,
        tempat_lahir: toTitleCase(document.getElementById('tempat_lahir').value.trim()),
        tanggal_lahir: fullDate,
        umur: calculatedAge,
        desa: savedDesa,
        kelompok: savedKelompok,
        status: statusValue,
        is_disabilitas: isDis,
        kategori_disabilitas: katDis
    };

    if (!editId) {
        const isDuplicate = globalCache.jamaah.some(j => 
            (j.nama || '').trim().toLowerCase() === payload.nama.toLowerCase() &&
            (j.tempat_lahir || '').trim().toLowerCase() === payload.tempat_lahir.toLowerCase() &&
            (j.tanggal_lahir || '') === payload.tanggal_lahir &&
            (j.kelompok || '').trim().toLowerCase() === payload.kelompok.toLowerCase() &&
            (j.desa || '').trim().toLowerCase() === payload.desa.toLowerCase()
        );

        if (isDuplicate) {
            const userChoice = await showDuplicateConfirmModal(
                payload.nama, 
                payload.tempat_lahir, 
                payload.tanggal_lahir, 
                payload.kelompok, 
                payload.desa
            );

            if (!userChoice) {
                return;
            }
        }
    }

    showDataLoading("Menyimpan data...");

    try {
        if (editId) {
            const { data, error } = await supabaseUtama.from('data_jamaah').update(payload).eq('id', editId).select();
            if (error) throw error;
            
            const idx = globalCache.jamaah.findIndex(j => String(j.id) === String(editId));
            if (idx !== -1 && data && data.length > 0) {
                globalCache.jamaah[idx] = data[0];
            }
        } else {
            const { data, error } = await supabaseUtama.from('data_jamaah').insert([payload]).select();
            if (error) throw error;
            
            if (data && data.length > 0) {
                globalCache.jamaah.push(data[0]);
            }
        }

        showCustomModal("Sukses", editId ? "Data Berhasil Di-update!" : "Data Berhasil Disimpan!", "🎉", () => {
            
			invalidateAppCache();
			
			if (currentMode === "UPDATE") {
                const currentDesa = document.getElementById('searchDesa').value;
                const currentKelompok = document.getElementById('searchKelompok').value;
                switchMode('UPDATE', true);
                if (currentDesa && currentKelompok) fetchAutoJamaahList(currentDesa, currentKelompok);
            } else {
                document.getElementById('edit_jamaah_id').value = "";
                document.getElementById('nama').value = "";
                document.getElementById('jenis_kelamin').value = "";
                document.getElementById('tempat_lahir').value = "";
                document.getElementById('tgl_lahir_tgl').value = "";
                document.getElementById('tgl_lahir_bln').value = "";
                document.getElementById('tgl_lahir_thn').value = "";
                document.getElementById('status').value = "Menikah";
                toggleNoHpInput("Menikah");
                document.getElementById('is_disabilitas').checked = false;
                toggleDisabilitasOptionsForm();
                document.getElementById('displayUmur').classList.add('hidden');

                if (savedDesa) {
                    desaEl.value = savedDesa;
                    kelompokEl.innerHTML = '<option value="">-- Pilih Kelompok --</option>';
                    if (dataWilayah[savedDesa]) {
                        dataWilayah[savedDesa].forEach(k => kelompokEl.add(new Option(k, k)));
                    }
                    kelompokEl.disabled = false;
                    kelompokEl.classList.remove('bg-slate-100/50', 'text-slate-400');
                    kelompokEl.value = savedKelompok;
                }

                if (currentUser.role === 'OPERATOR') {
                    applyRoleRestrictionsUI();
                }

                document.getElementById('nama').focus();
            }
        });

    } catch(err) {
        showCustomModal("Gagal", err.message || "Gagal menyimpan data ke server.", "❌");
    } finally {
        hideDataLoading();
    }
});

function openExportJamaahModal() {
    const searchDesa = document.getElementById('searchDesa').value;
    const searchKelompok = document.getElementById('searchKelompok').value;
    const scopeSelect = document.getElementById('exportScopeMode');

    if (searchDesa && searchKelompok) {
        scopeSelect.value = "KELOMPOK";
    } else if (searchDesa) {
        scopeSelect.value = "DESA";
    } else {
        scopeSelect.value = "ALL";
    }

    handleExportScopeChange(scopeSelect.value);

    if (searchDesa) {
        const expDesa = document.getElementById('exportDesa');
        expDesa.value = searchDesa;
        expDesa.dispatchEvent(new Event('change', { bubbles: true }));

        if (searchKelompok) {
            const expKelompok = document.getElementById('exportKelompok');
            expKelompok.value = searchKelompok;
        }
    }
	
	if (currentUser && currentUser.role === 'OPERATOR') {
        applyRoleRestrictionsUI();
    }

    openModal('exportJamaahModal');
}

function handleExportScopeChange(mode) {
    const boxDesa = document.getElementById('exportBoxDesa');
    const boxKelompok = document.getElementById('exportBoxKelompok');

    if (mode === "ALL") {
        boxDesa.classList.add('hidden');
        boxKelompok.classList.add('hidden');
    } else if (mode === "DESA") {
        boxDesa.classList.remove('hidden');
        boxKelompok.classList.add('hidden');
    } else if (mode === "KELOMPOK") {
        boxDesa.classList.remove('hidden');
        boxKelompok.classList.remove('hidden');
    }
}

function toggleAllExportCols(checked) {
    document.querySelectorAll('.export-col-cb').forEach(cb => cb.checked = checked);
}

function processExportJamaahData(exportType = 'excel') {
    const mode = document.getElementById('exportScopeMode').value;
    const selectedDesa = document.getElementById('exportDesa').value;
    const selectedKelompok = document.getElementById('exportKelompok').value;

    if (mode === "DESA" && !selectedDesa) {
        showCustomModal("Peringatan", "Silakan pilih Desa terlebih dahulu!", "⚠️");
        return;
    }

    if (mode === "KELOMPOK" && (!selectedDesa || !selectedKelompok)) {
        showCustomModal("Peringatan", "Silakan pilih Desa dan Kelompok terlebih dahulu!", "⚠️");
        return;
    }

    const selectedCols = [];
    document.querySelectorAll('.export-col-cb:checked').forEach(cb => selectedCols.push(cb.value));

    if (selectedCols.length === 0) {
        showCustomModal("Peringatan", "Pilih minimal satu kolom untuk diexport!", "⚠️");
        return;
    }

    closeModal('exportJamaahModal');

    try {
        // Filter wilayah sesuai opsi yang dipilih
        let targetDesaFilter = mode === "ALL" ? null : selectedDesa;
        let targetKelompokFilter = mode === "KELOMPOK" ? selectedKelompok : null;

        // 1. GUNAKAN DEDUPLIKASI PINTAR (Gabungkan Jamaah + Generus Tanpa Data Dobel/Pengajar)
        let data = getUniqueMembers(
            globalCache.jamaah || [],
            globalCache.generus || [],
            targetDesaFilter,
            targetKelompokFilter
        );

        if (!data || data.length === 0) {
            showCustomModal("Export Gagal", "Tidak ada data jamaah/generus yang sesuai dengan pilihan wilayah.", "ℹ️");
            return;
        }

        // Urutkan berdasarkan Desa -> Kelompok -> Nama
        data.sort((a, b) => {
            if ((a.desa || '') !== (b.desa || '')) return (a.desa || '').localeCompare(b.desa || '');
            if ((a.kelompok || '') !== (b.kelompok || '')) return (a.kelompok || '').localeCompare(b.kelompok || '');
            return (a.nama || '').localeCompare(b.nama || '');
        });

        const labelMapping = {
            nama: "Nama Lengkap",
            jenis_kelamin: "JK",
            tempat_lahir: "Tempat Lahir",
            tanggal_lahir: "Tanggal Lahir",
            umur: "Umur (Thn)",
            desa: "Desa",
            kelompok: "Kelompok",
            status: "Status / Kategori",
            disabilitas: "Disabilitas",
            no_hp: "No HP / WhatsApp"
        };

        const formattedData = data.map((item, index) => {
            let row = { "No": index + 1 };
            selectedCols.forEach(col => {
                let headerName = labelMapping[col] || col;
                let val = item[col] ?? '';

                if (col === 'tanggal_lahir' && val) {
                    const p = val.split('-');
                    if (p.length === 3) val = `${p[2]}/${p[1]}/${p[0]}`;
                } else if (col === 'disabilitas') {
                    if (item.is_disabilitas) {
                        const kats = Array.isArray(item.kategori_disabilitas) && item.kategori_disabilitas.length > 0 
                            ? item.kategori_disabilitas.join(', ') 
                            : (typeof item.kategori_disabilitas === 'string' && item.kategori_disabilitas ? item.kategori_disabilitas : 'Penyandang Disabilitas');
                        val = `Penyandang (${kats})`;
                    } else {
                        val = 'Bukan Penyandang Disabilitas';
                    }
                }

                row[headerName] = val;
            });
            return row;
        });

        let fileName = "Data_Jamaah_dan_Generus";
        if (mode === "DESA") fileName += `_${selectedDesa}`;
        if (mode === "KELOMPOK") fileName += `_${selectedDesa}_${selectedKelompok}`;
        fileName += `_${new Date().toISOString().slice(0, 10)}`;

        const ws = XLSX.utils.json_to_sheet(formattedData);

        if (exportType === 'csv') {
            const csvOutput = XLSX.utils.sheet_to_csv(ws);
            const blob = new Blob(["\ufeff" + csvOutput], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.setAttribute("download", `${fileName}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Data Jamaah & Generus");
            XLSX.writeFile(wb, `${fileName}.xlsx`);
        }

    } catch (err) {
        showCustomModal("Gagal Export", err.message, "❌");
    }
}

// SIMPAN / UPDATE SARPRAS
document.getElementById('formSarpras').addEventListener('submit', function(e) {
    e.preventDefault();

    if (currentUser.role === 'OPERATOR') {
        showCustomModal("Akses Dibatasi", "Operator sementara belum dapat mengubah data Sarpras.", "⚠️");
        return;
    }

    const editId = document.getElementById('edit_sarpras_id').value;
    const payload = {
        desa: document.getElementById('sarp_desa').value,
        kelompok: document.getElementById('sarp_kelompok').value,
        status_tanah: document.getElementById('sarp_status_tanah').value,
        jumlah_sub_kelompok: getIntVal('sarp_sub'),
        jumlah_masjid: getIntVal('sarp_masjid'),
        jumlah_aula: getIntVal('sarp_aula'),
        km_pria: getIntVal('sarp_km_pria'),
        km_wanita: getIntVal('sarp_km_wanita'),
        km_mt: getIntVal('sarp_km_mt'),
        km_tamu: getIntVal('sarp_km_tamu')
    };

    (async () => {
        showDataLoading("Menyimpan data sarpras...");
        try {
            if (editId) {
                const { data, error } = await supabaseUtama
                    .from('fasilitas_kelompok')
                    .update(payload)
                    .eq('id', editId)
                    .select();
                if (error) throw error;
                const idx = globalCache.sarpras.findIndex(s => String(s.id) === String(editId));
                if (idx !== -1 && data && data.length > 0) globalCache.sarpras[idx] = data[0];
            } else {
                const { data, error } = await supabaseUtama
                    .from('fasilitas_kelompok')
                    .upsert([payload], { onConflict: 'desa,kelompok' })
                    .select();
                if (error) throw error;
                if (data && data.length > 0) {
                    const idx = globalCache.sarpras.findIndex(s => s.desa === payload.desa && s.kelompok === payload.kelompok);
                    if (idx !== -1) globalCache.sarpras[idx] = data[0];
                    else globalCache.sarpras.push(data[0]);
                }
            }

            showCustomModal("Sukses", "Data Sarpras Berhasil Diperbarui!", "🏛️", () => {
                
				invalidateAppCache();
				
				document.getElementById('edit_sarpras_id').value = "";
                setTimeout(() => {
                    switchSectionView('rekap');
                    switchTabRekap('REKAP_SARPRAS');
                }, 100);
            });
        } catch (e) {
            showCustomModal("Gagal", e.message || "Gagal menyimpan sarpras", "❌");
        } finally {
            hideDataLoading();
        }
    })();
});

function editSarpras(id) {
    if (currentUser.role === 'OPERATOR') {
        showCustomModal("Fitur Dalam Pemeliharaan", "Modul Sarpras belum dapat diakses oleh Operator saat ini.", "🛠️");
        return;
    }

    let data = globalCache.sarpras.find(s => String(s.id) === String(id));
    if (!data) return;

    document.getElementById('edit_sarpras_id').value = data.id || '';
    document.getElementById('sarp_desa').value = data.desa || '';

    const kelompokEl = document.getElementById('sarp_kelompok');
    kelompokEl.innerHTML = '<option value="">-- Pilih Kelompok --</option>';
    if (dataWilayah[data.desa]) {
        dataWilayah[data.desa].forEach(k => kelompokEl.add(new Option(k, k)));
    }
    kelompokEl.disabled = false;
    kelompokEl.classList.remove('bg-slate-100/50', 'text-slate-400');
    kelompokEl.value = data.kelompok || '';

    document.getElementById('sarp_status_tanah').value = data.status_tanah || '';
    document.getElementById('sarp_sub').value = data.jumlah_sub_kelompok ?? 0;
    document.getElementById('sarp_masjid').value = data.jumlah_masjid ?? 0;
    document.getElementById('sarp_aula').value = data.jumlah_aula ?? 0;
    document.getElementById('sarp_km_pria').value = data.km_pria ?? 0;
    document.getElementById('sarp_km_wanita').value = data.km_wanita ?? 0;
    document.getElementById('sarp_km_mt').value = data.km_mt ?? 0;
    document.getElementById('sarp_km_tamu').value = data.km_tamu ?? 0;

    document.getElementById('sarpBtn').textContent = data.id ? "Perbarui Data Sarpras" : "Simpan Data Sarpras";
    showSection('sarpras');
}

function toggleNamaKegiatanLainnya(selectEl) {
    const customInput = document.getElementById('abs_nama_custom');
    const boxTargetCustom = document.getElementById('boxTargetCustom');

    if (selectEl.value === 'LAINNYA') {
        customInput.classList.remove('hidden');
        customInput.required = true;
        boxTargetCustom.classList.remove('hidden');
    } else {
        customInput.classList.add('hidden');
        customInput.required = false;
        customInput.value = '';
        boxTargetCustom.classList.add('hidden');
        document.querySelectorAll('input[name="target_custom"]').forEach(cb => cb.checked = false);
    }
}

document.getElementById('formAbsensiKegiatan').addEventListener('submit', function(e) {
    e.preventDefault();
    const editId = document.getElementById('edit_absensi_id').value;
    const selectNama = document.getElementById('abs_nama').value;
    const customNama = toTitleCase(document.getElementById('abs_nama_custom').value.trim());
    const finalNamaKegiatan = selectNama === 'LAINNYA' ? customNama : selectNama;

    const absTgl = document.getElementById('abs_tgl')?.value;
    const absBln = document.getElementById('abs_bln')?.value;
    const absThn = document.getElementById('abs_thn')?.value;

    let tanggalKegiatan = (absThn && absBln && absTgl)
        ? `${absThn}-${absBln}-${absTgl}`
        : (editId ? document.getElementById('edit_tanggal_kegiatan').value : getTodayDateString());

    const infaqRaw = document.getElementById('abs_infaq').value.replace(/[^0-9]/g, '');

    const targetCustomSelected = selectNama === 'LAINNYA'
        ? Array.from(document.querySelectorAll('input[name="target_custom"]:checked')).map(cb => cb.value)
        : null;

    const payload = {
        nama_kegiatan: finalNamaKegiatan,
        tanggal_kegiatan: tanggalKegiatan,
        desa: document.getElementById('abs_desa').value,
        kelompok: document.getElementById('abs_kelompok').value,
        jumlah_laki: getIntVal('abs_laki'),
        jumlah_perempuan: getIntVal('abs_perempuan'),
        jumlah_ijin: getIntVal('abs_ijin'),
        infaq: parseFloat(infaqRaw) || 0,
        target_custom: targetCustomSelected
    };

    (async () => {
        showDataLoading("Menyimpan data absensi...");
        try {
            if (editId) {
                const { data, error } = await supabaseAbsensi.from('absensi_sdc').update(payload).eq('id', editId).select();
                if (error) throw error;
                const idx = globalCache.absensi.findIndex(a => String(a.id) === String(editId));
                if (idx !== -1 && data && data.length > 0) globalCache.absensi[idx] = data[0];
            } else {
                const { data, error } = await supabaseAbsensi.from('absensi_sdc').insert([payload]).select();
                if (error) throw error;
                if (data && data.length > 0) globalCache.absensi.push(data[0]);
            }

            showCustomModal("Sukses", "Data Absensi Berhasil Diperbarui!", "📋", () => {
                invalidateAppCache();

                e.target.reset();
                document.getElementById('abs_nama_custom').classList.add('hidden');
                document.getElementById('boxTargetCustom').classList.add('hidden');
                document.getElementById('edit_absensi_id').value = "";
                document.getElementById('edit_tanggal_kegiatan').value = "";
                document.getElementById('absBtn').textContent = "Simpan Absensi";
                setAbsensiDateDefault();

                if (currentUser.role === 'OPERATOR') {
                    applyRoleRestrictionsUI();
                }
                checkOperatorMonthlyAttendance();
                switchTabAbsensi('REKAP');
            });
        } catch (e) {
            if (e.code === '23505' || (e.message && e.message.includes('unique_kegiatan_kelompok_tanggal'))) {
                showCustomModal(
                    "Absensi Sudah Terisi",
                    `Kelompok ${payload.kelompok} (${payload.desa}) sudah pernah mengisi absensi untuk kegiatan "${payload.nama_kegiatan}" pada tanggal ${payload.tanggal_kegiatan}.\n\nJika ingin mengubah data, silakan gunakan tombol Edit di menu Rekapan.`,
                    "⚠️"
                );
            } else {
                showCustomModal("Gagal Simpan", e.message || "Gagal menyimpan absensi", "❌");
            }
        } finally {
            hideDataLoading();
        }
    })();
});

function editAbsensi(id) {
    const data = globalCache.absensi.find(a => String(a.id) === String(id));
    if (!data) return;

    document.getElementById('edit_absensi_id').value = data.id;
    document.getElementById('edit_tanggal_kegiatan').value = data.tanggal_kegiatan;
    setAbsensiDateDefault(data.tanggal_kegiatan);

    const selectNama = document.getElementById('abs_nama');
    const customInput = document.getElementById('abs_nama_custom');
    const boxTargetCustom = document.getElementById('boxTargetCustom');

    const standardOptions = [
        "Materi PPG Pusat dan 30 Point",
        "Pengajian Ibu-Ibu Daerah",
        "Pengajian Umum Daerah",
        "Pengajian Remaja Daerah",
        "Asrama K. Khotbah"
    ];

    if (standardOptions.includes(data.nama_kegiatan)) {
        selectNama.value = data.nama_kegiatan;
        customInput.classList.add('hidden');
        customInput.value = '';
        boxTargetCustom.classList.add('hidden');
    } else {
        selectNama.value = "LAINNYA";
        customInput.classList.remove('hidden');
        customInput.value = data.nama_kegiatan;
        boxTargetCustom.classList.remove('hidden');

        document.querySelectorAll('input[name="target_custom"]').forEach(cb => {
            cb.checked = Array.isArray(data.target_custom) && data.target_custom.includes(cb.value);
        });
    }

    document.getElementById('abs_desa').value = data.desa;
    const klp = document.getElementById('abs_kelompok');
    klp.innerHTML = `<option value="${data.kelompok}">${data.kelompok}</option>`;
    klp.disabled = false;
    klp.classList.remove('bg-slate-100/50', 'text-slate-400');

    document.getElementById('abs_laki').value = data.jumlah_laki ?? '';
    document.getElementById('abs_perempuan').value = data.jumlah_perempuan ?? '';
    document.getElementById('abs_ijin').value = data.jumlah_ijin ?? '';
    const infaqEl = document.getElementById('abs_infaq');
    infaqEl.value = data.infaq ? (parseInt(data.infaq, 10) || 0).toLocaleString('id-ID') : '';

    if (currentUser.role === 'OPERATOR') {
        applyRoleRestrictionsUI();
    }

    document.getElementById('absBtn').textContent = "Update Absensi";
    switchTabAbsensi('INPUT');
}

function switchTabRekap(tab) {
    if (currentUser.role === 'OPERATOR' && tab === 'REKAP_SARPRAS') {
        showCustomModal("Fitur Dalam Pemeliharaan", "Rekap Sarpras belum dapat diakses oleh Operator.", "🛠️");
        return;
    }

    activeRekapSubTab = tab;
    const btnPrint = document.getElementById('btnPrintRekap');
    const btnExport = document.getElementById('btnExportExcel');
    const secStatus = document.getElementById('sectionStatusKeseluruhan');
    const secRekapKlp = document.getElementById('sectionRekapKelompok');

    const tabStatus = document.getElementById('tabStatusKeseluruhan');
    const tabKlp = document.getElementById('tabRekapKelompok');
    const tabSarp = document.getElementById('tabRekapSarpras');

    secStatus.classList.add('hidden');
    secRekapKlp.classList.add('hidden');

    [tabStatus, tabKlp, tabSarp].forEach(t => {
        if (t) t.className = "py-2 px-3.5 text-xs font-extrabold rounded-xl text-amber-900 hover:bg-amber-200/60 flex items-center gap-1.5 transition-all duration-300 whitespace-nowrap";
    });

    if (tab === 'STATUS_KESELURUHAN') {
        secStatus.classList.remove('hidden');
        tabStatus.className = "py-2 px-3.5 text-xs font-extrabold rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md flex items-center gap-1.5 transition-all duration-300 whitespace-nowrap";
        if(btnPrint) btnPrint.classList.remove('hidden');
        if(btnExport) btnExport.classList.add('hidden');
        loadRekapStatusKeseluruhan();

    } else if (tab === 'REKAP_KELOMPOK') {
        secRekapKlp.classList.remove('hidden');
        tabKlp.className = "py-2 px-3.5 text-xs font-extrabold rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md flex items-center gap-1.5 transition-all duration-300 whitespace-nowrap";
        if(btnPrint) btnPrint.classList.remove('hidden');
        if(btnExport) btnExport.classList.remove('hidden');
        loadRekapKelompokLengkap();

    } else if (tab === 'REKAP_SARPRAS') {
        secRekapKlp.classList.remove('hidden');
        tabSarp.className = "py-2 px-3.5 text-xs font-extrabold rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md flex items-center gap-1.5 transition-all duration-300 whitespace-nowrap";
        if(btnPrint) btnPrint.classList.remove('hidden');
        if(btnExport) btnExport.classList.remove('hidden');
        loadRekapSarprasDeveloper();
    }
}

function triggerPrintRekapCurrentTab() {
    let docTitle = "Laporan Rekapitulasi Data Jamaah & Generus";
    if (activeRekapSubTab === 'REKAP_KELOMPOK') {
        docTitle = "Laporan Rekapitulasi Jamaah & Sarpras Per Kelompok";
    }
    printData('printableRekapContent', docTitle);
}

function switchTabAbsensi(tab) {
    activeAbsensiSubTab = tab;

    const btnPrint = document.getElementById('btnPrintAbsensi');
    const btnCopy = document.getElementById('btnCopyBelumAbsen');
    const tabInput = document.getElementById('tabInputAbsensi');
    const tabRekap = document.getElementById('tabRekapAbsensi');

    if (tab === 'INPUT') {
        document.getElementById('formAbsensiKegiatan').classList.remove('hidden');
        document.getElementById('printableAbsensi').classList.add('hidden');

        const editIdVal = document.getElementById('edit_absensi_id')?.value;
        const savedTglVal = document.getElementById('edit_tanggal_kegiatan')?.value;
        if (window._pendingAlertPrefill && window._pendingAlertPrefill.tanggalIso) {
            setAbsensiDateDefault(window._pendingAlertPrefill.tanggalIso);
        } else if (!editIdVal) {
            setAbsensiDateDefault();
        } else if (savedTglVal) {
            setAbsensiDateDefault(savedTglVal);
        }

        tabInput.className = "py-2 px-3.5 text-xs font-extrabold rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-md flex items-center gap-1.5 transition-all duration-300";
        tabRekap.className = "py-2 px-3.5 text-xs font-extrabold rounded-xl text-fuchsia-900 hover:bg-fuchsia-200/60 flex items-center gap-1.5 transition-all duration-300";

        if (btnPrint) btnPrint.classList.add('hidden');
        if (btnCopy) btnCopy.classList.add('hidden');
    } else {
        document.getElementById('formAbsensiKegiatan').classList.add('hidden');
        document.getElementById('printableAbsensi').classList.remove('hidden');

        tabRekap.className = "py-2 px-3.5 text-xs font-extrabold rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-md flex items-center gap-1.5 transition-all duration-300";
        tabInput.className = "py-2 px-3.5 text-xs font-extrabold rounded-xl text-fuchsia-900 hover:bg-fuchsia-200/60 flex items-center gap-1.5 transition-all duration-300";

        if (btnPrint) btnPrint.classList.remove('hidden');
        if (btnCopy && currentUser.role === 'DEVELOPER') btnCopy.classList.remove('hidden');

        populateKegiatanFilter();
        loadRekapAbsensi();
    }
}

function copyKelompokBelumAbsen() {
    if (currentUser.role !== 'DEVELOPER') return;

    const desa = document.getElementById('filterDesaAbsensi')?.value || '';
    const tglAngka = document.getElementById('filterTanggalAbsensi')?.value || '';
    const bulan = document.getElementById('filterBulanAbsensi')?.value || '';
    const tahun = document.getElementById('filterTahun')?.value || '';
    const kegiatan = document.getElementById('filterKegiatanAbsensi')?.value || '';

    if (!kegiatan) {
        showCustomModal("Pilih Kegiatan", "Silakan pilih Filter Nama Kegiatan terlebih dahulu untuk mengecek kelompok yang belum absen.", "⚠️");
        return;
    }

    let data = [...globalCache.absensi];
    data = data.filter(item => item.nama_kegiatan === kegiatan);
    
    // Perbaikan logika filter agar menangani opsi kosong ("Semua Tgl", "Semua Bulan", dll) dengan benar
    const filteredData = data.filter(item => {
        if (desa && item.desa !== desa) return false;
        if (!item.tanggal_kegiatan) return false;

        const parts = item.tanggal_kegiatan.split('-'); // Format YYYY-MM-DD
        if (parts.length < 3) return false;

        const itemTahun = parts[0];
        const itemBulan = parts[1];
        const itemTgl = parts[2];

        if (tahun && itemTahun !== tahun) return false;
        if (bulan && itemBulan !== bulan) return false;
        if (tglAngka && itemTgl !== tglAngka) return false;

        return true;
    });

    const sudahAbsenSet = new Set();
    filteredData.forEach(item => {
        sudahAbsenSet.add(`${item.desa}__${item.kelompok}`);
    });

    const belumAbsen = [];
    Object.keys(dataWilayah).forEach(d => {
        if (!desa || d === desa) {
            dataWilayah[d].forEach(k => {
                if (!sudahAbsenSet.has(`${d}__${k}`)) {
                    belumAbsen.push({ desa: d, kelompok: k });
                }
            });
        }
    });

    if (belumAbsen.length === 0) {
        showCustomModal("Lengkap", "Mantap! Semua kelompok sudah mengisi absensi untuk kegiatan ini pada filter waktu yang dipilih.", "✅");
        return;
    }

    // Membuat Label Waktu yang Dinamis
    const elmBulan = document.getElementById('filterBulanAbsensi');
    const namaBulan = bulan ? elmBulan.options[elmBulan.selectedIndex].text : 'Semua Bulan';
    
    let labelWaktu = "";
    if (tglAngka && bulan && tahun) {
        labelWaktu = `${tglAngka} ${namaBulan} ${tahun}`;
    } else if (bulan && tahun) {
        labelWaktu = `${namaBulan} ${tahun}`;
    } else {
        labelWaktu = `Periode ${tahun || 'Keseluruhan'}`;
    }

    // Susun Teks WhatsApp
    let pesan = `*PEMBERITAHUAN ABSENSI*\n\n`;
    pesan += `Kegiatan: *${kegiatan}*\n`;
    pesan += `Waktu: *${labelWaktu}*\n\n`;
    pesan += `Berikut adalah daftar kelompok yang *BELUM* mengisi absensi:\n\n`;

    belumAbsen.forEach((item, index) => {
        pesan += `${index + 1}. Kelompok ${item.kelompok} (${item.desa})\n`;
    });

    pesan += `\nMohon kepada operator kelompok terkait untuk segera mengisi absensi di aplikasi OS SDC Tawangmangu. Alkhamdulillah Jaza Kumullahu Khoiro 🙏`;

    // Render Pratinjau ke dalam Modal Belum Absen
    document.getElementById('belumAbsenSubtitle').textContent = `${kegiatan} • ${labelWaktu}`;
    
    const listEl = document.getElementById('belumAbsenList');
    listEl.innerHTML = '';

    belumAbsen.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = "p-3 sm:p-3.5 bg-white/90 border border-rose-100 rounded-xl flex justify-between items-center transition-all duration-200 shadow-sm hover:shadow-md hover:bg-white gap-2";
        row.innerHTML = `
            <div class="flex items-center gap-2 truncate">
                <span class="text-xs font-bold text-rose-500 shrink-0 min-w-[20px]">
                    ${index + 1}.
                </span>
                <span class="font-extrabold text-xs sm:text-sm text-slate-800 truncate">
                    Kelompok ${item.kelompok}
                </span>
            </div>
            <span class="text-[10px] font-extrabold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 shrink-0">
                ${item.desa}
            </span>
        `;
        listEl.appendChild(row);
    });

    const btnSalin = document.getElementById('btnProsesSalinBelumAbsen');
    btnSalin.onclick = () => {
        navigator.clipboard.writeText(pesan).then(() => {
            closeModal('belumAbsenModal');
            setTimeout(() => {
                showCustomModal(
                    "Berhasil Disalin", 
                    `Daftar ${belumAbsen.length} kelompok yang belum absen telah disalin ke clipboard. Silakan tempel (paste) di Grup WA Operator.`, 
                    "📋"
                );
            }, 300);
        }).catch(() => {
            showCustomModal("Gagal", "Browser tidak mendukung penyalinan otomatis ke clipboard.", "❌");
        });
    };

    openModal('belumAbsenModal');
}

function parseKategoriGenerus(rawStr) {
    const val = (rawStr || "").toLowerCase().trim();
	if (val.includes('balita')) return 'balita';
    if (val.includes('paud')) return 'paud';
    if (val.includes('tk')) return 'tk';
    if (val.includes('caberawit') || val.includes('cabe rawit')) return 'caberawit';
    if (val.includes('pra')) return 'praRemaja';
    if (val.includes('remaja')) return 'remaja';
    if (val.includes('mandiri')) return 'usiaMandiri';
    return null;
}

function loadRekapStatusKeseluruhan() {
    const dataJamaah = globalCache.jamaah;
    const dataGenerus = globalCache.generus;

    let menikah = 0, duda = 0, janda = 0, manula = 0, operator = 0, totalDisabilitas = 0;
    
    window.allOperatorsCache = [];
    window.activeDisabilitasDataset = [];
    window.statusJamaahCache = {
        'Menikah': [],
        'Duda': [],
        'Janda': [],
        'Manula': []
    };

    dataJamaah.forEach(item => {
        const st = (item.status || "").toLowerCase();
        const itemData = {
            nama: item.nama,
            kelompok: item.kelompok || '-',
            desa: item.desa || '-',
            umur: item.umur !== null && item.umur !== undefined && item.umur !== '' ? `${item.umur} thn` : '-'
        };

        if (item.is_disabilitas) {
            totalDisabilitas++;
            window.activeDisabilitasDataset.push({
                nama: item.nama,
                kelompok: item.kelompok || '-',
                desa: item.desa || '-',
                umur: itemData.umur,
                kategoriRaw: item.kategori_disabilitas,
                kategori: Array.isArray(item.kategori_disabilitas) && item.kategori_disabilitas.length > 0 
                    ? item.kategori_disabilitas 
                    : (item.kategori_disabilitas ? item.kategori_disabilitas.split(',') : ['Penyandang Disabilitas'])
            });
        }

        if (st === "menikah") {
            menikah++;
            window.statusJamaahCache['Menikah'].push(itemData);
        } else if (st === "duda") {
            duda++;
            window.statusJamaahCache['Duda'].push(itemData);
        } else if (st === "janda") {
            janda++;
            window.statusJamaahCache['Janda'].push(itemData);
        } else if (st === "manula") {
            manula++;
            window.statusJamaahCache['Manula'].push(itemData);
        } else if (st === "operator") {
            operator++;
            window.allOperatorsCache.push({
                nama: item.nama,
                no_hp: item.no_hp,
                desa: item.desa,
                kelompok: item.kelompok
            });
        }
    });

    const genCounts = { balita: 0,paud: 0, tk: 0, caberawit: 0, praRemaja: 0, remaja: 0, usiaMandiri: 0 };
    let totalGenerusMurni = 0;

    dataGenerus.forEach(g => {
        const key = parseKategoriGenerus(g.kategori_usia);
        if (key && genCounts.hasOwnProperty(key)) {
            genCounts[key]++;
            totalGenerusMurni++;
        }

        if (g.is_disabilitas) {
            totalDisabilitas++;
            let umurTxt = '-';
            if (g.umur !== null && g.umur !== undefined && g.umur !== '') {
                umurTxt = `${g.umur} thn`;
            } else if (g.usia !== null && g.usia !== undefined && g.usia !== '') {
                umurTxt = `${g.usia} thn`;
            }

            window.activeDisabilitasDataset.push({
                nama: g.nama,
                kelompok: g.kelompok || '-',
                desa: g.desa || '-',
                umur: umurTxt,
                kategoriRaw: g.kategori_disabilitas,
                kategori: Array.isArray(g.kategori_disabilitas) && g.kategori_disabilitas.length > 0 
                    ? g.kategori_disabilitas 
                    : (g.kategori_disabilitas ? g.kategori_disabilitas.split(',') : ['Penyandang Disabilitas'])
            });
        }
    });

    document.getElementById('stMenikah').textContent = menikah;
    document.getElementById('stDuda').textContent = duda;
    document.getElementById('stJanda').textContent = janda;
    document.getElementById('stManula').textContent = manula;
    document.getElementById('stOperator').textContent = operator;
    document.getElementById('stTotalJamaahDewasa').textContent = `${dataJamaah.length} Orang`;
    document.getElementById('stTotalDisabilitas').textContent = `${totalDisabilitas} Orang`;

    document.getElementById('genBalita').textContent = genCounts.balita;
	document.getElementById('genPaud').textContent = genCounts.paud;
    document.getElementById('genTk').textContent = genCounts.tk;
    document.getElementById('genCaberawit').textContent = genCounts.caberawit;
    document.getElementById('genPraRemaja').textContent = genCounts.praRemaja;
    document.getElementById('genRemaja').textContent = genCounts.remaja;
    document.getElementById('genUsiaMandiri').textContent = genCounts.usiaMandiri;

    document.getElementById('stTotalGenerus').textContent = `${totalGenerusMurni} Orang`;
    document.getElementById('stTotalAll').textContent = `${dataJamaah.length + totalGenerusMurni} Data`;
}

function showDisabilitasDetailModal() {
    window.activeDisabilitasDataset.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));

    const katCounts = {};
    window.activeDisabilitasDataset.forEach(item => {
        let kats = [];
        if (Array.isArray(item.kategoriRaw) && item.kategoriRaw.length > 0) {
            kats = item.kategoriRaw;
        } else if (item.kategori) {
            kats = item.kategori.split(',').map(s => s.trim());
        } else {
            kats = ['Lainnya'];
        }

        kats.forEach(k => {
            const cleanKat = k || 'Lainnya';
            katCounts[cleanKat] = (katCounts[cleanKat] || 0) + 1;
        });
    });

    const summaryEl = document.getElementById('disabilitasCategorySummary');
    if (summaryEl) {
        summaryEl.innerHTML = '';
        const keys = Object.keys(katCounts);
        if (keys.length === 0) {
            summaryEl.innerHTML = `<p class="col-span-full text-[10px] text-slate-400 font-semibold text-center py-1">Belum ada kategori terdata.</p>`;
        } else {
            keys.forEach(kat => {
                const badge = document.createElement('div');
                badge.className = "p-1.5 bg-white/80 rounded-xl border border-teal-100 flex justify-between items-center";
                badge.innerHTML = `
                    <span class="text-[10px] font-extrabold text-slate-600 truncate mr-1" title="${kat}">${kat}</span>
                    <span class="text-[10px] font-black text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded-md">${katCounts[kat]}</span>
                `;
                summaryEl.appendChild(badge);
            });
        }
    }

    const searchInput = document.getElementById('disabilitasDetailSearch');
    if (searchInput) searchInput.value = '';

    renderDisabilitasDetailList(window.activeDisabilitasDataset);
    openModal('disabilitasDetailModal');
}

function renderDisabilitasDetailList(listData) {
    const listEl = document.getElementById('disabilitasDetailList');
    listEl.innerHTML = '';

    if (!listData || listData.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-slate-400 font-semibold text-center py-5">Tidak ada penyandang disabilitas terdaftar.</p>`;
        return;
    }

    listData.forEach(item => {
        const card = document.createElement('div');
        card.className = "p-3 bg-gradient-to-r from-teal-50/90 to-emerald-50/90 border border-teal-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 animate-fade-in-up hover:shadow-md transition-all";
        
        let katArray = [];
        if (Array.isArray(item.kategoriRaw) && item.kategoriRaw.length > 0) {
            katArray = item.kategoriRaw;
        } else if (Array.isArray(item.kategori)) {
            katArray = item.kategori;
        } else if (typeof item.kategori === 'string') {
            katArray = item.kategori.split(',').map(s => s.trim());
        }

        let badgesHtml = katArray.map(k => `
            <span class="text-[10px] font-extrabold text-teal-800 bg-teal-100/90 border border-teal-300/60 px-2.5 py-1 rounded-lg inline-block shadow-2xs">
                ${k.trim()}
            </span>
        `).join('');

        card.innerHTML = `
            <div class="space-y-1">
                <div class="font-extrabold text-xs sm:text-sm text-slate-800 flex items-center gap-2">
                    <span>${item.nama}</span>
                    <span class="text-[10px] font-extrabold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-md border border-teal-200 shrink-0">
                        ${item.umur}
                    </span>
                </div>
                <div class="text-[11px] font-semibold text-slate-500">
                    Klp. <span class="text-teal-900 font-black">${item.kelompok}</span> (${item.desa})
                </div>
            </div>
            <div class="flex flex-col items-start sm:items-end gap-1 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-teal-200/50">
                ${badgesHtml}
            </div>
        `;
        listEl.appendChild(card);
    });
}

function filterDisabilitasDetailList() {
    const query = (document.getElementById('disabilitasDetailSearch').value || '').toLowerCase().trim();
    if (!query) {
        renderDisabilitasDetailList(window.activeDisabilitasDataset);
        return;
    }
    const filtered = window.activeDisabilitasDataset.filter(item => {
        const katString = Array.isArray(item.kategori) ? item.kategori.join(' ') : (item.kategori || '');
        return (item.nama || '').toLowerCase().includes(query) || 
               (item.kelompok || '').toLowerCase().includes(query) ||
               (item.desa || '').toLowerCase().includes(query) ||
               katString.toLowerCase().includes(query);
    });
    renderDisabilitasDetailList(filtered);
}

function showStatusDetailModal(categoryName) {
    document.getElementById('statusDetailTitle').textContent = `Rincian Kategori: ${categoryName}`;
    const listData = window.statusJamaahCache && window.statusJamaahCache[categoryName] ? window.statusJamaahCache[categoryName] : [];
    
    window.activeStatusDataset = [...listData];
    window.activeStatusDataset.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));

    const searchInput = document.getElementById('statusDetailSearch');
    if (searchInput) searchInput.value = '';

    renderStatusDetailList(window.activeStatusDataset);
    openModal('statusDetailModal');
}

function renderStatusDetailList(listData) {
    const listEl = document.getElementById('statusDetailList');
    listEl.innerHTML = '';

    if (!listData || listData.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-slate-400 font-semibold text-center py-5">Tidak ada data jamaah pada kategori ini.</p>`;
        return;
    }

    listData.forEach(item => {
        const card = document.createElement('div');
        card.className = "p-3 bg-white border border-indigo-100 rounded-2xl flex items-center justify-between gap-3 animate-fade-in-up hover:shadow-md transition-shadow";
        
        card.innerHTML = `
            <div>
                <div class="font-extrabold text-xs sm:text-sm text-slate-800">${item.nama}</div>
                <div class="text-[11px] font-semibold text-slate-500 mt-0.5">
                    Kelompok: <span class="text-indigo-700 font-bold">${item.kelompok}</span> (${item.desa})
                </div>
            </div>
            <div class="shrink-0 text-right">
                <span class="text-[10px] font-extrabold text-fuchsia-600 bg-fuchsia-50 border border-fuchsia-200 px-2 py-1 rounded-lg inline-block">
                    ${item.umur}
                </span>
            </div>
        `;
        listEl.appendChild(card);
    });
}

function filterStatusDetailList() {
    const query = (document.getElementById('statusDetailSearch').value || '').toLowerCase().trim();
    if (!query) {
        renderStatusDetailList(window.activeStatusDataset);
        return;
    }
    const filtered = window.activeStatusDataset.filter(item => {
        return (item.nama || '').toLowerCase().includes(query) || (item.kelompok || '').toLowerCase().includes(query);
    });
    renderStatusDetailList(filtered);
}

function showKelompokDetailModal(kelompokNama) {
    document.getElementById('kelompokDetailTitle').textContent = `Kelompok: ${kelompokNama}`;

    // Panggil fungsi getUniqueMembers untuk menyaring data ganda/mirip secara otomatis
    // (Fungsi ini otomatis menggabungkan jamaah & generus serta membuang data duplikat)
    const uniqueMembers = getUniqueMembers(
        globalCache.jamaah || [],
        globalCache.generus || [],
        null, // Tidak batasi desa, cukup kelompoknya saja
        kelompokNama
    );

    let combined = uniqueMembers.map(m => ({
        nama: m.nama,
        status: m.status || 'Jamaah'
    }));

    // Urutkan berdasarkan abjad nama
    combined.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
    window.activeKelompokDataset = combined;

    const searchInput = document.getElementById('kelompokDetailSearch');
    if (searchInput) searchInput.value = '';

    renderKelompokDetailList(window.activeKelompokDataset);
    openModal('kelompokDetailModal', false);
}

function renderKelompokDetailList(listData) {
    const listEl = document.getElementById('kelompokDetailList');
    listEl.innerHTML = '';

    if (!listData || listData.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-slate-400 font-semibold text-center py-5">Belum ada jamaah terdaftar di kelompok ini.</p>`;
        return;
    }

    listData.forEach(item => {
        const card = document.createElement('div');
        card.className = "p-3 bg-white border border-indigo-100 rounded-2xl flex items-center justify-between gap-3 animate-fade-in-up hover:shadow-md transition-shadow";

        card.innerHTML = `
            <div>
                <div class="font-extrabold text-xs sm:text-sm text-slate-800">${item.nama}</div>
            </div>
            <div class="shrink-0 text-right">
                <span class="text-[10px] font-extrabold border px-2.5 py-1 rounded-lg inline-block bg-indigo-50 text-indigo-700 border-indigo-200">
                    ${item.status}
                </span>
            </div>
        `;
        listEl.appendChild(card);
    });
}

function fetchAutoJamaahList(desa, kelompok) {
    const listContainer = document.getElementById('autoJamaahListContainer');
    const searchNamaInput = document.getElementById('searchNamaJamaah');

    if (searchNamaInput) searchNamaInput.value = '';

    if (!desa || !kelompok) {
        listContainer.classList.add('hidden');
        if (currentMode === 'UPDATE') {
            document.getElementById('formJamaah').classList.add('hidden');
        }
        return;
    }

    const filteredData = globalCache.jamaah.filter(j => j.desa === desa && j.kelompok === kelompok);
    filteredData.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));

    window.currentGroupJamaahData = filteredData;
    renderJamaahListItems(window.currentGroupJamaahData);
}

function renderJamaahListItems(filteredData) {
    const listContainer = document.getElementById('autoJamaahListContainer');
    const listEl = document.getElementById('autoJamaahList');

    listContainer.classList.remove('hidden');

    if (filteredData.length === 0) {
        listEl.innerHTML = `<div class="text-xs text-slate-500 bg-slate-50/80 p-4 rounded-xl text-center border border-slate-200/60 font-medium">Jamaah tidak ditemukan.</div>`;
        return;
    }

    listEl.innerHTML = '';
    
    filteredData.forEach((j) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = "w-full text-left p-3 sm:p-4 rounded-xl border border-indigo-100 hover:border-indigo-400 bg-white hover:bg-indigo-50/50 transition-all duration-300 flex justify-between items-center group cursor-pointer animate-fade-in-up hover:shadow-md";
        
        const noHpText = j.no_hp ? ` | WA: <span class="text-blue-600 font-extrabold">${j.no_hp}</span>` : '';
        const disText = j.is_disabilitas ? ` | <span class="text-teal-600 font-bold">♿ Disabilitas</span>` : '';

        btn.innerHTML = `
            <div class="flex items-center gap-3 sm:gap-4">
                <div>
                    <div class="font-bold text-xs sm:text-sm text-slate-800 group-hover:text-indigo-700 transition-colors">${j.nama}</div>
                    <div class="text-[10px] text-slate-500 mt-0.5">
                        Status: <span class="font-bold ${j.status === 'Operator' ? 'text-blue-600' : 'text-slate-600'}">${j.status || '-'}</span>${noHpText}${disText}
                    </div>
                </div>
            </div>
            <span class="text-[10px] sm:text-[11px] font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-lg border border-indigo-200 shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                Edit &raquo;
            </span>
        `;
        
        btn.onclick = () => selectJamaahToForm(j);
        listEl.appendChild(btn);
    });
}

function filterJamaahByNama() {
    const query = (document.getElementById('searchNamaJamaah').value || '').toLowerCase().trim();
    if (!query) {
        renderJamaahListItems(window.currentGroupJamaahData);
        return;
    }
    const filtered = window.currentGroupJamaahData.filter(j => (j.nama || '').toLowerCase().includes(query));
    renderJamaahListItems(filtered);
}

function filterKelompokDetailList() {
    const query = (document.getElementById('kelompokDetailSearch').value || '').toLowerCase().trim();
    if (!query) {
        renderKelompokDetailList(window.activeKelompokDataset);
        return;
    }
    const filtered = window.activeKelompokDataset.filter(item => {
        return (item.nama || '').toLowerCase().includes(query) || (item.status || '').toLowerCase().includes(query);
    });
    renderKelompokDetailList(filtered);
}

async function showAllOperatorsModal() {
    document.getElementById('opModalTitle').textContent = "Kontak Operator Semua Kelompok";
    
    showDataLoading("Memuat daftar kontak operator...");
    
    try {
        // Ambil data langsung dari Supabase agar Operator bisa melihat data dari kelompok lain
        const { data, error } = await supabaseUtama
            .from('data_jamaah')
            .select('nama, no_hp, desa, kelompok')
            .eq('status', 'Operator');
            
        if (error) throw error;
        
        window.activeOperatorDataset = data || [];
        
        // Urutkan berdasarkan Desa -> Kelompok -> Nama
        window.activeOperatorDataset.sort((a, b) => {
            if (a.desa !== b.desa) return (a.desa || '').localeCompare(b.desa || '');
            if (a.kelompok !== b.kelompok) return (a.kelompok || '').localeCompare(b.kelompok || '');
            return (a.nama || '').localeCompare(b.nama || '');
        });

        const searchInput = document.getElementById('opSearchInput');
        if (searchInput) searchInput.value = '';

        const iconBox = document.getElementById('opModalIconBox');
        const opCard = document.getElementById('operatorDetailModalCard');
        const theme = getCurrentTheme();

        iconBox.className = `w-14 h-14 ${theme.iconBgModal} rounded-3xl flex items-center justify-center mx-auto text-2xl font-bold shadow-inner`;
        opCard.style.borderColor = theme.borderColorModal;

        renderOperatorModalList(window.activeOperatorDataset);
        openModal('operatorDetailModal');
    } catch (err) {
        showCustomModal("Gagal", "Gagal memuat kontak operator: " + err.message, "❌");
    } finally {
        hideDataLoading();
    }
}

function renderOperatorModalList(listData) {
    const listEl = document.getElementById('opModalList');
    listEl.innerHTML = '';

    if (!listData || listData.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-slate-400 font-semibold text-center py-5">Tidak ada data operator ditemukan.</p>`;
        return;
    }

    listData.forEach(op => {
        const item = document.createElement('div');
        item.className = "p-3 sm:p-4 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-100 rounded-2xl flex items-center justify-between gap-3 animate-fade-in-up hover:shadow-md transition-shadow";

        const cleanHp = (op.no_hp || '').replace(/[^0-9]/g, '');
        const waLink = cleanHp.startsWith('0') ? `62${cleanHp.slice(1)}` : cleanHp;

        item.innerHTML = `
            <div>
                <div class="font-extrabold text-sm text-slate-800">${op.nama}</div>
                <div class="text-[11px] font-bold text-slate-500 mt-1">
                    Klp. <span class="text-indigo-800 font-black">${op.kelompok || '-'}</span> (${op.desa || '-'})
                </div>
                <div class="text-[11px] sm:text-xs font-black text-blue-600 mt-1">${op.no_hp || 'No HP belum diisi'}</div>
            </div>
            ${op.no_hp ? `
                <a href="https://wa.me/${waLink}" target="_blank" class="px-3 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:scale-95 text-white font-extrabold text-[11px] sm:text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 shrink-0">
                    💬 WA
                </a>
            ` : `
                <span class="text-[10px] text-slate-400 italic font-semibold shrink-0">No HP kosong</span>
            `}
        `;
        listEl.appendChild(item);
    });
}

function filterOperatorList() {
    const query = (document.getElementById('opSearchInput').value || '').toLowerCase().trim();
    
    if (!query) {
        renderOperatorModalList(window.activeOperatorDataset);
        return;
    }

    const filtered = window.activeOperatorDataset.filter(op => {
        const namaMatch = (op.nama || '').toLowerCase().includes(query);
        const kelompokMatch = (op.kelompok || '').toLowerCase().includes(query);
        const desaMatch = (op.desa || '').toLowerCase().includes(query);
        const hpMatch = (op.no_hp || '').toLowerCase().includes(query);

        return namaMatch || kelompokMatch || desaMatch || hpMatch;
    });

    renderOperatorModalList(filtered);
}

function getUniqueMembers(jamaahList, generusList, targetDesa = null, targetKelompok = null) {
    const memberMap = new Map();
    const dobMap = new Map();

    const filterDesa = targetDesa ? targetDesa.trim().toLowerCase() : null;
    const filterKlp = targetKelompok ? targetKelompok.trim().toLowerCase() : null;

    const calculateAgeFromDate = (dateString) => {
        if (!dateString) return null;
        const cleanStr = String(dateString).replace(/[^0-9]/g, '');
        if (cleanStr.length !== 8) return null;
        
        let y, m, d;
        if (String(dateString).includes('-') && String(dateString).indexOf('-') === 4) {
            y = parseInt(cleanStr.substring(0, 4), 10);
            m = parseInt(cleanStr.substring(4, 6), 10);
            d = parseInt(cleanStr.substring(6, 8), 10);
        } else {
            d = parseInt(cleanStr.substring(0, 2), 10);
            m = parseInt(cleanStr.substring(2, 4), 10);
            y = parseInt(cleanStr.substring(4, 8), 10);
        }
        
        const birthDate = new Date(y, m - 1, d);
        const today = new Date();
        if (isNaN(birthDate.getTime())) return null;
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
        return age >= 0 ? age : null;
    };

    const normalizeDateStr = (dateStr) => {
        if (!dateStr) return '';
        const digits = String(dateStr).replace(/[^0-9]/g, '');
        if (digits.length !== 8) return String(dateStr).trim();
        
        if (String(dateStr).includes('-') && String(dateStr).indexOf('-') === 4) {
            return digits; // YYYYMMDD
        }
        const d = digits.substring(0, 2);
        const m = digits.substring(2, 4);
        const y = digits.substring(4, 8);
        return `${y}${m}${d}`;
    };

    const isSimilarName = (name1, name2) => {
        const n1 = name1.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        const n2 = name2.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        
        if (n1 === n2) return true;
        
        const words1 = n1.split(/\s+/);
        const words2 = n2.split(/\s+/);
        
        if (words1.length >= 2 && words2.length >= 2) {
            if (words1[0] === words2[0] && words1[1] === words2[1]) {
                if (words1[2] && words2[2]) {
                    if (words1[2].startsWith(words2[2]) || words2[2].startsWith(words1[2])) {
                        return true;
                    }
                } else {
                    return true;
                }
            }
        }
        return false;
    };

    jamaahList.forEach(j => {
        if (filterDesa && (j.desa || '').trim().toLowerCase() !== filterDesa) return;
        if (filterKlp && (j.kelompok || '').trim().toLowerCase() !== filterKlp) return;

        const cleanName = (j.nama || '').trim();
        const cleanDesa = (j.desa || '').trim().toLowerCase();
        const cleanKlp = (j.kelompok || '').trim().toLowerCase();
        const normDob = normalizeDateStr(j.tanggal_lahir || j.tgl_lahir);

        const nameKey = `${cleanName.toLowerCase()}__${cleanDesa}__${cleanKlp}`;
        const dobKey = normDob ? `${normDob}__${cleanDesa}__${cleanKlp}` : null;

        let calcAge = j.umur;
        if ((calcAge === null || calcAge === undefined || calcAge === '') && (j.tanggal_lahir || j.tgl_lahir)) {
            calcAge = calculateAgeFromDate(j.tanggal_lahir || j.tgl_lahir);
        }

        const memberObj = {
            id: j.id,
            nama: j.nama,
            desa: j.desa,
            kelompok: j.kelompok,
            status: j.status || 'Menikah',
            jenis_kelamin: (j.jenis_kelamin || '-').toUpperCase(),
            umur: (calcAge !== null && calcAge !== undefined && calcAge !== '') ? `${calcAge} thn` : '-',
            is_disabilitas: !!j.is_disabilitas,
            kategori_disabilitas: j.kategori_disabilitas,
            tipe: 'DEWASA',
            sumber: 'data_jamaah'
        };

        memberMap.set(nameKey, memberObj);
        if (dobKey) {
            dobMap.set(dobKey, memberObj);
        }
    });

    generusList.forEach(g => {
        if (filterDesa && (g.desa || '').trim().toLowerCase() !== filterDesa) return;
        if (filterKlp && (g.kelompok || '').trim().toLowerCase() !== filterKlp) return;

        const cleanName = (g.nama || '').trim();
        const cleanDesa = (g.desa || '').trim().toLowerCase();
        const cleanKlp = (g.kelompok || '').trim().toLowerCase();
        const normDob = normalizeDateStr(g.tanggal_lahir || g.tgl_lahir);

        const dobKey = normDob ? `${normDob}__${cleanDesa}__${cleanKlp}` : null;

        if (dobKey && dobMap.has(dobKey)) {
            return; 
        }

        let isDuplicateByName = false;
        for (let [existingKey, existingMember] of memberMap.entries()) {
            if (existingMember.desa.toLowerCase() === cleanDesa && existingMember.kelompok.toLowerCase() === cleanKlp) {
                if (isSimilarName(existingMember.nama, cleanName)) {
                    isDuplicateByName = true;
                    break;
                }
            }
        }

        if (isDuplicateByName) {
            return; 
        }

        let rawKat = g.kategori_usia || 'Generus';
        let parsedKey = parseKategoriGenerus(rawKat);
        let labelKat = rawKat;

        if (parsedKey === 'balita') labelKat = 'BALITA';
		else if (parsedKey === 'paud') labelKat = 'PAUD';
        else if (parsedKey === 'tk') labelKat = 'TK';
        else if (parsedKey === 'caberawit') labelKat = 'Caberawit';
        else if (parsedKey === 'praRemaja') labelKat = 'Pra Remaja';
        else if (parsedKey === 'remaja') labelKat = 'Remaja';
        else if (parsedKey === 'usiaMandiri') labelKat = 'Usia Mandiri';

        let valUmur = g.umur ?? g.usia ?? null;
        if ((valUmur === null || valUmur === undefined || valUmur === '') && (g.tanggal_lahir || g.tgl_lahir)) {
            valUmur = calculateAgeFromDate(g.tanggal_lahir || g.tgl_lahir);
        }

        const nameKey = `${cleanName.toLowerCase()}__${cleanDesa}__${cleanKlp}`;
        memberMap.set(nameKey, {
            id: g.id,
            nama: g.nama,
            desa: g.desa,
            kelompok: g.kelompok,
            status: labelKat,
            jenis_kelamin: (g.jenis_kelamin || g.jk || '-').toUpperCase(),
            umur: (valUmur !== null && valUmur !== undefined && valUmur !== '') ? `${valUmur} thn` : '-',
            is_disabilitas: !!g.is_disabilitas,
            kategori_disabilitas: g.kategori_disabilitas,
            tipe: 'GENERUS',
            sumber: 'data_generus'
        });
    });

    return Array.from(memberMap.values());
}

window.lastDeveloperRekapExport = null;

function loadRekapKelompokLengkap() {
    const tbody = document.getElementById('tbodyRekapKelompok');
    const tfoot = document.getElementById('tfootRekapKelompok');
    const thead = document.querySelector('#tableRekapKelompok thead');
    const tableEl = document.getElementById('tableRekapKelompok');
    const filterContainer = document.getElementById('filterDesaRekap')?.parentElement;
    const titleEl = document.getElementById('judulRekapKelompok');
    const infoHeaderDev = document.getElementById('infoHeaderLaporanDev');
    const rekapBawahDev = document.getElementById('rekapBawahDeveloper');
    const theadBawah = document.getElementById('theadRekapBawahDev');
    const tbodyBawah = document.getElementById('tbodyRekapBawahDev');

    const jamaahData = globalCache.jamaah || [];
    const generusData = globalCache.generus || [];
    const sarprasData = globalCache.sarpras || [];
    const absensiData = globalCache.absensi || [];

    // -------------------------------------------------------------
    // MODE 1: TAMPILAN OPERATOR (DAFTAR NAMA ANGGOTA KELOMPOK)
    // -------------------------------------------------------------
    if (currentUser.role === 'OPERATOR') {
        window.lastDeveloperRekapExport = null;
        if (tableEl) tableEl.classList.remove('dev-rekap-table');
        if (infoHeaderDev) infoHeaderDev.classList.add('hidden');
        if (rekapBawahDev) rekapBawahDev.classList.add('hidden');
        if (titleEl) titleEl.textContent = `DAFTAR JAMAAH & GENERUS KELOMPOK ${currentUser.kelompok.toUpperCase()}`;
        if (filterContainer) filterContainer.style.display = 'none';

        if (tableEl) {
            tableEl.className = "w-full text-[10px] sm:text-[11px] text-left border-collapse border border-slate-300";
        }

        thead.innerHTML = `
            <tr>
                <th class="px-1 py-2 text-center w-[6%] text-[10px] sm:text-[11px] border border-indigo-200 bg-indigo-100/80 text-indigo-950 font-extrabold">No</th>
                <th class="px-1.5 py-2 text-left text-[10px] sm:text-[11px] w-[30%] border border-indigo-200 bg-indigo-100/80 text-indigo-950 font-extrabold">Nama Lengkap</th>
                <th class="px-1.5 py-2 text-center text-[10px] sm:text-[11px] w-[24%] border border-indigo-200 bg-indigo-100/80 text-indigo-950 font-extrabold">Status</th>
                <th class="px-1.5 py-2 text-center text-[10px] sm:text-[11px] w-[8%] border border-indigo-200 bg-indigo-100/80 text-indigo-950 font-extrabold">JK</th>
                <th class="px-1.5 py-2 text-center text-[10px] sm:text-[11px] w-[16%] border border-indigo-200 bg-indigo-100/80 text-indigo-950 font-extrabold">Umur</th>
                <th class="px-1.5 py-2 text-center text-[10px] sm:text-[11px] w-[16%] border border-indigo-200 bg-indigo-100/80 text-indigo-950 font-extrabold">Dis.</th>
            </tr>
        `;

        const listMembers = getUniqueMembers(jamaahData, generusData, currentUser.desa, currentUser.kelompok);

        if (listMembers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400 font-semibold text-xs border border-slate-200">Belum ada data jamaah/generus di kelompok ini.</td></tr>';
            tfoot.innerHTML = '';
            return;
        }

        listMembers.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));

        let countL = 0, countP = 0;
        let catCounts = {
            'Menikah': 0, 'Duda': 0, 'Janda': 0, 'Manula': 0, 'Operator': 0,
            'BALITA': 0, 'PAUD': 0, 'TK': 0, 'Caberawit': 0, 'Pra Remaja': 0, 'Remaja': 0, 'Usia Mandiri': 0
        };

        tbody.innerHTML = '';
        listMembers.forEach((item, index) => {
            if (item.jenis_kelamin === 'L') countL++;
            else if (item.jenis_kelamin === 'P') countP++;

            if (catCounts.hasOwnProperty(item.status)) {
                catCounts[item.status]++;
            }

            const tr = document.createElement('tr');
            tr.className = "hover:bg-indigo-50/50 transition-colors border-b border-indigo-50/60";

            const badgeClass = item.tipe === 'GENERUS'
                ? 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200'
                : 'bg-indigo-50 text-indigo-800 border-indigo-200';

            tr.innerHTML = `
                <td class="px-1 py-2 text-center font-bold text-slate-500 text-[11px] border border-slate-200">${index + 1}</td>
                <td class="px-1.5 py-2 font-extrabold text-slate-800 text-left text-[11px] leading-snug break-words border border-slate-200">${item.nama}</td>
                <td class="px-1.5 py-2 text-center border border-slate-200">
                    <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border inline-block ${badgeClass}">
                        ${item.status}
                    </span>
                </td>
                <td class="px-1.5 py-2 text-center font-bold text-slate-700 text-[11px] border border-slate-200">${item.jenis_kelamin}</td>
                <td class="px-1.5 py-2 text-center font-bold text-slate-600 text-[10px] border border-slate-200">${item.umur}</td>
                <td class="px-1.5 py-2 text-center border border-slate-200">
                    ${item.is_disabilitas ? '<span class="text-teal-600 font-extrabold text-[10px]">♿ Ya</span>' : '<span class="text-slate-300 text-[10px]">-</span>'}
                </td>
            `;
            tbody.appendChild(tr);
        });

        const summaryChips = [];
        Object.keys(catCounts).forEach(k => {
            if (catCounts[k] > 0) {
                summaryChips.push(`
                    <div class="bg-white/90 border border-indigo-100 px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs shrink-0">
                        <span class="text-[9px] font-bold text-slate-500">${k}:</span>
                        <span class="text-[10px] font-black text-indigo-700">${catCounts[k]}</span>
                    </div>
                `);
            }
        });

        tfoot.innerHTML = `
            <tr>
                <td class="px-1 py-2.5 text-center font-black uppercase bg-indigo-200/95 text-[10px] border border-indigo-300">TOT</td>
                <td colspan="5" class="p-2.5 bg-gradient-to-r from-indigo-100/90 via-fuchsia-50/90 to-indigo-100/90 border border-indigo-300">
                    <div class="space-y-2">
                        <div class="flex flex-wrap items-center justify-start gap-6 border-b border-indigo-200/60 pb-1.5">
                            <div class="flex items-center gap-1.5">
                                <span class="text-[10px] font-black text-indigo-900 uppercase">Total:</span>
                                <span class="text-xs font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-fuchsia-600 bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                                    ${listMembers.length} Orang
                                </span>
                            </div>
                            <div class="flex items-center gap-1 text-[10px] font-bold text-slate-700">
                                <span class="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">👨 L: ${countL}</span>
                                <span class="bg-pink-50 text-pink-700 px-1.5 py-0.5 rounded border border-pink-200">👩 P: ${countP}</span>
                            </div>
                        </div>

                        <div>
                            <span class="block text-[9px] font-extrabold uppercase text-indigo-900 mb-1">Rincian Kategori:</span>
                            <div class="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                                ${summaryChips.join('')}
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    // -------------------------------------------------------------
    // MODE 2: TAMPILAN DEVELOPER (FORMAT LAPORAN PENEROBOSAN UMUM)
    // -------------------------------------------------------------
    if (tableEl) tableEl.classList.add('dev-rekap-table');
    if (titleEl) titleEl.textContent = "LAPORAN PENEROBOSAN UMUM";
    if (filterContainer) filterContainer.style.display = 'flex';
    if (infoHeaderDev) infoHeaderDev.classList.remove('hidden');
    if (rekapBawahDev) rekapBawahDev.classList.remove('hidden');

    const selectedFilterDesa = document.getElementById('filterDesaRekap').value;
    const now = new Date();
    const bulanNama = now.toLocaleDateString('id-ID', { month: 'long' }).toUpperCase();
    const tahunKomplit = String(now.getFullYear());

    if (document.getElementById('devInfoDesa')) {
        document.getElementById('devInfoDesa').textContent = selectedFilterDesa ? selectedFilterDesa.toUpperCase() : "SEMUA DESA";
    }
    if (document.getElementById('devInfoBulan')) {
        document.getElementById('devInfoBulan').textContent = bulanNama;
    }
    if (document.getElementById('devInfoTahun')) {
        document.getElementById('devInfoTahun').textContent = tahunKomplit;
    }

    thead.innerHTML = `
        <tr>
            <th rowspan="3" class="px-2 py-2 text-center align-middle bg-indigo-100 text-indigo-950 font-extrabold">NO</th>
            <th rowspan="3" class="px-2.5 py-2 text-left align-middle sticky-col bg-indigo-100 text-indigo-950 font-extrabold">KELOMPOK</th>
            <th colspan="21" class="px-2 py-2 text-center bg-indigo-100 text-indigo-950 font-extrabold">JUMLAH JAMAAH</th>
            <th colspan="3" class="px-2 py-2 text-center bg-indigo-100 text-indigo-950 font-extrabold">JANDA</th>
            <th rowspan="3" class="px-1.5 py-2 text-center align-middle bg-indigo-100 text-indigo-950 font-extrabold">DUDA</th>
            <th rowspan="3" class="px-1.5 py-2 text-center align-middle bg-indigo-100 text-indigo-950 font-extrabold">MANULA</th>
            <th rowspan="3" class="px-1.5 py-2 text-center align-middle bg-indigo-100 text-indigo-950 font-extrabold">SUB</th>
            <th rowspan="3" class="px-1.5 py-2 text-center align-middle bg-indigo-100 text-indigo-950 font-extrabold">KK</th>
            <th colspan="3" class="px-2 py-2 text-center bg-indigo-100 text-indigo-950 font-extrabold">JML PENGURUS</th>
            <th rowspan="3" class="px-2.5 py-2 text-center align-middle bg-indigo-100 text-indigo-950 font-extrabold">PERSENAN</th>
        </tr>
        <tr>
            <th colspan="3" class="px-1.5 py-1.5 text-center bg-indigo-100/90 text-indigo-950">BALITA</th>
            <th colspan="3" class="px-1.5 py-1.5 text-center bg-indigo-100/90 text-indigo-950">CBR / PAUD - SD</th>
            <th colspan="3" class="px-1.5 py-1.5 text-center bg-indigo-100/90 text-indigo-950">PRA REMAJA</th>
            <th colspan="3" class="px-1.5 py-1.5 text-center bg-indigo-100/90 text-indigo-950">REMAJA</th>
            <th colspan="3" class="px-1.5 py-1.5 text-center bg-indigo-100/90 text-indigo-950">USIA MANDIRI</th>
            <th colspan="3" class="px-1.5 py-1.5 text-center bg-indigo-100/90 text-indigo-950">DEWASA</th>
            <th colspan="3" class="px-1.5 py-1.5 text-center bg-indigo-200/90 text-indigo-950">TOTAL JAMAAH</th>

            <th rowspan="2" class="px-1.5 py-1.5 text-center align-middle bg-indigo-100/90 text-indigo-950">JML</th>
            <th colspan="2" class="px-1.5 py-1 text-center bg-indigo-100/90 text-indigo-950">SIAP DIWAYUH</th>

            <th rowspan="2" class="px-1.5 py-1.5 text-center align-middle bg-indigo-100/90 text-indigo-950">4 S</th>
            <th rowspan="2" class="px-1.5 py-1.5 text-center align-middle bg-indigo-100/90 text-indigo-950">LAIN</th>
            <th rowspan="2" class="px-1.5 py-1.5 text-center align-middle bg-indigo-100/90 text-indigo-950">JML</th>
        </tr>
        <tr>
            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">L</th>
            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">P</th>
            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">J</th>

            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">L</th>
            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">P</th>
            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">J</th>

            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">L</th>
            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">P</th>
            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">J</th>

            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">L</th>
            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">P</th>
            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">J</th>

            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">L</th>
            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">P</th>
            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">J</th>

            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">L</th>
            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">P</th>
            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">J</th>

            <th class="px-1 py-1 text-center bg-indigo-100 text-indigo-950">L</th>
            <th class="px-1 py-1 text-center bg-indigo-100 text-indigo-950">P</th>
            <th class="px-1 py-1 text-center bg-indigo-100 text-indigo-950">J</th>

            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">BTN</th>
            <th class="px-1 py-1 text-center bg-indigo-50 text-indigo-950">TR-AN</th>
        </tr>
    `;

    const rowsData = [];
    let noUrut = 1;

    Object.keys(dataWilayah).forEach(desa => {
        if (selectedFilterDesa && selectedFilterDesa !== desa) return;

        dataWilayah[desa].forEach(kelompok => {
            const members = getUniqueMembers(jamaahData, generusData, desa, kelompok);
            const sarp = sarprasData.find(s =>
                (s.desa || '').trim().toLowerCase() === desa.toLowerCase() &&
                (s.kelompok || '').trim().toLowerCase() === kelompok.toLowerCase()
            ) || {};

            const grp = {
                balita: { L: 0, P: 0 },
                cbrPaudSd: { L: 0, P: 0 },
                praRemaja: { L: 0, P: 0 },
                remaja: { L: 0, P: 0 },
                usiaMandiri: { L: 0, P: 0 },
                dewasa: { L: 0, P: 0 },
                jandaJml: 0,
                siapBtn: 0,
                siapTran: 0,
                dudaJml: 0,
                manulaJml: 0,
                sub: parseInt(sarp.jumlah_sub_kelompok, 10) || 0,
                kk: 0,
                pengurus4S: 0,
                pengurusLain: 0,
                masjid: parseInt(sarp.jumlah_masjid, 10) || 0,
                jedingL: parseInt(sarp.km_pria, 10) || 0,
                jedingP: parseInt(sarp.km_wanita, 10) || 0,
                aula: parseInt(sarp.jumlah_aula, 10) || 0,
                madrasah: 0,
                pondok: 0,
                sekolah: 0
            };

            members.forEach(m => {
                const jk = (m.jenis_kelamin || '').toUpperCase() === 'P' ? 'P' : 'L';
                const st = (m.status || '').toLowerCase().trim();

                if (m.tipe === 'GENERUS') {
                    const keyGen = parseKategoriGenerus(m.status);
                    if (keyGen === 'balita') {
                        grp.balita[jk]++;
                    } else if (keyGen === 'paud' || keyGen === 'tk' || keyGen === 'caberawit') {
                        grp.cbrPaudSd[jk]++;
                    } else if (keyGen === 'praRemaja') {
                        grp.praRemaja[jk]++;
                    } else if (keyGen === 'remaja') {
                        grp.remaja[jk]++;
                    } else if (keyGen === 'usiaMandiri') {
                        grp.usiaMandiri[jk]++;
                    }
                } else {
                    if (['menikah', 'manula', 'duda', 'janda'].includes(st)) {
                        grp.dewasa[jk]++;
                    }
                    if (st === 'janda') grp.jandaJml++;
                    if (st === 'duda') grp.dudaJml++;
                    if (st === 'manula') grp.manulaJml++;
                }
            });

            const jBalita = grp.balita.L + grp.balita.P;
            const jCbr = grp.cbrPaudSd.L + grp.cbrPaudSd.P;
            const jPra = grp.praRemaja.L + grp.praRemaja.P;
            const jRem = grp.remaja.L + grp.remaja.P;
            const jUsman = grp.usiaMandiri.L + grp.usiaMandiri.P;
            const jDewasa = grp.dewasa.L + grp.dewasa.P;

            const totL = grp.balita.L + grp.cbrPaudSd.L + grp.praRemaja.L + grp.remaja.L + grp.usiaMandiri.L + grp.dewasa.L;
            const totP = grp.balita.P + grp.cbrPaudSd.P + grp.praRemaja.P + grp.remaja.P + grp.usiaMandiri.P + grp.dewasa.P;
            const totJ = totL + totP;
            const pengurusJml = grp.pengurus4S + grp.pengurusLain;

            rowsData.push({
                no: noUrut++,
                desa,
                kelompokRaw: kelompok,
                kelompok: kelompok.toUpperCase(),
                ...grp,
                jBalita, jCbr, jPra, jRem, jUsman, jDewasa,
                totL, totP, totJ, pengurusJml
            });
        });
    });

    tbody.innerHTML = '';
    rowsData.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-indigo-50/50 transition-colors";
        tr.innerHTML = `
            <td class="px-1.5 py-2 text-center font-bold text-slate-600">${r.no}</td>
            <td class="px-2 py-2 font-extrabold text-indigo-900 hover:text-indigo-600 hover:underline cursor-pointer sticky-col" onclick="showKelompokDetailModal('${r.kelompokRaw}')" title="Klik untuk lihat anggota ${r.kelompok}">${r.kelompok}</td>

            <td class="px-1 py-2 text-center">${r.balita.L}</td>
            <td class="px-1 py-2 text-center">${r.balita.P}</td>
            <td class="px-1 py-2 text-center font-bold">${r.jBalita}</td>

            <td class="px-1 py-2 text-center">${r.cbrPaudSd.L}</td>
            <td class="px-1 py-2 text-center">${r.cbrPaudSd.P}</td>
            <td class="px-1 py-2 text-center font-bold">${r.jCbr}</td>

            <td class="px-1 py-2 text-center">${r.praRemaja.L}</td>
            <td class="px-1 py-2 text-center">${r.praRemaja.P}</td>
            <td class="px-1 py-2 text-center font-bold">${r.jPra}</td>

            <td class="px-1 py-2 text-center">${r.remaja.L}</td>
            <td class="px-1 py-2 text-center">${r.remaja.P}</td>
            <td class="px-1 py-2 text-center font-bold">${r.jRem}</td>

            <td class="px-1 py-2 text-center">${r.usiaMandiri.L}</td>
            <td class="px-1 py-2 text-center">${r.usiaMandiri.P}</td>
            <td class="px-1 py-2 text-center font-bold">${r.jUsman}</td>

            <td class="px-1 py-2 text-center">${r.dewasa.L}</td>
            <td class="px-1 py-2 text-center">${r.dewasa.P}</td>
            <td class="px-1 py-2 text-center font-bold">${r.jDewasa}</td>

            <td class="px-1 py-2 text-center font-black bg-indigo-50/70">${r.totL}</td>
            <td class="px-1 py-2 text-center font-black bg-indigo-50/70">${r.totP}</td>
            <td class="px-1 py-2 text-center font-black bg-indigo-100/70">${r.totJ}</td>

            <td class="px-1 py-2 text-center font-bold">${r.jandaJml}</td>
            <td class="px-1 py-2 text-center">${r.siapBtn || ''}</td>
            <td class="px-1 py-2 text-center">${r.siapTran || ''}</td>

            <td class="px-1 py-2 text-center font-bold">${r.dudaJml}</td>
            <td class="px-1 py-2 text-center font-bold">${r.manulaJml}</td>

            <td class="px-1 py-2 text-center">${r.sub || ''}</td>
            <td class="px-1 py-2 text-center font-bold">${r.kk}</td>

            <td class="px-1 py-2 text-center">${r.pengurus4S}</td>
            <td class="px-1 py-2 text-center">${r.pengurusLain || ''}</td>
            <td class="px-1 py-2 text-center font-bold">${r.pengurusJml}</td>

            <td class="px-2 py-2 text-center"></td>
        `;
        tbody.appendChild(tr);
    });

    const sum = rowsData.reduce((acc, r) => {
        acc.balitaL += r.balita.L; acc.balitaP += r.balita.P; acc.jBalita += r.jBalita;
        acc.cbrL += r.cbrPaudSd.L; acc.cbrP += r.cbrPaudSd.P; acc.jCbr += r.jCbr;
        acc.praL += r.praRemaja.L; acc.praP += r.praRemaja.P; acc.jPra += r.jPra;
        acc.remL += r.remaja.L; acc.remP += r.remaja.P; acc.jRem += r.jRem;
        acc.usmanL += r.usiaMandiri.L; acc.usmanP += r.usiaMandiri.P; acc.jUsman += r.jUsman;
        acc.dewasaL += r.dewasa.L; acc.dewasaP += r.dewasa.P; acc.jDewasa += r.jDewasa;
        acc.totL += r.totL; acc.totP += r.totP; acc.totJ += r.totJ;
        acc.jandaJml += r.jandaJml; acc.siapBtn += r.siapBtn; acc.siapTran += r.siapTran;
        acc.dudaJml += r.dudaJml; acc.manulaJml += r.manulaJml;
        acc.sub += r.sub; acc.kk += r.kk;
        acc.pengurus4S += r.pengurus4S; acc.pengurusLain += r.pengurusLain; acc.pengurusJml += r.pengurusJml;
        acc.masjid += r.masjid; acc.jedingL += r.jedingL; acc.jedingP += r.jedingP;
        acc.aula += r.aula; acc.madrasah += r.madrasah; acc.pondok += r.pondok; acc.sekolah += r.sekolah;
        return acc;
    }, {
        balitaL: 0, balitaP: 0, jBalita: 0,
        cbrL: 0, cbrP: 0, jCbr: 0,
        praL: 0, praP: 0, jPra: 0,
        remL: 0, remP: 0, jRem: 0,
        usmanL: 0, usmanP: 0, jUsman: 0,
        dewasaL: 0, dewasaP: 0, jDewasa: 0,
        totL: 0, totP: 0, totJ: 0,
        jandaJml: 0, siapBtn: 0, siapTran: 0,
        dudaJml: 0, manulaJml: 0,
        sub: 0, kk: 0,
        pengurus4S: 0, pengurusLain: 0, pengurusJml: 0,
        masjid: 0, jedingL: 0, jedingP: 0,
        aula: 0, madrasah: 0, pondok: 0, sekolah: 0
    });

    tfoot.innerHTML = `
        <tr>
            <td colspan="2" class="px-2.5 py-3 text-left font-black uppercase sticky-col bg-indigo-200/95">JUMLAH</td>
            <td class="px-1 py-3 text-center">${sum.balitaL}</td>
            <td class="px-1 py-3 text-center">${sum.balitaP}</td>
            <td class="px-1 py-3 text-center">${sum.jBalita}</td>

            <td class="px-1 py-3 text-center">${sum.cbrL}</td>
            <td class="px-1 py-3 text-center">${sum.cbrP}</td>
            <td class="px-1 py-3 text-center">${sum.jCbr}</td>

            <td class="px-1 py-3 text-center">${sum.praL}</td>
            <td class="px-1 py-3 text-center">${sum.praP}</td>
            <td class="px-1 py-3 text-center">${sum.jPra}</td>

            <td class="px-1 py-3 text-center">${sum.remL}</td>
            <td class="px-1 py-3 text-center">${sum.remP}</td>
            <td class="px-1 py-3 text-center">${sum.jRem}</td>

            <td class="px-1 py-3 text-center">${sum.usmanL}</td>
            <td class="px-1 py-3 text-center">${sum.usmanP}</td>
            <td class="px-1 py-3 text-center">${sum.jUsman}</td>

            <td class="px-1 py-3 text-center">${sum.dewasaL}</td>
            <td class="px-1 py-3 text-center">${sum.dewasaP}</td>
            <td class="px-1 py-3 text-center">${sum.jDewasa}</td>

            <td class="px-1 py-3 text-center">${sum.totL}</td>
            <td class="px-1 py-3 text-center">${sum.totP}</td>
            <td class="px-1 py-3 text-center">${sum.totJ}</td>

            <td class="px-1 py-3 text-center">${sum.jandaJml}</td>
            <td class="px-1 py-3 text-center">${sum.siapBtn || ''}</td>
            <td class="px-1 py-3 text-center">${sum.siapTran || ''}</td>

            <td class="px-1 py-3 text-center">${sum.dudaJml}</td>
            <td class="px-1 py-3 text-center">${sum.manulaJml}</td>

            <td class="px-1 py-3 text-center">${sum.sub}</td>
            <td class="px-1 py-3 text-center">${sum.kk}</td>

            <td class="px-1 py-3 text-center">${sum.pengurus4S}</td>
            <td class="px-1 py-3 text-center">${sum.pengurusLain}</td>
            <td class="px-1 py-3 text-center">${sum.pengurusJml}</td>

            <td class="px-2 py-3 text-center"></td>
        </tr>
    `;

    const wakilDesaCount = selectedFilterDesa ? 1 : Object.keys(dataWilayah).length;
    const kelompokCount = rowsData.length;

    const pengajianBulanIni = absensiData.filter(a => {
        if (!a.tanggal_kegiatan || !a.tanggal_kegiatan.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)) return false;
        if (selectedFilterDesa && a.desa !== selectedFilterDesa) return false;
        return true;
    });

    const countPengajian = (keywordList) => {
        const setKeg = new Set();
        pengajianBulanIni.forEach(a => {
            const nama = (a.nama_kegiatan || '').toLowerCase();
            if (keywordList.some(k => nama.includes(k))) {
                setKeg.add(`${a.nama_kegiatan}__${a.tanggal_kegiatan}`);
            }
        });
        return setKeg.size;
    };

    const jmlPengDesa = countPengajian(['desa', 'umum', 'ppg', '30 point', 'khotbah']);
    const jmlPengMuda = countPengajian(['remaja', 'muda']);
    const jmlPengIbu = countPengajian(['ibu-ibu', 'ibu ibu']);
    const jmlPengAgny = countPengajian(['agny']);
    const jmlPengMuswrh = countPengajian(['musyawarah', 'muswrh']);
    const jmlPengOrg = countPengajian(['organisasi']);

    if (theadBawah && tbodyBawah) {
        theadBawah.innerHTML = `
            <tr>
                <th colspan="11" class="px-2 py-1.5 border border-slate-400 bg-indigo-100">JUMLAH</th>
                <th rowspan="2" class="px-2 py-1.5 border border-slate-400 bg-indigo-100 align-middle">MT</th>
                <th rowspan="2" class="px-2 py-1.5 border border-slate-400 bg-indigo-100 align-middle">MS</th>
                <th colspan="6" class="px-2 py-1.5 border border-slate-400 bg-indigo-100">JUMLAH PENGAJIAN / BULAN</th>
            </tr>
            <tr>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">WAKIL DESA</th>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">KELOMPOK</th>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">SUB</th>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">KK</th>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">Masjid</th>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">Jeding L</th>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">Jeding P</th>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">Aula</th>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">Madrasah</th>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">Pondok</th>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">Sekolah</th>

                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">Desa</th>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">Muda-di</th>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">Ibu-ibu</th>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">Agny'</th>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">Muswrh</th>
                <th class="px-1.5 py-1 border border-slate-400 bg-indigo-50">Organisasi</th>
            </tr>
        `;

        tbodyBawah.innerHTML = `
            <tr>
                <td class="px-2 py-2 border border-slate-400">${wakilDesaCount}</td>
                <td class="px-2 py-2 border border-slate-400">${kelompokCount}</td>
                <td class="px-2 py-2 border border-slate-400">${sum.sub}</td>
                <td class="px-2 py-2 border border-slate-400">${sum.kk}</td>
                <td class="px-2 py-2 border border-slate-400">${sum.masjid}</td>
                <td class="px-2 py-2 border border-slate-400">${sum.jedingL}</td>
                <td class="px-2 py-2 border border-slate-400">${sum.jedingP}</td>
                <td class="px-2 py-2 border border-slate-400">${sum.aula}</td>
                <td class="px-2 py-2 border border-slate-400">${sum.madrasah}</td>
                <td class="px-2 py-2 border border-slate-400">${sum.pondok}</td>
                <td class="px-2 py-2 border border-slate-400">${sum.sekolah}</td>

                <td class="px-2 py-2 border border-slate-400"></td>
                <td class="px-2 py-2 border border-slate-400"></td>

                <td class="px-2 py-2 border border-slate-400">${jmlPengDesa}</td>
                <td class="px-2 py-2 border border-slate-400">${jmlPengMuda}</td>
                <td class="px-2 py-2 border border-slate-400">${jmlPengIbu}</td>
                <td class="px-2 py-2 border border-slate-400">${jmlPengAgny}</td>
                <td class="px-2 py-2 border border-slate-400">${jmlPengMuswrh}</td>
                <td class="px-2 py-2 border border-slate-400">${jmlPengOrg}</td>
            </tr>
        `;
    }

    window.lastDeveloperRekapExport = {
        desaLabel: selectedFilterDesa ? selectedFilterDesa.toUpperCase() : "SEMUA DESA",
        daerahLabel: "TAWANGMANGU",
        bulanLabel: bulanNama,
        tahunLabel: tahunKomplit,
        rowsData,
        sum,
        bottomSummary: {
            wakilDesaCount,
            kelompokCount,
            jmlPengDesa,
            jmlPengMuda,
            jmlPengIbu,
            jmlPengAgny,
            jmlPengMuswrh,
            jmlPengOrg
        }
    };
}

async function exportTableToExcel(tbodyId, tfootId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody || tbody.rows.length === 0) {
        showCustomModal("Export Gagal", "Tidak ada data untuk diexport ke Excel.", "⚠️");
        return;
    }

    if (currentUser.role === 'DEVELOPER' && window.lastDeveloperRekapExport && typeof ExcelJS !== 'undefined') {
        showDataLoading("Menyusun file Excel...");
        try {
            const exp = window.lastDeveloperRekapExport;
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet("Laporan Penerobosan Umum");

            const thinBorder = {
                top: { style: 'thin', color: { argb: 'FF000000' } },
                left: { style: 'thin', color: { argb: 'FF000000' } },
                bottom: { style: 'thin', color: { argb: 'FF000000' } },
                right: { style: 'thin', color: { argb: 'FF000000' } }
            };

            const headerFill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD9E1F2' }
            };

            const totalFill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFEDF2FA' }
            };

            // Judul Utama (Kolom A s.d. AH = 34 kolom)
            ws.mergeCells('A1:AH1');
            const cTitle1 = ws.getCell('A1');
            cTitle1.value = "LAPORAN PENEROBOSAN UMUM";
            cTitle1.font = { name: 'Calibri', size: 14, bold: true };
            cTitle1.alignment = { horizontal: 'center', vertical: 'middle' };
            ws.getRow(1).height = 24;

            ws.mergeCells('A2:AH2');
            const cTitle2 = ws.getCell('A2');
            cTitle2.value = "JUMLAH JAMAAH , PERSENAN , KEGIATAN DAN KEPENGURUSAN DESA";
            cTitle2.font = { name: 'Calibri', size: 11, bold: true };
            cTitle2.alignment = { horizontal: 'center', vertical: 'middle' };
            ws.getRow(2).height = 20;

            // Blok Identitas DESA / BULAN / TAHUN & DAERAH
            ws.getCell('A4').value = "DESA";
            ws.getCell('A4').font = { bold: true };
            ws.getCell('C4').value = `:  ${exp.desaLabel}`;
            ws.getCell('C4').font = { bold: true };

            ws.getCell('T4').value = "BULAN";
            ws.getCell('T4').font = { bold: true };
            ws.getCell('V4').value = `:   ${exp.bulanLabel}`;
            ws.getCell('V4').font = { bold: true };

            ws.getCell('AE4').value = "TAHUN";
            ws.getCell('AE4').font = { bold: true };
            ws.getCell('AG4').value = `:  ${exp.tahunLabel}`;
            ws.getCell('AG4').font = { bold: true };

            ws.getCell('A5').value = "DAERAH";
            ws.getCell('A5').font = { bold: true };
            ws.getCell('C5').value = `:  ${exp.daerahLabel}`;
            ws.getCell('C5').font = { bold: true };

            // Header Tabel Utama (Baris 7, 8, 9)
            const r7 = ws.getRow(7);
            const r8 = ws.getRow(8);
            const r9 = ws.getRow(9);
            r7.height = 22;
            r8.height = 20;
            r9.height = 20;

            ws.mergeCells('A7:A9');
            ws.getCell('A7').value = "NO";

            ws.mergeCells('B7:B9');
            ws.getCell('B7').value = "KELOMPOK";

            ws.mergeCells('C7:W7');
            ws.getCell('C7').value = "JUMLAH JAMAAH";

            ws.mergeCells('X7:Z7');
            ws.getCell('X7').value = "JANDA";

            ws.mergeCells('AA7:AA9');
            ws.getCell('AA7').value = "DUDA";

            ws.mergeCells('AB7:AB9');
            ws.getCell('AB7').value = "MANULA";

            ws.mergeCells('AC7:AC9');
            ws.getCell('AC7').value = "SUB";

            ws.mergeCells('AD7:AD9');
            ws.getCell('AD7').value = "KK";

            ws.mergeCells('AE7:AG7');
            ws.getCell('AE7').value = "JML PENGURUS";

            ws.mergeCells('AH7:AH9');
            ws.getCell('AH7').value = "PERSENAN";

            const subGroups = [
                { start: 3, label: "BALITA" },
                { start: 6, label: "CBR / PAUD - SD" },
                { start: 9, label: "PRA REMAJA" },
                { start: 12, label: "REMAJA" },
                { start: 15, label: "USIA MANDIRI" },
                { start: 18, label: "DEWASA" },
                { start: 21, label: "TOTAL JAMAAH" }
            ];

            subGroups.forEach(sg => {
                ws.mergeCells(8, sg.start, 8, sg.start + 2);
                ws.getCell(8, sg.start).value = sg.label;
                ws.getCell(9, sg.start).value = "L";
                ws.getCell(9, sg.start + 1).value = "P";
                ws.getCell(9, sg.start + 2).value = "J";
            });

            ws.mergeCells('X8:X9');
            ws.getCell('X8').value = "JML";

            ws.mergeCells('Y8:Z8');
            ws.getCell('Y8').value = "SIAP DIWAYUH";
            ws.getCell('Y9').value = "BTN";
            ws.getCell('Z9').value = "TR-AN";

            ws.mergeCells('AE8:AE9');
            ws.getCell('AE8').value = "4 S";

            ws.mergeCells('AF8:AF9');
            ws.getCell('AF8').value = "LAIN";

            ws.mergeCells('AG8:AG9');
            ws.getCell('AG8').value = "JML";

            [r7, r8, r9].forEach(row => {
                row.eachCell({ includeEmpty: true }, cell => {
                    cell.fill = headerFill;
                    cell.font = { name: 'Calibri', size: 10, bold: true };
                    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                    cell.border = thinBorder;
                });
            });
            ws.getCell('B7').alignment = { horizontal: 'left', vertical: 'middle' };

            // Isi Baris Data Kelompok
            let currentRow = 10;
            exp.rowsData.forEach(r => {
                const rowVals = [
                    r.no, r.kelompok,
                    r.balita.L, r.balita.P, r.jBalita,
                    r.cbrPaudSd.L, r.cbrPaudSd.P, r.jCbr,
                    r.praRemaja.L, r.praRemaja.P, r.jPra,
                    r.remaja.L, r.remaja.P, r.jRem,
                    r.usiaMandiri.L, r.usiaMandiri.P, r.jUsman,
                    r.dewasa.L, r.dewasa.P, r.jDewasa,
                    r.totL, r.totP, r.totJ,
                    r.jandaJml, r.siapBtn || null, r.siapTran || null,
                    r.dudaJml, r.manulaJml,
                    r.sub || null, r.kk,
                    r.pengurus4S, r.pengurusLain || null, r.pengurusJml,
                    ""
                ];
                const excelRow = ws.getRow(currentRow);
                excelRow.values = rowVals;
                excelRow.height = 19;

                excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    cell.border = thinBorder;
                    cell.font = {
                        name: 'Calibri',
                        size: 10,
                        bold: colNumber === 2 || colNumber === 23 || colNumber === 33
                    };
                    if (colNumber === 2) {
                        cell.alignment = { horizontal: 'left', vertical: 'middle' };
                    } else if (colNumber === 34) {
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    } else {
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    }
                });
                currentRow++;
            });

            // Baris JUMLAH
            const s = exp.sum;
            const totalRowVals = [
                "", "JUMLAH",
                s.balitaL, s.balitaP, s.jBalita,
                s.cbrL, s.cbrP, s.jCbr,
                s.praL, s.praP, s.jPra,
                s.remL, s.remP, s.jRem,
                s.usmanL, s.usmanP, s.jUsman,
                s.dewasaL, s.dewasaP, s.jDewasa,
                s.totL, s.totP, s.totJ,
                s.jandaJml, s.siapBtn || null, s.siapTran || null,
                s.dudaJml, s.manulaJml,
                s.sub, s.kk,
                s.pengurus4S, s.pengurusLain, s.pengurusJml,
                ""
            ];
            const totalRow = ws.getRow(currentRow);
            totalRow.values = totalRowVals;
            totalRow.height = 22;
            totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                cell.fill = totalFill;
                cell.border = thinBorder;
                cell.font = { name: 'Calibri', size: 10, bold: true };
                cell.alignment = { horizontal: colNumber === 2 ? 'left' : 'center', vertical: 'middle' };
            });

            // Tabel Ringkasan Bawah (Baris +2 dari totalRow)
            const bTop = currentRow + 2;
            const bSub = bTop + 1;
            const bVal = bTop + 2;

            ws.getRow(bTop).height = 20;
            ws.getRow(bSub).height = 22;
            ws.getRow(bVal).height = 22;

            // Kolom A..L untuk JUMLAH (12 kolom: A=1 .. L=12)
            ws.mergeCells(bTop, 1, bTop, 12);
            ws.getCell(bTop, 1).value = "JUMLAH";

            // Kolom M (13) = MT, Kolom N (14) = MS
            ws.mergeCells(bTop, 13, bSub, 13);
            ws.getCell(bTop, 13).value = "MT";

            ws.mergeCells(bTop, 14, bSub, 14);
            ws.getCell(bTop, 14).value = "MS";

            // Kolom O..T (15..20) = JUMLAH PENGAJIAN / BULAN (6 kolom)
            ws.mergeCells(bTop, 15, bTop, 20);
            ws.getCell(bTop, 15).value = "JUMLAH PENGAJIAN / BULAN";

            const bottomHeaders = [
                "WAKIL DESA", "KELOMPOK", "SUB", "KK", "Masjid",
                "Jeding L", "Jeding P", "Aula", "Madrasah", "Pondok", "Sekolah", "Jml",
                "", "",
                "Desa", "Muda-di", "Ibu-ibu", "Agny'", "Muswrh", "Organisasi"
            ];

            for (let c = 1; c <= 20; c++) {
                if (c === 13 || c === 14) continue;
                ws.getCell(bSub, c).value = bottomHeaders[c - 1];
            }

            const bs = exp.bottomSummary;
            const bottomValues = [
                bs.wakilDesaCount, bs.kelompokCount, s.sub, s.kk, s.masjid,
                s.jedingL, s.jedingP, s.aula, s.madrasah, s.pondok, s.sekolah,
                s.masjid + s.aula + s.madrasah + s.pondok + s.sekolah,
                "", "",
                bs.jmlPengDesa, bs.jmlPengMuda, bs.jmlPengIbu, bs.jmlPengAgny, bs.jmlPengMuswrh, bs.jmlPengOrg
            ];

            for (let c = 1; c <= 20; c++) {
                ws.getCell(bVal, c).value = bottomValues[c - 1];
            }

            [bTop, bSub].forEach(rIdx => {
                for (let c = 1; c <= 20; c++) {
                    const cell = ws.getCell(rIdx, c);
                    cell.fill = headerFill;
                    cell.font = { name: 'Calibri', size: 10, bold: true };
                    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                    cell.border = thinBorder;
                }
            });

            for (let c = 1; c <= 20; c++) {
                const cell = ws.getCell(bVal, c);
                cell.fill = totalFill;
                cell.font = { name: 'Calibri', size: 10, bold: true };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = thinBorder;
            }

            // Atur lebar kolom agar tidak terpotong saat dibuka di Excel
            const colWidths = [5, 18, 4.5, 4.5, 5, 4.5, 4.5, 5, 4.5, 4.5, 5, 4.5, 4.5, 5, 4.5, 4.5, 5, 4.5, 4.5, 5, 5, 5, 6, 6, 5, 6, 7, 8, 5, 6, 5, 5, 6, 14];
            colWidths.forEach((w, idx) => {
                ws.getColumn(idx + 1).width = w;
            });

            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `Laporan_Penerobosan_Umum_${exp.desaLabel.replace(/\s+/g, '_')}_${exp.tahunLabel}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            showCustomModal("Gagal Export", err.message || "Terjadi kesalahan saat membuat file Excel.", "❌");
        } finally {
            hideDataLoading();
        }
        return;
    }

    let table = document.getElementById('tableRekapKelompok');
    let fileName = `Rekap_Jamaah_Sarpras_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const wb = XLSX.utils.table_to_book(table, { sheet: "Data Jamaah" });
    XLSX.writeFile(wb, fileName);
}

function setupYearFilter() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthStr = String(now.getMonth() + 1).padStart(2, '0');
    const currentDateStr = String(now.getDate()).padStart(2, '0');

    // 1. Dropdown Tanggal
    const selTanggalFilter = document.getElementById('filterTanggalAbsensi');
    if (selTanggalFilter) {
        selTanggalFilter.innerHTML = '<option value="">Semua Tgl</option>';
        for (let i = 1; i <= 31; i++) {
            const val = i < 10 ? `0${i}` : `${i}`;
            selTanggalFilter.add(new Option(val, val));
        }
        // Set default ke Tanggal Hari Ini
        selTanggalFilter.value = currentDateStr; 
    }

    // 2. Dropdown Tahun
    const selTahunFilter = document.getElementById('filterTahun');
    if (selTahunFilter) {
        selTahunFilter.innerHTML = '<option value="">Semua Tahun</option>';
        for (let i = currentYear; i >= currentYear - 3; i--) {
            selTahunFilter.add(new Option(`Tahun ${i}`, i));
        }
        // Set default ke Tahun Sekarang
        selTahunFilter.value = currentYear; 
    }

    // 3. Dropdown Bulan
    const selBulanFilter = document.getElementById('filterBulanAbsensi');
    if (selBulanFilter) {
        // Pilihan 'Semua Bulan' sudah ada di HTML, kita cukup set default value-nya
        // Set default ke Bulan Sekarang
        selBulanFilter.value = currentMonthStr; 
    }
}

function populateKegiatanFilter() {
    const selKegiatan = document.getElementById('filterKegiatanAbsensi');
    if (!selKegiatan) return;

    const currentValue = selKegiatan.value;
    const uniqueKegiatan = [...new Set(globalCache.absensi.map(item => item.nama_kegiatan))].filter(Boolean).sort();
    
    selKegiatan.innerHTML = '<option value="">-- Semua Kegiatan --</option>';
    uniqueKegiatan.forEach(nama => selKegiatan.add(new Option(nama, nama)));
    if (currentValue && uniqueKegiatan.includes(currentValue)) selKegiatan.value = currentValue;
}

function loadRekapAbsensi() {
    const desa = document.getElementById('filterDesaAbsensi')?.value || '';
    const tglAngka = document.getElementById('filterTanggalAbsensi')?.value || '';
    const bulan = document.getElementById('filterBulanAbsensi')?.value || '';
    const tahun = document.getElementById('filterTahun')?.value || '';
    const kegiatan = document.getElementById('filterKegiatanAbsensi')?.value || '';

    const tbody = document.getElementById('tbodyRekapAbsensi');
    const tfoot = document.getElementById('tfootRekapAbsensi');

    let data = [...globalCache.absensi];
    if (kegiatan) data = data.filter(item => item.nama_kegiatan === kegiatan);

    data.sort((a, b) => {
        // Prioritaskan kelompok operator yang sedang login di urutan paling atas
        if (currentUser && currentUser.role === 'OPERATOR') {
            const aIsMyGroup = (a.desa === currentUser.desa && a.kelompok === currentUser.kelompok) ? 1 : 0;
            const bIsMyGroup = (b.desa === currentUser.desa && b.kelompok === currentUser.kelompok) ? 1 : 0;
            if (aIsMyGroup !== bIsMyGroup) {
                return bIsMyGroup - aIsMyGroup;
            }
        }
        
        // Jika bukan grupnya, urutkan berdasarkan tanggal terbaru
        const dateA = String(a.tanggal_kegiatan || '');
        const dateB = String(b.tanggal_kegiatan || '');
        if (dateA !== dateB) {
            return dateB.localeCompare(dateA);
        }
        return String(b.id || '').localeCompare(String(a.id || ''));
    });
   
    const filteredData = data.filter(item => {
        if (desa && item.desa !== desa) return false;
        if (!item.tanggal_kegiatan) return false;

        const parts = item.tanggal_kegiatan.split('-');
        if (parts.length < 3) return false;

        const itemTahun = parts[0];
        const itemBulan = parts[1];
        const itemTgl = parts[2];

        if (tahun && itemTahun !== tahun) return false;
        if (bulan && itemBulan !== bulan) return false;
        if (tglAngka && itemTgl !== tglAngka) return false;

        return true;
    });

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-400 font-medium">Tidak ada data.</td></tr>';
        tfoot.innerHTML = '';
        return;
    }

    tbody.innerHTML = '';
    let totalLaki = 0, totalPerempuan = 0, totalIjin = 0, totalInfaq = 0;
    let totalHadirAll = 0, totalTargetAll = 0;

    filteredData.forEach(item => {
        const jmlL = item.jumlah_laki || 0;
        const jmlP = item.jumlah_perempuan || 0;
        const totalHadir = jmlL + jmlP;

        totalLaki += jmlL;
        totalPerempuan += jmlP;
        totalIjin += (item.jumlah_ijin || 0);
        totalInfaq += (item.infaq || 0);

        let targetJamaah = 0;
        const namaKeg = (item.nama_kegiatan || '').trim().toLowerCase();

        if (namaKeg.includes('ibu-ibu') || namaKeg.includes('ibu ibu')) {
            targetJamaah = globalCache.jamaah.filter(j => {
                if (j.desa !== item.desa || j.kelompok !== item.kelompok) return false;
                const st = (j.status || '').toLowerCase();
                const jk = (j.jenis_kelamin || '').toUpperCase();
                return st === 'janda' || (st === 'menikah' && jk === 'P') || (st === 'manula' && jk === 'P');
            }).length;

        } else if (namaKeg.includes('remaja')) {
            targetJamaah = globalCache.generus.filter(g => {
                if (g.desa !== item.desa || g.kelompok !== item.kelompok) return false;
                const kat = parseKategoriGenerus(g.kategori_usia);
                return ['praRemaja', 'remaja', 'usiaMandiri'].includes(kat);
            }).length;

        } else if (item.target_custom && Array.isArray(item.target_custom) && item.target_custom.length > 0) {
            const listTarget = item.target_custom;

            if (listTarget.includes('semua_jamaah')) {
                const totalDewasaAll = globalCache.jamaah.filter(j => j.desa === item.desa && j.kelompok === item.kelompok).length;
                const totalGenerusAll = globalCache.generus.filter(g => g.desa === item.desa && g.kelompok === item.kelompok).length;
                targetJamaah = totalDewasaAll + totalGenerusAll;
            } else {
                const totalDewasa = globalCache.jamaah.filter(j => {
                    if (j.desa !== item.desa || j.kelompok !== item.kelompok) return false;
                    const st = (j.status || '').toLowerCase();
                    const jk = (j.jenis_kelamin || '').toUpperCase();

                    if (listTarget.includes('ibu_ibu') && (st === 'janda' || (st === 'menikah' && jk === 'P') || (st === 'manula' && jk === 'P'))) return true;
                    if (listTarget.includes('bapak_bapak') && (st === 'duda' || (st === 'menikah' && jk === 'L') || (st === 'manula' && jk === 'L'))) return true;
                    if (listTarget.includes('duda_janda') && (st === 'duda' || st === 'janda')) return true;
                    if (listTarget.includes('manula') && st === 'manula') return true;
                    return false;
                }).length;

                const totalGenerusMatch = globalCache.generus.filter(g => {
                    if (g.desa !== item.desa || g.kelompok !== item.kelompok) return false;
                    const kat = parseKategoriGenerus(g.kategori_usia);

                    if (listTarget.includes('muda_mudi') && ['praRemaja', 'remaja', 'usiaMandiri'].includes(kat)) return true;
                    if (listTarget.includes('caberawit') && ['balita', 'paud', 'tk', 'caberawit'].includes(kat)) return true;
                    return false;
                }).length;

                targetJamaah = totalDewasa + totalGenerusMatch;
            }

        } else {
            const totalDewasaAll = globalCache.jamaah.filter(j => j.desa === item.desa && j.kelompok === item.kelompok).length;
            const totalGenerusAll = globalCache.generus.filter(g => g.desa === item.desa && g.kelompok === item.kelompok).length;
            targetJamaah = totalDewasaAll + totalGenerusAll;
        }

        let persentase = 0;
        if (targetJamaah > 0) {
            persentase = Math.min(100, Math.round((totalHadir / targetJamaah) * 100));
        }

        totalHadirAll += totalHadir;
        totalTargetAll += targetJamaah;

        let badgeColor = "bg-rose-100 text-rose-800 border-rose-200";
        if (persentase >= 85) badgeColor = "bg-emerald-100 text-emerald-800 border-emerald-200";
        else if (persentase >= 65) badgeColor = "bg-amber-100 text-amber-800 border-amber-200";

        let tglFormatted = '-';
        if (item.tanggal_kegiatan) {
            const p = item.tanggal_kegiatan.split('-');
            if (p.length === 3) tglFormatted = `${p[2]}/${p[1]}/${p[0]}`;
        }

        // --- TAMBAHKAN KODE INI UNTUK MENGAMANKAN TOMBOL EDIT ---
        let btnEditHtml = '';
        // Tombol edit hanya muncul jika yang login adalah Developer ATAU Operator grup tersebut
        if (currentUser.role === 'DEVELOPER' || (currentUser.role === 'OPERATOR' && item.desa === currentUser.desa && item.kelompok === currentUser.kelompok)) {
            btnEditHtml = `<button onclick="editAbsensi('${item.id}')" class="px-3 py-1.5 bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-200 rounded-lg font-extrabold text-[10px] transition-colors shadow-sm">Edit</button>`;
        }
        // --------------------------------------------------------

        const tr = document.createElement('tr');
        tr.className = "hover:bg-fuchsia-50/50 transition-colors";
        tr.innerHTML = `
            <td class="px-2.5 py-3 font-extrabold text-fuchsia-900 whitespace-nowrap sticky-col" title="${item.kelompok}">${item.kelompok}</td>
            <td class="px-2 py-3 text-center whitespace-nowrap font-semibold text-slate-600">${tglFormatted}</td>
            <td class="px-2 py-3 text-center whitespace-nowrap font-bold">${jmlL}L / ${jmlP}P</td>
            <td class="px-2 py-3 text-center whitespace-nowrap">
                <span class="px-2 py-0.5 font-black text-[11px] rounded-md border ${badgeColor}" title="Target Acuan: ${targetJamaah} Orang">
                    ${persentase}%
                </span>
            </td>
            <td class="px-2 py-3 text-center whitespace-nowrap font-bold text-pink-600">${item.jumlah_ijin || 0} Orang</td>
            <td class="px-2 py-3 text-right font-extrabold whitespace-nowrap text-slate-800">Rp${(item.infaq || 0).toLocaleString('id-ID')}</td>
            <td class="px-2 py-3 text-center whitespace-nowrap no-print">${btnEditHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    let persentaseTotal = 0;
    if (totalTargetAll > 0) {
        persentaseTotal = Math.min(100, Math.round((totalHadirAll / totalTargetAll) * 100));
    }

    tfoot.innerHTML = `
        <tr>
            <td class="px-2.5 py-4 text-left font-black uppercase whitespace-nowrap sticky-col bg-fuchsia-200/90">TOTAL</td>
            <td class="px-2 py-4 text-center font-black text-fuchsia-950 whitespace-nowrap">-</td>
            <td class="px-2 py-4 text-center font-black text-fuchsia-950 whitespace-nowrap">${totalLaki}L / ${totalPerempuan}P</td>
            <td class="px-2 py-4 text-center font-black text-fuchsia-950 whitespace-nowrap text-[12px] bg-fuchsia-300/80">${persentaseTotal}%</td>
            <td class="px-2 py-4 text-center font-black text-pink-800 whitespace-nowrap">${totalIjin} Orang</td>
            <td class="px-2 py-4 text-right font-black text-emerald-700 whitespace-nowrap text-[13px]">Rp${totalInfaq.toLocaleString('id-ID')}</td>
            <td class="px-2 py-4 text-center no-print"></td>
        </tr>
    `;
}

function exportTableToExcel(tbodyId, tfootId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody || tbody.rows.length === 0) {
        showCustomModal("Export Gagal", "Tidak ada data untuk diexport ke Excel.", "⚠️");
        return;
    }

    const roleUpper = String(currentUser?.role || '').toUpperCase();

    if (roleUpper === 'DEVELOPER') {
        if (!window.lastDeveloperRekapExport && typeof loadRekapKelompokLengkap === 'function') {
            loadRekapKelompokLengkap();
        }
    }

    if (roleUpper === 'DEVELOPER' && window.lastDeveloperRekapExport && typeof XLSX !== 'undefined') {
        const exp = window.lastDeveloperRekapExport;
        const s = exp.sum;
        const bs = exp.bottomSummary;

        const TOTAL_COLS = 34; // Kolom A (0) s.d. AH (33)
        const makeEmptyRow = () => Array.from({ length: TOTAL_COLS }, () => "");

        const aoa = [];
        const merges = [];

        // Row 0 (Excel 1): Judul Utama
        const rTitle1 = makeEmptyRow();
        rTitle1[0] = "LAPORAN PENEROBOSAN UMUM";
        aoa.push(rTitle1);
        merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 33 } });

        // Row 1 (Excel 2): Subjudul
        const rTitle2 = makeEmptyRow();
        rTitle2[0] = "JUMLAH JAMAAH , PERSENAN , KEGIATAN DAN KEPENGURUSAN DESA";
        aoa.push(rTitle2);
        merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 33 } });

        // Row 2 (Excel 3): Spasi
        aoa.push(makeEmptyRow());

        // Row 3 (Excel 4): DESA | BULAN | TAHUN (di-merge agar teks panjang tidak terpotong)
        const rMeta1 = makeEmptyRow();
        rMeta1[0] = "DESA";
        rMeta1[2] = `:  ${exp.desaLabel}`;
        rMeta1[19] = "BULAN";
        rMeta1[22] = `:  ${exp.bulanLabel}`;
        rMeta1[29] = "TAHUN";
        rMeta1[32] = `:  ${exp.tahunLabel}`;
        aoa.push(rMeta1);
        merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: 1 } });   // A4:B4 = DESA
        merges.push({ s: { r: 3, c: 2 }, e: { r: 3, c: 9 } });   // C4:J4 = : SEMUA DESA
        merges.push({ s: { r: 3, c: 19 }, e: { r: 3, c: 21 } }); // T4:V4 = BULAN
        merges.push({ s: { r: 3, c: 22 }, e: { r: 3, c: 26 } }); // W4:AA4 = : NOVEMBER
        merges.push({ s: { r: 3, c: 29 }, e: { r: 3, c: 31 } }); // AD4:AF4 = TAHUN
        merges.push({ s: { r: 3, c: 32 }, e: { r: 3, c: 33 } }); // AG4:AH4 = : 2026

        // Row 4 (Excel 5): DAERAH
        const rMeta2 = makeEmptyRow();
        rMeta2[0] = "DAERAH";
        rMeta2[2] = `:  ${exp.daerahLabel}`;
        aoa.push(rMeta2);
        merges.push({ s: { r: 4, c: 0 }, e: { r: 4, c: 1 } });   // A5:B5 = DAERAH
        merges.push({ s: { r: 4, c: 2 }, e: { r: 4, c: 9 } });   // C5:J5 = : TAWANGMANGU

        // Row 5 (Excel 6): Spasi
        aoa.push(makeEmptyRow());

        // Row 6, 7, 8 (Excel 7, 8, 9): Header Tabel Utama 3 Tingkat
        const h1 = makeEmptyRow();
        const h2 = makeEmptyRow();
        const h3 = makeEmptyRow();

        h1[0] = "NO";
        merges.push({ s: { r: 6, c: 0 }, e: { r: 8, c: 0 } });

        h1[1] = "KELOMPOK";
        merges.push({ s: { r: 6, c: 1 }, e: { r: 8, c: 1 } });

        h1[2] = "JUMLAH JAMAAH";
        merges.push({ s: { r: 6, c: 2 }, e: { r: 6, c: 22 } });

        h1[23] = "JANDA";
        merges.push({ s: { r: 6, c: 23 }, e: { r: 6, c: 25 } });

        h1[26] = "DUDA";
        merges.push({ s: { r: 6, c: 26 }, e: { r: 8, c: 26 } });

        h1[27] = "MANULA";
        merges.push({ s: { r: 6, c: 27 }, e: { r: 8, c: 27 } });

        h1[28] = "SUB";
        merges.push({ s: { r: 6, c: 28 }, e: { r: 8, c: 28 } });

        h1[29] = "KK";
        merges.push({ s: { r: 6, c: 29 }, e: { r: 8, c: 29 } });

        h1[30] = "JML PENGURUS";
        merges.push({ s: { r: 6, c: 30 }, e: { r: 6, c: 32 } });

        h1[33] = "PERSENAN";
        merges.push({ s: { r: 6, c: 33 }, e: { r: 8, c: 33 } });

        const ageGroups = [
            { startCol: 2, label: "BALITA" },
            { startCol: 5, label: "CBR / PAUD - SD" },
            { startCol: 8, label: "PRA REMAJA" },
            { startCol: 11, label: "REMAJA" },
            { startCol: 14, label: "USIA MANDIRI" },
            { startCol: 17, label: "DEWASA" },
            { startCol: 20, label: "TOTAL JAMAAH" }
        ];

        ageGroups.forEach(g => {
            h2[g.startCol] = g.label;
            merges.push({ s: { r: 7, c: g.startCol }, e: { r: 7, c: g.startCol + 2 } });
            h3[g.startCol] = "L";
            h3[g.startCol + 1] = "P";
            h3[g.startCol + 2] = "J";
        });

        h2[23] = "JML";
        merges.push({ s: { r: 7, c: 23 }, e: { r: 8, c: 23 } });

        h2[24] = "SIAP DIWAYUH";
        merges.push({ s: { r: 7, c: 24 }, e: { r: 7, c: 25 } });
        h3[24] = "BTN";
        h3[25] = "TR-AN";

        h2[30] = "4 S";
        merges.push({ s: { r: 7, c: 30 }, e: { r: 8, c: 30 } });

        h2[31] = "LAIN";
        merges.push({ s: { r: 7, c: 31 }, e: { r: 8, c: 31 } });

        h2[32] = "JML";
        merges.push({ s: { r: 7, c: 32 }, e: { r: 8, c: 32 } });

        aoa.push(h1, h2, h3);

        // Data Kelompok (mulai Row 9 / Excel 10)
        const dataStartRow = aoa.length;
        exp.rowsData.forEach(r => {
            const row = makeEmptyRow();
            row[0] = r.no;
            row[1] = r.kelompok;

            row[2] = r.balita.L; row[3] = r.balita.P; row[4] = r.jBalita;
            row[5] = r.cbrPaudSd.L; row[6] = r.cbrPaudSd.P; row[7] = r.jCbr;
            row[8] = r.praRemaja.L; row[9] = r.praRemaja.P; row[10] = r.jPra;
            row[11] = r.remaja.L; row[12] = r.remaja.P; row[13] = r.jRem;
            row[14] = r.usiaMandiri.L; row[15] = r.usiaMandiri.P; row[16] = r.jUsman;
            row[17] = r.dewasa.L; row[18] = r.dewasa.P; row[19] = r.jDewasa;
            row[20] = r.totL; row[21] = r.totP; row[22] = r.totJ;

            row[23] = r.jandaJml;
            row[24] = r.siapBtn || "";
            row[25] = r.siapTran || "";
            row[26] = r.dudaJml;
            row[27] = r.manulaJml;
            row[28] = r.sub || "";
            row[29] = r.kk;
            row[30] = r.pengurus4S;
            row[31] = r.pengurusLain || "";
            row[32] = r.pengurusJml;
            row[33] = "";

            aoa.push(row);
        });
        const dataEndRow = aoa.length - 1;

        // Baris JUMLAH Utama
        const totalRowIdx = aoa.length;
        const rSum = makeEmptyRow();
        rSum[1] = "JUMLAH";
        rSum[2] = s.balitaL; rSum[3] = s.balitaP; rSum[4] = s.jBalita;
        rSum[5] = s.cbrL; rSum[6] = s.cbrP; rSum[7] = s.jCbr;
        rSum[8] = s.praL; rSum[9] = s.praP; rSum[10] = s.jPra;
        rSum[11] = s.remL; rSum[12] = s.remP; rSum[13] = s.jRem;
        rSum[14] = s.usmanL; rSum[15] = s.usmanP; rSum[16] = s.jUsman;
        rSum[17] = s.dewasaL; rSum[18] = s.dewasaP; rSum[19] = s.jDewasa;
        rSum[20] = s.totL; rSum[21] = s.totP; rSum[22] = s.totJ;
        rSum[23] = s.jandaJml;
        rSum[24] = s.siapBtn || "";
        rSum[25] = s.siapTran || "";
        rSum[26] = s.dudaJml;
        rSum[27] = s.manulaJml;
        rSum[28] = s.sub;
        rSum[29] = s.kk;
        rSum[30] = s.pengurus4S;
        rSum[31] = s.pengurusLain;
        rSum[32] = s.pengurusJml;
        rSum[33] = "";
        aoa.push(rSum);

        // 2 Baris Kosong sebelum Tabel Bawah
        aoa.push(makeEmptyRow(), makeEmptyRow());

        // Tabel Ringkasan Bawah (Kolom 0..19 => A..T)
        const bTopIdx = aoa.length;
        const bSubIdx = bTopIdx + 1;
        const bValIdx = bTopIdx + 2;

        const bTop = makeEmptyRow();
        const bSub = makeEmptyRow();
        const bVal = makeEmptyRow();

        bTop[0] = "JUMLAH";
        merges.push({ s: { r: bTopIdx, c: 0 }, e: { r: bTopIdx, c: 11 } });

        bTop[12] = "MT";
        merges.push({ s: { r: bTopIdx, c: 12 }, e: { r: bSubIdx, c: 12 } });

        bTop[13] = "MS";
        merges.push({ s: { r: bTopIdx, c: 13 }, e: { r: bSubIdx, c: 13 } });

        bTop[14] = "JUMLAH PENGAJIAN / BULAN";
        merges.push({ s: { r: bTopIdx, c: 14 }, e: { r: bTopIdx, c: 19 } });

        const subLabelsBawah = [
            "WAKIL DESA", "KELOMPOK", "SUB", "KK", "Masjid",
            "Jeding L", "Jeding P", "Aula", "Madrasah", "Pondok", "Sekolah", "Jml"
        ];
        subLabelsBawah.forEach((lbl, idx) => { bSub[idx] = lbl; });

        const pengajianLabelsBawah = ["Desa", "Muda-di", "Ibu-ibu", "Agny'", "Muswrh", "Organisasi"];
        pengajianLabelsBawah.forEach((lbl, idx) => { bSub[14 + idx] = lbl; });

        const valsBawah = [
            bs.wakilDesaCount, bs.kelompokCount, s.sub, s.kk, s.masjid,
            s.jedingL, s.jedingP, s.aula, s.madrasah, s.pondok, s.sekolah,
            s.masjid + s.aula + s.madrasah + s.pondok + s.sekolah
        ];
        valsBawah.forEach((val, idx) => { bVal[idx] = val; });

        const valsPengajian = [
            bs.jmlPengDesa, bs.jmlPengMuda, bs.jmlPengIbu,
            bs.jmlPengAgny, bs.jmlPengMuswrh, bs.jmlPengOrg
        ];
        valsPengajian.forEach((val, idx) => { bVal[14 + idx] = val; });

        aoa.push(bTop, bSub, bVal);

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!merges'] = merges;

        // Definisi Gaya (Border, Alignment, Font, Warna Fill)
        const borderThin = {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } }
        };

        const fillHeader = { patternType: "solid", fgColor: { rgb: "D9E1F2" } };
        const fillTotalHighlight = { patternType: "solid", fgColor: { rgb: "E9EDF4" } };
        const fillFooter = { patternType: "solid", fgColor: { rgb: "D9E1F2" } };

        const setCellStyle = (r, c, style) => {
            const addr = XLSX.utils.encode_cell({ r, c });
            if (!ws[addr]) ws[addr] = { t: "s", v: "" };
            ws[addr].s = style;
        };

        // Style Judul Utama & Subjudul
        for (let c = 0; c < TOTAL_COLS; c++) {
            setCellStyle(0, c, {
                font: { name: "Calibri", sz: 14, bold: true, color: { rgb: "000000" } },
                alignment: { horizontal: "center", vertical: "center" }
            });
            setCellStyle(1, c, {
                font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "000000" } },
                alignment: { horizontal: "center", vertical: "center" }
            });
        }

        // Style Identitas DESA / BULAN / TAHUN / DAERAH
        [3, 4].forEach(r => {
            for (let c = 0; c < TOTAL_COLS; c++) {
                setCellStyle(r, c, {
                    font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "000000" } },
                    alignment: { horizontal: "left", vertical: "center" }
                });
            }
        });

        // Style Header Tabel Utama (Row 6, 7, 8)
        for (let r = 6; r <= 8; r++) {
            for (let c = 0; c < TOTAL_COLS; c++) {
                setCellStyle(r, c, {
                    font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "000000" } },
                    fill: fillHeader,
                    border: borderThin,
                    alignment: {
                        horizontal: (r === 6 && c === 1) ? "left" : "center",
                        vertical: "center",
                        wrapText: true
                    }
                });
            }
        }

        // Style Baris Data Kelompok
        const highlightCols = new Set([4, 7, 10, 13, 16, 19, 20, 21, 22, 23, 26, 27, 29, 32]);
        for (let r = dataStartRow; r <= dataEndRow; r++) {
            for (let c = 0; c < TOTAL_COLS; c++) {
                const isTotalJamaahCol = (c === 20 || c === 21 || c === 22);
                setCellStyle(r, c, {
                    font: {
                        name: "Calibri",
                        sz: 10,
                        bold: c === 1 || highlightCols.has(c),
                        color: { rgb: "000000" }
                    },
                    fill: isTotalJamaahCol ? fillTotalHighlight : undefined,
                    border: borderThin,
                    alignment: {
                        horizontal: c === 1 ? "left" : "center",
                        vertical: "center"
                    }
                });
            }
        }

        // Style Baris JUMLAH Utama
        for (let c = 0; c < TOTAL_COLS; c++) {
            setCellStyle(totalRowIdx, c, {
                font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "000000" } },
                fill: fillFooter,
                border: borderThin,
                alignment: {
                    horizontal: c === 1 ? "left" : "center",
                    vertical: "center"
                }
            });
        }

        // Style Tabel Ringkasan Bawah (bTopIdx, bSubIdx, bValIdx, Kolom 0..19)
        [bTopIdx, bSubIdx].forEach(r => {
            for (let c = 0; c < 20; c++) {
                setCellStyle(r, c, {
                    font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "000000" } },
                    fill: fillHeader,
                    border: borderThin,
                    alignment: { horizontal: "center", vertical: "center", wrapText: true }
                });
            }
        });

        for (let c = 0; c < 20; c++) {
            setCellStyle(bValIdx, c, {
                font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "000000" } },
                fill: fillFooter,
                border: borderThin,
                alignment: { horizontal: "center", vertical: "center" }
            });
        }

        // Atur Tinggi Baris agar rapi & tidak dempet
        ws['!rows'] = [];
        ws['!rows'][0] = { hpt: 24 };
        ws['!rows'][1] = { hpt: 20 };
        ws['!rows'][3] = { hpt: 19 };
        ws['!rows'][4] = { hpt: 19 };
        ws['!rows'][6] = { hpt: 22 };
        ws['!rows'][7] = { hpt: 20 };
        ws['!rows'][8] = { hpt: 20 };
        for (let r = dataStartRow; r <= dataEndRow; r++) {
            ws['!rows'][r] = { hpt: 19 };
        }
        ws['!rows'][totalRowIdx] = { hpt: 22 };
        ws['!rows'][bTopIdx] = { hpt: 20 };
        ws['!rows'][bSubIdx] = { hpt: 24 };
        ws['!rows'][bValIdx] = { hpt: 22 };

        // Atur Lebar Kolom agar presisi tanpa perlu geser manual
        ws['!cols'] = [
            { wch: 5.5 },  // A: NO
            { wch: 24 },   // B: KELOMPOK
            { wch: 5.5 }, { wch: 5.5 }, { wch: 6 },   // C-E: BALITA (L, P, J)
            { wch: 5.5 }, { wch: 5.5 }, { wch: 6 },   // F-H: CBR / PAUD - SD (L, P, J)
            { wch: 5.5 }, { wch: 5.5 }, { wch: 6 },   // I-K: PRA REMAJA (L, P, J)
            { wch: 5.5 }, { wch: 5.5 }, { wch: 6 },   // L-N: REMAJA (L, P, J)
            { wch: 5.5 }, { wch: 5.5 }, { wch: 6 },   // O-Q: USIA MANDIRI (L, P, J)
            { wch: 5.5 }, { wch: 5.5 }, { wch: 6.5 }, // R-T: DEWASA (L, P, J)
            { wch: 6 },   { wch: 6 },   { wch: 7 },   // U-W: TOTAL JAMAAH (L, P, J)
            { wch: 6.5 }, { wch: 6 },   { wch: 7 },   // X-Z: JANDA (JML, BTN, TR-AN)
            { wch: 7 },   { wch: 8.5 },               // AA-AB: DUDA, MANULA
            { wch: 6 },   { wch: 6 },                 // AC-AD: SUB, KK
            { wch: 5.5 }, { wch: 6 },   { wch: 6.5 }, // AE-AG: JML PENGURUS (4 S, LAIN, JML)
            { wch: 15 }                               // AH: PERSENAN
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Laporan Penerobosan Umum");
        const safeDesa = exp.desaLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
        XLSX.writeFile(wb, `Laporan_Penerobosan_Umum_${safeDesa}_${exp.tahunLabel}.xlsx`);
        return;
    }

    let table = document.getElementById('tableRekapKelompok');
    let fileName = `Rekap_Jamaah_Sarpras_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const wb = XLSX.utils.table_to_book(table, { sheet: "Data Jamaah" });
    XLSX.writeFile(wb, fileName);
}

function printData(elementId, documentTitle = 'Laporan Sistem Informasi') {
    let targetContentEl;

    if (elementId === 'printableRekapContent') {
        if (activeRekapSubTab === 'STATUS_KESELURUHAN') {
            targetContentEl = document.getElementById('sectionStatusKeseluruhan');
        } else if (activeRekapSubTab === 'REKAP_KELOMPOK' || activeRekapSubTab === 'REKAP_SARPRAS') {
            targetContentEl = document.getElementById('sectionRekapKelompok');
        }
    } else {
        targetContentEl = document.getElementById(elementId);
    }

    if (!targetContentEl) return;

    const today = new Date();
    const dateStr = today.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const clonedContent = targetContentEl.cloneNode(true);

    clonedContent.classList.remove('hidden');
    clonedContent.querySelectorAll('.hidden').forEach(el => el.classList.remove('hidden'));
    clonedContent.querySelectorAll('.no-print, button, select, input, svg').forEach(el => el.remove());

    clonedContent.querySelectorAll('.col-aksi').forEach(el => el.remove());
    clonedContent.querySelectorAll('tr').forEach(tr => {
        const cells = Array.from(tr.children);
        cells.forEach(cell => {
            if (cell.classList.contains('no-print') || cell.classList.contains('col-aksi') || cell.querySelector('button')) {
                cell.remove();
            }
        });
    });

    clonedContent.querySelectorAll('.table-vertical-scroll, table').forEach(el => {
        el.style.transform = 'none';
        el.style.overflow = 'visible';
        el.style.maxHeight = 'none';
    });

    let orientation = 'portrait';
    if (activeSectionId === 'rekap' && activeRekapSubTab === 'REKAP_KELOMPOK' && currentUser.role === 'DEVELOPER') {
        orientation = 'landscape';
    }

    const printHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${documentTitle}</title>
            <style>
                @page {
                    size: A4 ${orientation};
                    margin: 10mm 10mm 10mm 10mm;
                }
                body {
                    font-family: Arial, Helvetica, sans-serif;
                    color: #111111;
                    background: #ffffff;
                    margin: 0;
                    padding: 0;
                    font-size: 12pt !important;
                }
                svg, img {
                    display: none !important;
                }
                .word-header {
                    text-align: center;
                    border-bottom: 2px solid #000000;
                    padding-bottom: 6px;
                    margin-bottom: 12px;
                }
                .word-header h1 {
                    font-size: 14pt;
                    font-weight: bold;
                    margin: 0 0 2px 0;
                    text-transform: uppercase;
                }
                .word-header p {
                    font-size: 10pt;
                    margin: 2px 0;
                    color: #333333;
                }
                h4 {
                    font-size: 11pt;
                    font-weight: bold;
                    margin: 10px 0 4px 0;
                    text-transform: uppercase;
                    color: #000000;
                    page-break-after: avoid;
                }

                table {
                    width: 100% !important;
                    border-collapse: collapse !important;
                    margin-top: 6px !important;
                    margin-bottom: 12px !important;
                    font-size: 10pt !important;
                    page-break-inside: auto !important;
                }
                
                tfoot {
                    display: table-row-group !important;
                    page-break-inside: avoid !important;
                }
                
                tr {
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                }
                
                th, td {
                    border: 1px solid #000000 !important;
                    padding: 5px 6px !important;
                    text-align: center !important;
                    vertical-align: middle !important;
                    word-wrap: break-word !important;
                }
                
                /* KOLOM NAMA LENGKAP RATA KIRI */
                td:nth-child(2), th:nth-child(2),
                td.text-left, th.text-left {
                    text-align: left !important;
                }

                th {
                    background-color: #f0f0f0 !important;
                    font-weight: bold !important;
                    text-transform: uppercase !important;
                }
                
                /* RAPKAN BARIS TOTAL (TFOOT) */
                tfoot td {
                    background-color: #fcfcfc !important;
                    font-weight: normal !important;
                    text-align: left !important;
                    padding: 8px 10px !important;
                }

                /* RAPIKAN TAMPILAN ELEMEN DI DALAM TOTAL */
                tfoot div, tfoot span, tfoot p {
                    box-sizing: border-box !important;
                }

                tfoot .space-y-2 {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 6px !important;
                }

                tfoot .flex {
                    display: flex !important;
                    align-items: center !important;
                }

                tfoot .flex-wrap {
                    flex-wrap: wrap !important;
                }

                tfoot .gap-6 {
                    gap: 16px !important;
                }

                tfoot .gap-1 {
                    gap: 6px !important;
                }

                tfoot .border-b {
                    border-bottom: 1px solid #cccccc !important;
                    padding-bottom: 6px !important;
                }

                /* STYLING RINGKASAN CHIPS KATEGORI DI BARIS TOTAL */
                tfoot .bg-white\/90, tfoot .bg-white {
                    background-color: #f0f4f8 !important;
                    border: 1px solid #b0c4de !important;
                    border-radius: 4px !important;
                    padding: 3px 8px !important;
                    margin-right: 4px !important;
                    margin-bottom: 4px !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    font-size: 9pt !important;
                }

                tfoot .text-indigo-700, tfoot .font-black {
                    font-weight: bold !important;
                    color: #000000 !important;
                }
            </style>
        </head>
        <body>
            <div class="word-header">
                <h1>INSAN QUR'ANY TAWANGMANGU</h1>
                <p><strong>${documentTitle}</strong></p>
                <p style="font-size: 9pt; color: #555555;">Dicetak pada: ${dateStr} WIB</p>
            </div>

            ${clonedContent.innerHTML}
        </body>
        </html>
    `;

    const oldIframe = document.getElementById('printIframeHidden');
    if (oldIframe) oldIframe.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'printIframeHidden';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';

    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(printHTML);
    iframeDoc.close();

    iframe.onload = function() {
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        }, 200);
    };
}

let activeSelectTarget = null;
let touchStartY = 0;
let touchStartX = 0;
let isSwiping = false;

document.addEventListener('mousedown', interceptSelectMouseDown, { capture: true });
document.addEventListener('touchstart', interceptSelectTouchStart, { capture: true, passive: true });
document.addEventListener('touchmove', interceptSelectTouchMove, { capture: true, passive: true });
document.addEventListener('touchend', interceptSelectTouchEnd, { capture: true });

function interceptSelectMouseDown(e) {
    const select = e.target.closest('select');
    if (!select || select.disabled) return;

    e.preventDefault();
    e.stopPropagation();

    activeSelectTarget = select;
    openCenterPicker(select);
}

function interceptSelectTouchStart(e) {
    const select = e.target.closest('select');
    if (!select || select.disabled) return;

    isSwiping = false;
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
}

function interceptSelectTouchMove(e) {
    if (!touchStartY) return;

    const diffY = Math.abs(e.touches[0].clientY - touchStartY);
    const diffX = Math.abs(e.touches[0].clientX - touchStartX);

    if (diffY > 6 || diffX > 6) {
        isSwiping = true;
    }
}

function interceptSelectTouchEnd(e) {
    const select = e.target.closest('select');
    if (!select || select.disabled) return;

    if (!isSwiping) {
        e.preventDefault();
        e.stopPropagation();
        
        activeSelectTarget = select;
        openCenterPicker(select);
    }
}

function openCenterPicker(selectEl) {
    const modal = document.getElementById('centerPickerModal');
    const titleEl = document.getElementById('centerPickerTitle');
    const optionsEl = document.getElementById('centerPickerOptions');
    const theme = getCurrentTheme();

    let titleText = "Pilih Opsi";
    const labelEl = selectEl.closest('div')?.parentElement?.querySelector('label') || selectEl.closest('div')?.querySelector('label');
    if (labelEl) {
        titleText = labelEl.textContent.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    } else {
        const labelEl = selectEl.closest('div')?.querySelector('label');
        if (labelEl) {
            titleText = labelEl.textContent.replace(/[^a-zA-Z0-9\s]/g, '').trim();
        }
    }

    titleEl.textContent = titleText || "Pilih Opsi";
    titleEl.className = `text-xs font-extrabold uppercase tracking-widest ${theme.pickerTitleClass} truncate max-w-[70%] block`;

    optionsEl.className = "overflow-y-auto space-y-2.5 pr-1 flex-1 py-1";
    optionsEl.innerHTML = '';
    
    const options = Array.from(selectEl.options).filter(opt => opt.value !== "");

    options.forEach((opt) => {
		const isSelected = opt.value === selectEl.value;
		const isMeninggal = opt.value === "Meninggal / Sambung Luar Daerah"; // Cek opsi meninggal
		const item = document.createElement('div');
		
		const baseClass = "picker-option-item p-3.5 sm:p-4 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer flex justify-between items-center transition-all border";
		
		// Tentukan warna berdasarkan kondisi (Selected / Meninggal / Normal)
		let colorStyle = "";
		if (isSelected) {
			colorStyle = "bg-gradient-to-r " + theme.btnGradient + " text-white border-transparent shadow-md transform scale-[1.01]";
		} else if (isMeninggal) {
			// Style khusus tulisan dan background merah untuk opsi Meninggal / Sambung Luar Daerah
			colorStyle = "bg-rose-50/90 border-rose-200 text-rose-600 hover:bg-rose-100 hover:border-rose-300 font-extrabold shadow-xs";
		} else {
			colorStyle = "bg-white/90 border-slate-200/80 text-slate-700 hover:bg-white hover:border-indigo-200 shadow-xs";
		}

		item.className = `${baseClass} ${colorStyle}`;

		item.innerHTML = `
			<span class="truncate pr-2">${opt.text}</span>
			${isSelected ? `
				<svg class="w-4 h-4 sm:w-5 sm:h-5 text-white shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
				</svg>
			` : ''}
		`;

		item.onclick = (e) => {
			e.stopPropagation();
			selectEl.value = opt.value;
			selectEl.dispatchEvent(new Event('change', { bubbles: true }));
			closeCenterPicker();
		};

		optionsEl.appendChild(item);
	});

    const modalContent = modal.firstElementChild;
    modalContent.className = `rounded-[2rem] p-5 sm:p-6 max-w-sm w-full transform transition-all duration-300 max-h-[75vh] flex flex-col ${theme.pickerThemeClass}`;

    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            modalContent.classList.remove('scale-90', 'opacity-0');
            modalContent.classList.add('scale-100', 'opacity-100');
        });
    });

    history.pushState({ pickerOpen: true, section: activeSectionId }, '', '#picker');
}

function closeCenterPicker(backHistory = true) {
    const modal = document.getElementById('centerPickerModal');
    if (!modal || modal.classList.contains('hidden')) return;

    const modalContent = modal.firstElementChild;
    if (modalContent) {
        modalContent.classList.remove('scale-100', 'opacity-100');
        modalContent.classList.add('scale-90', 'opacity-0');
    }
    modal.classList.add('opacity-0');

    setTimeout(() => {
        modal.classList.add('hidden');
        activeSelectTarget = null;
    }, 380);

    if (backHistory && window.history.state && window.history.state.pickerOpen) {
        window.history.back();
    }
}

async function showDuplicateConfirmModal(nama, tempatLahir, tanggalLahir, kelompok, desa) {
    return new Promise((resolve) => {
        const parts = tanggalLahir.split('-');
        const tglFormatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : tanggalLahir;

        showCustomModal(
            "Data Terindikasi Ganda",
            `Jamaah dengan nama "${nama}" (Lahir: ${tempatLahir}, ${tglFormatted}) di kelompok ${kelompok} (${desa}) sudah terdaftar di sistem.\n\nApakah Anda yakin ingin tetap menambahkannya sebagai data baru?`,
            "⚠️",
            () => resolve(true),
            true,
            () => resolve(false)
        );
    });
}

function loadRekapSarprasDeveloper() {
    if (currentUser.role === 'OPERATOR') {
        showCustomModal("Fitur Dalam Pemeliharaan", "Modul Rekap Sarpras belum dapat diakses oleh Operator saat ini.", "🛠️");
        return;
    }

    const tbody = document.getElementById('tbodyRekapKelompok');
    const tfoot = document.getElementById('tfootRekapKelompok');
    const thead = document.querySelector('#tableRekapKelompok thead');
    const filterContainer = document.getElementById('filterDesaRekap')?.parentElement;
    const titleEl = document.querySelector('#sectionRekapKelompok h4');

    const sarprasData = globalCache.sarpras;

    if (titleEl) titleEl.textContent = "Rekapitulasi Sarana Prasarana Per Kelompok";
    if (filterContainer) filterContainer.style.display = 'flex';

    thead.innerHTML = `
        <tr>
            <th class="px-2.5 py-3 sticky-col bg-teal-100 text-teal-950 font-extrabold">Kelompok</th>
            <th class="px-2 py-3 text-center whitespace-nowrap bg-teal-100 text-teal-950">Status Tanah</th>
            <th class="px-2 py-3 text-center whitespace-nowrap bg-teal-100 text-teal-950">Sub Klp</th>
            <th class="px-2 py-3 text-center whitespace-nowrap bg-teal-100 text-teal-950">Masjid</th>
            <th class="px-2 py-3 text-center whitespace-nowrap bg-teal-100 text-teal-950">Aula</th>
            <th class="px-2 py-3 text-center whitespace-nowrap bg-teal-100 text-teal-950">Toilet Pria</th>
            <th class="px-2 py-3 text-center whitespace-nowrap bg-teal-100 text-teal-950">Toilet Wanita</th>
            <th class="px-2 py-3 text-center whitespace-nowrap bg-teal-100 text-teal-950">Kmr MT</th>
            <th class="px-2 py-3 text-center whitespace-nowrap bg-teal-100 text-teal-950">Kmr Tamu</th>
        </tr>
    `;

    const selectedFilterDesa = document.getElementById('filterDesaRekap').value;
    tbody.innerHTML = '';

    let totSub = 0, totMasjid = 0, totAula = 0, totKmPria = 0, totKmWanita = 0, totKmMt = 0, totKmTamu = 0;

    Object.keys(dataWilayah).forEach(desa => {
        if (!selectedFilterDesa || selectedFilterDesa === desa) {
            dataWilayah[desa].forEach(kelompok => {
                const item = sarprasData.find(s => s.desa === desa && s.kelompok === kelompok) || {
                    status_tanah: '-', jumlah_sub_kelompok: 0, jumlah_masjid: 0, jumlah_aula: 0,
                    km_pria: 0, km_wanita: 0, km_mt: 0, km_tamu: 0
                };

                totSub += parseInt(item.jumlah_sub_kelompok, 10) || 0;
                totMasjid += parseInt(item.jumlah_masjid, 10) || 0;
                totAula += parseInt(item.jumlah_aula, 10) || 0;
                totKmPria += parseInt(item.km_pria, 10) || 0;
                totKmWanita += parseInt(item.km_wanita, 10) || 0;
                totKmMt += parseInt(item.km_mt, 10) || 0;
                totKmTamu += parseInt(item.km_tamu, 10) || 0;

                const tr = document.createElement('tr');
                tr.className = "hover:bg-teal-50/50 transition-colors";
                tr.innerHTML = `
                    <td class="px-2.5 py-2.5 font-extrabold text-teal-950 sticky-col">${kelompok}</td>
                    <td class="px-2 py-2.5 text-center font-bold text-slate-700">${item.status_tanah || '-'}</td>
                    <td class="px-2 py-2.5 text-center font-bold text-slate-800">${item.jumlah_sub_kelompok || 0}</td>
                    <td class="px-2 py-2.5 text-center font-bold text-slate-800">${item.jumlah_masjid || 0}</td>
                    <td class="px-2 py-2.5 text-center font-bold text-slate-800">${item.jumlah_aula || 0}</td>
                    <td class="px-2 py-2.5 text-center font-bold text-blue-800">${item.km_pria || 0}</td>
                    <td class="px-2 py-2.5 text-center font-bold text-pink-800">${item.km_wanita || 0}</td>
                    <td class="px-2 py-2.5 text-center font-bold text-indigo-800">${item.km_mt || 0}</td>
                    <td class="px-2 py-2.5 text-center font-bold text-teal-800">${item.km_tamu || 0}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    });

    tfoot.innerHTML = `
        <tr>
            <td class="px-2.5 py-3.5 text-left font-black uppercase sticky-col bg-teal-200/90">TOTAL</td>
            <td class="px-2 py-3.5 text-center font-black">-</td>
            <td class="px-2 py-3.5 text-center font-black text-teal-950">${totSub}</td>
            <td class="px-2 py-3.5 text-center font-black text-teal-950">${totMasjid}</td>
            <td class="px-2 py-3.5 text-center font-black text-teal-950">${totAula}</td>
            <td class="px-2 py-3.5 text-center font-black text-blue-950">${totKmPria}</td>
            <td class="px-2 py-3.5 text-center font-black text-pink-950">${totKmWanita}</td>
            <td class="px-2 py-3.5 text-center font-black text-indigo-950">${totKmMt}</td>
            <td class="px-2 py-3.5 text-center font-black text-teal-950">${totKmTamu}</td>
        </tr>
    `;
}

// Fungsi untuk mengecek absensi berdasarkan Nama Kegiatan dan Bulan saja
function formatTanggalSingkatId(isoDateStr) {
    if (!isoDateStr) return '';
    const parts = String(isoDateStr).split('-');
    if (parts.length !== 3) return isoDateStr;

    const tglNum = parseInt(parts[2], 10);
    const blnIdx = parseInt(parts[1], 10) - 1;
    const thnNum = parts[0];

    const bulanPendek = [
        "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
        "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
    ];

    const namaBln = bulanPendek[blnIdx] || parts[1];
    return `${tglNum} ${namaBln} ${thnNum}`;
}

function prefillAbsensiFromAlert(namaKegiatan = '', tanggalIso = '') {
    // Simpan target prefill sementara agar tidak tertimpa reset saat pindah ke menu absensi
    window._pendingAlertPrefill = {
        namaKegiatan: namaKegiatan || '',
        tanggalIso: tanggalIso || ''
    };

    showSection('absensi');
    switchTabAbsensi('INPUT');
    applyAlertPrefillToForm();
}

function applyAlertPrefillToForm() {
    const pending = window._pendingAlertPrefill;
    if (!pending) return;

    const { namaKegiatan, tanggalIso } = pending;

    // Reset mode edit agar tidak menimpa data lama
    const editIdEl = document.getElementById('edit_absensi_id');
    const editTglEl = document.getElementById('edit_tanggal_kegiatan');
    const absBtnEl = document.getElementById('absBtn');
    if (editIdEl) editIdEl.value = '';
    if (editTglEl) editTglEl.value = '';
    if (absBtnEl) absBtnEl.textContent = 'Simpan Absensi';

    // Set Nama Kegiatan
    if (namaKegiatan) {
        const selectNama = document.getElementById('abs_nama');
        const customInput = document.getElementById('abs_nama_custom');
        const boxTargetCustom = document.getElementById('boxTargetCustom');

        const standardOptions = [
            "Materi PPG Pusat dan 30 Point",
            "Pengajian Ibu-Ibu Daerah",
            "Pengajian Umum Daerah",
            "Pengajian Remaja Daerah",
            "Asrama K. Khotbah"
        ];

        if (selectNama) {
            if (standardOptions.includes(namaKegiatan)) {
                selectNama.value = namaKegiatan;
                if (customInput) {
                    customInput.classList.add('hidden');
                    customInput.value = '';
                }
                if (boxTargetCustom) {
                    boxTargetCustom.classList.add('hidden');
                }
            } else {
                selectNama.value = "LAINNYA";
                if (customInput) {
                    customInput.classList.remove('hidden');
                    customInput.value = namaKegiatan;
                }
                if (boxTargetCustom) {
                    boxTargetCustom.classList.remove('hidden');
                }
            }
        }
    }

    // Set Tanggal Kegiatan (3 dropdown: abs_tgl, abs_bln, abs_thn)
    if (tanggalIso) {
        setAbsensiDateDefault(tanggalIso);
    } else {
        setAbsensiDateDefault();
    }

    // Pastikan desa & kelompok operator terisi / terkunci sesuai aturan role
    if (currentUser && currentUser.role === 'OPERATOR') {
        applyRoleRestrictionsUI();
    }

    // Kosongkan field jumlah agar siap diisi operator
    ['abs_laki', 'abs_perempuan', 'abs_ijin', 'abs_infaq'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    window._pendingAlertPrefill = null;
}

function checkOperatorMonthlyAttendance() {
    const alertContainer = document.getElementById('dashboardAlertContainer');
    if (!alertContainer) return;

    alertContainer.innerHTML = '';

    if (!currentUser || currentUser.role !== 'OPERATOR') {
        return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const currentYearMonth = `${year}-${month}`;

    const namaBulanArr = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    const namaBulanIni = namaBulanArr[now.getMonth()];

    const absensiList = globalCache.absensi || [];

    // 1. Kumpulkan semua nama kegiatan & tanggal-tanggal acaranya di bulan berjalan
    const monthActivityDatesMap = new Map();

    absensiList.forEach(item => {
        if (
            item.tanggal_kegiatan &&
            item.tanggal_kegiatan.startsWith(currentYearMonth) &&
            item.nama_kegiatan
        ) {
            const namaKeg = item.nama_kegiatan.trim();
            if (!monthActivityDatesMap.has(namaKeg)) {
                monthActivityDatesMap.set(namaKeg, new Set());
            }
            monthActivityDatesMap.get(namaKeg).add(item.tanggal_kegiatan);
        }
    });

    if (monthActivityDatesMap.size === 0) {
        return;
    }

    // 2. Kumpulkan pasangan (nama_kegiatan + tanggal_kegiatan) yang SUDAH diisi operator ini
    const mySubmittedSet = new Set();

    absensiList.forEach(item => {
        if (
            item.desa === currentUser.desa &&
            item.kelompok === currentUser.kelompok &&
            item.tanggal_kegiatan &&
            item.tanggal_kegiatan.startsWith(currentYearMonth) &&
            item.nama_kegiatan
        ) {
            const namaKeg = item.nama_kegiatan.trim();
            mySubmittedSet.add(`${namaKeg}__${item.tanggal_kegiatan}`);
        }
    });

    // 3. Cari tanggal kegiatan mana saja yang belum diisi oleh kelompok operator ini
    const missingItems = [];

    monthActivityDatesMap.forEach((datesSet, namaKeg) => {
        const sortedDates = Array.from(datesSet).sort();
        const unsubmittedDates = sortedDates.filter(tglIso => !mySubmittedSet.has(`${namaKeg}__${tglIso}`));

        unsubmittedDates.forEach(tglIso => {
            missingItems.push({
                namaKegiatan: namaKeg,
                tanggalIso: tglIso,
                labelTanggal: formatTanggalSingkatId(tglIso)
            });
        });
    });

    missingItems.sort((a, b) => {
        if (a.tanggalIso !== b.tanggalIso) return a.tanggalIso.localeCompare(b.tanggalIso);
        return a.namaKegiatan.localeCompare(b.namaKegiatan);
    });

    // 4. Render alert lengkap dengan informasi tanggal acara & aksi prefill langsung
    if (missingItems.length > 0) {
        const firstItem = missingItems[0];
        const encodedFirstNama = encodeURIComponent(firstItem.namaKegiatan);
        const encodedFirstTgl = encodeURIComponent(firstItem.tanggalIso);

        const listHtml = missingItems.map(item => {
            const safeNama = encodeURIComponent(item.namaKegiatan);
            const safeTgl = encodeURIComponent(item.tanggalIso);
            return `
                <button type="button"
                    onclick="prefillAbsensiFromAlert(decodeURIComponent('${safeNama}'), decodeURIComponent('${safeTgl}'))"
                    class="w-full text-left bg-white/90 hover:bg-rose-50/90 border border-rose-100 hover:border-rose-300 p-2.5 rounded-xl flex items-center justify-between gap-2 shadow-2xs mb-1.5 transition-all cursor-pointer">
                    <div class="min-w-0">
                        <div class="text-xs font-extrabold text-slate-800 truncate">• ${item.namaKegiatan}</div>
                        <div class="text-[10px] font-bold text-rose-700 mt-0.5">📅 Tanggal Acara: ${item.labelTanggal}</div>
                    </div>
                    <span class="text-[10px] font-black bg-rose-100 text-rose-800 px-2.5 py-1 rounded-lg border border-rose-200 shrink-0">
                        Isi Sekarang &raquo;
                    </span>
                </button>
            `;
        }).join('');

        alertContainer.innerHTML = `
            <div class="bg-gradient-to-r from-rose-500/10 via-red-500/10 to-amber-500/10 border-2 border-rose-300/80 p-4 rounded-2xl shadow-lg backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in-up">
                <div class="flex items-start gap-3 w-full sm:w-auto">
                    <div class="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xl shrink-0 shadow-inner">
                        ⚠️
                    </div>
                    <div class="w-full">
                        <h4 class="text-xs sm:text-sm font-extrabold text-rose-900 tracking-tight">
                            Absensi Bulan ${namaBulanIni} ${year} Belum Lengkap!
                        </h4>
                        <p class="text-[11px] text-rose-700 font-medium mt-0.5 leading-relaxed">
                            Kelompok <strong>${currentUser.kelompok}</strong> belum melaporkan absensi untuk kegiatan berikut pada bulan ini:
                        </p>
                        <div class="mt-2.5 max-h-40 overflow-y-auto pr-1">
                            ${listHtml}
                        </div>
                    </div>
                </div>
                <button type="button"
                    onclick="prefillAbsensiFromAlert(decodeURIComponent('${encodedFirstNama}'), decodeURIComponent('${encodedFirstTgl}'))"
                    class="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 shrink-0 text-center">
                    Lengkapi Absensi &raquo;
                </button>
            </div>
        `;
    }
}

function applyRoleRestrictionsUI() {
    const badgeKelompok = document.getElementById('badgeKelompokLogin');
    const teksKelompokAktif = document.getElementById('namaKelompokAktif');
    const btnUploadJadwal = document.getElementById('btnUploadJadwal');
    
    // Ambil elemen container tombol log operator dengan aman
    const devLogBtnContainer = document.getElementById('developerLogBtnContainer');

    if (currentUser.role === 'OPERATOR') {
        const opDesa = currentUser.desa;
        const opKelompok = currentUser.kelompok;

        if (badgeKelompok && teksKelompokAktif) {
            teksKelompokAktif.textContent = `${opKelompok} (${opDesa})`;
            badgeKelompok.classList.remove('hidden');
        }

        if (btnUploadJadwal) {
            btnUploadJadwal.classList.add('hidden');
        }

        // Sembunyikan tombol log operator untuk operator biasa
        if (devLogBtnContainer) {
            devLogBtnContainer.classList.add('hidden');
        }

        // KUNCI KETAT SEMUA PILIHAN DESA DAN KELOMPOK DI SEMUA MENU
        const pairs = [
            { desaId: 'desa', kelompokId: 'kelompok' },
            { desaId: 'searchDesa', kelompokId: 'searchKelompok' },
            { desaId: 'abs_desa', kelompokId: 'abs_kelompok' },
            { desaId: 'sarp_desa', kelompokId: 'sarp_kelompok' },
            { desaId: 'exportDesa', kelompokId: 'exportKelompok' }
        ];

        pairs.forEach(({ desaId, kelompokId }) => {
            const dEl = document.getElementById(desaId);
            const kEl = document.getElementById(kelompokId);

            if (dEl) {
                dEl.value = opDesa;
                dEl.disabled = true;
                dEl.classList.add('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
            }

            if (kEl) {
                kEl.innerHTML = `<option value="${opKelompok}">${opKelompok}</option>`;
                kEl.value = opKelompok;
                kEl.disabled = true;
                kEl.classList.add('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
                kEl.classList.remove('bg-slate-100/50', 'text-slate-400');
            }
        });

        // Kunci Mode Export khusus untuk operator (hanya bisa kelompok sendiri)
        const exportScopeEl = document.getElementById('exportScopeMode');
        if (exportScopeEl) {
            exportScopeEl.value = 'KELOMPOK';
            exportScopeEl.disabled = true;
            exportScopeEl.classList.add('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
        }

        // Otomatis muat daftar jamaah kelompok untuk mode update
        if (document.getElementById('searchKelompok')) {
            fetchAutoJamaahList(opDesa, opKelompok);
        }
        
    } else if (currentUser.role === 'DEVELOPER') {
        if (badgeKelompok) {
            badgeKelompok.classList.add('hidden');
        }

        if (btnUploadJadwal) {
            btnUploadJadwal.classList.remove('hidden');
        }

        // Tampilkan tombol log operator khusus untuk Developer secara aman
        if (devLogBtnContainer) {
            devLogBtnContainer.classList.remove('hidden');
        }
    }

    checkDeveloperAccess();
}

function openUploadJadwalModal() {
    // Pastikan hanya Developer yang bisa meng-upload/mengganti jadwal
    if (currentUser.role !== 'DEVELOPER') {
        showCustomModal("Akses Dibatasi", "Fitur upload/ganti jadwal hanya dapat diakses oleh Developer.", "⚠️");
        return;
    }
    const fileInput = document.getElementById('fileJadwalInput');
    if (fileInput) fileInput.value = '';
    openModal('uploadJadwalModal');
}

function processUploadAndOverwriteJadwal() {
    const fileInput = document.getElementById('fileJadwalInput');
    const file = fileInput.files[0];

    if (!file) {
        showCustomModal("Peringatan", "Silakan pilih file Excel atau CSV terlebih dahulu!", "⚠️");
        return;
    }

    closeModal('uploadJadwalModal');
    showDataLoading("Membaca file & memperbarui database...");

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            // Ambil sheet pertama dari file excel
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Konversi isi sheet menjadi format JSON
            const rawJson = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (rawJson.length < 2) {
                throw new Error("File Excel kosong atau format baris tidak valid.");
            }

            // Deteksi baris header (mencari kolom yang sesuai dengan format Anda)
            let headerRowIndex = 0;
            for (let i = 0; i < Math.min(5, rawJson.length); i++) {
                const rowStr = rawJson[i].join(' ').toLowerCase();
                if (rowStr.includes('acara') || rowStr.includes('kegiatan') || rowStr.includes('tanggal')) {
                    headerRowIndex = i;
                    break;
                }
            }

            const headers = rawJson[headerRowIndex].map(h => String(h || '').trim().toLowerCase());
            const rows = rawJson.slice(headerRowIndex + 1);

            // Mapping posisi kolom berdasarkan nama header di file Anda
            const getColIdx = (keywords) => {
                return headers.findIndex(h => keywords.some(k => h.includes(k)));
            };

            const idxHariTgl = getColIdx(['hari', 'tanggal']);
            const idxAcara = getColIdx(['acara', 'kegiatan']);
            const idxPukul = getColIdx(['pukul', 'jam']);
            const idxTempat = getColIdx(['tempat']);
            const idxPeserta = getColIdx(['peserta']);
            const idxPenyampai = getColIdx(['penyampai', 'pemateri']);
            const idxMateri = getColIdx(['materi']);

            const newJadwalRecords = [];

            rows.forEach(r => {
                // Lewati baris yang kosong melompong
                if (!r || r.length === 0 || r.every(cell => !cell)) return;

                const hariTgl = idxHariTgl !== -1 ? String(r[idxHariTgl] || '').trim() : '';
                const namaKeg = idxAcara !== -1 ? String(r[idxAcara] || '').trim() : '';
                
                if (!namaKeg && !hariTgl) return; // Lewati baris kosong

                newJadwalRecords.push({
                    hari_tanggal: hariTgl,
                    nama_kegiatan: namaKeg,
                    pukul: idxPukul !== -1 ? String(r[idxPukul] || '').trim() : '-',
                    tempat: idxTempat !== -1 ? String(r[idxTempat] || '').trim() : '-',
                    peserta: idxPeserta !== -1 ? String(r[idxPeserta] || '').trim() : '-',
                    penyampai_materi: idxPenyampai !== -1 ? String(r[idxPenyampai] || '').trim() : '-',
                    materi: idxMateri !== -1 ? String(r[idxMateri] || '').trim() : '-'
                });
            });

            if (newJadwalRecords.length === 0) {
                throw new Error("Tidak ada data jadwal valid yang ditemukan di dalam file.");
            }

            // --- PROSES OVERWRITE (TIMPA DATA) DI SUPABASE ---
            // 1. Hapus semua data jadwal lama di database
            const { error: deleteErr } = await supabaseUtama
                .from('jadwal_kegiatan')
                .delete()
                .neq('id', 0); // Menghapus seluruh baris

            if (deleteErr) throw deleteErr;

            // 2. Masukkan (Insert) data jadwal baru dari file yang di-upload
            const { data: insertedData, error: insertErr } = await supabaseUtama
                .from('jadwal_kegiatan')
                .insert(newJadwalRecords)
                .select();

            if (insertErr) throw insertErr;

            // Update cache lokal
            globalCache.jadwal = insertedData || [];

            hideDataLoading();
            showCustomModal(
                "Berhasil Overwrite!", 
                `Jadwal bulan lalu telah dihapus dan digantikan dengan ${newJadwalRecords.length} agenda kegiatan terbaru dari file Anda.`, 
                "🎉",
                () => {
                    loadJadwalKegiatan(); // Refresh tampilan tabel jadwal
                }
            );

        } catch (err) {
            hideDataLoading();
            showCustomModal("Gagal Memproses File", err.message || "Terjadi kesalahan saat membaca file.", "❌");
        }
    };

    reader.readAsArrayBuffer(file);
}

function loadJadwalKegiatan() {
    const tbody = document.getElementById('tbodyJadwal');
    if (!tbody) return;

    const jadwalList = globalCache.jadwal || [];

    if (jadwalList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-400 font-medium">Belum ada agenda jadwal kegiatan yang diunggah.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    jadwalList.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-violet-50/50 transition-colors";
        tr.innerHTML = `
            <td class="px-2 py-3 font-bold text-violet-900 text-center text-[11px] sm:text-xs leading-snug">${item.hari_tanggal || '-'}</td>
            <td class="px-3 py-3 font-extrabold text-slate-800 text-[11px] sm:text-xs leading-relaxed">${item.nama_kegiatan || '-'}</td>
            <td class="px-2 py-3 text-center whitespace-nowrap font-bold text-slate-600 text-[11px] sm:text-xs">${item.pukul || '-'}</td>
            <td class="px-2.5 py-3 font-semibold text-slate-700 text-[11px] sm:text-xs">${item.tempat || '-'}</td>
            <td class="px-2.5 py-3 font-semibold text-slate-700 text-[11px] sm:text-xs">${item.peserta || '-'}</td>
            <td class="px-2.5 py-3 font-semibold text-slate-700 text-[11px] sm:text-xs">${item.penyampai_materi || '-'}</td>
            <td class="px-2.5 py-3 font-semibold text-slate-700 text-[11px] sm:text-xs">${item.materi || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function checkDeveloperAccess() {
    const uploadContainer = document.getElementById('developerUploadContainer');
    if (!uploadContainer) return;

    // Cek apakah yang login adalah DEVELOPER
    if (currentUser && currentUser.role === 'DEVELOPER') {
        uploadContainer.classList.remove('hidden'); // Tampilkan kotak upload
    } else {
        uploadContainer.classList.add('hidden'); // Sembunyikan jika bukan developer
    }
}

document.getElementById('uploadFileWord')?.addEventListener('change', function(e) {
    // Pengaman ketat: Tolak jika bukan developer
    if (!currentUser || currentUser.role !== 'DEVELOPER') {
        showCustomModal("Akses Ditolak", "Maaf, hanya developer yang memiliki hak akses untuk mengunggah jadwal.", "⛔");
        e.target.value = ''; // Reset pilihan file
        return;
    }

    const file = e.target.files[0];
    if (!file) return;

    showDataLoading("Membaca file Word...");
    const reader = new FileReader();

    reader.onload = function(event) {
        const arrayBuffer = event.target.result;

        // Menggunakan library Mammoth.js untuk membaca file .docx
        mammoth.convertToHtml({ arrayBuffer: arrayBuffer })
            .then(function(result) {
                const htmlString = result.value;
                parseWordTableToJadwal(htmlString);
            })
            .catch(function(err) {
                console.error("Gagal membaca file Word:", err);
                showCustomModal("Error", "Gagal membaca file Word. Pastikan file berformat .docx yang valid.", "❌");
            })
            .finally(() => {
                hideDataLoading();
            });
    };

    reader.readAsArrayBuffer(file);
});

function parseWordTableToJadwal(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const table = doc.querySelector('table');

    if (!table) {
        showCustomModal("Peringatan", "Tidak ditemukan tabel di dalam dokumen Word tersebut. Pastikan data jadwal disusun dalam bentuk tabel.", "⚠️");
        return;
    }

    const rows = table.querySelectorAll('tr');
    const parsedJadwal = [];

    // Mulai dari i = 1 dengan asumsi baris pertama adalah judul kolom (header)
    for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].querySelectorAll('td, th');
        if (cols.length >= 7) {
            parsedJadwal.push({
                hari_tanggal: cols[0].textContent.trim(),
                nama_kegiatan: cols[1].textContent.trim(),
                pukul: cols[2].textContent.trim(),
                tempat: cols[3].textContent.trim(),
                peserta: cols[4].textContent.trim(),
                penyampai_materi: cols[5].textContent.trim(),
                materi: cols[6].textContent.trim()
            });
        }
    }

    if (parsedJadwal.length === 0) {
        showCustomModal("Peringatan", "Format tabel dalam file Word kosong atau tidak sesuai.", "⚠️");
        return;
    }

    uploadJadwalToSupabase(parsedJadwal);
}

async function uploadJadwalToSupabase(dataList) {
    showDataLoading("Menyimpan jadwal ke database...");
    try {
        const { error } = await supabaseUtama.from('jadwal_kegiatan').insert(dataList);

        if (error) throw error;

        showCustomModal("Sukses", "Jadwal kegiatan dari file Word berhasil diunggah!", "✅");
        
        // Bersihkan input file dan perbarui data di layar
        document.getElementById('uploadFileWord').value = '';
        globalCache.isLoaded = false;
        await preloadAllApplicationData();
        loadJadwalKegiatan();

    } catch (err) {
        console.error("Gagal menyimpan ke Supabase:", err);
        showCustomModal("Error", "Gagal menyimpan data ke database.", "❌");
    } finally {
        hideDataLoading();
    }
}

async function processUploadAndOverwriteJadwal() {
    const fileInput = document.getElementById('fileJadwalInput');
    if (!fileInput || fileInput.files.length === 0) {
        showCustomModal("Peringatan", "Silakan pilih file jadwal (.docx, .xlsx, atau .csv) terlebih dahulu.", "⚠️");
        return;
    }

    const file = fileInput.files[0];
    const fileName = file.name.toLowerCase();
    
    showDataLoading("Memproses dan menyimpan jadwal...");

    try {
        let rawRows = [];

        if (fileName.endsWith('.docx')) {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
            rawRows = parseTableHtmlToRawArray(result.value);
        } else {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        }

        // Panggil fungsi pintar untuk mencocokkan kolom secara otomatis
        const mappedData = mapTableRowsToSupabaseData(rawRows);

        if (!mappedData || mappedData.length === 0) {
            hideDataLoading();
            showCustomModal("Gagal", "Tidak ada data valid yang ditemukan pada file.", "❌");
            return;
        }

        // 1. Hapus seluruh data jadwal lama di Supabase (Overwrite)
        const { error: deleteErr } = await supabaseUtama
            .from('jadwal_kegiatan')
            .delete()
            .neq('id', 0);

        if (deleteErr) throw deleteErr;

        // 2. Masukkan data baru yang sudah dipetakan ke Supabase
        const { data: insertedData, error: insertErr } = await supabaseUtama
            .from('jadwal_kegiatan')
            .insert(mappedData)
            .select();

        if (insertErr) throw insertErr;
		
		invalidateAppCache();

        // Perbarui cache lokal
        globalCache.jadwal = insertedData || [];

        hideDataLoading();
        closeModal('uploadJadwalModal');
        showCustomModal("Berhasil", `Jadwal kegiatan berhasil diperbarui (${mappedData.length} agenda)!`, "✅");
        loadJadwalKegiatan(); // Refresh tabel jadwal di layar

    } catch (error) {
        hideDataLoading();
        console.error("Gagal memproses file:", error);
        showCustomModal("Error", "Gagal menyimpan data ke database: " + (error.message || ''), "❌");
    }
}

// Helper untuk membaca tabel HTML dari Word (.docx)
function parseTableHtmlToRawArray(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const tables = doc.querySelectorAll('table');
    if (tables.length === 0) return [];

    let rowsData = [];
    const rows = tables[0].querySelectorAll('tr');
    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        let rowData = [];
        cols.forEach(col => rowData.push(col.textContent.trim()));
        if (rowData.length > 0) rowsData.push(rowData);
    });
    return rowsData;
}

// Fungsi pintar untuk mendeteksi dan memetakan kolom secara otomatis
function mapTableRowsToSupabaseData(rawRows) {
    if (!rawRows || rawRows.length < 2) return [];

    const headers = rawRows[0].map(h => (h ? h.toString().toLowerCase().trim() : ''));
    const dataRows = rawRows.slice(1);

    const getIndex = (keywords) => {
        return headers.findIndex(h => keywords.some(kw => h.includes(kw)));
    };

    const idxHari = getIndex(['hari', 'tanggal', 'tgl']);
    const idxAcara = getIndex(['acara', 'kegiatan', 'nama kegiatan', 'agenda']);
    const idxPukul = getIndex(['pukul', 'jam', 'waktu']);
    const idxTempat = getIndex(['tempat', 'lokasi', 'gedung']);
    const idxPeserta = getIndex(['peserta', 'sasaran', 'golongan']);
    const idxPenyampai = getIndex(['penyampai', 'pemateri', 'muballigh', 'penceramah', 'nara sumber']);
    const idxMateri = getIndex(['materi', 'judul', 'pembahasan']);

    return dataRows.map(row => {
        return {
            hari_tanggal: idxHari !== -1 ? (row[idxHari] || '') : (row[0] || ''),
            nama_kegiatan: idxAcara !== -1 ? (row[idxAcara] || '') : (row[1] || ''),
            pukul: idxPukul !== -1 ? (row[idxPukul] || '') : (row[2] || ''),
            tempat: idxTempat !== -1 ? (row[idxTempat] || '') : (row[3] || ''),
            peserta: idxPeserta !== -1 ? (row[idxPeserta] || '') : (row[4] || ''),
            penyampai_materi: idxPenyampai !== -1 ? (row[idxPenyampai] || '') : (row[5] || ''),
            materi: idxMateri !== -1 ? (row[idxMateri] || '') : (row[6] || '')
        };
    }).filter(item => item.nama_kegiatan && item.nama_kegiatan.trim() !== '');
}

window.allDeveloperLogsDataset = [];

// Fungsi untuk membuka modal Log Operator
async function openDeveloperLogModal() {
    if (currentUser.role !== 'DEVELOPER') {
        showCustomModal("Akses Dibatasi", "Fitur ini hanya dapat diakses oleh Developer.", "⚠️");
        return;
    }
    
    // Kosongkan kolom pencarian setiap kali modal dibuka
    const searchInput = document.getElementById('developerLogSearchInput');
    if (searchInput) searchInput.value = '';

    openModal('developerLogModal');
    await fetchAndRenderDeveloperLogs();
}

// Fungsi mengambil data log dari tabel operator_logs di Supabase
async function fetchAndRenderDeveloperLogs() {
    const container = document.getElementById('developerLogListContainer');
    container.innerHTML = `<div class="text-xs text-slate-400 text-center py-6">Mengambil data log...</div>`;

    try {
        const { data, error } = await supabaseUtama
            .from('operator_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50); // Maksimal ambil 50 data terbaru dari database

        if (error) throw error;

        window.allDeveloperLogsDataset = data || [];
        renderDeveloperLogList(window.allDeveloperLogsDataset);

    } catch (err) {
        container.innerHTML = `<div class="text-xs text-rose-500 text-center py-6 font-semibold">Gagal memuat log: ${err.message}</div>`;
    }
}

// Fungsi untuk merender daftar kartu log ke layar (Hanya menampilkan Operator)
function renderDeveloperLogList(listData) {
    const container = document.getElementById('developerLogListContainer');
    container.innerHTML = '';

    // Filter ketat: Hanya ambil data yang kelompoknya BUKAN 'Developer' atau 'Admin'
    const operatorOnlyData = (listData || []).filter(log => {
        const kelompok = (log.kelompok || '').toLowerCase();
        const desa = (log.desa || '').toLowerCase();
        
        // Sembunyikan jika log berasal dari Developer / Admin
        if (kelompok === 'developer' || kelompok === 'Admin' || desa === 'Admin') {
            return false;
        }
        return true;
    });

    if (operatorOnlyData.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-400 text-center py-6 font-medium">Tidak ada catatan log aktivitas operator yang ditemukan.</div>`;
        return;
    }

    operatorOnlyData.forEach(log => {
        const dateObj = new Date(log.created_at);
        const timeFormatted = dateObj.toLocaleDateString('id-ID', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        const card = document.createElement('div');
        card.className = "p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-white hover:border-indigo-200 transition-all shadow-2xs animate-fade-in-up";
        
        card.innerHTML = `
            <div class="space-y-1">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-extrabold text-indigo-950">Kelompok ${log.kelompok || '-'}</span>
                    <span class="text-[10px] font-bold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-md">${log.desa || '-'}</span>
                </div>
                <p class="text-xs text-slate-700 font-medium">${log.keterangan || log.aksi || '-'}</p>
            </div>
            <div class="text-[10px] font-bold text-slate-400 shrink-0 text-left sm:text-right">
                ${timeFormatted} WIB
            </div>
        `;
        container.appendChild(card);
    });
}

// Fungsi pencarian log secara real-time saat diketik
function filterDeveloperLogs() {
    const query = (document.getElementById('developerLogSearchInput').value || '').toLowerCase().trim();
    
    if (!query) {
        renderDeveloperLogList(window.allDeveloperLogsDataset);
        return;
    }

    const filtered = window.allDeveloperLogsDataset.filter(log => {
        const kelompokMatch = (log.kelompok || '').toLowerCase().includes(query);
        const desaMatch = (log.desa || '').toLowerCase().includes(query);
        const ketMatch = (log.keterangan || '').toLowerCase().includes(query);
        const aksiMatch = (log.aksi || '').toLowerCase().includes(query);

        return kelompokMatch || desaMatch || ketMatch || aksiMatch;
    });

    renderDeveloperLogList(filtered);
}