/* ============================================
   CarCare Pro - Application Logic
   ============================================ */

// ==========================================
// Firebase Configuration
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyD1Om8Ydo7W1LvbC7LFH47Wc-HLKYsnDUs",
    authDomain: "carcarepro-9fe9c.firebaseapp.com",
    projectId: "carcarepro-9fe9c",
    storageBucket: "carcarepro-9fe9c.firebasestorage.app",
    messagingSenderId: "345006977406",
    appId: "1:345006977406:web:67ee08f038b4b8c833432f",
    measurementId: "G-9V6YXJZY3T"
};

firebase.initializeApp(firebaseConfig);
const fireAuth = firebase.auth();
const fireDB = firebase.firestore();

// Enable offline persistence
fireDB.enablePersistence().catch(() => { });

// ==========================================
// Data Layer (Firestore + Local Cache)
// ==========================================
const DB = {
    PIN_KEY: 'carcare_pin',
    SESSION_KEY: 'carcare_session',
    VEHICLES_KEY: 'carcare_vehicles',
    RECORDS_KEY: 'carcare_records',
    FUEL_LOGS_KEY: 'carcare_fuel_logs',
    CHARGE_LOGS_KEY: 'carcare_charge_logs',

    // In-memory cache
    _vehicles: [],
    _records: [],
    _fuelLogs: [],
    _chargeLogs: [],
    _userId: null,
    _unsubVehicles: null,
    _unsubRecords: null,
    _unsubFuelLogs: null,
    _unsubChargeLogs: null,

    getVehicles() {
        return this._vehicles;
    },
    getRecords() {
        return this._records;
    },

    saveVehicles(vehicles) {
        this._vehicles = vehicles;
        this._syncToCloud('vehicles', vehicles);
    },
    saveRecords(records) {
        this._records = records;
        this._syncToCloud('records', records);
    },

    getFuelLogs() {
        return this._fuelLogs;
    },
    saveFuelLogs(logs) {
        this._fuelLogs = logs;
        this._syncToCloud('fuelLogs', logs);
    },

    getChargeLogs() {
        return this._chargeLogs;
    },
    saveChargeLogs(logs) {
        this._chargeLogs = logs;
        this._syncToCloud('chargeLogs', logs);
    },

    // Firestore sync (fire-and-forget)
    _syncToCloud(collection, data) {
        if (!this._userId) return;
        fireDB.doc(`users/${this._userId}/data/${collection}`)
            .set({ items: data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
            .catch(err => console.warn('Cloud sync error:', err));
    },

    // Load from Firestore
    async loadFromCloud() {
        if (!this._userId) return;
        try {
            const vSnap = await fireDB.doc(`users/${this._userId}/data/vehicles`).get();
            const rSnap = await fireDB.doc(`users/${this._userId}/data/records`).get();
            const fSnap = await fireDB.doc(`users/${this._userId}/data/fuelLogs`).get();
            this._vehicles = vSnap.exists ? (vSnap.data().items || []) : [];
            this._records = rSnap.exists ? (rSnap.data().items || []) : [];
            this._fuelLogs = fSnap.exists ? (fSnap.data().items || []) : [];
        } catch (err) {
            console.warn('Cloud load error, using local cache:', err);
        }
    },

    // Real-time sync listener
    startRealtimeSync() {
        if (!this._userId) return;
        this._unsubVehicles = fireDB.doc(`users/${this._userId}/data/vehicles`)
            .onSnapshot(snap => {
                if (snap.exists && snap.metadata.hasPendingWrites === false) {
                    this._vehicles = snap.data().items || [];
                    if (typeof renderVehicles === 'function') renderVehicles();
                    if (typeof renderDashboard === 'function') renderDashboard();
                    if (typeof updateVehicleSelects === 'function') updateVehicleSelects();
                }
            });
        this._unsubRecords = fireDB.doc(`users/${this._userId}/data/records`)
            .onSnapshot(snap => {
                if (snap.exists && snap.metadata.hasPendingWrites === false) {
                    this._records = snap.data().items || [];
                    if (typeof renderRecords === 'function') renderRecords();
                    if (typeof renderDashboard === 'function') renderDashboard();
                    if (typeof renderAnalytics === 'function') renderAnalytics();
                }
            });
        this._unsubFuelLogs = fireDB.doc(`users/${this._userId}/data/fuelLogs`)
            .onSnapshot(snap => {
                if (snap.exists && snap.metadata.hasPendingWrites === false) {
                    this._fuelLogs = snap.data().items || [];
                    if (typeof renderFuelLogs === 'function') renderFuelLogs();
                    if (typeof renderDashboard === 'function') renderDashboard();
                }
            });
        this._unsubChargeLogs = fireDB.doc(`users/${this._userId}/data/chargeLogs`)
            .onSnapshot(snap => {
                if (snap.exists && snap.metadata.hasPendingWrites === false) {
                    this._chargeLogs = snap.data().items || [];
                    if (typeof renderChargeLogs === 'function') renderChargeLogs();
                    if (typeof renderDashboard === 'function') renderDashboard();
                }
            });
    },

    stopRealtimeSync() {
        if (this._unsubVehicles) this._unsubVehicles();
        if (this._unsubRecords) this._unsubRecords();
        if (this._unsubFuelLogs) this._unsubFuelLogs();
        if (this._unsubChargeLogs) this._unsubChargeLogs();
    },

    // Migrate localStorage data to Firestore (first-time)
    async migrateLocalData() {
        const localVehicles = JSON.parse(localStorage.getItem(this.VEHICLES_KEY) || '[]');
        const localRecords = JSON.parse(localStorage.getItem(this.RECORDS_KEY) || '[]');
        const localFuelLogs = JSON.parse(localStorage.getItem(this.FUEL_LOGS_KEY) || '[]');

        if (localVehicles.length > 0 || localRecords.length > 0 || localFuelLogs.length > 0) {
            // Check if Firestore already has data
            const vSnap = await fireDB.doc(`users/${this._userId}/data/vehicles`).get();
            if (!vSnap.exists || (vSnap.data().items || []).length === 0) {
                // Firestore is empty, migrate local data
                this._vehicles = localVehicles;
                this._records = localRecords;
                this._fuelLogs = localFuelLogs;
                this._syncToCloud('vehicles', localVehicles);
                this._syncToCloud('records', localRecords);
                this._syncToCloud('fuelLogs', localFuelLogs);
                const localChargeLogs = JSON.parse(localStorage.getItem(this.CHARGE_LOGS_KEY) || '[]');
                if (localChargeLogs.length > 0) {
                    this._chargeLogs = localChargeLogs;
                    this._syncToCloud('chargeLogs', localChargeLogs);
                }
                console.log('Migrated local data to Firestore');
            }
        }
    },

    // PIN management (stays in localStorage per-device)
    hasPin() {
        return !!localStorage.getItem(this.PIN_KEY);
    },
    setPin(pin) {
        localStorage.setItem(this.PIN_KEY, hashPin(pin));
    },
    verifyPin(pin) {
        return localStorage.getItem(this.PIN_KEY) === hashPin(pin);
    },
    isLoggedIn() {
        return sessionStorage.getItem(this.SESSION_KEY) === 'true';
    },
    setLoggedIn(val) {
        if (val) sessionStorage.setItem(this.SESSION_KEY, 'true');
        else sessionStorage.removeItem(this.SESSION_KEY);
    }
};

// Simple hash for PIN
function hashPin(pin) {
    let hash = 0;
    const str = 'carcare_salt_' + pin + '_v1';
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'pin_' + Math.abs(hash).toString(36);
}

// ==========================================
// Helpers
// ==========================================
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
const REPAIR_TYPES = {
    engine: { emoji: '🔧', label: 'เครื่องยนต์', color: '#ef4444' },
    brake: { emoji: '🛑', label: 'เบรก', color: '#f97316' },
    tire: { emoji: '🔘', label: 'ยาง', color: '#64748b' },
    oil: { emoji: '🛢️', label: 'เปลี่ยนถ่ายน้ำมัน', color: '#eab308' },
    battery: { emoji: '🔋', label: 'แบตเตอรี่', color: '#22c55e' },
    ac: { emoji: '❄️', label: 'แอร์', color: '#06b6d4' },
    body: { emoji: '🚗', label: 'ตัวถัง/สี', color: '#8b5cf6' },
    electric: { emoji: '⚡', label: 'ระบบไฟฟ้า', color: '#f59e0b' },
    suspension: { emoji: '🔩', label: 'ช่วงล่าง', color: '#14b8a6' },
    transmission: { emoji: '⚙️', label: 'เกียร์/ส่งกำลัง', color: '#ec4899' },
    maintenance: { emoji: '📋', label: 'ตรวจเช็คประจำ', color: '#3b82f6' },
    other: { emoji: '📌', label: 'อื่นๆ', color: '#94a3b8' }
};

const FUEL_TYPES = {
    gasohol91: { emoji: '⛽', label: 'แก๊สโซฮอล์ 91', color: '#22c55e' },
    gasohol95: { emoji: '⛽', label: 'แก๊สโซฮอล์ 95', color: '#16a34a' },
    e20: { emoji: '⛽', label: 'แก๊สโซฮอล์ E20', color: '#15803d' },
    e85: { emoji: '⛽', label: 'E85', color: '#166534' },
    diesel: { emoji: '⛽', label: 'ดีเซล', color: '#eab308' },
    dieselB7: { emoji: '⛽', label: 'ดีเซล B7', color: '#ca8a04' },
    premium_diesel: { emoji: '⛽', label: 'ดีเซลพรีเมียม', color: '#a16207' },
    benzin95: { emoji: '⛽', label: 'เบนซิน 95', color: '#ef4444' },
    ngv: { emoji: '🔵', label: 'NGV', color: '#3b82f6' },
    lpg: { emoji: '🟢', label: 'LPG', color: '#06b6d4' },
    ev: { emoji: '🔋', label: 'ชาร์จ EV', color: '#8b5cf6' }
};

const STATUS_MAP = {
    completed: { label: '✅ เสร็จสิ้น', class: 'status-completed' },
    inprogress: { label: '🔄 กำลังซ่อม', class: 'status-inprogress' },
    scheduled: { label: '📅 นัดหมาย', class: 'status-scheduled' }
};

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function formatCurrency(amount) {
    if (amount === undefined || amount === null) return '฿0';
    return '฿' + Number(amount).toLocaleString('th-TH');
}

function formatNumber(num) {
    if (!num) return '-';
    return Number(num).toLocaleString('th-TH');
}

function daysUntil(dateStr) {
    if (!dateStr) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function getVehicleLabel(vehicleId) {
    const vehicles = DB.getVehicles();
    const v = vehicles.find(v => v.id === vehicleId);
    if (!v) return 'ไม่ทราบ';
    return `${escapeHTML(v.brand)} ${escapeHTML(v.model)} (${escapeHTML(v.plate)})`;
}

function getVehicleShort(vehicleId) {
    const vehicles = DB.getVehicles();
    const v = vehicles.find(v => v.id === vehicleId);
    if (!v) return 'ไม่ทราบ';
    return `${escapeHTML(v.brand)} ${escapeHTML(v.model)}`;
}

// ==========================================
// Toast Notifications
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️'
    };

    toast.innerHTML = `<span>${icons[type] || ''}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ==========================================
// Navigation
// ==========================================
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            navItems.forEach(n => n.classList.remove('active'));
            pages.forEach(p => p.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(`page-${page}`).classList.add('active');

            // Close mobile sidebar
            document.getElementById('sidebar').classList.remove('open');
            document.querySelector('.sidebar-overlay')?.classList.remove('active');

            // Refresh page data
            if (page === 'dashboard') renderDashboard();
            if (page === 'pixel') renderPixelDashboard();
            if (page === 'vehicles') renderVehicles();
            if (page === 'records') { renderRecords(); renderAnalytics(); }
            if (page === 'fuel') renderFuelLogs();
            if (page === 'charge') renderChargeLogs();
        });
    });

    // "ดูทั้งหมด" link
    document.querySelectorAll('[data-goto]').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.goto;
            document.querySelector(`.nav-item[data-page="${page}"]`).click();
        });
    });

    // Mobile hamburger
    const hamburger = document.getElementById('hamburger');
    hamburger.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', () => {
                document.getElementById('sidebar').classList.remove('open');
                overlay.classList.remove('active');
            });
        }
        overlay.classList.toggle('active');
    });
}

// ==========================================
// Modals
// ==========================================
function openModal(id) {
    document.getElementById(id).classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';
}

function initModals() {
    // Close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(btn.dataset.close);
        });
    });

    // Click outside modal
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal(overlay.id);
            }
        });
    });

    // ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => {
                closeModal(m.id);
            });
        }
    });
}

// ==========================================
// Vehicle CRUD
// ==========================================
let deleteTarget = null;

// Current vehicle image base64
let currentVehicleImage = '';

// Current record images (array of base64)
let currentRecordImages = [];
const MAX_RECORD_IMAGES = 5;

function initVehicleForm() {
    document.getElementById('btnAddVehicle').addEventListener('click', () => {
        resetVehicleForm();
        document.getElementById('vehicleModalTitle').textContent = 'เพิ่มรถใหม่';
        openModal('vehicleModal');
    });

    document.getElementById('vehicleForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveVehicle();
    });

    // Image upload handlers
    initVehicleImageUpload();
}

function initVehicleImageUpload() {
    const uploadArea = document.getElementById('vehicleImageUpload');
    const fileInput = document.getElementById('vehicleImageInput');
    const removeBtn = document.getElementById('btnRemoveImage');

    uploadArea.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove-image')) return;
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            showToast('ไฟล์ใหญ่เกิน 2MB กรุณาเลือกไฟล์ที่เล็กกว่า', 'error');
            return;
        }

        if (!file.type.startsWith('image/')) {
            showToast('กรุณาเลือกไฟล์รูปภาพ', 'error');
            return;
        }

        compressAndSetImage(file);
    });

    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearVehicleImage();
    });
}

function compressAndSetImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 400;
            let w = img.width;
            let h = img.height;
            if (w > h) {
                if (w > MAX_SIZE) { h = (h * MAX_SIZE) / w; w = MAX_SIZE; }
            } else {
                if (h > MAX_SIZE) { w = (w * MAX_SIZE) / h; h = MAX_SIZE; }
            }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            currentVehicleImage = canvas.toDataURL('image/jpeg', 0.7);
            updateImagePreview(currentVehicleImage);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function updateImagePreview(src) {
    const imgTag = document.getElementById('vehicleImageTag');
    const placeholder = document.querySelector('#vehicleImagePreview .placeholder-icon');
    const uploadArea = document.getElementById('vehicleImageUpload');
    const removeBtn = document.getElementById('btnRemoveImage');
    const uploadText = uploadArea.querySelector('.upload-main');

    if (src) {
        imgTag.src = src;
        imgTag.style.display = 'block';
        placeholder.style.display = 'none';
        uploadArea.classList.add('has-image');
        removeBtn.style.display = 'flex';
        uploadText.textContent = 'คลิกเพื่อเปลี่ยนรูป';
    } else {
        imgTag.src = '';
        imgTag.style.display = 'none';
        placeholder.style.display = 'block';
        uploadArea.classList.remove('has-image');
        removeBtn.style.display = 'none';
        uploadText.textContent = 'คลิกเพื่ออัปโหลดรูปรถ';
    }
}

function clearVehicleImage() {
    currentVehicleImage = '';
    document.getElementById('vehicleImageInput').value = '';
    updateImagePreview(null);
}

function resetVehicleForm() {
    document.getElementById('vehicleId').value = '';
    document.getElementById('vehicleBrand').value = '';
    document.getElementById('vehicleModel').value = '';
    document.getElementById('vehicleYear').value = '';
    document.getElementById('vehiclePlate').value = '';
    document.getElementById('vehicleColor').value = '';
    document.getElementById('vehicleMileage').value = '';
    document.getElementById('vehicleNotes').value = '';
    clearVehicleImage();
}

function saveVehicle() {
    const id = document.getElementById('vehicleId').value;
    const vehicle = {
        id: id || generateId(),
        brand: document.getElementById('vehicleBrand').value.trim(),
        model: document.getElementById('vehicleModel').value.trim(),
        year: document.getElementById('vehicleYear').value,
        plate: document.getElementById('vehiclePlate').value.trim(),
        color: document.getElementById('vehicleColor').value.trim(),
        mileage: document.getElementById('vehicleMileage').value,
        notes: document.getElementById('vehicleNotes').value.trim(),
        image: currentVehicleImage,
        createdAt: id ? undefined : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const vehicles = DB.getVehicles();
    if (id) {
        const idx = vehicles.findIndex(v => v.id === id);
        if (idx !== -1) {
            vehicle.createdAt = vehicles[idx].createdAt;
            // Keep existing image if not changed
            if (!currentVehicleImage && vehicles[idx].image) {
                vehicle.image = vehicles[idx].image;
            }
            vehicles[idx] = vehicle;
        }
        showToast('อัปเดตข้อมูลรถสำเร็จ');
    } else {
        vehicles.push(vehicle);
        showToast('เพิ่มรถใหม่สำเร็จ');
    }

    DB.saveVehicles(vehicles);
    closeModal('vehicleModal');
    renderVehicles();
    renderDashboard();
    updateVehicleSelects();
}

function editVehicle(id) {
    const vehicles = DB.getVehicles();
    const v = vehicles.find(v => v.id === id);
    if (!v) return;

    document.getElementById('vehicleModalTitle').textContent = 'แก้ไขข้อมูลรถ';
    document.getElementById('vehicleId').value = v.id;
    document.getElementById('vehicleBrand').value = v.brand;
    document.getElementById('vehicleModel').value = v.model;
    document.getElementById('vehicleYear').value = v.year || '';
    document.getElementById('vehiclePlate').value = v.plate;
    document.getElementById('vehicleColor').value = v.color || '';
    document.getElementById('vehicleMileage').value = v.mileage || '';
    document.getElementById('vehicleNotes').value = v.notes || '';
    // Set image preview
    if (v.image) {
        currentVehicleImage = v.image;
        updateImagePreview(v.image);
    } else {
        clearVehicleImage();
    }
    openModal('vehicleModal');
}

function deleteVehicle(id) {
    const v = DB.getVehicles().find(v => v.id === id);
    deleteTarget = { type: 'vehicle', id };
    document.getElementById('deleteMessage').textContent = `คุณต้องการลบ "${v.brand} ${v.model} (${v.plate})" หรือไม่? บันทึกการซ่อมของรถคันนี้จะถูกลบด้วย`;
    openModal('deleteModal');
}

function confirmDelete() {
    if (!deleteTarget) return;

    if (deleteTarget.type === 'vehicle') {
        let vehicles = DB.getVehicles().filter(v => v.id !== deleteTarget.id);
        DB.saveVehicles(vehicles);
        // Also remove associated records
        let records = DB.getRecords().filter(r => r.vehicleId !== deleteTarget.id);
        DB.saveRecords(records);
        // Also remove associated fuel logs
        let fuelLogs = DB.getFuelLogs().filter(f => f.vehicleId !== deleteTarget.id);
        DB.saveFuelLogs(fuelLogs);
        // Also remove associated charge logs
        let chargeLogs = DB.getChargeLogs().filter(c => c.vehicleId !== deleteTarget.id);
        DB.saveChargeLogs(chargeLogs);
        showToast('ลบรถและบันทึกที่เกี่ยวข้องแล้ว');
        renderVehicles();
    } else if (deleteTarget.type === 'record') {
        let records = DB.getRecords().filter(r => r.id !== deleteTarget.id);
        DB.saveRecords(records);
        showToast('ลบบันทึกการซ่อมแล้ว');
        renderRecords();
    } else if (deleteTarget.type === 'fuel') {
        let fuelLogs = DB.getFuelLogs().filter(f => f.id !== deleteTarget.id);
        DB.saveFuelLogs(fuelLogs);
        showToast('ลบบันทึกการเติมน้ำมันแล้ว');
        renderFuelLogs();
    } else if (deleteTarget.type === 'charge') {
        let chargeLogs = DB.getChargeLogs().filter(l => l.id !== deleteTarget.id);
        DB.saveChargeLogs(chargeLogs);
        showToast('ลบบันทึกการชาร์จแล้ว');
        renderChargeLogs();
    }

    closeModal('deleteModal');
    renderDashboard();
    updateVehicleSelects();
    deleteTarget = null;
}

// ==========================================
// Record CRUD
// ==========================================
function initRecordForm() {
    const addBtns = [document.getElementById('btnAddRecord'), document.getElementById('btnQuickAdd')];
    addBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                resetRecordForm();
                document.getElementById('recordModalTitle').textContent = 'บันทึกการซ่อม';
                updateVehicleSelects();
                openModal('recordModal');
            });
        }
    });

    document.getElementById('recordForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveRecord();
    });

    initRecordImageUpload();
}

// ==========================================
// Record Image Upload
// ==========================================
function compressRecordImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 600;
                let w = img.width;
                let h = img.height;
                if (w > h) {
                    if (w > MAX_SIZE) { h = (h * MAX_SIZE) / w; w = MAX_SIZE; }
                } else {
                    if (h > MAX_SIZE) { w = (w * MAX_SIZE) / h; h = MAX_SIZE; }
                }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function initRecordImageUpload() {
    const dropZone = document.getElementById('recordImageDropZone');
    const fileInput = document.getElementById('recordImageInput');
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => {
        if (currentRecordImages.length < MAX_RECORD_IMAGES) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', async () => {
        await handleRecordFiles(fileInput.files);
        fileInput.value = '';
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        await handleRecordFiles(e.dataTransfer.files);
    });
}

async function handleRecordFiles(files) {
    const remaining = MAX_RECORD_IMAGES - currentRecordImages.length;
    if (remaining <= 0) {
        showToast(`สามารถเพิ่มได้สูงสุด ${MAX_RECORD_IMAGES} รูป`, 'error');
        return;
    }

    const validFiles = Array.from(files)
        .filter(f => f.type.startsWith('image/'))
        .slice(0, remaining);

    if (validFiles.length === 0) return;

    if (Array.from(files).filter(f => f.type.startsWith('image/')).length > remaining) {
        showToast(`เลือกได้อีก ${remaining} รูป (สูงสุด ${MAX_RECORD_IMAGES} รูป)`, 'info');
    }

    for (const file of validFiles) {
        const base64 = await compressRecordImage(file);
        currentRecordImages.push(base64);
    }
    renderRecordImagePreviews();
}

function renderRecordImagePreviews() {
    const grid = document.getElementById('recordImagesGrid');
    const dropZone = document.getElementById('recordImageDropZone');
    if (!grid) return;

    // Hide drop zone if max reached
    if (dropZone) {
        dropZone.classList.toggle('hidden-upload', currentRecordImages.length >= MAX_RECORD_IMAGES);
    }

    if (currentRecordImages.length === 0) {
        grid.innerHTML = '';
        return;
    }

    let html = currentRecordImages.map((img, idx) => `
        <div class="record-image-thumb">
            <img src="${img}" alt="รูปที่ ${idx + 1}">
            <button type="button" class="btn-remove-thumb" onclick="removeRecordImage(${idx})" title="ลบรูป">&times;</button>
        </div>
    `).join('');

    // Add button if not maxed
    if (currentRecordImages.length < MAX_RECORD_IMAGES) {
        html += `
            <div class="record-images-add-btn" onclick="document.getElementById('recordImageInput').click()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                เพิ่มรูป
            </div>
        `;
    }

    grid.innerHTML = html;
}

function removeRecordImage(idx) {
    currentRecordImages.splice(idx, 1);
    renderRecordImagePreviews();
}

function resetRecordForm() {
    document.getElementById('recordId').value = '';
    document.getElementById('recordVehicle').value = '';
    document.getElementById('recordDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('recordType').value = '';
    document.getElementById('recordStatus').value = 'completed';
    document.getElementById('recordShop').value = '';
    document.getElementById('recordDescription').value = '';
    document.getElementById('recordMileage').value = '';
    document.getElementById('recordCost').value = '';
    document.getElementById('recordNextDate').value = '';
    document.getElementById('recordNextMileage').value = '';
    document.getElementById('recordNotes').value = '';
    currentRecordImages = [];
    renderRecordImagePreviews();
}

function saveRecord() {
    const vehicleId = document.getElementById('recordVehicle').value;
    if (!vehicleId) {
        showToast('กรุณาเลือกรถ', 'error');
        return;
    }

    const vehicles = DB.getVehicles();
    if (!vehicles.find(v => v.id === vehicleId)) {
        showToast('ไม่พบข้อมูลรถที่เลือก', 'error');
        return;
    }

    const id = document.getElementById('recordId').value;
    const record = {
        id: id || generateId(),
        vehicleId,
        date: document.getElementById('recordDate').value,
        type: document.getElementById('recordType').value,
        status: document.getElementById('recordStatus').value,
        shop: document.getElementById('recordShop').value.trim(),
        description: document.getElementById('recordDescription').value.trim(),
        mileage: document.getElementById('recordMileage').value,
        cost: parseFloat(document.getElementById('recordCost').value) || 0,
        nextDate: document.getElementById('recordNextDate').value,
        nextMileage: document.getElementById('recordNextMileage').value,
        notes: document.getElementById('recordNotes').value.trim(),
        images: [...currentRecordImages],
        createdAt: id ? undefined : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const records = DB.getRecords();
    if (id) {
        const idx = records.findIndex(r => r.id === id);
        if (idx !== -1) {
            record.createdAt = records[idx].createdAt;
            records[idx] = record;
        }
        showToast('อัปเดตบันทึกการซ่อมสำเร็จ');
    } else {
        records.push(record);
        showToast('บันทึกการซ่อมสำเร็จ');
    }

    // Update vehicle mileage if provided
    if (record.mileage) {
        const vIdx = vehicles.findIndex(v => v.id === vehicleId);
        if (vIdx !== -1 && (!vehicles[vIdx].mileage || Number(record.mileage) > Number(vehicles[vIdx].mileage))) {
            vehicles[vIdx].mileage = record.mileage;
            DB.saveVehicles(vehicles);
        }
    }

    DB.saveRecords(records);
    closeModal('recordModal');
    renderRecords();
    renderDashboard();
}

function editRecord(id) {
    const records = DB.getRecords();
    const r = records.find(r => r.id === id);
    if (!r) return;

    updateVehicleSelects();
    document.getElementById('recordModalTitle').textContent = 'แก้ไขบันทึกการซ่อม';
    document.getElementById('recordId').value = r.id;
    document.getElementById('recordVehicle').value = r.vehicleId;
    document.getElementById('recordDate').value = r.date;
    document.getElementById('recordType').value = r.type;
    document.getElementById('recordStatus').value = r.status;
    document.getElementById('recordShop').value = r.shop;
    document.getElementById('recordDescription').value = r.description;
    document.getElementById('recordMileage').value = r.mileage || '';
    document.getElementById('recordCost').value = r.cost;
    document.getElementById('recordNextDate').value = r.nextDate || '';
    document.getElementById('recordNextMileage').value = r.nextMileage || '';
    document.getElementById('recordNotes').value = r.notes || '';
    currentRecordImages = r.images ? [...r.images] : [];
    renderRecordImagePreviews();
    openModal('recordModal');
}

function deleteRecord(id) {
    deleteTarget = { type: 'record', id };
    document.getElementById('deleteMessage').textContent = 'คุณต้องการลบบันทึกการซ่อมนี้หรือไม่?';
    openModal('deleteModal');
}

// ==========================================
// Vehicle Select Updates
// ==========================================
function updateVehicleSelects() {
    const vehicles = DB.getVehicles();
    const selects = [
        document.getElementById('recordVehicle'),
        document.getElementById('filterVehicle'),
        document.getElementById('fuelVehicle'),
        document.getElementById('filterFuelVehicle'),
        document.getElementById('chargeVehicle'),
        document.getElementById('filterChargeVehicle')
    ];

    selects.forEach(sel => {
        if (!sel) return;
        const currentVal = sel.value;
        const firstOption = sel.querySelector('option:first-child');
        sel.innerHTML = '';
        if (firstOption) {
            sel.appendChild(firstOption);
        }

        vehicles.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = `${v.brand} ${v.model} (${v.plate})`;
            sel.appendChild(opt);
        });

        sel.value = currentVal;
    });
}


// ==========================================
// Renderers
// ==========================================

// Pixel Game Dashboard
function renderPixelDashboard() {
    const vehicles = DB.getVehicles();
    const records = DB.getRecords();
    const fuelLogs = DB.getFuelLogs();
    const chargeLogs = DB.getChargeLogs();

    // --- Stats ---
    const totalRepairCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
    const totalFuelCost = fuelLogs.reduce((sum, f) => sum + (f.totalCost || 0), 0);
    const totalChargeCost = chargeLogs.reduce((sum, c) => sum + (c.totalCost || 0), 0);

    document.getElementById('pixelStatCars').textContent = vehicles.length + ' คัน';
    document.getElementById('pixelStatRepair').textContent = formatCurrency(totalRepairCost);
    document.getElementById('pixelStatFuel').textContent = formatCurrency(totalFuelCost);
    document.getElementById('pixelStatCharge').textContent = formatCurrency(totalChargeCost);

    // --- Level & Bars ---
    const totalActivities = records.length + fuelLogs.length + chargeLogs.length;
    const level = Math.max(1, Math.floor(totalActivities / 10) + 1);
    const xpCurrent = totalActivities % 50;
    const xpMax = 50;
    const hpMax = 100;
    // HP = % of vehicles with at least one activity
    const activeVehicleIds = new Set([
        ...records.map(r => r.vehicleId),
        ...fuelLogs.map(f => f.vehicleId),
        ...chargeLogs.map(c => c.vehicleId)
    ]);
    const hpCurrent = vehicles.length > 0
        ? Math.round((activeVehicleIds.size / vehicles.length) * hpMax)
        : (vehicles.length === 0 ? 0 : hpMax);

    document.getElementById('pixelLevel').textContent = level;
    document.getElementById('pixelHpBar').style.width = Math.max(hpCurrent, 0) + '%';
    document.getElementById('pixelHpText').textContent = hpCurrent + '/' + hpMax;
    document.getElementById('pixelXpBar').style.width = ((xpCurrent / xpMax) * 100) + '%';
    document.getElementById('pixelXpText').textContent = xpCurrent + '/' + xpMax;

    // --- Quest Log (Recent Activities) ---
    const questLog = document.getElementById('pixelQuestLog');
    const activities = [];

    records.forEach(r => {
        const typeInfo = REPAIR_TYPES[r.type] || REPAIR_TYPES.other;
        activities.push({
            date: r.date,
            type: 'repair',
            emoji: typeInfo.emoji,
            title: typeInfo.label,
            meta: `${getVehicleShort(r.vehicleId)} · ${r.shop || '-'}`,
            cost: r.cost || 0,
            badgeClass: 'repair',
            badgeLabel: '⚔ ซ่อม'
        });
    });

    fuelLogs.forEach(f => {
        const fuelInfo = (typeof FUEL_TYPES !== 'undefined' && FUEL_TYPES[f.fuelType]) || { emoji: '⛽', label: f.fuelType || 'น้ำมัน' };
        activities.push({
            date: f.date,
            type: 'fuel',
            emoji: fuelInfo.emoji,
            title: `เติม${fuelInfo.label}`,
            meta: `${getVehicleShort(f.vehicleId)}${f.liters ? ' · ' + f.liters + ' ลิตร' : ''}`,
            cost: f.totalCost || 0,
            badgeClass: 'fuel',
            badgeLabel: '🧪 เติม'
        });
    });

    chargeLogs.forEach(c => {
        const chargeInfo = (typeof CHARGE_TYPES !== 'undefined' && CHARGE_TYPES[c.chargeType]) || { emoji: '⚡', label: c.chargeType || 'ชาร์จ' };
        activities.push({
            date: c.date,
            type: 'charge',
            emoji: chargeInfo.emoji || '⚡',
            title: `ชาร์จ ${chargeInfo.label || 'EV'}`,
            meta: `${getVehicleShort(c.vehicleId)}${c.kwh ? ' · ' + c.kwh + ' kWh' : ''}`,
            cost: c.totalCost || 0,
            badgeClass: 'charge',
            badgeLabel: '⚡ ชาร์จ'
        });
    });

    activities.sort((a, b) => new Date(b.date) - new Date(a.date));
    const recentQuests = activities.slice(0, 8);

    if (recentQuests.length === 0) {
        questLog.innerHTML = `
            <div class="pixel-empty-quest">
                <span>ยังไม่มี Quest...</span>
                <span class="pixel-hint">เริ่มบันทึกการซ่อม เติมน้ำมัน หรือชาร์จไฟ!</span>
            </div>`;
    } else {
        questLog.innerHTML = recentQuests.map(a => `
            <div class="pixel-quest-item">
                <div class="pixel-quest-icon">${a.emoji}</div>
                <div class="pixel-quest-info">
                    <span class="pixel-quest-name">${a.title}</span>
                    <span class="pixel-quest-meta">📅 ${formatDate(a.date)} · ${a.meta}</span>
                </div>
                <span class="pixel-quest-badge ${a.badgeClass}">${a.badgeLabel}</span>
                <span class="pixel-quest-reward">${formatCurrency(a.cost)}</span>
            </div>`).join('');
    }

    // --- Upcoming Quests ---
    const upcomingContainer = document.getElementById('pixelUpcomingQuests');
    const upcomingRecords = records
        .filter(r => r.nextDate && daysUntil(r.nextDate) !== null)
        .sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate))
        .slice(0, 5);

    if (upcomingRecords.length === 0) {
        upcomingContainer.innerHTML = `
            <div class="pixel-empty-quest">
                <span>ไม่มี Quest ที่จะถึง</span>
                <span class="pixel-hint">ระบุวันนัดซ่อมครั้งถัดไปเมื่อบันทึก</span>
            </div>`;
    } else {
        upcomingContainer.innerHTML = upcomingRecords.map(r => {
            const nextDate = new Date(r.nextDate);
            const days = daysUntil(r.nextDate);
            const isOverdue = days < 0;
            const isToday = days === 0;
            const daysText = isOverdue
                ? `เกิน ${Math.abs(days)} วัน!`
                : isToday ? '🔥 วันนี้!' : `อีก ${days} วัน`;
            const daysClass = isOverdue ? 'overdue' : isToday ? 'today' : '';

            return `
                <div class="pixel-upcoming-item">
                    <div class="pixel-upcoming-date">
                        <span class="day">${nextDate.getDate()}</span>
                        <span class="month">${THAI_MONTHS[nextDate.getMonth()]}</span>
                    </div>
                    <div class="pixel-upcoming-info">
                        <span class="title">${getVehicleShort(r.vehicleId)}</span>
                        <span class="subtitle">${(REPAIR_TYPES[r.type] || REPAIR_TYPES.other).label} - ${escapeHTML(r.shop || '-')}</span>
                    </div>
                    <span class="pixel-days-left ${daysClass}">${daysText}</span>
                </div>`;
        }).join('');
    }
}

// Dashboard
function renderDashboard() {
    const vehicles = DB.getVehicles();
    const records = DB.getRecords();
    const fuelLogs = DB.getFuelLogs();
    const chargeLogs = DB.getChargeLogs();

    // --- Stats ---
    document.getElementById('statVehicles').textContent = vehicles.length;

    const totalRepairCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
    const totalFuelCost = fuelLogs.reduce((sum, f) => sum + (f.totalCost || 0), 0);
    const totalChargeCost = chargeLogs.reduce((sum, c) => sum + (c.totalCost || 0), 0);

    document.getElementById('statRepairCost').textContent = formatCurrency(totalRepairCost);
    document.getElementById('statFuelCostAll').textContent = formatCurrency(totalFuelCost);
    document.getElementById('statChargeCostAll').textContent = formatCurrency(totalChargeCost);

    // Upcoming
    const upcomingRecords = records
        .filter(r => r.nextDate && daysUntil(r.nextDate) !== null)
        .sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate));


    // --- Unified Activity Feed ---
    const recentContainer = document.getElementById('recentRecords');
    const activities = [];

    // Add repairs
    records.forEach(r => {
        const typeInfo = REPAIR_TYPES[r.type] || REPAIR_TYPES.other;
        const statusInfo = (typeof STATUS_MAP !== 'undefined' && STATUS_MAP[r.status]) || { label: 'เสร็จสิ้น', class: 'status-completed' };
        activities.push({
            date: r.date,
            type: 'repair',
            emoji: typeInfo.emoji,
            title: typeInfo.label,
            badge: `<span class="status-badge ${statusInfo.class}">${statusInfo.label}</span>`,
            meta: `🚗 ${getVehicleShort(r.vehicleId)} · 🏪 ${r.shop || '-'}`,
            cost: r.cost || 0,
            accentColor: '#ef4444'
        });
    });

    // Add fuel logs
    fuelLogs.forEach(f => {
        const fuelInfo = (typeof FUEL_TYPES !== 'undefined' && FUEL_TYPES[f.fuelType]) || { emoji: '⛽', label: f.fuelType || 'น้ำมัน' };
        activities.push({
            date: f.date,
            type: 'fuel',
            emoji: fuelInfo.emoji,
            title: `เติม${fuelInfo.label}`,
            badge: '<span class="activity-type-badge fuel">เติมน้ำมัน</span>',
            meta: `🚗 ${getVehicleShort(f.vehicleId)} · ${f.liters ? f.liters + ' ลิตร' : ''} ${f.station ? '· ⛽ ' + escapeHTML(f.station) : ''}`,
            cost: f.totalCost || 0,
            accentColor: '#f59e0b'
        });
    });

    // Add charge logs
    chargeLogs.forEach(c => {
        const chargeInfo = (typeof CHARGE_TYPES !== 'undefined' && CHARGE_TYPES[c.chargeType]) || { emoji: '⚡', label: c.chargeType || 'ชาร์จ' };
        activities.push({
            date: c.date,
            type: 'charge',
            emoji: chargeInfo.emoji || '⚡',
            title: `ชาร์จ ${chargeInfo.label || 'EV'}`,
            badge: '<span class="activity-type-badge charge">ชาร์จไฟ</span>',
            meta: `🚗 ${getVehicleShort(c.vehicleId)} · ${c.kwh ? c.kwh + ' kWh' : ''} ${c.provider ? '· 🔌 ' + escapeHTML(c.provider) : ''}`,
            cost: c.totalCost || 0,
            accentColor: '#3b82f6'
        });
    });

    // Sort by date descending and take top 8
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));
    const recentActivities = activities.slice(0, 8);

    if (recentActivities.length === 0) {
        recentContainer.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <p>ยังไม่มีกิจกรรม</p>
                <span>เริ่มบันทึกการซ่อม เติมน้ำมัน หรือชาร์จไฟ</span>
            </div>`;
    } else {
        recentContainer.innerHTML = recentActivities.map(a => `
            <div class="record-item activity-item">
                <div class="activity-accent" style="background:${a.accentColor}"></div>
                <div class="record-type-icon">${a.emoji}</div>
                <div class="record-info">
                    <div class="title">
                        ${a.title}
                        ${a.badge}
                    </div>
                    <div class="meta">
                        <span>📅 ${formatDate(a.date)}</span>
                        <span>${a.meta}</span>
                    </div>
                </div>
                <div class="record-cost">${formatCurrency(a.cost)}</div>
            </div>`).join('');
    }

    // --- Upcoming Services (unchanged logic) ---
    const upcomingContainer = document.getElementById('upcomingServices');
    const upcomingDisplay = upcomingRecords.slice(0, 5);

    if (upcomingDisplay.length === 0) {
        upcomingContainer.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <p>ไม่มีนัดหมาย</p>
                <span>ระบุวันนัดซ่อมครั้งถัดไปเมื่อบันทึก</span>
            </div>`;
    } else {
        upcomingContainer.innerHTML = upcomingDisplay.map(r => {
            const nextDate = new Date(r.nextDate);
            const days = daysUntil(r.nextDate);
            const isOverdue = days < 0;
            const daysText = isOverdue
                ? `เกินกำหนด ${Math.abs(days)} วัน`
                : days === 0 ? 'วันนี้!' : `อีก ${days} วัน`;

            return `
                <div class="upcoming-item">
                    <div class="upcoming-date">
                        <span class="day">${nextDate.getDate()}</span>
                        <span class="month">${THAI_MONTHS[nextDate.getMonth()]}</span>
                    </div>
                    <div class="upcoming-info">
                        <div class="title">${getVehicleShort(r.vehicleId)}</div>
                        <div class="subtitle">${(REPAIR_TYPES[r.type] || REPAIR_TYPES.other).label} - ${escapeHTML(r.shop || '-')}</div>
                    </div>
                    <span class="upcoming-days-left ${isOverdue ? 'overdue' : ''}">${daysText}</span>
                </div>`;
        }).join('');
    }
}


// Vehicles
function renderVehicles() {
    const vehicles = DB.getVehicles();
    const records = DB.getRecords();
    const container = document.getElementById('vehiclesList');

    if (vehicles.length === 0) {
        container.innerHTML = `
                <div class="empty-state-large" >
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.3"><path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M5 17h-2v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2"/><path d="M9 17h6"/><path d="M14 7l3 5"/></svg>
                <h3>ยังไม่มีข้อมูลรถยนต์</h3>
                <p>เพิ่มรถคันแรกของคุณเพื่อเริ่มบันทึกการซ่อม</p>
            </div>`;
        return;
    }

    container.innerHTML = vehicles.map(v => {
        const vRecords = records.filter(r => r.vehicleId === v.id);
        const totalCost = vRecords.reduce((sum, r) => sum + (r.cost || 0), 0);
        const lastRecord = vRecords.sort((a, b) => new Date(b.date) - new Date(a.date))[0];

        const imageHtml = v.image
            ? `<div class="vehicle-card-image"><img src="${v.image}" alt="${escapeHTML(v.brand)} ${escapeHTML(v.model)}"></div>`
            : `<div class="vehicle-card-image"><div class="no-image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M5 17h-2v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2" /><path d="M9 17h6" /></svg><span>ยังไม่มีรูป</span></div></div>`;

        return `
            <div class="vehicle-card">
                ${imageHtml}
                <div class="vehicle-card-header">
                    <div class="vehicle-card-title">
                        <h3>${escapeHTML(v.brand)} ${escapeHTML(v.model)}</h3>
                        <span class="plate">🔖 ${escapeHTML(v.plate)}</span>
                    </div>
                    <div class="vehicle-card-actions">
                        <button class="btn-icon" onclick="editVehicle('${v.id}')" title="แก้ไข">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn-icon danger" onclick="deleteVehicle('${v.id}')" title="ลบ">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>
                <div class="vehicle-card-details">
                    ${v.year ? `<div class="vehicle-detail"><span class="label">ปี</span><span class="value">${escapeHTML(v.year)}</span></div>` : ''}
                    ${v.color ? `<div class="vehicle-detail"><span class="label">สี</span><span class="value">${escapeHTML(v.color)}</span></div>` : ''}
                    <div class="vehicle-detail"><span class="label">ไมล์</span><span class="value">${v.mileage ? formatNumber(v.mileage) + ' กม.' : '-'}</span></div>
                    <div class="vehicle-detail"><span class="label">ซ่อมล่าสุด</span><span class="value">${lastRecord ? formatDate(lastRecord.date) : '-'}</span></div>
                </div>
            </div>`;
    }).join('');
}

// Records
function renderRecords() {
    const records = DB.getRecords();
    const container = document.getElementById('recordsList');

    // Apply filters
    const searchQuery = document.getElementById('searchRecords')?.value.toLowerCase() || '';
    const filterVehicle = document.getElementById('filterVehicle')?.value || '';
    const filterType = document.getElementById('filterType')?.value || '';
    const filterStatus = document.getElementById('filterStatus')?.value || '';

    let filtered = [...records];

    if (searchQuery) {
        filtered = filtered.filter(r =>
            (r.shop && r.shop.toLowerCase().includes(searchQuery)) ||
            (r.description && r.description.toLowerCase().includes(searchQuery)) ||
            (r.notes && r.notes.toLowerCase().includes(searchQuery))
        );
    }
    if (filterVehicle) {
        filtered = filtered.filter(r => r.vehicleId === filterVehicle);
    }
    if (filterType) {
        filtered = filtered.filter(r => r.type === filterType);
    }
    if (filterStatus) {
        filtered = filtered.filter(r => r.status === filterStatus);
    }

    // Sort by date descending
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filtered.length === 0) {
        container.innerHTML = `
                <div class="empty-state-large" >
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <h3>${records.length === 0 ? 'ยังไม่มีบันทึกการซ่อม' : 'ไม่พบรายการที่ตรงกับตัวกรอง'}</h3>
                <p>${records.length === 0 ? 'เพิ่มบันทึกการซ่อมครั้งแรกของคุณ' : 'ลองเปลี่ยนเงื่อนไขการค้นหา'}</p>
            </div>`;
        return;
    }

    // Build image registry for lightbox (avoid inline base64 in onclick)
    const _recordImagesMap = {};

    container.innerHTML = filtered.map(r => {
        const typeInfo = REPAIR_TYPES[r.type] || REPAIR_TYPES.other;
        const statusInfo = STATUS_MAP[r.status] || STATUS_MAP.completed;
        const images = r.images || [];
        let imagesHtml = '';
        if (images.length > 0) {
            _recordImagesMap[r.id] = images;
            const shown = images.slice(0, 4);
            imagesHtml = `<div class="record-images-strip">`;
            imagesHtml += shown.map((img, idx) =>
                `<img src="${img}" alt="รูปที่ ${idx + 1}" onclick="event.stopPropagation();openLightboxById('${r.id}', ${idx})">`
            ).join('');
            if (images.length > 4) {
                imagesHtml += `<div class="record-images-more" onclick="event.stopPropagation();openLightboxById('${r.id}', 4)">+${images.length - 4}</div>`;
            }
            imagesHtml += `</div>`;
        }

        return `
            <div class="record-card">
                <div class="record-type-icon">${typeInfo.emoji}</div>
                <div class="record-info">
                    <div class="title">
                        ${typeInfo.label}
                        <span class="status-badge ${statusInfo.class}">${statusInfo.label}</span>
                        ${images.length > 0 ? `<span style="font-size:0.78rem;color:var(--text-muted)">📷 ${images.length}</span>` : ''}
                    </div>
                    <div class="meta">
                        <span>📅 ${formatDate(r.date)}</span>
                        <span>🚗 ${getVehicleShort(r.vehicleId)}</span>
                        <span>🏪 ${escapeHTML(r.shop || '-')}</span>
                        ${r.mileage ? `<span>📍 ${formatNumber(r.mileage)} กม.</span>` : ''}
                    </div>
                    <div class="meta" style="margin-top:4px">
                        <span style="color: var(--text-secondary)">${escapeHTML(r.description || '')}</span>
                    </div>
                    ${imagesHtml}
                </div>
                <div class="record-cost">${formatCurrency(r.cost)}</div>
                <div class="record-actions">
                    <button class="btn-icon" onclick="editRecord('${r.id}')" title="แก้ไข">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-icon danger" onclick="deleteRecord('${r.id}')" title="ลบ">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>`;
    }).join('');

    // Store the map globally for lightbox access
    window._recordImagesMap = _recordImagesMap;
}

