/**
 * app-shared.js
 * Közös profil-, téma-, csillagmentő, süti-jóváhagyó és felhő-szinkron modul
 */
(function (window) {
    'use strict';

    const STATE_KEY = 'laura_app_state_v1';
    const COOKIE_KEY = 'laura_app_profile_v1';
    const SZORZO_STARS_KEY = 'varazs_szorzo_stars';
    const FELMERO_KEY = 'laura_szorzo_felmero_v1';
    const FELMERO_COOKIE = 'laura_felmero_compact';

    // Firebase Realtime Database végpontok (EU és US régió automatikus felismeréssel)
    const FIREBASE_DB_URLS = [
        'https://lauralabor-1f53a-default-rtdb.europe-west1.firebasedatabase.app',
        'https://lauralabor-1f53a-default-rtdb.firebaseio.com'
    ];

    const LESSON_KEYS = [
        'szorzas',
        'felmero',
        'ketjegyu',
        'pcreszek',
        'szilard',
        'vizlabor',
        'legnemu',
        'suruseg'
    ];

    function getDefaultState() {
        return {
            childName: 'Laura',
            theme: 'girly', // 'girly' | 'boyish' | 'neutral'
            onboardingDone: false,
            cookieConsent: false,
            cloudCode: '',
            stars: {
                szorzas: 0,
                felmero: 0,
                ketjegyu: 0,
                pcreszek: 0,
                szilard: 0,
                vizlabor: 0,
                legnemu: 0,
                suruseg: 0
            },
            updatedAt: Date.now()
        };
    }

    let state = getDefaultState();

    // =====================================================
    // SEGÉDFÜGGVÉNYEK: SÜTI ÉS LOCALSTORAGE OLVASÁS/ÍRÁS
    // =====================================================
    function readCookie(name) {
        try {
            const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
            return match ? decodeURIComponent(match[2]) : null;
        } catch (e) {
            return null;
        }
    }

    function writeCookie(name, val) {
        if (!state.cookieConsent) return;
        try {
            document.cookie = `${name}=${encodeURIComponent(val)}; max-age=31536000; path=/; SameSite=Lax`;
        } catch (e) {}
    }

    // 200-as felmérő kompakt (200 karakteres) kiolvasása és visszaírása
    function getFelmeroStats() {
        let mastered = 0;
        let slow = 0;
        let wrong = 0;
        let tested = 0;
        let compact = '';

        try {
            const raw = localStorage.getItem(FELMERO_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.items) {
                    const statusMap = { untested: '0', mastered: '1', slow: '2', wrong: '3' };
                    for (let a = 1; a <= 10; a++) {
                        for (let b = 1; b <= 10; b++) {
                            const m = parsed.items[`mul_${a}_${b}`];
                            const st = m ? m.status : 'untested';
                            compact += statusMap[st] || '0';
                            if (st !== 'untested') tested++;
                            if (st === 'mastered') mastered++;
                            if (st === 'slow') slow++;
                            if (st === 'wrong') wrong++;
                        }
                    }
                    for (let a = 1; a <= 10; a++) {
                        for (let b = 1; b <= 10; b++) {
                            const d = parsed.items[`div_${a}_${b}`];
                            const st = d ? d.status : 'untested';
                            compact += statusMap[st] || '0';
                            if (st !== 'untested') tested++;
                            if (st === 'mastered') mastered++;
                            if (st === 'slow') slow++;
                            if (st === 'wrong') wrong++;
                        }
                    }
                }
            }
        } catch (e) {}

        return { mastered, slow, wrong, tested, total: 200, compact };
    }

    function restoreFelmeroFromCompact(compactStr) {
        if (!compactStr || compactStr.length !== 200) return;
        try {
            let parsed = null;
            const raw = localStorage.getItem(FELMERO_KEY);
            if (raw) {
                parsed = JSON.parse(raw);
            }
            if (!parsed || !parsed.items) {
                parsed = {
                    settings: {
                        scope: 'all',
                        thresholdMs: 6000,
                        inputMode: 'keypad',
                        selectedTables: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
                    },
                    stepCounter: 0,
                    items: {}
                };
                for (let a = 1; a <= 10; a++) {
                    for (let b = 1; b <= 10; b++) {
                        parsed.items[`mul_${a}_${b}`] = {
                            key: `mul_${a}_${b}`, op: 'mul', table: a, a, b, answer: a * b,
                            status: 'untested', lastTimeMs: null, bestTimeMs: null, attempts: 0, wrongCount: 0, lastAskedStep: -100
                        };
                        parsed.items[`div_${a}_${b}`] = {
                            key: `div_${a}_${b}`, op: 'div', table: a, a: a * b, b: a, answer: b,
                            status: 'untested', lastTimeMs: null, bestTimeMs: null, attempts: 0, wrongCount: 0, lastAskedStep: -100
                        };
                    }
                }
            }

            const revMap = { '0': 'untested', '1': 'mastered', '2': 'slow', '3': 'wrong' };
            const rank = { untested: 0, wrong: 1, slow: 2, mastered: 3 };
            let idx = 0;

            for (let a = 1; a <= 10; a++) {
                for (let b = 1; b <= 10; b++) {
                    const incoming = revMap[compactStr[idx++]] || 'untested';
                    const item = parsed.items[`mul_${a}_${b}`];
                    if (item && rank[incoming] > rank[item.status || 'untested']) {
                        item.status = incoming;
                        item.attempts = Math.max(1, item.attempts || 0);
                    }
                }
            }
            for (let a = 1; a <= 10; a++) {
                for (let b = 1; b <= 10; b++) {
                    const incoming = revMap[compactStr[idx++]] || 'untested';
                    const item = parsed.items[`div_${a}_${b}`];
                    if (item && rank[incoming] > rank[item.status || 'untested']) {
                        item.status = incoming;
                        item.attempts = Math.max(1, item.attempts || 0);
                    }
                }
            }

            localStorage.setItem(FELMERO_KEY, JSON.stringify(parsed));
            if (state.cookieConsent) {
                writeCookie(FELMERO_COOKIE, compactStr);
            }
        } catch (e) {}
    }

    // =====================================================
    // ÁLLAPOT BETÖLTÉSE ÉS MENTÉSE
    // =====================================================
    function loadState() {
        const def = getDefaultState();
        try {
            const raw = localStorage.getItem(STATE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                state = Object.assign({}, def, parsed);
                state.stars = Object.assign({}, def.stars, parsed.stars || {});
            } else {
                const cRaw = readCookie(COOKIE_KEY);
                if (cRaw) {
                    const parsed = JSON.parse(cRaw);
                    state = Object.assign({}, def, parsed);
                    state.stars = Object.assign({}, def.stars, parsed.stars || {});
                }
            }
        } catch (e) {
            state = def;
        }

        // Szinkronizáció a korábbi szorzótábla csillagokkal és a 200-as felmérővel
        try {
            const legacySzorzo = parseInt(localStorage.getItem(SZORZO_STARS_KEY) || '0', 10);
            if (legacySzorzo > (state.stars.szorzas || 0)) {
                state.stars.szorzas = legacySzorzo;
            } else if ((state.stars.szorzas || 0) > legacySzorzo) {
                localStorage.setItem(SZORZO_STARS_KEY, String(state.stars.szorzas));
            }
        } catch (e) {}

        const fStats = getFelmeroStats();
        if (fStats.mastered > (state.stars.felmero || 0)) {
            state.stars.felmero = fStats.mastered;
        }

        applyThemeImmediately();
    }

    function saveState(skipCloud = false) {
        state.updatedAt = Date.now();
        try {
            localStorage.setItem(STATE_KEY, JSON.stringify(state));
            localStorage.setItem(SZORZO_STARS_KEY, String(state.stars.szorzas || 0));
        } catch (e) {}

        if (state.cookieConsent) {
            writeCookie(COOKIE_KEY, JSON.stringify({
                childName: state.childName,
                theme: state.theme,
                onboardingDone: state.onboardingDone,
                cookieConsent: state.cookieConsent,
                cloudCode: state.cloudCode,
                stars: state.stars
            }));
        }

        if (!skipCloud && state.cloudCode) {
            pushToCloudDebounced();
        }
    }

    function applyThemeImmediately() {
        const validThemes = ['girly', 'boyish', 'neutral'];
        const t = validThemes.includes(state.theme) ? state.theme : 'girly';
        document.documentElement.setAttribute('data-theme', t);
    }

    // =====================================================
    // NÉV ÉS TÉMA DINAMIKUS ALKALMAZÁSA AZ OLDALON
    // =====================================================
    function applyProfileToDOM() {
        applyThemeImmediately();
        const name = (state.childName || 'Laura').trim();

        // [data-child-name] elemek frissítése
        document.querySelectorAll('[data-child-name]').forEach(el => {
            el.textContent = name;
        });

        // Ha a dokumentum címében vagy főcímében "Laura" szerepel, kicseréljük a beállított névre
        if (document.title && document.title.includes('Laura')) {
            document.title = document.title.replace(/Laura/g, name);
        }
        document.querySelectorAll('h1, h2').forEach(heading => {
            if (heading.dataset.originalTemplate) {
                heading.textContent = heading.dataset.originalTemplate.replace(/\{name\}/g, name);
            } else if (heading.textContent.includes('Laura')) {
                heading.dataset.originalTemplate = heading.textContent.replace(/Laura/g, '{name}');
                heading.textContent = heading.dataset.originalTemplate.replace(/\{name\}/g, name);
            }
        });
    }

    // =====================================================
    // CSILLAGOK KEZELÉSE LECKÉNKÉNT
    // =====================================================
    function getStars(lessonKey) {
        if (lessonKey === 'felmero') {
            const fStats = getFelmeroStats();
            state.stars.felmero = Math.max(state.stars.felmero || 0, fStats.mastered);
        }
        return state.stars[lessonKey] || 0;
    }

    function setStars(lessonKey, value) {
        const cleanVal = Math.max(0, parseInt(value, 10) || 0);
        state.stars[lessonKey] = cleanVal;
        saveState();
        notifyListeners();
        return cleanVal;
    }

    function addStars(lessonKey, delta) {
        const current = getStars(lessonKey);
        const updated = Math.max(0, current + (parseInt(delta, 10) || 0));
        state.stars[lessonKey] = updated;
        saveState();
        notifyListeners();
        return updated;
    }

    function recordBestStars(lessonKey, score) {
        const current = getStars(lessonKey);
        if (score > current) {
            state.stars[lessonKey] = score;
            saveState();
            notifyListeners();
        }
        return state.stars[lessonKey];
    }

    function getTotalStars() {
        const fStats = getFelmeroStats();
        state.stars.felmero = Math.max(state.stars.felmero || 0, fStats.mastered);
        return LESSON_KEYS.reduce((sum, k) => sum + (parseInt(state.stars[k], 10) || 0), 0);
    }

    // =====================================================
    // VARÁZS-LINK (?sync=...) ÉS FELHŐ SZINKRONIZÁCIÓ
    // =====================================================
    function encodeSyncPayload() {
        const fStats = getFelmeroStats();
        const payload = {
            n: state.childName,
            t: state.theme,
            s: state.stars,
            f: fStats.compact || ''
        };
        const json = JSON.stringify(payload);
        return btoa(unescape(encodeURIComponent(json)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    function decodeSyncPayload(encoded) {
        try {
            let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) base64 += '=';
            const json = decodeURIComponent(escape(atob(base64)));
            return JSON.parse(json);
        } catch (e) {
            return null;
        }
    }

    function mergeIncomingPayload(payload) {
        if (!payload || typeof payload !== 'object') return false;
        if (payload.n && typeof payload.n === 'string') {
            state.childName = payload.n.trim().slice(0, 30) || state.childName;
        }
        if (payload.t && ['girly', 'boyish', 'neutral'].includes(payload.t)) {
            state.theme = payload.t;
        }
        if (payload.s && typeof payload.s === 'object') {
            LESSON_KEYS.forEach(k => {
                const inc = parseInt(payload.s[k], 10) || 0;
                if (inc > (state.stars[k] || 0)) {
                    state.stars[k] = inc;
                }
            });
        }
        if (payload.f && typeof payload.f === 'string' && payload.f.length === 200) {
            restoreFelmeroFromCompact(payload.f);
            const fStats = getFelmeroStats();
            state.stars.felmero = Math.max(state.stars.felmero || 0, fStats.mastered);
        }
        state.onboardingDone = true;
        saveState(true);
        applyProfileToDOM();
        notifyListeners();
        return true;
    }

    function checkUrlSyncParam() {
        try {
            const url = new URL(window.location.href);
            const syncParam = url.searchParams.get('sync');
            if (syncParam) {
                const decoded = decodeSyncPayload(syncParam);
                if (decoded && mergeIncomingPayload(decoded)) {
                    url.searchParams.delete('sync');
                    window.history.replaceState({}, document.title, url.toString());
                    setTimeout(() => {
                        showToast(`🎉 Sikeres szinkronizálás! (${state.childName} • ⭐ ${getTotalStars()} csillag)`);
                    }, 300);
                }
            }
        } catch (e) {}
    }

    function getMagicSyncUrl() {
        const code = encodeSyncPayload();
        const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, 'index.html');
        return `${baseUrl}?sync=${code}`;
    }

    // Felhő szinkron Családi Varázskóddal
    let cloudPushTimer = null;
    function normalizeCloudKey(rawCode) {
        return String(rawCode || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '');
    }

    function pushToCloudDebounced() {
        if (cloudPushTimer) clearTimeout(cloudPushTimer);
        cloudPushTimer = setTimeout(() => {
            syncWithCloud('push');
        }, 1200);
    }

    async function fetchFirebaseWithFallback(path, options) {
        let lastErr = null;
        for (const baseUrl of FIREBASE_DB_URLS) {
            try {
                const res = await fetch(`${baseUrl}${path}`, options);
                // Ha a régió nem egyezik, a Firebase 404-et vagy átirányítási hibát ad; 200 és 401/403 esetén jó régióban vagyunk
                if (res.ok || res.status === 401 || res.status === 403) {
                    return res;
                }
            } catch (e) {
                lastErr = e;
            }
        }
        if (lastErr) throw lastErr;
        return null;
    }

    async function syncWithCloud(mode = 'both') {
        const cleanKey = normalizeCloudKey(state.cloudCode);
        if (!cleanKey || cleanKey.length < 3) {
            return { ok: false, message: 'Adj meg legalább 3 karakteres Családi Varázskódot!' };
        }

        const syncPath = `/profiles/laura_sync_${cleanKey}.json`;

        try {
            if (mode === 'pull' || mode === 'both') {
                const res = await fetchFirebaseWithFallback(syncPath, { method: 'GET', cache: 'no-store' });
                if (res && (res.status === 401 || res.status === 403)) {
                    return { ok: false, message: '🔒 A Firebase Rules még nem engedélyezi a hozzáférést. Állítsd be a Rules JSON-t a Firebase-ben!' };
                }
                if (res && res.ok) {
                    const data = await res.json();
                    if (data && typeof data === 'string') {
                        const remotePayload = decodeSyncPayload(data.trim());
                        if (remotePayload) {
                            mergeIncomingPayload(remotePayload);
                        }
                    }
                }
            }

            if (mode === 'push' || mode === 'both') {
                const encoded = encodeSyncPayload();
                const pushRes = await fetchFirebaseWithFallback(syncPath, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(encoded)
                });
                if (!pushRes) {
                    return { ok: false, message: 'A Firebase adatbázis nem érhető el. Ellenőrizd az internetkapcsolatot!' };
                }
                if (pushRes.status === 401 || pushRes.status === 403) {
                    return { ok: false, message: '🔒 A Firebase Rules még zárolva van. Illeszd be a megadott Rules JSON-t a Firebase-ben!' };
                }
                if (!pushRes.ok) {
                    return { ok: false, message: 'Hiba történt a felhőbe mentéskor.' };
                }
            }

            return {
                ok: true,
                message: `☁️ Sikeres Firebase szinkron! (Kód: ${cleanKey} • ⭐ ${getTotalStars()} csillag)`
            };
        } catch (err) {
            return {
                ok: false,
                message: 'Nincs internetkapcsolat vagy a Firebase jelenleg nem érhető el.'
            };
        }
    }

    // Kis felugró értesítés (Toast)
    function showToast(msg) {
        let toast = document.getElementById('lauraAppToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'lauraAppToast';
            toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:12px 20px;border-radius:16px;font-weight:800;font-size:0.92rem;z-index:10000;box-shadow:0 10px 25px rgba(0,0,0,0.25);transition:opacity 0.3s ease;';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.opacity = '1';
        toast.style.display = 'block';
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { toast.style.display = 'none'; }, 300);
        }, 3600);
    }

    // =====================================================
    // ESEMÉNYFIGYELŐK FRISSÍTÉSHEZ
    // =====================================================
    const listeners = [];
    function onUpdate(fn) {
        if (typeof fn === 'function') listeners.push(fn);
    }
    function notifyListeners() {
        listeners.forEach(fn => {
            try { fn(state); } catch (e) {}
        });
    }

    // Automatikus inicializálás
    loadState();

    window.addEventListener('DOMContentLoaded', () => {
        checkUrlSyncParam();
        applyProfileToDOM();
        if (state.cloudCode) {
            syncWithCloud('both').then(() => notifyListeners());
        }
    });

    // Globális API
    window.LauraApp = {
        getState: () => state,
        getProfile: () => ({
            childName: state.childName,
            theme: state.theme,
            onboardingDone: state.onboardingDone,
            cookieConsent: state.cookieConsent,
            cloudCode: state.cloudCode
        }),
        updateProfile: (updates) => {
            if (typeof updates.childName === 'string') {
                state.childName = updates.childName.trim() || 'Laura';
            }
            if (updates.theme && ['girly', 'boyish', 'neutral'].includes(updates.theme)) {
                state.theme = updates.theme;
            }
            if (typeof updates.onboardingDone === 'boolean') {
                state.onboardingDone = updates.onboardingDone;
            }
            if (typeof updates.cookieConsent === 'boolean') {
                state.cookieConsent = updates.cookieConsent;
            }
            if (typeof updates.cloudCode === 'string') {
                state.cloudCode = normalizeCloudKey(updates.cloudCode);
            }
            saveState();
            applyProfileToDOM();
            notifyListeners();
        },
        hasCookieConsent: () => !!state.cookieConsent,
        acceptCookies: () => {
            state.cookieConsent = true;
            saveState();
            notifyListeners();
        },
        getStars,
        setStars,
        addStars,
        recordBestStars,
        getTotalStars,
        getFelmeroStats,
        getMagicSyncUrl,
        syncWithCloud,
        showToast,
        onUpdate,
        resetAllStars: () => {
            LESSON_KEYS.forEach(k => { state.stars[k] = 0; });
            try {
                localStorage.removeItem(SZORZO_STARS_KEY);
                localStorage.removeItem(FELMERO_KEY);
            } catch (e) {}
            saveState();
            notifyListeners();
        }
    };
})(window);