// ==========================================
// Analytics
// ==========================================
function renderAnalytics() {
    const records = DB.getRecords();
    const vehicles = DB.getVehicles();

    renderMonthlyChart(records);
    renderTypeChart(records);
    renderVehicleChart(records, vehicles);
}

function renderMonthlyChart(records) {
    const canvas = document.getElementById('monthlyChart');
    const container = canvas.parentElement;

    // Get available years
    const years = [...new Set(records.map(r => new Date(r.date).getFullYear()))].sort((a, b) => b - a);
    const yearSelect = document.getElementById('analyticsYear');
    const currentYear = new Date().getFullYear();

    yearSelect.innerHTML = '';
    if (years.length === 0) years.push(currentYear);
    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = `ปี ${y + 543} `;
        yearSelect.appendChild(opt);
    });

    yearSelect.onchange = () => renderMonthlyChart(records);
    const selectedYear = parseInt(yearSelect.value) || currentYear;

    // Calculate monthly data
    const monthlyData = new Array(12).fill(0);
    records.forEach(r => {
        const d = new Date(r.date);
        if (d.getFullYear() === selectedYear) {
            monthlyData[d.getMonth()] += r.cost || 0;
        }
    });

    const maxVal = Math.max(...monthlyData, 1);

    if (records.length === 0) {
        container.innerHTML = `
                <div class="no-data-chart" >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <span>ยังไม่มีข้อมูลสำหรับแสดงกราฟ</span>
            </div> `;
        return;
    }

    container.innerHTML = `
                <div class="bar-chart" >
                    ${monthlyData.map((val, i) => {
        const height = Math.max((val / maxVal) * 100, val > 0 ? 3 : 0.5);
        return `
                    <div class="bar-col">
                        <span class="bar-value">${val > 0 ? formatCurrency(val) : ''}</span>
                        <div class="bar" style="height: ${height}%" title="${THAI_MONTHS_FULL[i]}: ${formatCurrency(val)}"></div>
                        <span class="bar-label">${THAI_MONTHS[i]}</span>
                    </div>`;
    }).join('')
        }
        </div> `;
}

function renderTypeChart(records) {
    const canvas = document.getElementById('typeChart');
    const container = canvas.parentElement;

    if (records.length === 0) {
        container.innerHTML = `
                <div class="no-data-chart" >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/></svg>
                <span>ยังไม่มีข้อมูลสำหรับแสดงกราฟ</span>
            </div> `;
        return;
    }

    // Calculate by type
    const typeData = {};
    records.forEach(r => {
        const type = r.type || 'other';
        typeData[type] = (typeData[type] || 0) + (r.cost || 0);
    });

    const sorted = Object.entries(typeData).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((sum, [, val]) => sum + val, 0);

    // Build conic gradient angle stops
    let accumulated = 0;
    const gradientStops = [];
    sorted.forEach(([type, val]) => {
        const typeInfo = REPAIR_TYPES[type] || REPAIR_TYPES.other;
        const start = accumulated;
        accumulated += (val / total) * 360;
        gradientStops.push(`${typeInfo.color} ${start}deg ${accumulated} deg`);
    });

    const gradient = `conic - gradient(${gradientStops.join(', ')})`;

    container.innerHTML = `
                <div class="donut-chart-wrapper" >
            <div class="donut-chart" style="background: ${gradient}">
                <div class="donut-center">
                    <span class="total-label">ทั้งหมด</span>
                    <span class="total-value">${formatCurrency(total)}</span>
                </div>
            </div>
            <div class="donut-legend">
                ${sorted.map(([type, val]) => {
        const typeInfo = REPAIR_TYPES[type] || REPAIR_TYPES.other;
        const pct = ((val / total) * 100).toFixed(1);
        return `
                        <div class="legend-item">
                            <div class="legend-dot" style="background:${typeInfo.color}"></div>
                            <span class="legend-label">${typeInfo.emoji} ${typeInfo.label}</span>
                            <span class="legend-value">${formatCurrency(val)} (${pct}%)</span>
                        </div>`;
    }).join('')}
            </div>
        </div> `;
}

function renderVehicleChart(records, vehicles) {
    const canvas = document.getElementById('vehicleChart');
    const container = canvas.parentElement;

    if (records.length === 0 || vehicles.length === 0) {
        container.innerHTML = `
                <div class="no-data-chart" >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M5 17h-2v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2"/></svg>
                <span>ยังไม่มีข้อมูลสำหรับแสดงกราฟ</span>
            </div> `;
        return;
    }

    const vehicleData = {};
    records.forEach(r => {
        vehicleData[r.vehicleId] = (vehicleData[r.vehicleId] || 0) + (r.cost || 0);
    });

    const sorted = Object.entries(vehicleData)
        .map(([id, cost]) => ({ id, cost, label: getVehicleLabel(id) }))
        .sort((a, b) => b.cost - a.cost);

    const maxCost = Math.max(...sorted.map(s => s.cost), 1);

    const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

    container.innerHTML = `
                <div class="h-bar-chart" >
                    ${sorted.map((item, i) => {
        const pct = (item.cost / maxCost) * 100;
        const color = colors[i % colors.length];
        return `
                    <div class="h-bar-row">
                        <span class="h-bar-label">${item.label}</span>
                        <div class="h-bar-track">
                            <div class="h-bar-fill" style="width: ${Math.max(pct, 8)}%; background: linear-gradient(90deg, ${color}, ${color}88)">
                                <span>${formatCurrency(item.cost)}</span>
                            </div>
                        </div>
                    </div>`;
    }).join('')
        }
        </div> `;
}

// ==========================================
// Fuel Log CRUD
// ==========================================
function initFuelForm() {
    const addBtn = document.getElementById('btnAddFuel');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            resetFuelForm();
            document.getElementById('fuelModalTitle').textContent = 'บันทึกการเติมน้ำมัน';
            updateVehicleSelects();
            openModal('fuelModal');
        });
    }

    const fuelForm = document.getElementById('fuelForm');
    if (fuelForm) {
        fuelForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveFuelLog();
        });
    }

    // Auto-calculate total cost
    const litersInput = document.getElementById('fuelLiters');
    const priceInput = document.getElementById('fuelPricePerLiter');
    const totalInput = document.getElementById('fuelTotalCost');

    const autoCalc = () => {
        const liters = parseFloat(litersInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;
        if (liters > 0 && price > 0) {
            totalInput.value = (liters * price).toFixed(2);
        } else {
            totalInput.value = '';
        }
    };

    if (litersInput) litersInput.addEventListener('input', autoCalc);
    if (priceInput) priceInput.addEventListener('input', autoCalc);
}

function resetFuelForm() {
    document.getElementById('fuelId').value = '';
    document.getElementById('fuelVehicle').value = '';
    document.getElementById('fuelDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('fuelType').value = '';
    document.getElementById('fuelMileage').value = '';
    document.getElementById('fuelLiters').value = '';
    document.getElementById('fuelPricePerLiter').value = '';
    document.getElementById('fuelTotalCost').value = '';
    document.getElementById('fuelFullTank').checked = false;
    document.getElementById('fuelStation').value = '';
    document.getElementById('fuelNotes').value = '';
}

function saveFuelLog() {
    const vehicleId = document.getElementById('fuelVehicle').value;
    if (!vehicleId) {
        showToast('กรุณาเลือกรถ', 'error');
        return;
    }

    const vehicles = DB.getVehicles();
    if (!vehicles.find(v => v.id === vehicleId)) {
        showToast('ไม่พบข้อมูลรถที่เลือก', 'error');
        return;
    }

    const id = document.getElementById('fuelId').value;
    const liters = parseFloat(document.getElementById('fuelLiters').value) || 0;
    const pricePerLiter = parseFloat(document.getElementById('fuelPricePerLiter').value) || 0;
    const totalCost = parseFloat(document.getElementById('fuelTotalCost').value) || (liters * pricePerLiter);

    const fuelLog = {
        id: id || generateId(),
        vehicleId,
        date: document.getElementById('fuelDate').value,
        fuelType: document.getElementById('fuelType').value,
        mileage: document.getElementById('fuelMileage').value,
        liters,
        pricePerLiter,
        totalCost,
        fullTank: document.getElementById('fuelFullTank').checked,
        station: document.getElementById('fuelStation').value.trim(),
        notes: document.getElementById('fuelNotes').value.trim(),
        createdAt: id ? undefined : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const fuelLogs = DB.getFuelLogs();
    if (id) {
        const idx = fuelLogs.findIndex(f => f.id === id);
        if (idx !== -1) {
            fuelLog.createdAt = fuelLogs[idx].createdAt;
            fuelLogs[idx] = fuelLog;
        }
        showToast('อัปเดตบันทึกน้ำมันสำเร็จ');
    } else {
        fuelLogs.push(fuelLog);
        showToast('บันทึกการเติมน้ำมันสำเร็จ');
    }

    // Update vehicle mileage if provided
    if (fuelLog.mileage) {
        const vIdx = vehicles.findIndex(v => v.id === vehicleId);
        if (vIdx !== -1 && (!vehicles[vIdx].mileage || Number(fuelLog.mileage) > Number(vehicles[vIdx].mileage))) {
            vehicles[vIdx].mileage = fuelLog.mileage;
            DB.saveVehicles(vehicles);
        }
    }

    DB.saveFuelLogs(fuelLogs);
    closeModal('fuelModal');
    renderFuelLogs();
    renderDashboard();
}

function editFuelLog(id) {
    const fuelLogs = DB.getFuelLogs();
    const f = fuelLogs.find(f => f.id === id);
    if (!f) return;

    updateVehicleSelects();
    document.getElementById('fuelModalTitle').textContent = 'แก้ไขบันทึกน้ำมัน';
    document.getElementById('fuelId').value = f.id;
    document.getElementById('fuelVehicle').value = f.vehicleId;
    document.getElementById('fuelDate').value = f.date;
    document.getElementById('fuelType').value = f.fuelType;
    document.getElementById('fuelMileage').value = f.mileage || '';
    document.getElementById('fuelLiters').value = f.liters || '';
    document.getElementById('fuelPricePerLiter').value = f.pricePerLiter || '';
    document.getElementById('fuelTotalCost').value = f.totalCost || '';
    document.getElementById('fuelFullTank').checked = f.fullTank || false;
    document.getElementById('fuelStation').value = f.station || '';
    document.getElementById('fuelNotes').value = f.notes || '';
    openModal('fuelModal');
}

function deleteFuelLog(id) {
    const f = DB.getFuelLogs().find(f => f.id === id);
    if (!f) return;
    const typeInfo = FUEL_TYPES[f.fuelType] || { label: 'น้ำมัน' };
    deleteTarget = { type: 'fuel', id };
    document.getElementById('deleteMessage').textContent = `คุณต้องการลบบันทึกเติม "${typeInfo.label}" เมื่อ ${formatDate(f.date)} หรือไม่ ? `;
    openModal('deleteModal');
}

function calculateFuelEfficiency(vehicleId) {
    const fuelLogs = DB.getFuelLogs()
        .filter(f => f.vehicleId === vehicleId && f.fullTank && f.mileage)
        .sort((a, b) => Number(a.mileage) - Number(b.mileage));

    if (fuelLogs.length < 2) return null;

    let totalKm = 0;
    let totalLiters = 0;

    for (let i = 1; i < fuelLogs.length; i++) {
        const km = Number(fuelLogs[i].mileage) - Number(fuelLogs[i - 1].mileage);
        if (km > 0) {
            totalKm += km;
            totalLiters += fuelLogs[i].liters;
        }
    }

    if (totalLiters === 0) return null;
    return (totalKm / totalLiters).toFixed(2);
}

function renderFuelLogs() {
    const fuelLogs = DB.getFuelLogs();
    const vehicles = DB.getVehicles();

    // Summary stats
    document.getElementById('statFuelCount').textContent = fuelLogs.length;

    const totalFuelCost = fuelLogs.reduce((sum, f) => sum + (f.totalCost || 0), 0);
    document.getElementById('statFuelCost').textContent = formatCurrency(totalFuelCost);

    // Average efficiency across all vehicles
    const vehicleIds = [...new Set(fuelLogs.map(f => f.vehicleId))];
    const efficiencies = vehicleIds.map(id => calculateFuelEfficiency(id)).filter(e => e !== null);
    if (efficiencies.length > 0) {
        const avgEff = (efficiencies.reduce((s, e) => s + parseFloat(e), 0) / efficiencies.length).toFixed(2);
        document.getElementById('statFuelEfficiency').textContent = `${avgEff} กม./ ล.`;
    } else {
        document.getElementById('statFuelEfficiency').textContent = '- กม./ล.';
    }

    // Last refuel date
    const sortedAll = [...fuelLogs].sort((a, b) => new Date(b.date) - new Date(a.date));
    document.getElementById('statFuelLast').textContent = sortedAll.length > 0 ? formatDate(sortedAll[0].date) : '-';

    // Apply filters
    const searchVal = (document.getElementById('searchFuel')?.value || '').toLowerCase();
    const filterVehicle = document.getElementById('filterFuelVehicle')?.value || '';
    const filterType = document.getElementById('filterFuelType')?.value || '';

    let filtered = [...fuelLogs];

    if (searchVal) {
        filtered = filtered.filter(f =>
            (f.station || '').toLowerCase().includes(searchVal) ||
            (f.notes || '').toLowerCase().includes(searchVal)
        );
    }

    if (filterVehicle) {
        filtered = filtered.filter(f => f.vehicleId === filterVehicle);
    }

    if (filterType) {
        filtered = filtered.filter(f => f.fuelType === filterType);
    }

    // Sort by date descending
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Render list
    const container = document.getElementById('fuelLogsList');
    if (!container) return;

    if (filtered.length === 0) {
        container.innerHTML = `
                <div class="empty-state-large" >
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.3">
                    <path d="M3 22V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
                    <path d="M3 22h10" />
                    <path d="M13 10h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 6" />
                </svg>
                <h3>${searchVal || filterVehicle || filterType ? 'ไม่พบข้อมูลที่ตรงกับตัวกรอง' : 'ยังไม่มีบันทึกการเติมน้ำมัน'}</h3>
                <p>${searchVal || filterVehicle || filterType ? 'ลองเปลี่ยนเงื่อนไขการค้นหา' : 'เพิ่มบันทึกการเติมน้ำมันครั้งแรกของคุณ'}</p>
            </div> `;
        renderFuelAnalytics();
        return;
    }

    container.innerHTML = filtered.map(f => {
        const typeInfo = FUEL_TYPES[f.fuelType] || { emoji: '⛽', label: f.fuelType || 'ไม่ระบุ', color: '#94a3b8' };
        const vehicleLabel = getVehicleShort(f.vehicleId);

        return `
                <div class="record-item fuel-item" >
                <div class="record-type-icon" style="background: ${typeInfo.color}22; color: ${typeInfo.color}">${typeInfo.emoji}</div>
                <div class="record-info">
                    <div class="title">
                        ${typeInfo.label}
                        <span class="fuel-badge" style="background: ${typeInfo.color}22; color: ${typeInfo.color}; border: 1px solid ${typeInfo.color}44">${f.liters ? f.liters.toFixed(1) + ' ล.' : '-'}${f.fullTank ? ' 🔵' : ''}</span>
                    </div>
                    <div class="meta">
                        <span>📅 ${formatDate(f.date)}</span>
                        <span>🚗 ${vehicleLabel}</span>
                        ${f.station ? `<span>⛽ ${escapeHTML(f.station)}</span>` : ''}
                        ${f.mileage ? `<span>🔢 ${formatNumber(f.mileage)} กม.</span>` : ''}
                    </div>
                    ${f.pricePerLiter ? `<div class="fuel-price-detail">฿${f.pricePerLiter.toFixed(2)}/ล.</div>` : ''}
                </div>
                <div class="record-cost">${formatCurrency(f.totalCost)}</div>
                <div class="record-actions">
                    <button class="btn-icon" onclick="editFuelLog('${f.id}')" title="แก้ไข">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-icon btn-icon-danger" onclick="deleteFuelLog('${f.id}')" title="ลบ">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div> `;
    }).join('');

    // Render fuel analytics charts
    renderFuelAnalytics();
}

// ==========================================
// Fuel Analytics
// ==========================================
function renderFuelAnalytics() {
    const fuelLogs = DB.getFuelLogs();
    renderFuelMonthlyChart(fuelLogs);
    renderFuelTypeChart(fuelLogs);
    renderFuelEfficiencyChart(fuelLogs);
    renderFuelVehicleChart(fuelLogs);
    renderFuelPriceChart(fuelLogs);
}

function renderFuelMonthlyChart(fuelLogs) {
    const container = document.getElementById('fuelMonthlyChartContainer');
    if (!container) return;

    // Year select
    const years = [...new Set(fuelLogs.map(f => new Date(f.date).getFullYear()))].sort((a, b) => b - a);
    const yearSelect = document.getElementById('fuelAnalyticsYear');
    const currentYear = new Date().getFullYear();

    if (yearSelect) {
        yearSelect.innerHTML = '';
        if (years.length === 0) years.push(currentYear);
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = `ปี ${y + 543} `;
            yearSelect.appendChild(opt);
        });
        yearSelect.onchange = () => renderFuelAnalytics();
    }

    const selectedYear = parseInt(yearSelect?.value) || currentYear;

    const monthlyData = new Array(12).fill(0);
    fuelLogs.forEach(f => {
        const d = new Date(f.date);
        if (d.getFullYear() === selectedYear) {
            monthlyData[d.getMonth()] += f.totalCost || 0;
        }
    });

    const maxVal = Math.max(...monthlyData, 1);

    if (fuelLogs.length === 0) {
        container.innerHTML = `
                <div class="no-data-chart" >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 22V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M13 10h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2"/></svg>
                <span>ยังไม่มีข้อมูลสำหรับแสดงกราฟ</span>
            </div> `;
        return;
    }

    container.innerHTML = `
                <div class="bar-chart" >
                    ${monthlyData.map((val, i) => {
        const height = Math.max((val / maxVal) * 100, val > 0 ? 3 : 0.5);
        return `
                    <div class="bar-col">
                        <span class="bar-value">${val > 0 ? formatCurrency(val) : ''}</span>
                        <div class="bar fuel-bar" style="height: ${height}%" title="${THAI_MONTHS_FULL[i]}: ${formatCurrency(val)}"></div>
                        <span class="bar-label">${THAI_MONTHS[i]}</span>
                    </div>`;
    }).join('')
        }
        </div> `;
}

function renderFuelTypeChart(fuelLogs) {
    const container = document.getElementById('fuelTypeChartContainer');
    if (!container) return;

    if (fuelLogs.length === 0) {
        container.innerHTML = `
                <div class="no-data-chart" >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/></svg>
                <span>ยังไม่มีข้อมูลสำหรับแสดงกราฟ</span>
            </div> `;
        return;
    }

    const typeData = {};
    fuelLogs.forEach(f => {
        const type = f.fuelType || 'other';
        typeData[type] = (typeData[type] || 0) + (f.totalCost || 0);
    });

    const sorted = Object.entries(typeData).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((sum, [, val]) => sum + val, 0);

    let accumulated = 0;
    const gradientStops = [];
    sorted.forEach(([type, val]) => {
        const typeInfo = FUEL_TYPES[type] || { color: '#94a3b8' };
        const start = accumulated;
        accumulated += (val / total) * 360;
        gradientStops.push(`${typeInfo.color} ${start}deg ${accumulated} deg`);
    });

    const gradient = `conic - gradient(${gradientStops.join(', ')})`;

    container.innerHTML = `
                <div class="donut-chart-wrapper" >
            <div class="donut-chart" style="background: ${gradient}">
                <div class="donut-center">
                    <span class="total-label">ทั้งหมด</span>
                    <span class="total-value">${formatCurrency(total)}</span>
                </div>
            </div>
            <div class="donut-legend">
                ${sorted.map(([type, val]) => {
        const typeInfo = FUEL_TYPES[type] || { emoji: '⛽', label: type, color: '#94a3b8' };
        const pct = ((val / total) * 100).toFixed(1);
        return `
                        <div class="legend-item">
                            <div class="legend-dot" style="background:${typeInfo.color}"></div>
                            <span class="legend-label">${typeInfo.emoji} ${typeInfo.label}</span>
                            <span class="legend-value">${formatCurrency(val)} (${pct}%)</span>
                        </div>`;
    }).join('')}
            </div>
        </div> `;
}

function renderFuelEfficiencyChart(fuelLogs) {
    const container = document.getElementById('fuelEfficiencyChartContainer');
    if (!container) return;

    // Get logs with mileage and full tank, sorted by date
    const validLogs = fuelLogs
        .filter(f => f.fullTank && f.mileage && f.liters)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (validLogs.length < 2) {
        container.innerHTML = `
                <div class="no-data-chart" >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                <span>ต้องมีข้อมูลเติมเต็มถังพร้อมเลขไมล์อย่างน้อย 2 ครั้ง</span>
            </div> `;
        return;
    }

    // Calculate efficiency for consecutive full-tank fills
    const effPoints = [];
    for (let i = 1; i < validLogs.length; i++) {
        const km = Number(validLogs[i].mileage) - Number(validLogs[i - 1].mileage);
        if (km > 0 && validLogs[i].liters > 0) {
            effPoints.push({
                date: validLogs[i].date,
                efficiency: parseFloat((km / validLogs[i].liters).toFixed(2)),
                vehicle: getVehicleShort(validLogs[i].vehicleId)
            });
        }
    }

    if (effPoints.length === 0) {
        container.innerHTML = `
                <div class="no-data-chart" >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                <span>ไม่สามารถคำนวณอัตราสิ้นเปลืองได้</span>
            </div> `;
        return;
    }

    const maxEff = Math.max(...effPoints.map(p => p.efficiency), 1);
    const minEff = Math.min(...effPoints.map(p => p.efficiency));
    const range = maxEff - minEff || 1;

    container.innerHTML = `
                <div class="line-chart-wrapper" >
            <div class="line-chart-area">
                ${effPoints.map((p, i) => {
        const x = effPoints.length === 1 ? 50 : (i / (effPoints.length - 1)) * 100;
        const y = 100 - ((p.efficiency - minEff) / range) * 80 - 10;
        return `
                    <div class="line-point" style="left: ${x}%; top: ${y}%" title="${formatDate(p.date)}: ${p.efficiency} กม./ล. (${p.vehicle})">
                        <div class="line-point-dot"></div>
                        <div class="line-point-label">${p.efficiency}</div>
                    </div>`;
    }).join('')}
                <svg class="line-chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polyline fill="none" stroke="var(--accent-blue)" stroke-width="0.8"
                        points="${effPoints.map((p, i) => {
        const x = effPoints.length === 1 ? 50 : (i / (effPoints.length - 1)) * 100;
        const y = 100 - ((p.efficiency - minEff) / range) * 80 - 10;
        return `${x},${y}`;
    }).join(' ')}" />
                    <polyline fill="url(#effGrad)" stroke="none"
                        points="${effPoints.map((p, i) => {
        const x = effPoints.length === 1 ? 50 : (i / (effPoints.length - 1)) * 100;
        const y = 100 - ((p.efficiency - minEff) / range) * 80 - 10;
        return `${x},${y}`;
    }).join(' ')} 100,100 0,100" />
                    <defs>
                        <linearGradient id="effGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="var(--accent-blue)" stop-opacity="0.2"/>
                            <stop offset="100%" stop-color="var(--accent-blue)" stop-opacity="0"/>
                        </linearGradient>
                    </defs>
                </svg>
            </div>
            <div class="line-chart-labels">
                ${effPoints.length <= 8 ? effPoints.map(p => `<span>${formatDate(p.date).split(' ').slice(0, 2).join(' ')}</span>`).join('') :
            [effPoints[0], effPoints[Math.floor(effPoints.length / 2)], effPoints[effPoints.length - 1]].map(p => `<span>${formatDate(p.date).split(' ').slice(0, 2).join(' ')}</span>`).join('')}
            </div>
        </div> `;
}

function renderFuelVehicleChart(fuelLogs) {
    const container = document.getElementById('fuelVehicleChartContainer');
    if (!container) return;

    const vehicles = DB.getVehicles();

    if (fuelLogs.length === 0 || vehicles.length === 0) {
        container.innerHTML = `
                <div class="no-data-chart" >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M5 17h-2v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2"/></svg>
                <span>ยังไม่มีข้อมูลสำหรับแสดงกราฟ</span>
            </div> `;
        return;
    }

    const vehicleData = {};
    fuelLogs.forEach(f => {
        vehicleData[f.vehicleId] = (vehicleData[f.vehicleId] || 0) + (f.totalCost || 0);
    });

    const sorted = Object.entries(vehicleData)
        .map(([id, cost]) => ({ id, cost, label: getVehicleLabel(id) }))
        .sort((a, b) => b.cost - a.cost);

    const maxCost = Math.max(...sorted.map(s => s.cost), 1);
    const colors = ['#22c55e', '#16a34a', '#15803d', '#eab308', '#3b82f6', '#8b5cf6', '#ec4899'];

    container.innerHTML = `
                <div class="h-bar-chart" >
                    ${sorted.map((item, i) => {
        const pct = (item.cost / maxCost) * 100;
        const color = colors[i % colors.length];
        return `
                    <div class="h-bar-row">
                        <span class="h-bar-label">${item.label}</span>
                        <div class="h-bar-track">
                            <div class="h-bar-fill" style="width: ${Math.max(pct, 8)}%; background: linear-gradient(90deg, ${color}, ${color}88)">
                                <span>${formatCurrency(item.cost)}</span>
                            </div>
                        </div>
                    </div>`;
    }).join('')
        }
        </div> `;
}

function renderFuelPriceChart(fuelLogs) {
    const container = document.getElementById('fuelPriceChartContainer');
    if (!container) return;

    // Group by month and average price per liter
    const priceByMonth = {};
    fuelLogs.forEach(f => {
        if (!f.pricePerLiter || !f.date) return;
        const d = new Date(f.date);
        const key = `${d.getFullYear()} -${String(d.getMonth() + 1).padStart(2, '0')} `;
        if (!priceByMonth[key]) priceByMonth[key] = { total: 0, count: 0 };
        priceByMonth[key].total += f.pricePerLiter;
        priceByMonth[key].count += 1;
    });

    const sorted = Object.entries(priceByMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, data]) => ({
            month: key,
            avgPrice: parseFloat((data.total / data.count).toFixed(2)),
            label: (() => {
                const [y, m] = key.split('-');
                return `${THAI_MONTHS[parseInt(m) - 1]} ${(parseInt(y) + 543).toString().slice(-2)} `;
            })()
        }));

    if (sorted.length === 0) {
        container.innerHTML = `
                <div class="no-data-chart" >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                <span>ยังไม่มีข้อมูลราคาน้ำมัน</span>
            </div> `;
        return;
    }

    const maxPrice = Math.max(...sorted.map(s => s.avgPrice), 1);
    const minPrice = Math.min(...sorted.map(s => s.avgPrice));
    const range = maxPrice - minPrice || 1;

    container.innerHTML = `
                <div class="line-chart-wrapper" >
            <div class="line-chart-area">
                ${sorted.map((p, i) => {
        const x = sorted.length === 1 ? 50 : (i / (sorted.length - 1)) * 100;
        const y = 100 - ((p.avgPrice - minPrice) / range) * 80 - 10;
        return `
                    <div class="line-point" style="left: ${x}%; top: ${y}%" title="${p.label}: ฿${p.avgPrice}/ล.">
                        <div class="line-point-dot price-dot"></div>
                        <div class="line-point-label">฿${p.avgPrice}</div>
                    </div>`;
    }).join('')}
                <svg class="line-chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polyline fill="none" stroke="var(--accent-orange)" stroke-width="0.8"
                        points="${sorted.map((p, i) => {
        const x = sorted.length === 1 ? 50 : (i / (sorted.length - 1)) * 100;
        const y = 100 - ((p.avgPrice - minPrice) / range) * 80 - 10;
        return `${x},${y}`;
    }).join(' ')}" />
                    <polyline fill="url(#priceGrad)" stroke="none"
                        points="${sorted.map((p, i) => {
        const x = sorted.length === 1 ? 50 : (i / (sorted.length - 1)) * 100;
        const y = 100 - ((p.avgPrice - minPrice) / range) * 80 - 10;
        return `${x},${y}`;
    }).join(' ')} 100,100 0,100" />
                    <defs>
                        <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="var(--accent-orange)" stop-opacity="0.2"/>
                            <stop offset="100%" stop-color="var(--accent-orange)" stop-opacity="0"/>
                        </linearGradient>
                    </defs>
                </svg>
            </div>
            <div class="line-chart-labels">
                ${sorted.map(p => `<span>${p.label}</span>`).join('')}
            </div>
        </div> `;
}

function initFuelFilters() {
    const searchFuel = document.getElementById('searchFuel');
    const filterFuelVehicle = document.getElementById('filterFuelVehicle');
    const filterFuelType = document.getElementById('filterFuelType');

    if (searchFuel) searchFuel.addEventListener('input', renderFuelLogs);
    if (filterFuelVehicle) filterFuelVehicle.addEventListener('change', renderFuelLogs);
    if (filterFuelType) filterFuelType.addEventListener('change', renderFuelLogs);
}

// ==========================================
// Fuel Export
// ==========================================
function initFuelExport() {
    const btnCSV = document.getElementById('btnExportFuelCSV');
    const btnPDF = document.getElementById('btnExportFuelPDF');
    if (btnCSV) btnCSV.addEventListener('click', exportFuelCSV);
    if (btnPDF) btnPDF.addEventListener('click', exportFuelPDF);
}

function exportFuelCSV() {
    const fuelLogs = DB.getFuelLogs();
    const vehicles = DB.getVehicles();

    if (fuelLogs.length === 0) {
        showToast('ไม่มีข้อมูลน้ำมันสำหรับส่งออก', 'info');
        return;
    }

    const headers = ['วันที่', 'รถ', 'ทะเบียน', 'ประเภทน้ำมัน', 'จำนวนลิตร', 'ราคาต่อลิตร(บาท)', 'ราคารวม(บาท)', 'เลขไมล์', 'เติมเต็มถัง', 'ชื่อปั๊ม', 'หมายเหตุ'];

    const rows = fuelLogs.map(f => {
        const v = vehicles.find(v => v.id === f.vehicleId);
        const typeInfo = FUEL_TYPES[f.fuelType] || { label: f.fuelType || '-' };
        return [
            f.date,
            v ? `${v.brand} ${v.model} ` : 'ไม่ทราบ',
            v ? v.plate : '-',
            typeInfo.label,
            f.liters || 0,
            f.pricePerLiter || 0,
            f.totalCost || 0,
            f.mileage || '',
            f.fullTank ? 'ใช่' : 'ไม่',
            f.station || '',
            f.notes || ''
        ];
    });

    let csvContent = '\uFEFF' + headers.join(',') + '\n';
    rows.forEach(row => {
        csvContent += row.map(cell => {
            const str = String(cell).replace(/"/g, '""');
            return `"${str}"`;
        }).join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `carcare_fuel_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast('ส่งออกข้อมูลน้ำมันเป็น CSV สำเร็จ');
}

function exportFuelPDF() {
    const allFuelLogs = DB.getFuelLogs();
    const vehicles = DB.getVehicles();

    if (allFuelLogs.length === 0) {
        showToast('ไม่มีข้อมูลน้ำมันสำหรับส่งออก PDF', 'info');
        return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10001;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';

    const vehicleOptions = vehicles.map(v => {
        const count = allFuelLogs.filter(f => f.vehicleId === v.id).length;
        return `<button class="pdf-vehicle-btn" data-id="${v.id}" style="width:100%;padding:12px 16px;margin-bottom:8px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;text-align:left;font-family:inherit;font-size:0.95rem;transition:all 0.15s ease;display:flex;justify-content:space-between;align-items:center;">
            <span><strong>${v.brand} ${v.model}</strong> <span style="color:var(--text-muted);font-size:0.85rem;">${v.plate || ''}</span></span>
            <span style="color:var(--text-muted);font-size:0.8rem;">${count} รายการ</span>
        </button>`;
    }).join('');

    overlay.innerHTML = `
        <div style="background:var(--bg-secondary);border-radius:16px;padding:24px;width:90%;max-width:400px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <h3 style="margin:0 0 4px;font-size:1.1rem;color:var(--text-primary);">⛽ ส่งออกรายงานน้ำมัน PDF</h3>
            <p style="margin:0 0 16px;font-size:0.85rem;color:var(--text-muted);">เลือกรถที่ต้องการออกรายงาน</p>
            <button class="pdf-vehicle-btn" data-id="all" style="width:100%;padding:12px 16px;margin-bottom:12px;border:2px solid var(--accent-green);border-radius:10px;background:rgba(34,197,94,0.1);color:var(--accent-green);cursor:pointer;text-align:center;font-family:inherit;font-size:0.95rem;font-weight:600;transition:all 0.15s ease;">
                ⛽ ออกรายงานทุกคัน (${allFuelLogs.length} รายการ)
            </button>
            <div style="height:1px;background:var(--border-color);margin-bottom:12px;"></div>
            ${vehicleOptions}
            <button id="fuelPdfCancelBtn" style="width:100%;padding:10px;margin-top:4px;border:1px solid var(--border-color);border-radius:10px;background:transparent;color:var(--text-muted);cursor:pointer;font-family:inherit;font-size:0.9rem;">ยกเลิก</button>
        </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector('#fuelPdfCancelBtn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelectorAll('.pdf-vehicle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const selectedId = btn.dataset.id;
            overlay.remove();
            generateFuelPDF(selectedId);
        });
    });
}

function generateFuelPDF(vehicleId) {
    const allFuelLogs = DB.getFuelLogs();
    const allVehicles = DB.getVehicles();
    const isAll = vehicleId === 'all';
    const vehicles = isAll ? allVehicles : allVehicles.filter(v => v.id === vehicleId);
    const fuelLogs = isAll ? allFuelLogs : allFuelLogs.filter(f => f.vehicleId === vehicleId);

    if (fuelLogs.length === 0) {
        showToast('ไม่มีข้อมูลน้ำมันสำหรับรถคันนี้', 'info');
        return;
    }

    showToast('กำลังสร้าง PDF...', 'info');

    const today = new Date();
    const dateStr = `${today.getDate()} ${THAI_MONTHS_FULL[today.getMonth()]} ${today.getFullYear() + 543} `;
    const totalCost = fuelLogs.reduce((sum, f) => sum + (f.totalCost || 0), 0);
    const totalLiters = fuelLogs.reduce((sum, f) => sum + (f.liters || 0), 0);
    const sortedLogs = [...fuelLogs].sort((a, b) => new Date(b.date) - new Date(a.date));
    const titleText = isAll ? 'รายงานน้ำมันทุกคัน' : `${vehicles[0].brand} ${vehicles[0].model} (${vehicles[0].plate || '-'})`;

    // Vehicle summary cards
    const vehicleCards = vehicles.map(v => {
        const vLogs = fuelLogs.filter(f => f.vehicleId === v.id);
        const vCost = vLogs.reduce((sum, f) => sum + (f.totalCost || 0), 0);
        const vLiters = vLogs.reduce((sum, f) => sum + (f.liters || 0), 0);
        const eff = calculateFuelEfficiency(v.id);
        return `<div style = "background:#f0fdf4;border-radius:8px;padding:12px 16px;margin-bottom:8px;border-left:4px solid #22c55e;" >
            <div style="font-weight:700;font-size:14px;color:#14532d;">${v.brand} ${v.model} ${v.year ? '(' + v.year + ')' : ''}</div>
            <div style="font-size:12px;color:#64748b;margin-top:4px;">ทะเบียน: ${v.plate || '-'} | เติม ${vLogs.length} ครั้ง | ${vLiters.toFixed(1)} ล. | ฿${Number(vCost).toLocaleString('th-TH')}${eff ? ' | ' + eff + ' กม./ล.' : ''}</div>
        </div> `;
    }).join('');

    // Fuel type summary
    const typeCounts = {};
    const typeCosts = {};
    const typeLiters = {};
    fuelLogs.forEach(f => {
        const t = f.fuelType || 'other';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
        typeCosts[t] = (typeCosts[t] || 0) + (f.totalCost || 0);
        typeLiters[t] = (typeLiters[t] || 0) + (f.liters || 0);
    });
    const typeSummaryRows = Object.keys(typeCounts).map(t => {
        const info = FUEL_TYPES[t] || { emoji: '⛽', label: t };
        return `<tr>
            <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">${info.emoji} ${info.label}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;">${typeCounts[t]}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:12px;">${typeLiters[t].toFixed(1)} ล.</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:12px;">฿${Number(typeCosts[t]).toLocaleString('th-TH')}</td>
        </tr>`;
    }).join('');

    // Detail rows
    const logRows = sortedLogs.map((f, i) => {
        const v = vehicles.find(v => v.id === f.vehicleId);
        const typeInfo = FUEL_TYPES[f.fuelType] || { emoji: '⛽', label: f.fuelType || '-' };
        const bgColor = i % 2 === 0 ? '#ffffff' : '#f8fafc';
        return `<tr style="background:${bgColor};">
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;white-space:nowrap;">${formatDate(f.date)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;">${v ? v.plate : '-'}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;">${typeInfo.emoji} ${typeInfo.label}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;">${f.liters ? f.liters.toFixed(1) : '-'}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;">฿${f.pricePerLiter ? f.pricePerLiter.toFixed(2) : '-'}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;">${f.station || '-'}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;font-weight:600;">฿${Number(f.totalCost || 0).toLocaleString('th-TH')}</td>
        </tr>`;
    }).join('');

    // Avg price per liter
    const avgPrice = fuelLogs.length > 0 ? (fuelLogs.reduce((s, f) => s + (f.pricePerLiter || 0), 0) / fuelLogs.length).toFixed(2) : '-';

    const html = `
        <div style="font-family:'Noto Sans Thai','Inter',sans-serif;color:#1e293b;padding:0;width:100%;">
        <div style="background:linear-gradient(135deg,#14532d,#166534);color:white;padding:28px 32px;border-radius:12px;margin-bottom:24px;">
            <div style="font-size:24px;font-weight:800;">⛽ CarCare Pro — รายงานน้ำมัน</div>
            <div style="font-size:13px;opacity:0.85;margin-top:4px;">${titleText}</div>
            <div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.15);display:flex;gap:32px;flex-wrap:wrap;">
                <div><div style="font-size:10px;opacity:0.6;">วันที่สร้างรายงาน</div><div style="font-size:14px;font-weight:600;">${dateStr}</div></div>
                <div><div style="font-size:10px;opacity:0.6;">จำนวนครั้งเติม</div><div style="font-size:14px;font-weight:600;">${fuelLogs.length} ครั้ง</div></div>
                <div><div style="font-size:10px;opacity:0.6;">ปริมาณรวม</div><div style="font-size:14px;font-weight:600;">${totalLiters.toFixed(1)} ลิตร</div></div>
                <div><div style="font-size:10px;opacity:0.6;">ค่าน้ำมันรวม</div><div style="font-size:14px;font-weight:600;">฿${Number(totalCost).toLocaleString('th-TH')}</div></div>
                <div><div style="font-size:10px;opacity:0.6;">ราคาเฉลี่ย/ลิตร</div><div style="font-size:14px;font-weight:600;">฿${avgPrice}</div></div>
            </div>
        </div>

        <div style="margin-bottom:24px;">
            <div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#14532d;">🚗 ข้อมูลรถ</div>
            ${vehicleCards}
        </div>

        <div style="margin-bottom:24px;">
            <div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#14532d;">📊 สรุปตามประเภทน้ำมัน</div>
            <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">
                <thead><tr style="background:#166534;color:white;">
                    <th style="padding:8px 12px;text-align:left;font-size:11px;">ประเภท</th>
                    <th style="padding:8px 12px;text-align:center;font-size:11px;">จำนวนครั้ง</th>
                    <th style="padding:8px 12px;text-align:right;font-size:11px;">ปริมาณ</th>
                    <th style="padding:8px 12px;text-align:right;font-size:11px;">ค่าใช้จ่าย</th>
                </tr></thead>
                <tbody>${typeSummaryRows}</tbody>
            </table>
        </div>

        <div style="margin-bottom:24px;">
            <div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#14532d;">⛽ รายการเติมน้ำมันทั้งหมด</div>
            <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">
                <thead><tr style="background:#166534;color:white;">
                    <th style="padding:8px 10px;text-align:left;font-size:11px;">วันที่</th>
                    <th style="padding:8px 10px;text-align:left;font-size:11px;">ทะเบียน</th>
                    <th style="padding:8px 10px;text-align:left;font-size:11px;">ประเภท</th>
                    <th style="padding:8px 10px;text-align:right;font-size:11px;">ลิตร</th>
                    <th style="padding:8px 10px;text-align:right;font-size:11px;">ราคา/ล.</th>
                    <th style="padding:8px 10px;text-align:left;font-size:11px;">ปั๊ม</th>
                    <th style="padding:8px 10px;text-align:right;font-size:11px;">รวม</th>
                </tr></thead>
                <tbody>${logRows}</tbody>
            </table>
        </div>
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:10px;color:#94a3b8;">
            สร้างโดย CarCare Pro — ${dateStr}
        </div>
    </div> `;

    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '794px';
    document.body.appendChild(container);

    const opt = {
        margin: [10, 10, 10, 10],
        filename: `CarCarePro_Fuel_${isAll ? 'All' : (vehicles[0].plate || vehicles[0].brand).replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(opt).from(container.firstElementChild).save()
        .then(() => {
            document.body.removeChild(container);
            showToast('สร้าง PDF รายงานน้ำมันสำเร็จ');
        })
        .catch(err => {
            document.body.removeChild(container);
            console.error('Fuel PDF export error:', err);
            showToast('เกิดข้อผิดพลาดในการสร้าง PDF', 'error');
        });
}

// ==========================================
// EV Charging - Constants
// ==========================================
const CHARGE_TYPES = {
    ac_home: { emoji: '🏠', label: 'AC ชาร์จบ้าน', color: '#22c55e' },
    ac_normal: { emoji: '🔌', label: 'AC ปกติ', color: '#3b82f6' },
    dc_fast: { emoji: '⚡', label: 'DC เร็ว', color: '#f59e0b' }
};

const CHARGE_PROVIDERS = {
    home: { label: '🏠 ชาร์จบ้าน' },
    ea: { label: 'EA Anywhere' },
    pea_volta: { label: 'PEA Volta' },
    ptt_ev: { label: 'PTT EV Station' },
    sharge: { label: 'Sharge' },
    evolt: { label: 'EVolt' },
    gpx: { label: 'GPX' },
    tesla: { label: 'Tesla Supercharger' },
    other: { label: 'อื่นๆ' }
};

// ==========================================
// EV Charging - CRUD
// ==========================================
function initChargeForm() {
    const btnAdd = document.getElementById('btnAddCharge');
    const form = document.getElementById('chargeForm');
    const kwhInput = document.getElementById('chargeKwh');
    const priceInput = document.getElementById('chargePricePerKwh');
    const totalInput = document.getElementById('chargeTotalCostInput');

    if (btnAdd) btnAdd.addEventListener('click', () => {
        resetChargeForm();
        document.getElementById('chargeModalTitle').textContent = 'บันทึกการชาร์จ';
        document.getElementById('chargeDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('chargeModal').classList.add('active');
    });

    // Auto-calc total cost
    const calcTotal = () => {
        const kwh = parseFloat(kwhInput?.value) || 0;
        const price = parseFloat(priceInput?.value) || 0;
        if (totalInput) totalInput.value = kwh && price ? (kwh * price).toFixed(2) : '';
    };
    if (kwhInput) kwhInput.addEventListener('input', calcTotal);
    if (priceInput) priceInput.addEventListener('input', calcTotal);

    if (form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveChargeLog();
    });
}

function resetChargeForm() {
    document.getElementById('chargeId').value = '';
    document.getElementById('chargeForm').reset();
    document.getElementById('chargeTotalCostInput').value = '';
}

function saveChargeLog() {
    const id = document.getElementById('chargeId').value;
    const log = {
        id: id || generateId(),
        vehicleId: document.getElementById('chargeVehicle').value,
        date: document.getElementById('chargeDate').value,
        chargeType: document.getElementById('chargeType').value,
        provider: document.getElementById('chargeProvider').value,
        kwh: parseFloat(document.getElementById('chargeKwh').value) || 0,
        pricePerKwh: parseFloat(document.getElementById('chargePricePerKwh').value) || 0,
        totalCost: parseFloat(document.getElementById('chargeTotalCostInput').value) || 0,
        mileage: document.getElementById('chargeMileage').value ? parseInt(document.getElementById('chargeMileage').value) : null,
        battStart: document.getElementById('chargeBattStart').value ? parseInt(document.getElementById('chargeBattStart').value) : null,
        battEnd: document.getElementById('chargeBattEnd').value ? parseInt(document.getElementById('chargeBattEnd').value) : null,
        station: document.getElementById('chargeStation').value.trim(),
        notes: document.getElementById('chargeNotes').value.trim(),
        createdAt: id ? undefined : new Date().toISOString()
    };

    const logs = DB.getChargeLogs();
    if (id) {
        const idx = logs.findIndex(l => l.id === id);
        if (idx !== -1) { log.createdAt = logs[idx].createdAt; logs[idx] = log; }
    } else {
        logs.push(log);
    }
    DB.saveChargeLogs(logs);

    // Update vehicle mileage
    if (log.mileage) {
        const vehicles = DB.getVehicles();
        const v = vehicles.find(v => v.id === log.vehicleId);
        if (v && (!v.currentMileage || log.mileage > v.currentMileage)) {
            v.currentMileage = log.mileage;
            DB.saveVehicles(vehicles);
        }
    }

    document.getElementById('chargeModal').classList.remove('active');
    renderChargeLogs();
    showToast(id ? 'แก้ไขข้อมูลการชาร์จสำเร็จ' : 'บันทึกการชาร์จสำเร็จ');
}

function editChargeLog(id) {
    const log = DB.getChargeLogs().find(l => l.id === id);
    if (!log) return;
    document.getElementById('chargeId').value = log.id;
    document.getElementById('chargeVehicle').value = log.vehicleId;
    document.getElementById('chargeDate').value = log.date;
    document.getElementById('chargeType').value = log.chargeType;
    document.getElementById('chargeProvider').value = log.provider || '';
    document.getElementById('chargeKwh').value = log.kwh;
    document.getElementById('chargePricePerKwh').value = log.pricePerKwh;
    document.getElementById('chargeTotalCostInput').value = log.totalCost;
    document.getElementById('chargeMileage').value = log.mileage || '';
    document.getElementById('chargeBattStart').value = log.battStart ?? '';
    document.getElementById('chargeBattEnd').value = log.battEnd ?? '';
    document.getElementById('chargeStation').value = log.station || '';
    document.getElementById('chargeNotes').value = log.notes || '';
    document.getElementById('chargeModalTitle').textContent = 'แก้ไขการชาร์จ';
    document.getElementById('chargeModal').classList.add('active');
}

function deleteChargeLog(id) {
    deleteTarget = { type: 'charge', id };
    document.getElementById('deleteMessage').textContent = 'คุณต้องการลบบันทึกการชาร์จนี้หรือไม่?';
    openModal('deleteModal');
}

// ==========================================
// EV Charging - Render
// ==========================================
function renderChargeLogs() {
    const logs = DB.getChargeLogs();
    const vehicles = DB.getVehicles();

    // Stats
    const totalCount = logs.length;
    const totalCost = logs.reduce((s, l) => s + (l.totalCost || 0), 0);
    const totalKwh = logs.reduce((s, l) => s + (l.kwh || 0), 0);
    document.getElementById('chargeTotalCount').textContent = totalCount;
    document.getElementById('chargeTotalCost').textContent = formatCurrency(totalCost);
    document.getElementById('chargeTotalKwh').textContent = `${totalKwh.toFixed(1)} kWh`;

    // Efficiency: km/kWh from consecutive charges with mileage
    const sorted = [...logs].filter(l => l.mileage && l.kwh).sort((a, b) => new Date(a.date) - new Date(b.date));
    let totalKm = 0, totalKwhUsed = 0;
    for (let i = 1; i < sorted.length; i++) {
        const km = Number(sorted[i].mileage) - Number(sorted[i - 1].mileage);
        if (km > 0) { totalKm += km; totalKwhUsed += sorted[i].kwh; }
    }
    const eff = totalKwhUsed > 0 ? (totalKm / totalKwhUsed).toFixed(2) : '-';
    document.getElementById('chargeEfficiency').textContent = eff !== '-' ? `${eff} กม./ kWh` : '-';

    // Filters
    const searchVal = document.getElementById('searchCharge')?.value?.toLowerCase() || '';
    const filterVehicle = document.getElementById('filterChargeVehicle')?.value || '';
    const filterType = document.getElementById('filterChargeType')?.value || '';

    const filtered = logs
        .filter(l => !searchVal || (l.station || '').toLowerCase().includes(searchVal) || (l.notes || '').toLowerCase().includes(searchVal))
        .filter(l => !filterVehicle || l.vehicleId === filterVehicle)
        .filter(l => !filterType || l.chargeType === filterType)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    const container = document.getElementById('chargeLogsList');
    if (!container) return;

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state-large" >
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.3">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                <h3>${searchVal || filterVehicle || filterType ? 'ไม่พบข้อมูลที่ตรงกับตัวกรอง' : 'ยังไม่มีบันทึกการชาร์จ'}</h3>
                <p>${searchVal || filterVehicle || filterType ? 'ลองเปลี่ยนเงื่อนไขการค้นหา' : 'เพิ่มบันทึกการชาร์จครั้งแรกของคุณ'}</p>
            </div> `;
        renderChargeAnalytics();
        return;
    }

    container.innerHTML = filtered.map(l => {
        const typeInfo = CHARGE_TYPES[l.chargeType] || { emoji: '⚡', label: l.chargeType || 'ไม่ระบุ', color: '#94a3b8' };
        const providerInfo = CHARGE_PROVIDERS[l.provider] || { label: l.provider || '' };
        const vehicleLabel = getVehicleShort(l.vehicleId);
        const battInfo = (l.battStart !== null && l.battEnd !== null) ? `${l.battStart}% → ${l.battEnd}% ` : '';

        return `
            <div class="record-item fuel-item" >
                <div class="record-type-icon" style="background:${typeInfo.color}22;color:${typeInfo.color}">
                    ${typeInfo.emoji}
                </div>
                <div class="record-info">
                    <div class="record-title">${l.kwh.toFixed(1)} kWh — ${vehicleLabel}</div>
                    <div class="record-meta">${formatDate(l.date)} ${l.station ? '• ' + escapeHTML(l.station) : ''} ${providerInfo.label ? '• ' + escapeHTML(providerInfo.label) : ''}</div>
                    <div class="fuel-price-detail">฿${l.pricePerKwh?.toFixed(2) || '-'}/kWh ${battInfo ? '• ' + battInfo : ''}</div>
                </div>
                <div class="record-cost">${formatCurrency(l.totalCost)}</div>
                <div class="record-actions">
                    <button class="btn-icon" onclick="editChargeLog('${l.id}')" title="แก้ไข">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-icon btn-icon-danger" onclick="deleteChargeLog('${l.id}')" title="ลบ">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div> `;
    }).join('');

    renderChargeAnalytics();
}

function initChargeFilters() {
    const search = document.getElementById('searchCharge');
    const filterVehicle = document.getElementById('filterChargeVehicle');
    const filterType = document.getElementById('filterChargeType');
    if (search) search.addEventListener('input', renderChargeLogs);
    if (filterVehicle) filterVehicle.addEventListener('change', renderChargeLogs);
    if (filterType) filterType.addEventListener('change', renderChargeLogs);
}

// ==========================================
// EV Charging - Analytics
// ==========================================
function renderChargeAnalytics() {
    const logs = DB.getChargeLogs();
    renderChargeMonthlyChart(logs);
    renderChargeTypeChart(logs);
    renderChargeEfficiencyChart(logs);
    renderChargeVehicleChart(logs);
    renderChargePriceChart(logs);
}

function renderChargeMonthlyChart(logs) {
    const container = document.getElementById('chargeMonthlyChartContainer');
    if (!container) return;
    const years = [...new Set(logs.map(l => new Date(l.date).getFullYear()))].sort((a, b) => b - a);
    const yearSelect = document.getElementById('chargeAnalyticsYear');
    const currentYear = new Date().getFullYear();
    if (yearSelect) {
        yearSelect.innerHTML = '';
        if (years.length === 0) years.push(currentYear);
        years.forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = `ปี ${y + 543} `; yearSelect.appendChild(o); });
        yearSelect.onchange = () => renderChargeAnalytics();
    }
    const selectedYear = parseInt(yearSelect?.value) || currentYear;
    const monthlyData = new Array(12).fill(0);
    logs.forEach(l => { const d = new Date(l.date); if (d.getFullYear() === selectedYear) monthlyData[d.getMonth()] += l.totalCost || 0; });
    const maxVal = Math.max(...monthlyData, 1);
    if (logs.length === 0) { container.innerHTML = '<div class="no-data-chart"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg><span>ยังไม่มีข้อมูล</span></div>'; return; }
    container.innerHTML = `<div class="bar-chart" > ${monthlyData.map((val, i) => { const h = Math.max((val / maxVal) * 100, val > 0 ? 3 : 0.5); return `<div class="bar-col"><span class="bar-value">${val > 0 ? formatCurrency(val) : ''}</span><div class="bar charge-bar" style="height:${h}%" title="${THAI_MONTHS_FULL[i]}: ${formatCurrency(val)}"></div><span class="bar-label">${THAI_MONTHS[i]}</span></div>`; }).join('')}</div> `;
}

function renderChargeTypeChart(logs) {
    const container = document.getElementById('chargeTypeChartContainer');
    if (!container) return;
    if (logs.length === 0) { container.innerHTML = '<div class="no-data-chart"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/></svg><span>ยังไม่มีข้อมูล</span></div>'; return; }
    const typeData = {};
    logs.forEach(l => { const t = l.chargeType || 'dc_fast'; typeData[t] = (typeData[t] || 0) + (l.totalCost || 0); });
    const sorted = Object.entries(typeData).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    let acc = 0; const stops = [];
    sorted.forEach(([t, v]) => { const c = (CHARGE_TYPES[t] || { color: '#94a3b8' }).color; const s = acc; acc += (v / total) * 360; stops.push(`${c} ${s}deg ${acc} deg`); });
    container.innerHTML = `<div class="donut-chart-wrapper" ><div class="donut-chart" style="background:conic-gradient(${stops.join(',')})"><div class="donut-center"><span class="total-label">ทั้งหมด</span><span class="total-value">${formatCurrency(total)}</span></div></div><div class="donut-legend">${sorted.map(([t, v]) => { const ti = CHARGE_TYPES[t] || { emoji: '⚡', label: t, color: '#94a3b8' }; return `<div class="legend-item"><div class="legend-dot" style="background:${ti.color}"></div><span class="legend-label">${ti.emoji} ${ti.label}</span><span class="legend-value">${formatCurrency(v)} (${((v / total) * 100).toFixed(1)}%)</span></div>`; }).join('')}</div></div> `;
}

function renderChargeEfficiencyChart(logs) {
    const container = document.getElementById('chargeEfficiencyChartContainer');
    if (!container) return;
    const valid = logs.filter(l => l.mileage && l.kwh).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (valid.length < 2) { container.innerHTML = '<div class="no-data-chart"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><span>ต้องมีข้อมูลชาร์จพร้อมเลขไมล์อย่างน้อย 2 ครั้ง</span></div>'; return; }
    const pts = [];
    for (let i = 1; i < valid.length; i++) { const km = Number(valid[i].mileage) - Number(valid[i - 1].mileage); if (km > 0 && valid[i].kwh > 0) pts.push({ date: valid[i].date, eff: parseFloat((km / valid[i].kwh).toFixed(2)), vehicle: getVehicleShort(valid[i].vehicleId) }); }
    if (pts.length === 0) { container.innerHTML = '<div class="no-data-chart"><span>ไม่สามารถคำนวณได้</span></div>'; return; }
    const maxE = Math.max(...pts.map(p => p.eff), 1), minE = Math.min(...pts.map(p => p.eff)), range = maxE - minE || 1;
    container.innerHTML = `<div class="line-chart-wrapper" ><div class="line-chart-area">${pts.map((p, i) => { const x = pts.length === 1 ? 50 : (i / (pts.length - 1)) * 100; const y = 100 - ((p.eff - minE) / range) * 80 - 10; return `<div class="line-point" style="left:${x}%;top:${y}%" title="${formatDate(p.date)}: ${p.eff} กม./kWh"><div class="line-point-dot"></div><div class="line-point-label">${p.eff}</div></div>`; }).join('')}<svg class="line-chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline fill="none" stroke="var(--accent-blue)" stroke-width="0.8" points="${pts.map((p, i) => { const x = pts.length === 1 ? 50 : (i / (pts.length - 1)) * 100; const y = 100 - ((p.eff - minE) / range) * 80 - 10; return `${x},${y}`; }).join(' ')}"/></svg></div><div class="line-chart-labels">${pts.length <= 8 ? pts.map(p => `<span>${formatDate(p.date).split(' ').slice(0, 2).join(' ')}</span>`).join('') : [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]].map(p => `<span>${formatDate(p.date).split(' ').slice(0, 2).join(' ')}</span>`).join('')}</div></div> `;
}

function renderChargeVehicleChart(logs) {
    const container = document.getElementById('chargeVehicleChartContainer');
    if (!container) return;
    if (logs.length === 0) { container.innerHTML = '<div class="no-data-chart"><span>ยังไม่มีข้อมูล</span></div>'; return; }
    const data = {};
    logs.forEach(l => { data[l.vehicleId] = (data[l.vehicleId] || 0) + (l.totalCost || 0); });
    const sorted = Object.entries(data).map(([id, cost]) => ({ id, cost, label: getVehicleLabel(id) })).sort((a, b) => b.cost - a.cost);
    const max = Math.max(...sorted.map(s => s.cost), 1);
    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];
    container.innerHTML = `<div class="h-bar-chart" > ${sorted.map((item, i) => `<div class="h-bar-row"><span class="h-bar-label">${item.label}</span><div class="h-bar-track"><div class="h-bar-fill" style="width:${Math.max((item.cost / max) * 100, 8)}%;background:linear-gradient(90deg,${colors[i % colors.length]},${colors[i % colors.length]}88)"><span>${formatCurrency(item.cost)}</span></div></div></div>`).join('')}</div> `;
}

function renderChargePriceChart(logs) {
    const container = document.getElementById('chargePriceChartContainer');
    if (!container) return;
    const byMonth = {};
    logs.forEach(l => { if (!l.pricePerKwh || !l.date) return; const d = new Date(l.date); const k = `${d.getFullYear()} -${String(d.getMonth() + 1).padStart(2, '0')} `; if (!byMonth[k]) byMonth[k] = { total: 0, count: 0 }; byMonth[k].total += l.pricePerKwh; byMonth[k].count++; });
    const sorted = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([k, d]) => ({ month: k, avg: parseFloat((d.total / d.count).toFixed(2)), label: (() => { const [y, m] = k.split('-'); return `${THAI_MONTHS[parseInt(m) - 1]} ${(parseInt(y) + 543).toString().slice(-2)} `; })() }));
    if (sorted.length === 0) { container.innerHTML = '<div class="no-data-chart"><span>ยังไม่มีข้อมูลราคาค่าไฟ</span></div>'; return; }
    const maxP = Math.max(...sorted.map(s => s.avg), 1), minP = Math.min(...sorted.map(s => s.avg)), range = maxP - minP || 1;
    container.innerHTML = `<div class="line-chart-wrapper" ><div class="line-chart-area">${sorted.map((p, i) => { const x = sorted.length === 1 ? 50 : (i / (sorted.length - 1)) * 100; const y = 100 - ((p.avg - minP) / range) * 80 - 10; return `<div class="line-point" style="left:${x}%;top:${y}%" title="${p.label}: ฿${p.avg}/kWh"><div class="line-point-dot price-dot"></div><div class="line-point-label">฿${p.avg}</div></div>`; }).join('')}<svg class="line-chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline fill="none" stroke="var(--accent-orange)" stroke-width="0.8" points="${sorted.map((p, i) => { const x = sorted.length === 1 ? 50 : (i / (sorted.length - 1)) * 100; const y = 100 - ((p.avg - minP) / range) * 80 - 10; return `${x},${y}`; }).join(' ')}"/></svg></div><div class="line-chart-labels">${sorted.map(p => `<span>${p.label}</span>`).join('')}</div></div> `;
}

// ==========================================
// EV Charging - Export
// ==========================================
function initChargeExport() {
    const btnCSV = document.getElementById('btnExportChargeCSV');
    const btnPDF = document.getElementById('btnExportChargePDF');
    if (btnCSV) btnCSV.addEventListener('click', exportChargeCSV);
    if (btnPDF) btnPDF.addEventListener('click', exportChargePDF);
}

function exportChargeCSV() {
    const logs = DB.getChargeLogs();
    const vehicles = DB.getVehicles();
    if (logs.length === 0) { showToast('ไม่มีข้อมูลชาร์จสำหรับส่งออก', 'info'); return; }
    const headers = ['วันที่', 'รถ', 'ทะเบียน', 'ประเภทชาร์จ', 'ผู้ให้บริการ', 'พลังงาน(kWh)', 'ค่าไฟ(บาท/kWh)', 'ราคารวม(บาท)', 'เลขไมล์', '%แบตเริ่ม', '%แบตจบ', 'สถานี', 'หมายเหตุ'];
    const rows = logs.map(l => {
        const v = vehicles.find(v => v.id === l.vehicleId);
        return [l.date, v ? `${v.brand} ${v.model} ` : '-', v ? v.plate : '-', (CHARGE_TYPES[l.chargeType] || {}).label || '-', (CHARGE_PROVIDERS[l.provider] || {}).label || '-', l.kwh || 0, l.pricePerKwh || 0, l.totalCost || 0, l.mileage || '', l.battStart ?? '', l.battEnd ?? '', l.station || '', l.notes || ''];
    });
    let csv = '\uFEFF' + headers.join(',') + '\n';
    rows.forEach(r => {
        csv += r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `carcare_charge_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast('ส่งออกข้อมูลชาร์จเป็น CSV สำเร็จ');
}

function exportChargePDF() {
    const allLogs = DB.getChargeLogs();
    const vehicles = DB.getVehicles();
    if (allLogs.length === 0) { showToast('ไม่มีข้อมูลชาร์จสำหรับส่งออก PDF', 'info'); return; }
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10001;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';
    const opts = vehicles.map(v => { const c = allLogs.filter(l => l.vehicleId === v.id).length; return `<button class="pdf-vehicle-btn" data-id="${v.id}" style="width:100%;padding:12px 16px;margin-bottom:8px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;text-align:left;font-family:inherit;font-size:0.95rem;display:flex;justify-content:space-between;align-items:center;"><span><strong>${v.brand} ${v.model}</strong> <span style="color:var(--text-muted);font-size:0.85rem;">${v.plate || ''}</span></span><span style="color:var(--text-muted);font-size:0.8rem;">${c} รายการ</span></button>`; }).join('');
    overlay.innerHTML = `<div style="background:var(--bg-secondary);border-radius:16px;padding:24px;width:90%;max-width:400px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);"><h3 style="margin:0 0 4px;font-size:1.1rem;color:var(--text-primary);">⚡ ส่งออกรายงานชาร์จ PDF</h3><p style="margin:0 0 16px;font-size:0.85rem;color:var(--text-muted);">เลือกรถที่ต้องการออกรายงาน</p><button class="pdf-vehicle-btn" data-id="all" style="width:100%;padding:12px 16px;margin-bottom:12px;border:2px solid var(--accent-blue);border-radius:10px;background:rgba(59,130,246,0.1);color:var(--accent-blue);cursor:pointer;text-align:center;font-family:inherit;font-size:0.95rem;font-weight:600;">⚡ ออกรายงานทุกคัน (${allLogs.length} รายการ)</button><div style="height:1px;background:var(--border-color);margin-bottom:12px;"></div>${opts}<button id="chargePdfCancelBtn" style="width:100%;padding:10px;margin-top:4px;border:1px solid var(--border-color);border-radius:10px;background:transparent;color:var(--text-muted);cursor:pointer;font-family:inherit;font-size:0.9rem;">ยกเลิก</button></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#chargePdfCancelBtn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelectorAll('.pdf-vehicle-btn').forEach(btn => { btn.addEventListener('click', () => { overlay.remove(); generateChargePDF(btn.dataset.id); }); });
}

function generateChargePDF(vehicleId) {
    const allLogs = DB.getChargeLogs(); const allVehicles = DB.getVehicles();
    const isAll = vehicleId === 'all';
    const vehicles = isAll ? allVehicles : allVehicles.filter(v => v.id === vehicleId);
    const logs = isAll ? allLogs : allLogs.filter(l => l.vehicleId === vehicleId);
    if (logs.length === 0) { showToast('ไม่มีข้อมูลชาร์จสำหรับรถคันนี้', 'info'); return; }
    showToast('กำลังสร้าง PDF...', 'info');
    const today = new Date();
    const dateStr = `${today.getDate()} ${THAI_MONTHS_FULL[today.getMonth()]} ${today.getFullYear() + 543}`;
    const totalCost = logs.reduce((s, l) => s + (l.totalCost || 0), 0);
    const totalKwh = logs.reduce((s, l) => s + (l.kwh || 0), 0);
    const avgPrice = logs.length > 0 ? (logs.reduce((s, l) => s + (l.pricePerKwh || 0), 0) / logs.length).toFixed(2) : '-';
    const sortedLogs = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));
    const title = isAll ? 'รายงานชาร์จทุกคัน' : `${vehicles[0].brand} ${vehicles[0].model} (${vehicles[0].plate || '-'})`;
    const vCards = vehicles.map(v => { const vL = logs.filter(l => l.vehicleId === v.id); const vC = vL.reduce((s, l) => s + (l.totalCost || 0), 0); const vK = vL.reduce((s, l) => s + (l.kwh || 0), 0); return `<div style="background:#eff6ff;border-radius:8px;padding:12px 16px;margin-bottom:8px;border-left:4px solid #3b82f6;"><div style="font-weight:700;font-size:14px;color:#1e3a5f;">${v.brand} ${v.model} ${v.year ? '(' + v.year + ')' : ''}</div><div style="font-size:12px;color:#64748b;margin-top:4px;">ทะเบียน: ${v.plate || '-'} | ชาร์จ ${vL.length} ครั้ง | ${vK.toFixed(1)} kWh | ฿${Number(vC).toLocaleString('th-TH')}</div></div>`; }).join('');
    const typeData = {}; const typeCosts = {}; const typeKwh = {};
    logs.forEach(l => { const t = l.chargeType || 'dc_fast'; typeData[t] = (typeData[t] || 0) + 1; typeCosts[t] = (typeCosts[t] || 0) + (l.totalCost || 0); typeKwh[t] = (typeKwh[t] || 0) + (l.kwh || 0); });
    const typeSumRows = Object.keys(typeData).map(t => { const ti = CHARGE_TYPES[t] || { emoji: '⚡', label: t }; return `<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">${ti.emoji} ${ti.label}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;">${typeData[t]}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:12px;">${typeKwh[t].toFixed(1)} kWh</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:12px;">฿${Number(typeCosts[t]).toLocaleString('th-TH')}</td></tr>`; }).join('');
    const rows = sortedLogs.map((l, i) => { const v = vehicles.find(v => v.id === l.vehicleId); const ti = CHARGE_TYPES[l.chargeType] || { emoji: '⚡', label: '-' }; const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc'; return `<tr style="background:${bg};"><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;white-space:nowrap;">${formatDate(l.date)}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;">${v ? v.plate : '-'}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;">${ti.emoji} ${ti.label}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;">${l.kwh?.toFixed(1) || '-'}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;">฿${l.pricePerKwh?.toFixed(2) || '-'}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;">${l.station || '-'}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;font-weight:600;">฿${Number(l.totalCost || 0).toLocaleString('th-TH')}</td></tr>`; }).join('');
    const html = `<div style="font-family:'Noto Sans Thai','Inter',sans-serif;color:#1e293b;padding:0;width:100%;"><div style="background:linear-gradient(135deg,#0f172a,#1e40af);color:white;padding:28px 32px;border-radius:12px;margin-bottom:24px;"><div style="font-size:24px;font-weight:800;">⚡ CarCare Pro — รายงานการชาร์จ</div><div style="font-size:13px;opacity:0.85;margin-top:4px;">${title}</div><div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.15);display:flex;gap:32px;flex-wrap:wrap;"><div><div style="font-size:10px;opacity:0.6;">วันที่สร้าง</div><div style="font-size:14px;font-weight:600;">${dateStr}</div></div><div><div style="font-size:10px;opacity:0.6;">จำนวนครั้ง</div><div style="font-size:14px;font-weight:600;">${logs.length} ครั้ง</div></div><div><div style="font-size:10px;opacity:0.6;">พลังงานรวม</div><div style="font-size:14px;font-weight:600;">${totalKwh.toFixed(1)} kWh</div></div><div><div style="font-size:10px;opacity:0.6;">ค่าชาร์จรวม</div><div style="font-size:14px;font-weight:600;">฿${Number(totalCost).toLocaleString('th-TH')}</div></div><div><div style="font-size:10px;opacity:0.6;">ราคาเฉลี่ย/kWh</div><div style="font-size:14px;font-weight:600;">฿${avgPrice}</div></div></div></div><div style="margin-bottom:24px;"><div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#1e40af;">🚗 ข้อมูลรถ</div>${vCards}</div><div style="margin-bottom:24px;"><div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#1e40af;">📊 สรุปตามประเภทชาร์จ</div><table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;"><thead><tr style="background:#1e40af;color:white;"><th style="padding:8px 12px;text-align:left;font-size:11px;">ประเภท</th><th style="padding:8px 12px;text-align:center;font-size:11px;">จำนวน</th><th style="padding:8px 12px;text-align:right;font-size:11px;">พลังงาน</th><th style="padding:8px 12px;text-align:right;font-size:11px;">ค่าใช้จ่าย</th></tr></thead><tbody>${typeSumRows}</tbody></table></div><div style="margin-bottom:24px;"><div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#1e40af;">⚡ รายการชาร์จทั้งหมด</div><table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;"><thead><tr style="background:#1e40af;color:white;"><th style="padding:8px 10px;text-align:left;font-size:11px;">วันที่</th><th style="padding:8px 10px;text-align:left;font-size:11px;">ทะเบียน</th><th style="padding:8px 10px;text-align:left;font-size:11px;">ประเภท</th><th style="padding:8px 10px;text-align:right;font-size:11px;">kWh</th><th style="padding:8px 10px;text-align:right;font-size:11px;">฿/kWh</th><th style="padding:8px 10px;text-align:left;font-size:11px;">สถานี</th><th style="padding:8px 10px;text-align:right;font-size:11px;">รวม</th></tr></thead><tbody>${rows}</tbody></table></div><div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:10px;color:#94a3b8;">สร้างโดย CarCare Pro — ${dateStr}</div></div>`;
    const el = document.createElement('div'); el.innerHTML = html; el.style.cssText = 'position:absolute;left:-9999px;top:0;width:794px;'; document.body.appendChild(el);
    html2pdf().set({ margin: [10, 10, 10, 10], filename: `CarCarePro_Charge_${isAll ? 'All' : (vehicles[0].plate || vehicles[0].brand).replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['avoid-all', 'css', 'legacy'] } }).from(el.firstElementChild).save().then(() => { document.body.removeChild(el); showToast('สร้าง PDF รายงานชาร์จสำเร็จ'); }).catch(err => { document.body.removeChild(el); console.error('Charge PDF error:', err); showToast('เกิดข้อผิดพลาดในการสร้าง PDF', 'error'); });
}

// ==========================================
// Export
// ==========================================
function initExport() {
    document.getElementById('btnExport').addEventListener('click', exportCSV);
    document.getElementById('btnExportPDF').addEventListener('click', exportPDF);
}

function exportCSV() {
    const records = DB.getRecords();
    const vehicles = DB.getVehicles();

    if (records.length === 0) {
        showToast('ไม่มีข้อมูลสำหรับส่งออก', 'info');
        return;
    }

    const headers = ['วันที่', 'รถ', 'ทะเบียน', 'ประเภทซ่อม', 'สถานะ', 'ร้าน/อู่', 'รายละเอียด', 'เลขไมล์', 'ค่าใช้จ่าย(บาท)', 'วันนัดถัดไป', 'หมายเหตุ'];

    const rows = records.map(r => {
        const v = vehicles.find(v => v.id === r.vehicleId);
        const typeInfo = REPAIR_TYPES[r.type] || REPAIR_TYPES.other;
        const statusInfo = STATUS_MAP[r.status] || STATUS_MAP.completed;

        return [
            r.date,
            v ? `${v.brand} ${v.model}` : 'ไม่ทราบ',
            v ? v.plate : '-',
            typeInfo.label,
            statusInfo.label.replace(/[✅🔄📅]/g, '').trim(),
            r.shop || '',
            r.description || '',
            r.mileage || '',
            r.cost || 0,
            r.nextDate || '',
            r.notes || ''
        ];
    });

    // BOM for Excel to recognize UTF-8
    let csvContent = '\uFEFF' + headers.join(',') + '\n';
    rows.forEach(row => {
        csvContent += row.map(cell => {
            const str = String(cell).replace(/"/g, '""');
            return `"${str}"`;
        }).join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `carcare_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast('ส่งออกข้อมูลเป็น CSV สำเร็จ');
}

function exportPDF() {
    const allRecords = DB.getRecords();
    const vehicles = DB.getVehicles();

    if (allRecords.length === 0) {
        showToast('ไม่มีข้อมูลสำหรับส่งออก PDF', 'info');
        return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10001;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';

    const vehicleOptions = vehicles.map(v => {
        const count = allRecords.filter(r => r.vehicleId === v.id).length;
        return `<button class="pdf-vehicle-btn" data-id="${v.id}" style="width:100%;padding:12px 16px;margin-bottom:8px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;text-align:left;font-family:inherit;font-size:0.95rem;transition:all 0.15s ease;display:flex;justify-content:space-between;align-items:center;">
            <span><strong>${v.brand} ${v.model}</strong> <span style="color:var(--text-muted);font-size:0.85rem;">${v.plate || ''}</span></span>
            <span style="color:var(--text-muted);font-size:0.8rem;">${count} รายการ</span>
        </button>`;
    }).join('');

    overlay.innerHTML = `
        <div style="background:var(--bg-secondary);border-radius:16px;padding:24px;width:90%;max-width:400px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <h3 style="margin:0 0 4px;font-size:1.1rem;color:var(--text-primary);">📄 ส่งออก PDF</h3>
            <p style="margin:0 0 16px;font-size:0.85rem;color:var(--text-muted);">เลือกรถที่ต้องการออกรายงาน</p>
            <button class="pdf-vehicle-btn" data-id="all" style="width:100%;padding:12px 16px;margin-bottom:12px;border:2px solid var(--accent-blue);border-radius:10px;background:rgba(59,130,246,0.1);color:var(--accent-blue);cursor:pointer;text-align:center;font-family:inherit;font-size:0.95rem;font-weight:600;transition:all 0.15s ease;">
                📋 ออกรายงานทุกคัน (${allRecords.length} รายการ)
            </button>
            <div style="height:1px;background:var(--border-color);margin-bottom:12px;"></div>
            ${vehicleOptions}
            <button id="pdfCancelBtn" style="width:100%;padding:10px;margin-top:4px;border:1px solid var(--border-color);border-radius:10px;background:transparent;color:var(--text-muted);cursor:pointer;font-family:inherit;font-size:0.9rem;">ยกเลิก</button>
        </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector('#pdfCancelBtn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelectorAll('.pdf-vehicle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const selectedId = btn.dataset.id;
            overlay.remove();
            generatePDFForVehicle(selectedId);
        });
    });
}

function generatePDFForVehicle(vehicleId) {
    const allRecords = DB.getRecords();
    const allVehicles = DB.getVehicles();
    const isAll = vehicleId === 'all';
    const vehicles = isAll ? allVehicles : allVehicles.filter(v => v.id === vehicleId);
    const records = isAll ? allRecords : allRecords.filter(r => r.vehicleId === vehicleId);

    if (records.length === 0) {
        showToast('ไม่มีข้อมูลซ่อมสำหรับรถคันนี้', 'info');
        return;
    }

    showToast('กำลังสร้าง PDF...', 'info');

    const today = new Date();
    const dateStr = `${today.getDate()} ${THAI_MONTHS_FULL[today.getMonth()]} ${today.getFullYear() + 543}`;
    const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
    const sortedRecords = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));
    const titleText = isAll ? 'รายงานทุกคัน' : `${vehicles[0].brand} ${vehicles[0].model} (${vehicles[0].plate || '-'})`;

    const vehicleCards = vehicles.map(v => {
        const vRecords = records.filter(r => r.vehicleId === v.id);
        const vCost = vRecords.reduce((sum, r) => sum + (r.cost || 0), 0);
        return `<div style="background:#f0f9ff;border-radius:8px;padding:12px 16px;margin-bottom:8px;border-left:4px solid #3b82f6;">
            <div style="font-weight:700;font-size:14px;color:#1e3a5f;">${v.brand} ${v.model} ${v.year ? '(' + v.year + ')' : ''}</div>
            <div style="font-size:12px;color:#64748b;margin-top:4px;">ทะเบียน: ${v.plate || '-'} | ซ่อม ${vRecords.length} ครั้ง | รวม ฿${Number(vCost).toLocaleString('th-TH')}</div>
        </div>`;
    }).join('');

    const typeCounts = {};
    const typeCosts = {};
    records.forEach(r => {
        const t = r.type || 'other';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
        typeCosts[t] = (typeCosts[t] || 0) + (r.cost || 0);
    });
    const typeSummaryRows = Object.keys(typeCounts).map(t => {
        const info = REPAIR_TYPES[t] || REPAIR_TYPES.other;
        return `<tr>
            <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">${info.emoji} ${info.label}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;">${typeCounts[t]}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:12px;">฿${Number(typeCosts[t]).toLocaleString('th-TH')}</td>
        </tr>`;
    }).join('');

    const recordRows = sortedRecords.map((r, i) => {
        const v = vehicles.find(v => v.id === r.vehicleId);
        const typeInfo = REPAIR_TYPES[r.type] || REPAIR_TYPES.other;
        const bgColor = i % 2 === 0 ? '#ffffff' : '#f8fafc';
        return `<tr style="background:${bgColor};">
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;white-space:nowrap;">${formatDate(r.date)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;">${v ? v.plate : '-'}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;">${typeInfo.emoji} ${typeInfo.label}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;">${r.shop || '-'}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;">${r.description || '-'}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;font-weight:600;">฿${Number(r.cost || 0).toLocaleString('th-TH')}</td>
        </tr>`;
    }).join('');

    const html = `
    <div style="font-family:'Noto Sans Thai','Inter',sans-serif;color:#1e293b;padding:0;width:100%;">
        <div style="background:linear-gradient(135deg,#0f1729,#1e3a5f);color:white;padding:28px 32px;border-radius:12px;margin-bottom:24px;">
            <div style="font-size:24px;font-weight:800;">🚗 CarCare Pro</div>
            <div style="font-size:13px;opacity:0.85;margin-top:4px;">${titleText}</div>
            <div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.15);display:flex;gap:32px;">
                <div><div style="font-size:10px;opacity:0.6;">วันที่สร้างรายงาน</div><div style="font-size:14px;font-weight:600;">${dateStr}</div></div>
                <div><div style="font-size:10px;opacity:0.6;">จำนวนรถ</div><div style="font-size:14px;font-weight:600;">${vehicles.length} คัน</div></div>
                <div><div style="font-size:10px;opacity:0.6;">รายการซ่อม</div><div style="font-size:14px;font-weight:600;">${records.length} ครั้ง</div></div>
                <div><div style="font-size:10px;opacity:0.6;">ค่าใช้จ่ายรวม</div><div style="font-size:14px;font-weight:600;">฿${Number(totalCost).toLocaleString('th-TH')}</div></div>
            </div>
        </div>
        <div style="margin-bottom:24px;">
            <div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#0f1729;">📋 ข้อมูลรถ</div>
            ${vehicleCards}
        </div>
        <div style="margin-bottom:24px;">
            <div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#0f1729;">📊 สรุปตามประเภทการซ่อม</div>
            <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">
                <thead><tr style="background:#1e3a5f;color:white;">
                    <th style="padding:8px 12px;text-align:left;font-size:12px;">ประเภท</th>
                    <th style="padding:8px 12px;text-align:center;font-size:12px;">จำนวน</th>
                    <th style="padding:8px 12px;text-align:right;font-size:12px;">ค่าใช้จ่าย</th>
                </tr></thead>
                <tbody>${typeSummaryRows}</tbody>
                <tfoot><tr style="background:#f0f9ff;font-weight:700;">
                    <td style="padding:8px 12px;font-size:12px;">รวมทั้งหมด</td>
                    <td style="padding:8px 12px;text-align:center;font-size:12px;">${records.length}</td>
                    <td style="padding:8px 12px;text-align:right;font-size:12px;">฿${Number(totalCost).toLocaleString('th-TH')}</td>
                </tr></tfoot>
            </table>
        </div>
        <div>
            <div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#0f1729;">🔧 รายการซ่อมทั้งหมด</div>
            <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">
                <thead><tr style="background:#1e3a5f;color:white;">
                    <th style="padding:8px 10px;text-align:left;font-size:11px;">วันที่</th>
                    <th style="padding:8px 10px;text-align:left;font-size:11px;">ทะเบียน</th>
                    <th style="padding:8px 10px;text-align:left;font-size:11px;">ประเภท</th>
                    <th style="padding:8px 10px;text-align:left;font-size:11px;">ร้าน/อู่</th>
                    <th style="padding:8px 10px;text-align:left;font-size:11px;">รายละเอียด</th>
                    <th style="padding:8px 10px;text-align:right;font-size:11px;">ค่าใช้จ่าย</th>
                </tr></thead>
                <tbody>${recordRows}</tbody>
            </table>
        </div>
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:10px;color:#94a3b8;">
            สร้างโดย CarCare Pro — ${dateStr}
        </div>
    </div>`;

    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '794px';
    document.body.appendChild(container);

    const opt = {
        margin: [10, 10, 10, 10],
        filename: `CarCarePro_${isAll ? 'All' : (vehicles[0].plate || vehicles[0].brand).replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(opt).from(container.firstElementChild).save()
        .then(() => {
            document.body.removeChild(container);
            showToast('สร้าง PDF สำเร็จ');
        })
        .catch(err => {
            document.body.removeChild(container);
            console.error('PDF export error:', err);
            showToast('เกิดข้อผิดพลาดในการสร้าง PDF', 'error');
        });
}

// ==========================================
// Filters
// ==========================================
function initFilters() {
    const search = document.getElementById('searchRecords');
    const filterVehicle = document.getElementById('filterVehicle');
    const filterType = document.getElementById('filterType');
    const filterStatus = document.getElementById('filterStatus');

    let timeout;
    search.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(renderRecords, 300);
    });

    filterVehicle.addEventListener('change', renderRecords);
    filterType.addEventListener('change', renderRecords);
    filterStatus.addEventListener('change', renderRecords);
}

// ==========================================
// Delete confirm (with PIN)
// ==========================================
function initDeleteConfirm() {
    document.getElementById('btnConfirmDelete').addEventListener('click', confirmDeleteWithPin);

    // Auto-focus pin digits in delete modal
    initPinDigitInputs(document.querySelectorAll('#deleteModal .pin-confirm-digit'));
}

function confirmDeleteWithPin() {
    const digits = document.querySelectorAll('#deleteModal .pin-confirm-digit');
    const pin = Array.from(digits).map(d => d.value).join('');
    const errorEl = document.getElementById('deletePinError');

    if (pin.length < 4) {
        errorEl.textContent = 'กรุณากรอกรหัส PIN 4 หลัก';
        digits.forEach(d => d.classList.add('error'));
        setTimeout(() => digits.forEach(d => d.classList.remove('error')), 1500);
        return;
    }

    if (!DB.verifyPin(pin)) {
        errorEl.textContent = 'รหัส PIN ไม่ถูกต้อง';
        digits.forEach(d => { d.value = ''; d.classList.add('error'); });
        digits[0].focus();
        setTimeout(() => digits.forEach(d => d.classList.remove('error')), 1500);
        return;
    }

    // PIN correct - proceed with delete
    errorEl.textContent = '';
    digits.forEach(d => d.value = '');
    confirmDelete();
}

// Reset delete modal PIN when opened
function resetDeletePinInputs() {
    const digits = document.querySelectorAll('#deleteModal .pin-confirm-digit');
    digits.forEach(d => { d.value = ''; d.classList.remove('error'); });
    document.getElementById('deletePinError').textContent = '';
}

// ==========================================
// PIN Setup & Login
// ==========================================
let pinSetupBuffer = '';
let pinSetupStep = 'enter'; // 'enter' or 'confirm'
let pinSetupFirst = '';
let pinLoginBuffer = '';

function initPinSystem() {
    if (!DB.hasPin()) {
        showPinSetup();
    } else if (!DB.isLoggedIn()) {
        showPinLogin();
    } else {
        showApp();
    }
}

function showPinSetup() {
    document.getElementById('authLoginScreen').style.display = 'none';
    document.getElementById('pinSetupScreen').style.display = 'flex';
    document.getElementById('pinLoginScreen').style.display = 'none';
    pinSetupBuffer = '';
    pinSetupStep = 'enter';
    pinSetupFirst = '';
    updatePinDots('pinSetupDots', 0);
    document.getElementById('pinSetupTitle').textContent = 'ตั้งรหัส PIN';
    document.getElementById('pinSetupSubtitle').textContent = 'กรุณาตั้งรหัส PIN 4 หลัก สำหรับเข้าใช้งานแอพ';
    document.getElementById('pinSetupError').textContent = '';
    initPinPad('pinSetupPad', handlePinSetupKey);
}

function showPinLogin() {
    document.getElementById('authLoginScreen').style.display = 'none';
    document.getElementById('pinLoginScreen').style.display = 'flex';
    document.getElementById('pinSetupScreen').style.display = 'none';
    pinLoginBuffer = '';
    updatePinDots('pinLoginDots', 0);
    document.getElementById('pinLoginError').textContent = '';
    initPinPad('pinLoginPad', handlePinLoginKey);
}

function showApp() {
    document.getElementById('authLoginScreen').style.display = 'none';
    document.getElementById('pinSetupScreen').style.display = 'none';
    document.getElementById('pinLoginScreen').style.display = 'none';
    DB.setLoggedIn(true);
    // Refresh UI with cloud data
    updateVehicleSelects();
    renderDashboard();
}

function updatePinDots(containerId, filled) {
    const dots = document.querySelectorAll(`#${containerId} .pin-dot`);
    dots.forEach((dot, i) => {
        dot.classList.toggle('filled', i < filled);
        dot.classList.remove('error');
    });
}

function showPinDotsError(containerId) {
    const dots = document.querySelectorAll(`#${containerId} .pin-dot`);
    const container = document.getElementById(containerId);
    dots.forEach(d => { d.classList.remove('filled'); d.classList.add('error'); });
    container.classList.add('shake');
    setTimeout(() => {
        dots.forEach(d => d.classList.remove('error'));
        container.classList.remove('shake');
    }, 500);
}

function initPinPad(padId, handler) {
    const pad = document.getElementById(padId);
    // Remove old listeners by cloning
    const newPad = pad.cloneNode(true);
    pad.parentNode.replaceChild(newPad, pad);

    newPad.querySelectorAll('.pin-key[data-key]').forEach(key => {
        key.addEventListener('click', () => {
            if (navigator.vibrate) navigator.vibrate(25);
            handler(key.dataset.key);
        });
    });
}

function handlePinSetupKey(key) {
    if (key === 'del') {
        pinSetupBuffer = pinSetupBuffer.slice(0, -1);
    } else if (pinSetupBuffer.length < 4) {
        pinSetupBuffer += key;
    }
    updatePinDots('pinSetupDots', pinSetupBuffer.length);

    if (pinSetupBuffer.length === 4) {
        setTimeout(() => {
            if (pinSetupStep === 'enter') {
                pinSetupFirst = pinSetupBuffer;
                pinSetupBuffer = '';
                pinSetupStep = 'confirm';
                updatePinDots('pinSetupDots', 0);
                document.getElementById('pinSetupTitle').textContent = 'ยืนยันรหัส PIN';
                document.getElementById('pinSetupSubtitle').textContent = 'กรุณาใส่รหัส PIN อีกครั้งเพื่อยืนยัน';
                document.getElementById('pinSetupError').textContent = '';
            } else {
                if (pinSetupBuffer === pinSetupFirst) {
                    // PIN matched - save and enter app
                    DB.setPin(pinSetupBuffer);
                    DB.setLoggedIn(true);
                    showApp();
                    showToast('ตั้งรหัส PIN สำเร็จ');
                } else {
                    // PIN mismatch - retry
                    showPinDotsError('pinSetupDots');
                    document.getElementById('pinSetupError').textContent = 'PIN ไม่ตรงกัน กรุณาลองใหม่';
                    pinSetupBuffer = '';
                    setTimeout(() => updatePinDots('pinSetupDots', 0), 500);
                }
            }
        }, 200);
    }
}

function handlePinLoginKey(key) {
    if (key === 'del') {
        pinLoginBuffer = pinLoginBuffer.slice(0, -1);
    } else if (pinLoginBuffer.length < 4) {
        pinLoginBuffer += key;
    }
    updatePinDots('pinLoginDots', pinLoginBuffer.length);

    if (pinLoginBuffer.length === 4) {
        setTimeout(() => {
            if (DB.verifyPin(pinLoginBuffer)) {
                DB.setLoggedIn(true);
                showApp();
                showToast('เข้าสู่ระบบสำเร็จ');
            } else {
                showPinDotsError('pinLoginDots');
                document.getElementById('pinLoginError').textContent = 'รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่';
                pinLoginBuffer = '';
                setTimeout(() => updatePinDots('pinLoginDots', 0), 500);
            }
        }, 200);
    }
}

// ==========================================
// PIN Digit Inputs (for modals)
// ==========================================
function initPinDigitInputs(digits) {
    digits.forEach((input, i) => {
        input.addEventListener('input', (e) => {
            const val = e.target.value.replace(/[^0-9]/g, '');
            e.target.value = val.slice(0, 1);
            if (val && i < digits.length - 1) {
                digits[i + 1].focus();
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && i > 0) {
                digits[i - 1].focus();
                digits[i - 1].value = '';
            }
        });
        input.addEventListener('focus', () => input.select());
    });
}

// ==========================================
// Settings (Change PIN)
// ==========================================
function initSettings() {
    document.getElementById('btnSettings').addEventListener('click', () => {
        // Reset all fields
        document.querySelectorAll('#settingsModal .pin-confirm-digit').forEach(d => d.value = '');
        document.getElementById('settingsPinError').textContent = '';
        openModal('settingsModal');
        // Focus first field
        setTimeout(() => {
            const first = document.querySelector('#settingsModal .settings-cur[data-idx="0"]');
            if (first) first.focus();
        }, 300);
    });

    // Init digit inputs for settings
    initPinDigitInputs(document.querySelectorAll('#settingsModal .settings-cur'));
    initPinDigitInputs(document.querySelectorAll('#settingsModal .settings-new'));
    initPinDigitInputs(document.querySelectorAll('#settingsModal .settings-confirm'));

    document.getElementById('btnSavePin').addEventListener('click', saveNewPin);

    // Logout (Firebase + PIN)
    document.getElementById('btnLogout').addEventListener('click', () => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10001;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';
        overlay.innerHTML = `
            <div style="background:var(--bg-secondary);border-radius:16px;padding:24px;width:90%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;">
                <div style="font-size:2.5rem;margin-bottom:12px;">🚪</div>
                <h3 style="margin:0 0 8px;font-size:1.1rem;color:var(--text-primary);">ออกจากระบบ</h3>
                <p style="margin:0 0 20px;font-size:0.9rem;color:var(--text-muted);">คุณต้องการออกจากระบบใช่หรือไม่?</p>
                <div style="display:flex;gap:12px;">
                    <button id="logoutCancel" style="flex:1;padding:10px;border:1px solid var(--border-color);border-radius:10px;background:transparent;color:var(--text-primary);cursor:pointer;font-family:inherit;font-size:0.9rem;">ยกเลิก</button>
                    <button id="logoutConfirm" style="flex:1;padding:10px;border:none;border-radius:10px;background:#ef4444;color:white;cursor:pointer;font-family:inherit;font-size:0.9rem;font-weight:600;">ออกจากระบบ</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('#logoutCancel').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#logoutConfirm').addEventListener('click', () => {
            overlay.remove();
            DB.setLoggedIn(false);
            DB.stopRealtimeSync();
            fireAuth.signOut();
            showAuthLogin();
            showToast('ออกจากระบบแล้ว', 'info');
        });
    });
}

function saveNewPin() {
    const curDigits = document.querySelectorAll('#settingsModal .settings-cur');
    const newDigits = document.querySelectorAll('#settingsModal .settings-new');
    const confirmDigits = document.querySelectorAll('#settingsModal .settings-confirm');
    const errorEl = document.getElementById('settingsPinError');

    const curPin = Array.from(curDigits).map(d => d.value).join('');
    const newPin = Array.from(newDigits).map(d => d.value).join('');
    const confirmPin = Array.from(confirmDigits).map(d => d.value).join('');

    if (curPin.length < 4) {
        errorEl.textContent = 'กรุณากรอก PIN ปัจจุบันให้ครบ 4 หลัก';
        return;
    }
    if (!DB.verifyPin(curPin)) {
        errorEl.textContent = 'PIN ปัจจุบันไม่ถูกต้อง';
        curDigits.forEach(d => { d.value = ''; d.classList.add('error'); });
        curDigits[0].focus();
        setTimeout(() => curDigits.forEach(d => d.classList.remove('error')), 1500);
        return;
    }
    if (newPin.length < 4) {
        errorEl.textContent = 'กรุณากรอก PIN ใหม่ให้ครบ 4 หลัก';
        return;
    }
    if (newPin !== confirmPin) {
        errorEl.textContent = 'PIN ใหม่ไม่ตรงกัน';
        confirmDigits.forEach(d => { d.value = ''; d.classList.add('error'); });
        confirmDigits[0].focus();
        setTimeout(() => confirmDigits.forEach(d => d.classList.remove('error')), 1500);
        return;
    }

    DB.setPin(newPin);
    closeModal('settingsModal');
    showToast('เปลี่ยนรหัส PIN สำเร็จ');
}

// ==========================================
// Firebase Auth
// ==========================================
function showAuthLogin() {
    document.getElementById('authLoginScreen').style.display = 'flex';
    document.getElementById('pinSetupScreen').style.display = 'none';
    document.getElementById('pinLoginScreen').style.display = 'none';
}

function hideAllScreens() {
    document.getElementById('authLoginScreen').style.display = 'none';
    document.getElementById('pinSetupScreen').style.display = 'none';
    document.getElementById('pinLoginScreen').style.display = 'none';
}

function initAuth() {
    document.getElementById('btnGoogleLogin').addEventListener('click', async () => {
        const errorEl = document.getElementById('authError');
        errorEl.textContent = '';
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            await fireAuth.signInWithPopup(provider);
            // onAuthStateChanged will handle the rest
        } catch (err) {
            console.error('Google login error:', err);
            if (err.code === 'auth/popup-blocked') {
                errorEl.textContent = 'บราวเซอร์บล็อก popup กรุณาอนุญาต popup แล้วลองใหม่';
            } else if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
                // User cancelled, do nothing
            } else {
                errorEl.textContent = 'เกิดข้อผิดพลาด: ' + (err.message || err.code);
            }
        }
    });

    // Check auth switch
    fireAuth.onAuthStateChanged(user => {
        if (user) {
            DB._userId = user.uid;

            // Set User Profile UI
            const profileEl = document.getElementById('userProfile');
            if (profileEl) {
                profileEl.style.display = 'flex';
                document.getElementById('userProfilePic').src = user.photoURL || 'icon.svg';
                document.getElementById('userProfileName').textContent = user.displayName || 'ผู้ใช้งาน';
                document.getElementById('userProfileEmail').textContent = user.email || '';
            }

            DB.migrateLocalData().then(() => {
                DB.loadFromCloud().then(() => {
                    DB.startRealtimeSync();
                    initPinSystem();
                    document.getElementById('authLoginScreen').style.display = 'none';
                });
            });
        } else {
            DB._userId = null;

            // Hide User Profile UI
            const profileEl = document.getElementById('userProfile');
            if (profileEl) profileEl.style.display = 'none';

            DB.stopRealtimeSync();
            showAuthLogin();
        }
    });
}

// ==========================================
// Lightbox
// ==========================================
let lightboxImages = [];
let lightboxIndex = 0;

function openLightbox(images, startIdx) {
    if (typeof images === 'string') {
        try { images = JSON.parse(images); } catch (e) { images = [images]; }
    }
    lightboxImages = images;
    lightboxIndex = startIdx || 0;
    updateLightbox();
    document.getElementById('lightboxOverlay').classList.add('active');
}

function openLightboxById(recordId, startIdx) {
    const images = (window._recordImagesMap && window._recordImagesMap[recordId]) || [];
    if (images.length === 0) return;
    openLightbox(images, startIdx);
}

function closeLightbox() {
    document.getElementById('lightboxOverlay').classList.remove('active');
}

function updateLightbox() {
    document.getElementById('lightboxImg').src = lightboxImages[lightboxIndex];
    document.getElementById('lightboxCounter').textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
    document.getElementById('lightboxPrev').style.display = lightboxImages.length > 1 ? '' : 'none';
    document.getElementById('lightboxNext').style.display = lightboxImages.length > 1 ? '' : 'none';
}

function initLightbox() {
    document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
    document.getElementById('lightboxOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeLightbox();
    });
    document.getElementById('lightboxPrev').addEventListener('click', () => {
        lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
        updateLightbox();
    });
    document.getElementById('lightboxNext').addEventListener('click', () => {
        lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
        updateLightbox();
    });
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('lightboxOverlay').classList.contains('active')) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') {
            lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
            updateLightbox();
        }
        if (e.key === 'ArrowRight') {
            lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
            updateLightbox();
        }
    });
}

// ==========================================
// Initialize App
// ==========================================
function init() {
    // Theme first (visual, no data dependency)
    initTheme();

    // UI event listeners (no data dependency)
    initNavigation();
    initModals();
    initVehicleForm();
    initRecordForm();
    initFuelForm();
    initFilters();
    initFuelFilters();
    initFuelExport();
    initChargeForm();
    initChargeFilters();
    initChargeExport();
    initExport();
    initDeleteConfirm();
    initSettings();
    initLightbox();

    // Firebase Auth (will trigger data load + PIN check)
    initAuth();
}

// ==========================================
// Theme Toggle
// ==========================================
function initTheme() {
    const saved = localStorage.getItem('carcare_theme') || 'dark';
    applyTheme(saved);

    document.getElementById('btnThemeToggle').addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem('carcare_theme', next);
    });
}

function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    updateThemeLabel(theme);
}

function updateThemeLabel(theme) {
    const label = document.querySelector('.theme-label');
    if (label) {
        label.textContent = theme === 'dark' ? 'เปลี่ยนเป็น Light Mode' : 'เปลี่ยนเป็น Dark Mode';
    }
}

// Override deleteVehicle and deleteRecord to reset PIN inputs when opening
const _origDeleteVehicle = deleteVehicle;
deleteVehicle = function (id) {
    _origDeleteVehicle(id);
    resetDeletePinInputs();
    setTimeout(() => {
        const first = document.querySelector('#deleteModal .pin-confirm-digit[data-idx="0"]');
        if (first) first.focus();
    }, 300);
};

const _origDeleteRecord = deleteRecord;
deleteRecord = function (id) {
    _origDeleteRecord(id);
    resetDeletePinInputs();
    setTimeout(() => {
        const first = document.querySelector('#deleteModal .pin-confirm-digit[data-idx="0"]');
        if (first) first.focus();
    }, 300);
};

const _origDeleteFuelLog = deleteFuelLog;
deleteFuelLog = function (id) {
    _origDeleteFuelLog(id);
    resetDeletePinInputs();
    setTimeout(() => {
        const first = document.querySelector('#deleteModal .pin-confirm-digit[data-idx="0"]');
        if (first) first.focus();
    }, 300);
};

const _origDeleteChargeLog = deleteChargeLog;
deleteChargeLog = function (id) {
    _origDeleteChargeLog(id);
    resetDeletePinInputs();
    setTimeout(() => {
        const first = document.querySelector('#deleteModal .pin-confirm-digit[data-idx="0"]');
        if (first) first.focus();
    }, 300);
};

// Run on DOM ready
document.addEventListener('DOMContentLoaded', init);
