// ==========================================
// 0. SİTE İÇİ BİLDİRİM SİSTEMİ (TOAST) — Tarayıcı alert() yerine
// ==========================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: '✅', error: '⚠️', warning: '⚡', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML =
        '<span class="toast-icon">' + (icons[type] || 'ℹ️') + '</span>' +
        '<span class="toast-text">' + escapeHtml(message) + '</span>';
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 400);
    }, 3500);
}

// HTML kaçışlama (kullanıcı girdilerini innerHTML'e basmadan önce)
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

// --- Site İçi Onay (Confirm) Modalı ---
let confirmCallback = null;

function showConfirm(message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-message');
    if (!modal || !msgEl) {
        if (typeof onConfirm === 'function') onConfirm();
        return;
    }
    msgEl.innerText = message;
    confirmCallback = onConfirm;
    modal.classList.remove('hidden');
    refreshScrollLock();
}

function confirmOk() {
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.add('hidden');
    const cb = confirmCallback;
    confirmCallback = null;
    if (typeof cb === 'function') cb();
    refreshScrollLock();
}

function confirmCancel() {
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.add('hidden');
    confirmCallback = null;
    refreshScrollLock();
}

// --- Masa Limiti / İletişim Modalı ---
function openLimitModal(message) {
    const modal = document.getElementById('limit-modal');
    const msgEl = document.getElementById('limit-message');
    if (modal && msgEl) {
        msgEl.innerText = message;
        modal.classList.remove('hidden');
        refreshScrollLock();
    } else {
        showToast(message, 'warning');
    }
}

function closeLimitModal() {
    const modal = document.getElementById('limit-modal');
    if (modal) modal.classList.add('hidden');
    refreshScrollLock();
}

// Açık modal varsa sayfa kaydırmasını kilitle
function refreshScrollLock() {
    const anyOpen = ['booking-modal', 'checkout-modal', 'orders-modal', 'confirm-modal', 'limit-modal'].some(function (id) {
        const m = document.getElementById(id);
        return m && !m.classList.contains('hidden');
    });
    document.body.classList.toggle('modal-open', anyOpen);
}

// Limit modalından İletişim bölümüne yönlendirme
function goToContact() {
    closeLimitModal();
    const contact = document.getElementById('contact');
    if (contact) contact.scrollIntoView({ behavior: 'smooth' });
    showToast('Daha fazla masa için iletişim hattımızdan bize ulaşabilirsiniz: 0555 111 22 33', 'info');
}

// ==========================================
// 1. TARİH & SAAT YARDIMCILARI
// ==========================================
function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function parseDateStr(s) {
    const parts = String(s).split('-').map(Number);
    return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
}

// Rezervasyonun tam tarih+saatini Date olarak döndürür
function getSlotDate(dateStr, timeStr) {
    const d = parseDateStr(dateStr);
    const [h, m] = String(timeStr).split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
}

// Rezervasyona kalan süre (dakika). Negatif = geçmiş.
function minutesUntilSlot(res) {
    return (getSlotDate(res.date, res.time).getTime() - Date.now()) / 60000;
}

// Rezervasyon saati geçmiş mi?
function isSlotPast(res) {
    return minutesUntilSlot(res) <= 0;
}

// Kalan süreyi okunur biçimde göster (ör: "1 sa 20 dk")
function formatRemaining(mins) {
    if (mins < 1) return 'az kaldı';
    if (mins < 60) return Math.floor(mins) + ' dk';
    return Math.floor(mins / 60) + ' sa ' + Math.floor(mins % 60) + ' dk';
}

// Tarihi "Bugün", "Yarın" ya da "GG.AA.YYYY" olarak göster
function formatDateLabel(dateStr) {
    if (dateStr === todayStr()) return 'Bugün';
    const t = new Date();
    t.setDate(t.getDate() + 1);
    const yar = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    if (dateStr === yar) return 'Yarın';
    const [y, m, d] = String(dateStr).split('-');
    return d + '.' + m + '.' + y;
}

// ==========================================
// 2. VERİLER (Rezervasyonlar & Siparişler)
// ==========================================
const TIME_SLOTS = ['12:00', '13:30', '15:00', '16:30', '18:00', '19:30', '21:00', '22:30'];
let currentSelectedTable = null;
let currentSelectedTime = null;
let currentSelectedDate = todayStr();
let bookedReservations = [];

// Onaylanmış siparişler — localStorage'da kalıcı
let confirmedOrders = [];
try {
    confirmedOrders = JSON.parse(localStorage.getItem('yushub_orders') || '[]');
    if (!Array.isArray(confirmedOrders)) confirmedOrders = [];
} catch (e) {
    confirmedOrders = [];
}

// Eski kayıtları yeni (tarihli) yapıya geçir
confirmedOrders.forEach(o => {
    if (o.reservation && !o.reservation.date) o.reservation.date = todayStr();
    if (o.reservation && !o.reservation.phone) o.reservation.phone = o.phone || '';
    if (!o.createdAt) o.createdAt = new Date().toISOString();
});

function saveOrders() {
    try { localStorage.setItem('yushub_orders', JSON.stringify(confirmedOrders)); } catch (e) {}
}

// ==========================================
// 3. KAT DEĞİŞTİRME
// ==========================================
function switchFloor(floorNum) {
    const floor1 = document.getElementById('floor-1');
    const floor2 = document.getElementById('floor-2');
    const buttons = document.querySelectorAll('.floor-buttons .btn');

    buttons.forEach(btn => btn.classList.remove('active'));

    if (floorNum === 1) {
        floor1.classList.remove('hidden');
        floor2.classList.add('hidden');
        buttons[0].classList.add('active');
    } else {
        floor1.classList.add('hidden');
        floor2.classList.remove('hidden');
        buttons[1].classList.add('active');
    }
}

// ==========================================
// 4. REZERVASYON MANTIĞI
// ==========================================
// Masa numarasına göre maksimum kişi kapasitesi
// (Masa 1-6: 4 Kişi | Masa 7-12: 2 Kişi | Masa 13-15: 6 Kişi)
function getTableCapacity(tableName) {
    const tableNum = parseInt(tableName.replace('Masa ', ''), 10);
    if (tableNum >= 1 && tableNum <= 6) return 4;
    if (tableNum >= 7 && tableNum <= 12) return 2;
    if (tableNum >= 13 && tableNum <= 15) return 6;
    return 4;
}

// Rezervasyon kimliği (masa + tarih + saat benzersizdir)
function reservationKey(r) {
    return r.table + '|' + (r.date || '') + '|' + r.time;
}

// Bir tarih için kullanılan masa rezervasyonu sayısı (aktif + siparişe dönüşmüş)
function countDayReservations(dateStr) {
    let count = bookedReservations.filter(r => r.date === dateStr).length;
    count += confirmedOrders.filter(o => o.reservation && o.reservation.date === dateStr).length;
    return count;
}

// Kullanım olan tüm tarihleri topla (limit özeti için)
function getUsedDates() {
    const set = {};
    bookedReservations.forEach(r => { if (r.date) set[r.date] = true; });
    confirmedOrders.forEach(o => { if (o.reservation && o.reservation.date) set[o.reservation.date] = true; });
    return Object.keys(set).sort();
}

// Bir masa+tarih+saat dolu mu? (Aktif rezervasyonlar + verilmiş siparişler)
function isSlotBooked(tableName, dateStr, timeStr) {
    if (bookedReservations.some(r => r.table === tableName && r.date === dateStr && r.time === timeStr)) return true;
    return confirmedOrders.some(o => o.reservation && o.reservation.table === tableName && o.reservation.date === dateStr && o.reservation.time === timeStr);
}

function canCancelReservation(reservation) {
    if (!reservation) return false;
    return minutesUntilSlot(reservation) > 60;
}

// Sipariş verilebilir mi? (Rezervasyon saatine 1 saatten fazla kalmışsa)
function canPlaceOrder(reservation) {
    if (!reservation) return false;
    return minutesUntilSlot(reservation) > 60;
}

// Onaylı sipariş iptal edilebilir mi? (1 saatten fazla kalmışsa; tarih bilinçli)
function canCancelOrder(order) {
    if (!order || !order.reservation || !order.reservation.time) return false;
    return minutesUntilSlot({ date: order.reservation.date || todayStr(), time: order.reservation.time }) > 60;
}

// Siparişin canlı durumu (rezervasyon saatine göre ilerler)
function computeOrderStatus(order) {
    const r = order.reservation || {};
    const mins = minutesUntilSlot({ date: r.date || todayStr(), time: r.time });
    if (mins <= 0) return 'Servis Edildi';
    if (mins <= 30) return 'Hazırlanıyor';
    return 'Onaylandı';
}

function renderTimeSlots() {
    const container = document.getElementById('time-slots-container');
    if (!container) return;
    container.innerHTML = TIME_SLOTS.map(time => {
        const booked = isSlotBooked(currentSelectedTable, currentSelectedDate, time);
        const mins = minutesUntilSlot({ date: currentSelectedDate, time });
        let disabled = false;
        let cls = '';
        let label = time;

        if (booked) {
            disabled = true; cls = 'slot-booked'; label = `${time} · Dolu`;
        } else if (mins <= 0) {
            disabled = true; cls = 'slot-past'; label = `${time} · Geçti`;
        } else if (mins < 15) {
            disabled = true; cls = 'slot-soon'; label = `${time} · Az Kaldı`;
        }

        return `<button type="button" class="${cls}" ${disabled ? 'disabled' : ''} onclick="selectTime('${time}')">${label}</button>`;
    }).join('');
}

function renderTableCancelArea() {
    const area = document.getElementById('table-cancel-area');
    if (!area) return;
    const tableBookings = bookedReservations.filter(r => r.table === currentSelectedTable);
    if (tableBookings.length === 0) {
        area.innerHTML = '';
        return;
    }
    area.innerHTML = tableBookings.map(r => `
        <button type="button" class="btn-cancel-reservation compact" onclick="cancelReservation('${r.table}', '${r.date}', '${r.time}')">
            ${r.table} — ${formatDateLabel(r.date)} ${r.time} rezervasyonunu iptal et
        </button>
    `).join('');
}

function updateReservationStatusBar() {
    const bar = document.getElementById('reservation-status-bar');
    if (!bar) return;
    if (bookedReservations.length === 0) {
        bar.classList.add('hidden');
        bar.innerHTML = '';
        return;
    }
    bar.classList.remove('hidden');

    // Tarih bazlı günlük limit özeti
    const usedDates = getUsedDates();
    const limitNotes = usedDates.map(ds => {
        const used = countDayReservations(ds);
        const label = formatDateLabel(ds);
        return `<span class="reservation-limit-pill">${label}: ${used}/2</span>`;
    }).join(' ');

    const rows = bookedReservations.map(r => {
        const past = isSlotPast(r);
        const textCls = past ? 'reservation-status-text slot-past' : 'reservation-status-text';
        const countdown = past
            ? '<span class="reservation-countdown">⏰ Geçti</span>'
            : `<span class="reservation-countdown">⏳ ${formatRemaining(minutesUntilSlot(r))} kaldı</span>`;
        const action = past
            ? '<span class="reservation-status-tag">⏰ Geçti</span>'
            : `<button type="button" class="btn-cancel-reservation" onclick="cancelReservation('${r.table}', '${r.date}', '${r.time}')">İptal Et</button>`;
        return `
        <div class="reservation-status-row">
            <div class="${textCls}">
                ${r.table} · ${formatDateLabel(r.date)} · Saat ${r.time} · ${r.guests} kişi · ${escapeHtml(r.name)}
                ${r.notes ? `<span class="reservation-status-note">📝 ${escapeHtml(r.notes)}</span>` : ''}
                ${countdown}
            </div>
            ${action}
        </div>
        `;
    }).join('');
    bar.innerHTML = `
        <div class="reservation-status-title">Aktif Rezervasyonlarınız (${bookedReservations.length})</div>
        <div class="reservation-limit-notes">${limitNotes || '<span class="reservation-limit-pill">Kullanım yok</span>'}</div>
        ${rows}
    `;
}

function cancelReservation(tableName, dateStr, timeStr) {
    const reservation = bookedReservations.find(r => r.table === tableName && r.date === dateStr && r.time === timeStr);
    if (!reservation) return;

    if (!canCancelReservation(reservation)) {
        showToast('Rezervasyon saatine 1 saatten az kaldığı için iptal edilemez.', 'error');
        return;
    }

    showConfirm(`${tableName} için ${formatDateLabel(dateStr)} ${timeStr} rezervasyonunu iptal etmek istediğinize emin misiniz?`, function () {
        bookedReservations = bookedReservations.filter(r => !(r.table === tableName && r.date === dateStr && r.time === timeStr));
        updateReservationStatusBar();
        renderReservationBanner();
        renderTimeSlots();
        renderTableCancelArea();
        closeModal();
        closeCartModal();
        showToast('Rezervasyonunuz iptal edildi. Bu saat tekrar seçilebilir.', 'success');
    });
}

// Modalı Açma
function openModal(tableName) {
    currentSelectedTable = tableName;
    document.getElementById('modal-title').innerText = `${tableName} Rezervasyonu`;

    const dateInput = document.getElementById('booking-date');
    if (dateInput) {
        dateInput.min = todayStr();
        if (!dateInput.value) dateInput.value = todayStr();
        currentSelectedDate = dateInput.value;
    }

    resetModalSteps();
    renderTimeSlots();
    renderTableCancelArea();
    renderDateLimitNote();

    document.getElementById('booking-modal').classList.remove('hidden');
    refreshScrollLock();
}

// Modalı Kapatma
function closeModal() {
    document.getElementById('booking-modal').classList.add('hidden');
    refreshScrollLock();
}

// Tarih değişince saat listesini yenile
function onBookingDateChange() {
    const dateInput = document.getElementById('booking-date');
    currentSelectedDate = dateInput ? dateInput.value : todayStr();
    renderTimeSlots();
    renderDateLimitNote();
}

// Seçilen tarih için kalan rezervasyon hakkını göster
function renderDateLimitNote() {
    const el = document.getElementById('date-limit-note');
    if (!el) return;
    const used = countDayReservations(currentSelectedDate);
    const left = Math.max(0, 2 - used);
    if (left <= 0) {
        el.className = 'date-limit-note limit-full';
        el.innerText = `⚠️ ${formatDateLabel(currentSelectedDate)} için masa limitiniz doldu (2/2).`;
    } else {
        el.className = 'date-limit-note';
        el.innerText = `📅 ${formatDateLabel(currentSelectedDate)} için kalan rezervasyon hakkınız: ${left} / 2`;
    }
}

// Saat Seçimi ve Adım 2'ye Geçiş
function selectTime(timeStr) {
    // Günlük limit kontrolü (seçilen tarih için)
    if (countDayReservations(currentSelectedDate) >= 2) {
        openLimitModal(`${formatDateLabel(currentSelectedDate)} için masa limitiniz doldu (2/2). Daha fazla masa için lütfen iletişim hattımızdan bize ulaşın: 0555 111 22 33`);
        return;
    }
    if (isSlotBooked(currentSelectedTable, currentSelectedDate, timeStr)) {
        showToast('Bu masa için seçilen saat dolu. Lütfen başka bir saat seçin.', 'warning');
        return;
    }
    const mins = minutesUntilSlot({ date: currentSelectedDate, time: timeStr });
    if (mins <= 0) {
        showToast('⏰ Bu saat geçmişte kaldığı için seçilemez.', 'error');
        return;
    }
    if (mins < 15) {
        showToast('⏰ Rezervasyon saatine 15 dakikadan az kaldığı için masa rezerve edilemez.', 'error');
        return;
    }
    currentSelectedTime = timeStr;

    document.getElementById('step-time').classList.add('hidden');
    document.getElementById('step-details').classList.remove('hidden');

    document.getElementById('selected-summary-info').innerText = `${currentSelectedTable} — ${formatDateLabel(currentSelectedDate)} Saat: ${currentSelectedTime}`;

    const guestSelect = document.getElementById('cust-guests');
    guestSelect.innerHTML = '';
    const maxCapacity = getTableCapacity(currentSelectedTable);
    for (let i = 1; i <= maxCapacity; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.innerText = `${i} Kişi ${i === maxCapacity ? '(Maksimum)' : ''}`;
        guestSelect.appendChild(opt);
    }
}

// Adımları Sıfırlama / Geri Butonu
function resetModalSteps() {
    currentSelectedTime = null;
    document.getElementById('step-time').classList.remove('hidden');
    document.getElementById('step-details').classList.add('hidden');
    document.getElementById('phone-error-msg').classList.add('hidden');
    document.getElementById('notificationArea').classList.add('hidden');

    const form = document.getElementById('reservation-form');
    if (form) form.reset();
    renderTimeSlots();
    renderTableCancelArea();
}

// ==========================================
// 5. REZERVASYON FORM GÖNDERİMİ
// ==========================================
function handleFormSubmit(event) {
    event.preventDefault();

    const name = document.getElementById('cust-name').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const guests = document.getElementById('cust-guests').value;
    const notes = document.getElementById('cust-notes').value.trim();
    const phoneError = document.getElementById('phone-error-msg');
    const notifArea = document.getElementById('notificationArea');

    const dateInput = document.getElementById('booking-date');
    const dateStr = dateInput && dateInput.value ? dateInput.value : todayStr();

    // Telefon Doğrulama (Tam 11 Rakam)
    if (phone.length !== 11 || !/^\d+$/.test(phone)) {
        phoneError.classList.remove('hidden');
        return;
    }
    phoneError.classList.add('hidden');

    if (isSlotBooked(currentSelectedTable, dateStr, currentSelectedTime)) {
        notifArea.className = 'notification-card error';
        notifArea.innerText = 'Bu masa ve saat artık dolu. Lütfen başka bir saat seçin.';
        notifArea.classList.remove('hidden');
        return;
    }

    const mins = minutesUntilSlot({ date: dateStr, time: currentSelectedTime });
    if (mins <= 0) {
        notifArea.className = 'notification-card error';
        notifArea.innerText = 'Bu saat geçmişte kaldığı için rezervasyon yapılamaz.';
        notifArea.classList.remove('hidden');
        renderTimeSlots();
        return;
    }
    if (mins < 15) {
        notifArea.className = 'notification-card error';
        notifArea.innerText = 'Rezervasyon saatine 15 dakikadan az kaldığı için masa rezerve edilemez.';
        notifArea.classList.remove('hidden');
        renderTimeSlots();
        return;
    }

    // Masa limiti: bir tarih için en fazla 2 masa (aktif + siparişe dönüşmüş toplam)
    if (countDayReservations(dateStr) >= 2) {
        openLimitModal(`Bu tarih için en fazla 2 masa rezerve edebilirsiniz. Daha fazla masa için lütfen iletişim hattımızdan bize ulaşın: 0555 111 22 33`);
        return;
    }

    showConfirm(`Sayın ${name}, ${currentSelectedTable} için ${formatDateLabel(dateStr)} ${currentSelectedTime} saatinde ${guests} kişilik rezervasyon oluşturulsun mu?`, function () {
        bookedReservations.push({
            table: currentSelectedTable,
            date: dateStr,
            time: currentSelectedTime,
            name,
            phone,
            guests,
            notes,
            createdAt: new Date().toISOString()
        });
        updateReservationStatusBar();

        notifArea.className = 'notification-card success';
        notifArea.innerText = `Sayın ${name}, ${currentSelectedTable} için ${formatDateLabel(dateStr)} ${currentSelectedTime} saatine ${guests} kişilik rezervasyonunuz başarıyla oluşturuldu. Artık sipariş oluşturabilirsiniz.`;
        notifArea.classList.remove('hidden');

        setTimeout(() => {
            closeModal();
            showToast(`${currentSelectedTable} · ${formatDateLabel(dateStr)} ${currentSelectedTime} rezervasyonunuz oluşturuldu.`, 'success');
        }, 2500);
    });
}

// ==========================================
// 6. YEMEK MENÜSÜ FİLTRE & ARAMA
// ==========================================
let currentMenuCategory = 'all';
let currentMenuSearch = '';

function applyMenuFilter() {
    const q = currentMenuSearch.toLocaleLowerCase('tr');
    document.querySelectorAll('.menu-item-card').forEach(item => {
        const cat = item.getAttribute('data-category');
        const titleEl = item.querySelector('.menu-item-title');
        const descEl = item.querySelector('.menu-item-desc');
        const title = (titleEl ? titleEl.textContent : '').toLocaleLowerCase('tr');
        const desc = (descEl ? descEl.textContent : '').toLocaleLowerCase('tr');

        const catOk = currentMenuCategory === 'all' || cat === currentMenuCategory;
        const searchOk = !q || title.indexOf(q) !== -1 || desc.indexOf(q) !== -1;
        item.classList.toggle('hidden', !(catOk && searchOk));
    });
}

function filterMenu(category, btnElement) {
    currentMenuCategory = category;
    document.querySelectorAll('.menu-category-tabs .menu-tab-btn').forEach(tab => tab.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    applyMenuFilter();
}

function searchMenu(query) {
    currentMenuSearch = query;
    applyMenuFilter();
}

// ==========================================
// 7. SEPET SİSTEMİ
// ==========================================
let cart = [];

function addToCart(id, name, price, img) {
    const existing = cart.find(item => item.id === id);
    if (existing) {
        existing.qty++;
    } else {
        cart.push({ id, name, price, img, qty: 1 });
    }
    updateCartUI();
    const allBtns = document.querySelectorAll(`[data-id="${id}"] .btn-add-to-cart`);
    allBtns.forEach(btn => {
        btn.classList.add('added');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<span>✓ Eklendi!</span>';
        setTimeout(() => {
            btn.classList.remove('added');
            btn.innerHTML = originalHTML;
        }, 1200);
    });
}

function removeFromCart(id) {
    cart = cart.filter(item => item.id !== id);
    updateCartUI();
    renderCartItems();
}

function changeQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
    updateCartUI();
    renderCartItems();
}

function clearCart() {
    showConfirm('Sepetteki tüm ürünler kaldırılacak. Emin misiniz?', function () {
        cart = [];
        updateCartUI();
        renderCartItems();
        showToast('Sepetiniz temizlendi.', 'info');
    });
}

function getCartTotal() {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function getCartCount() {
    return cart.reduce((sum, item) => sum + item.qty, 0);
}

function updateCartUI() {
    const count = getCartCount();
    const navBadge = document.getElementById('nav-cart-count');
    if (navBadge) navBadge.textContent = count;
    const floatBadge = document.getElementById('floating-cart-count');
    if (floatBadge) floatBadge.textContent = count;
    updateCartSummary();
}

function updateCartSummary() {
    const subtotal = getCartTotal();
    const count = getCartCount();
    const el = (id) => document.getElementById(id);
    if (el('cart-total-items-qty')) el('cart-total-items-qty').textContent = count;
    if (el('summary-subtotal')) el('summary-subtotal').textContent = subtotal.toLocaleString('tr-TR') + ' ₺';
    if (el('summary-grand-total')) el('summary-grand-total').textContent = subtotal.toLocaleString('tr-TR') + ' ₺';
    if (el('btn-order-price')) el('btn-order-price').textContent = subtotal.toLocaleString('tr-TR') + ' ₺';
}

// ==========================================
// 8. CHECKOUT — MASA SEÇİMİ & REZERVASYON BANNER'I
// ==========================================
function getSelectedReservation() {
    if (bookedReservations.length === 1) return bookedReservations[0];
    if (bookedReservations.length > 1) {
        const select = document.getElementById('checkout-table-select');
        const key = select ? select.value : '';
        return bookedReservations.find(r => reservationKey(r) === key) || null;
    }
    return null;
}

// Sipariş verilmiş (geçmemiş) masalar — seçim listesinde "Sipariş Verildi" olarak gösterilir
function getOrderedReservations() {
    const seen = {};
    const list = [];
    confirmedOrders.forEach(o => {
        const r = o.reservation;
        if (!r || !r.table || !r.time) return;
        const key = reservationKey(r);
        if (seen[key]) return;
        seen[key] = true;
        if (minutesUntilSlot(r) <= 0) return; // geçmiş siparişleri gösterme
        list.push(r);
    });
    return list;
}

function renderCheckoutTableSelect() {
    const group = document.getElementById('checkout-table-select-group');
    const select = document.getElementById('checkout-table-select');
    if (!group || !select) return;

    const ordered = getOrderedReservations();

    if (bookedReservations.length > 1 || ordered.length > 0) {
        group.classList.remove('hidden');
        let html = '<option value="">— Masa Seçiniz —</option>';
        html += bookedReservations.map(r => {
            const orderable = canPlaceOrder(r);
            const past = isSlotPast(r);
            let note = '';
            if (past) note = ' (⏰ geçti)';
            else if (!orderable) note = ' (⏰ siparişe kapalı)';
            const label = `${r.table} · ${formatDateLabel(r.date)} ${r.time} · ${r.guests} kişi` + note;
            const disabled = orderable ? '' : 'disabled';
            return `<option value="${reservationKey(r)}" ${disabled}>${label}</option>`;
        }).join('');
        html += ordered.map(r => {
            return `<option value="${reservationKey(r)}" disabled>${r.table} · ${formatDateLabel(r.date)} ${r.time} · ✓ Sipariş Verildi</option>`;
        }).join('');
        select.innerHTML = html;
        select.value = bookedReservations.length === 1 ? reservationKey(bookedReservations[0]) : '';
    } else if (bookedReservations.length === 1) {
        group.classList.add('hidden');
        select.value = reservationKey(bookedReservations[0]);
    } else {
        group.classList.add('hidden');
        select.value = '';
    }
}

function onCheckoutTableChange() {
    renderReservationBanner();
}

function renderReservationBanner() {
    const banner = document.getElementById('checkout-reservation-banner');
    if (!banner) return;

    if (bookedReservations.length === 0) {
        banner.innerHTML = '<p class="reservation-banner-note">Sipariş oluşturmak için önce masa rezervasyonu yapmalısınız.</p>';
        return;
    }

    const res = getSelectedReservation();
    if (!res) {
        banner.innerHTML = '<p class="reservation-banner-note">⚠️ Birden fazla rezervasyonunuz var. Lütfen sipariş vereceğiniz masayı yukarıdan seçin.</p>';
        return;
    }

    const notesLine = res.notes ? `<div class="reservation-banner-line">📝 Not: ${escapeHtml(res.notes)}</div>` : '';
    banner.innerHTML = `
        <div class="reservation-banner-title">✓ Rezervasyon Onaylandı</div>
        <div class="reservation-banner-line">🍽️ ${escapeHtml(res.table)}</div>
        <div class="reservation-banner-line">📅 ${formatDateLabel(res.date)} · ⏰ Saat: ${escapeHtml(res.time)}</div>
        <div class="reservation-banner-line">👤 ${escapeHtml(res.name)} — ${escapeHtml(res.guests)} kişi</div>
        <div class="reservation-banner-line">📞 ${escapeHtml(res.phone)}</div>
        ${notesLine}
        <button type="button" class="btn-cancel-reservation compact" onclick="cancelReservation('${res.table}', '${res.date}', '${res.time}')">
            Rezervasyonu İptal Et
        </button>
    `;
}

function renderCartItems() {
    const list = document.getElementById('cart-items-list');
    if (!list) return;
    if (cart.length === 0) {
        list.innerHTML = '<div class="cart-empty-notice">🍽️ Sepetiniz henüz boş.<br>Menüden lezzetlerinizi seçin!</div>';
        updateCartSummary();
        return;
    }
    list.innerHTML = cart.map(item => `
        <div class="cart-item-row">
            <img class="cart-item-thumb" src="${item.img}" alt="${escapeHtml(item.name)}" onerror="this.style.display='none'">
            <div class="cart-item-details">
                <div class="cart-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
                <div class="cart-item-unit-price">${item.price.toLocaleString('tr-TR')} ₺ / adet</div>
            </div>
            <div class="cart-item-qty-ctrl">
                <button type="button" class="cart-qty-btn" onclick="changeQty('${item.id}', -1)">−</button>
                <span class="cart-qty-num">${item.qty}</span>
                <button type="button" class="cart-qty-btn" onclick="changeQty('${item.id}', 1)">+</button>
            </div>
            <div class="cart-item-total-price">${(item.price * item.qty).toLocaleString('tr-TR')} ₺</div>
            <button type="button" class="btn-remove-cart-item" onclick="removeFromCart('${item.id}')" title="Kaldır">🗑</button>
        </div>
    `).join('');
    updateCartSummary();
}

// ==========================================
// 9. CHECKOUT MODAL AÇMA / KAPATMA
// ==========================================
function openCartModal() {
    if (bookedReservations.length === 0) {
        showToast('🍽️ Sipariş oluşturmak için önce bir masa rezerve etmelisiniz.', 'error');
        document.getElementById('services').scrollIntoView({ behavior: 'smooth' });
        return;
    }
    if (cart.length === 0) {
        showToast('🛒 Sepetiniz boş! Lütfen önce menüden yemek seçiniz.', 'warning');
        document.getElementById('menu').scrollIntoView({ behavior: 'smooth' });
        return;
    }
    if (!bookedReservations.some(r => canPlaceOrder(r))) {
        showToast('⏰ Rezervasyon saatinize 1 saatten az kaldığı için artık sipariş verilemez.', 'error');
        return;
    }
    const successView = document.getElementById('checkout-success-container');
    const mainContainer = document.getElementById('checkout-main-container');
    if (successView) successView.classList.add('hidden');
    if (mainContainer) mainContainer.classList.remove('hidden');
    resetStepBadges(1);
    renderCartItems();
    updateCartSummary();
    renderCheckoutTableSelect();
    renderReservationBanner();

    const nameInput = document.getElementById('checkout-name');
    const phoneInput = document.getElementById('checkout-phone');
    if (bookedReservations.length === 1) {
        if (nameInput && !nameInput.value) nameInput.value = bookedReservations[0].name;
        if (phoneInput && !phoneInput.value) phoneInput.value = bookedReservations[0].phone;
    }

    document.getElementById('checkout-modal').classList.remove('hidden');
    refreshScrollLock();
}

function closeCartModal() {
    document.getElementById('checkout-modal').classList.add('hidden');
    refreshScrollLock();
}

function resetStepBadges(activeStep) {
    for (let i = 1; i <= 2; i++) {
        const badge = document.getElementById(`badge-step-${i}`);
        if (badge) badge.classList.toggle('active', i === activeStep);
    }
}

// ==========================================
// 10. ÖDEME YÖNTEMİ & KART FORMATLAMA
// ==========================================
function switchPaymentMethod(method, btn) {
    const cardDetails = document.getElementById('payment-card-details');
    const cashDetails = document.getElementById('payment-cash-details');
    document.querySelectorAll('.payment-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (method === 'card') {
        cardDetails.classList.remove('hidden');
        cashDetails.classList.add('hidden');
    } else {
        cardDetails.classList.add('hidden');
        cashDetails.classList.remove('hidden');
    }
}

function formatCardNumber(input) {
    let v = input.value.replace(/\D/g, '').substring(0, 16);
    input.value = v.replace(/(.{4})/g, '$1 ').trim();
}

function formatCardExpiry(input) {
    let v = input.value.replace(/\D/g, '').substring(0, 4);
    if (v.length >= 3) {
        input.value = v.substring(0, 2) + '/' + v.substring(2);
    } else {
        input.value = v;
    }
}

// ==========================================
// 11. ONAYLANMIŞ SİPARİŞLER (SİPARİŞLERİM)
// ==========================================
function updateOrdersBadge() {
    const badge = document.getElementById('nav-orders-count');
    if (badge) badge.textContent = confirmedOrders.length;
}

function cancelOrder(orderCode) {
    const order = confirmedOrders.find(o => o.code === orderCode);
    if (!order) return;

    if (!canCancelOrder(order)) {
        showToast('⏰ Rezervasyon saatinize 1 saatten az kaldığı için sipariş iptal edilemez.', 'error');
        return;
    }

    showConfirm(`${order.code} numaralı onaylı siparişiniz iptal edilsin mi?`, function () {
        confirmedOrders = confirmedOrders.filter(o => o.code !== orderCode);
        // Rezervasyon AKTİF listeye geri EKLENMEZ; masa rezervi boşa çıkar.
        saveOrders();
        updateOrdersBadge();
        renderOrdersList();
        updateReservationStatusBar();
        renderCheckoutTableSelect();
        showToast(`${order.code} numaralı siparişiniz iptal edildi. Masa rezervasyonu da iptal edildi.`, 'success');
    });
}

function renderOrdersList() {
    const container = document.getElementById('orders-list-container');
    if (!container) return;
    if (confirmedOrders.length === 0) {
        container.innerHTML = '<div class="orders-empty">📋 Henüz onaylanmış siparişiniz bulunmuyor.<br>Sipariş verdikçe onaylı siparişleriniz burada listelenecektir.</div>';
        return;
    }
    container.innerHTML = confirmedOrders.map(order => {
        const itemsHtml = (order.items || []).map(it => `
            <div class="order-item-row">
                <span>${it.qty}x ${escapeHtml(it.name)}</span>
                <span>${(it.price * it.qty).toLocaleString('tr-TR')} ₺</span>
            </div>`).join('');
        const res = order.reservation || {};
        const status = computeOrderStatus(order);
        const chefNoteLine = order.chefNote ? `<div class="order-meta-line">👨‍🍳 Şef notu: ${escapeHtml(order.chefNote)}</div>` : '';
        const resNoteLine = res.notes ? `<div class="order-meta-line">📝 Rezervasyon notu: ${escapeHtml(res.notes)}</div>` : '';
        const statusClass = status === 'Onaylandı' ? 'status-onaylandi' : (status === 'Hazırlanıyor' ? 'status-hazirlaniyor' : 'status-servis');
        const cancelCtrl = canCancelOrder(order)
            ? `<button type="button" class="btn-cancel-order" onclick="cancelOrder('${order.code}')">İptal Et</button>`
            : `<span class="order-cancel-locked" title="Rezervasyon saatine 1 saatten az kaldığı için iptal edilemez">⏰ İptal edilemez</span>`;
        return `
        <div class="order-card">
            <div class="order-card-header">
                <span class="order-code">${escapeHtml(order.code)}</span>
                <div class="order-card-actions">
                    <span class="order-status-badge ${statusClass}">${status}</span>
                    ${cancelCtrl}
                </div>
            </div>
            <div class="order-card-body">
                <div class="order-meta-line">📅 ${escapeHtml(order.date)} · ⏰ ${escapeHtml(order.time)}</div>
                <div class="order-meta-line">👤 ${escapeHtml(order.name)} · 📞 ${escapeHtml(order.phone)}</div>
                <div class="order-meta-line">🍽️ ${escapeHtml(res.table)} · ${formatDateLabel(res.date)} · Saat ${escapeHtml(res.time)} · ${escapeHtml(res.guests)} kişi</div>
                ${resNoteLine}${chefNoteLine}
                <div class="order-meta-line">${escapeHtml(order.payment)}</div>
                <div class="order-items-list">${itemsHtml}</div>
                <div class="order-card-total"><span>Genel Toplam</span><span>${order.total.toLocaleString('tr-TR')} ₺</span></div>
            </div>
        </div>`;
    }).join('');
}

function openOrdersModal() {
    renderOrdersList();
    document.getElementById('orders-modal').classList.remove('hidden');
    refreshScrollLock();
}

function closeOrdersModal() {
    document.getElementById('orders-modal').classList.add('hidden');
    refreshScrollLock();
}

// ==========================================
// 12. CHECKOUT GÖNDERİMİ & MAKBUZ
// ==========================================
function handleCheckoutSubmit(event) {
    event.preventDefault();

    if (bookedReservations.length === 0) {
        showToast('🍽️ Sipariş oluşturmak için önce bir masa rezerve etmelisiniz.', 'error');
        closeCartModal();
        document.getElementById('services').scrollIntoView({ behavior: 'smooth' });
        return;
    }

    const res = getSelectedReservation();
    if (!res) {
        showToast('⚠️ Birden fazla rezervasyonunuz var. Lütfen sipariş vereceğiniz masayı seçin.', 'warning');
        const selectGroup = document.getElementById('checkout-table-select-group');
        if (selectGroup) selectGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    if (!canPlaceOrder(res)) {
        showToast('⏰ Rezervasyon saatinize 1 saatten az kaldığı için artık sipariş verilemez.', 'error');
        closeCartModal();
        return;
    }

    const name = document.getElementById('checkout-name').value.trim();
    const phone = document.getElementById('checkout-phone').value.trim();
    const paymentActive = document.querySelector('.payment-tab-btn.active');
    const paymentMethod = paymentActive ? paymentActive.id : 'btn-pay-card';

    if (!name) { showToast('Lütfen adınızı ve soyadınızı giriniz.', 'error'); return; }
    if (phone.length !== 11 || !/^\d+$/.test(phone)) {
        showToast('Lütfen geçerli 11 haneli bir telefon numarası giriniz (Örn: 05551234567).', 'error');
        return;
    }

    if (paymentMethod === 'btn-pay-card') {
        const cardNum = document.getElementById('card-number').value.replace(/\s/g, '');
        const cardExp = document.getElementById('card-exp').value;
        const cardCvv = document.getElementById('card-cvv').value;
        const cardHolder = document.getElementById('card-holder').value.trim();
        if (!cardHolder) { showToast('Lütfen kart üzerindeki ismi giriniz.', 'error'); return; }
        if (cardNum.length !== 16) { showToast('Lütfen geçerli 16 haneli kart numarası giriniz.', 'error'); return; }
        if (!/^\d{2}\/\d{2}$/.test(cardExp)) { showToast('Lütfen son kullanma tarihini AA/YY formatında giriniz.', 'error'); return; }
        const expMonth = parseInt(cardExp.substring(0, 2), 10);
        if (expMonth < 1 || expMonth > 12) { showToast('Lütfen geçerli bir ay giriniz (01-12).', 'error'); return; }
        if (cardCvv.length < 3) { showToast('Lütfen 3 haneli CVV güvenlik kodunu giriniz.', 'error'); return; }
    }

    const subtotal = getCartTotal();
    const now = new Date();
    const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('tr-TR');
    const orderNotes = document.getElementById('checkout-notes').value.trim();
    const payText = paymentMethod === 'btn-pay-card' ? '💳 Kredi / Banka Kartı' : '💵 Masada Nakit / POS';

    showConfirm(`${name}, ${res.table} (${formatDateLabel(res.date)} ${res.time}) için toplam ${subtotal.toLocaleString('tr-TR')} ₺ tutarındaki siparişiniz (${payText}) onaylansın mı?`, function () {
        completeOrder(res, name, phone, payText, orderNotes, subtotal, timeStr, dateStr, now);
    });
}

function completeOrder(res, name, phone, payText, orderNotes, subtotal, timeStr, dateStr, now) {
    const orderCode = '#YH-' + Math.floor(10000 + Math.random() * 90000);
    const reservationNotes = res.notes ? `<div>📝 Rezervasyon notu: ${escapeHtml(res.notes)}</div>` : '';
    const chefNotes = orderNotes ? `<div>👨‍🍳 Şef notu: ${escapeHtml(orderNotes)}</div>` : '';

    const order = {
        code: orderCode,
        status: 'Onaylandı',
        date: dateStr,
        time: timeStr,
        name,
        phone,
        payment: payText,
        reservation: {
            table: res.table,
            date: res.date,
            time: res.time,
            guests: res.guests,
            name: res.name,
            phone: res.phone || '',
            notes: res.notes || ''
        },
        chefNote: orderNotes,
        items: cart.map(item => ({ name: item.name, qty: item.qty, price: item.price })),
        total: subtotal,
        createdAt: now.toISOString()
    };
    confirmedOrders.unshift(order);
    saveOrders();
    updateOrdersBadge();
    renderOrdersList();

    // Sipariş verilen masayı aktif rezervasyonlardan kaldır
    bookedReservations = bookedReservations.filter(r => !(r.table === res.table && r.date === res.date && r.time === res.time));
    updateReservationStatusBar();
    renderCheckoutTableSelect();

    const itemsHtml = cart.map(item => `
        <div class="receipt-item-row">
            <span>${item.qty}x ${escapeHtml(item.name)}</span>
            <span>${(item.price * item.qty).toLocaleString('tr-TR')} ₺</span>
        </div>
    `).join('');

    const receiptHtml = `
        <div class="receipt-header">
            <span>YUS-HUB GASTRONOMİ</span>
            <span>${orderCode}</span>
        </div>
        <div style="font-size:12px;color:#6d4c38;margin-bottom:10px;line-height:1.7;">
            <div>📅 ${dateStr} &nbsp;⏰ ${timeStr}</div>
            <div>👤 ${escapeHtml(name)} &nbsp;|&nbsp; 📞 ${escapeHtml(phone)}</div>
            <div style="margin-top:6px;padding:8px;background:#f7ede3;border-radius:8px;">
                <strong>Rezervasyon</strong><br>
                🍽️ ${escapeHtml(res.table)} &nbsp;|&nbsp; 📅 ${formatDateLabel(res.date)} &nbsp;|&nbsp; ⏰ ${escapeHtml(res.time)}<br>
                ${escapeHtml(res.guests)} kişi — ${escapeHtml(res.name)}
                ${reservationNotes}
            </div>
            ${chefNotes}
            <div>${escapeHtml(payText)}</div>
        </div>
        <div class="receipt-items-list">${itemsHtml}</div>
        <div class="receipt-totals">
            <div class="receipt-grand-total"><span>Genel Toplam</span><span>${subtotal.toLocaleString('tr-TR')} ₺</span></div>
        </div>
        <div style="text-align:center;margin-top:12px;font-size:12px;color:#8c321d;font-weight:600;">
            ✦ Tahmini Hazırlanma Süresi: 20–30 Dakika ✦<br>Afiyet olsun, teşekkür ederiz!
        </div>
    `;

    const mainContainer = document.getElementById('checkout-main-container');
    const successView = document.getElementById('checkout-success-container');
    const receiptEl = document.getElementById('order-receipt-content');

    if (mainContainer) mainContainer.classList.add('hidden');
    if (receiptEl) receiptEl.innerHTML = receiptHtml;
    if (successView) successView.classList.remove('hidden');
    resetStepBadges(2);

    cart = [];
    updateCartUI();
    showToast(`${res.table} için siparişiniz onaylandı ve masa aktif rezervasyonlardan kaldırıldı.`, 'success');
}

// Makbuzu yazdır (yeni pencerede, sadece makbuz)
function printReceipt() {
    const receiptEl = document.getElementById('order-receipt-content');
    if (!receiptEl) return;
    const w = window.open('', '_blank', 'width=480,height=640');
    if (!w) {
        showToast('Lütfen açılır pencere iznini etkinleştirin.', 'error');
        return;
    }
    w.document.write(
        '<html><head><title>YUS-HUB Sipariş Makbuzu</title>' +
        '<style>body{font-family:Arial,sans-serif;color:#4a3427;padding:20px;max-width:420px;margin:0 auto;}' +
        '.receipt-header{display:flex;justify-content:space-between;border-bottom:1px solid #eee1d5;padding-bottom:8px;margin-bottom:10px;font-size:13px;font-weight:700;color:#8c321d;}' +
        '.receipt-items-list{margin-bottom:12px;border-bottom:1px dashed #d8c3b0;padding-bottom:10px;}' +
        '.receipt-item-row{display:flex;justify-content:space-between;font-size:13px;color:#4a2311;margin-bottom:5px;}' +
        '.receipt-grand-total{font-size:16px;font-weight:800;color:#2d7a3a;display:flex;justify-content:space-between;border-top:1px solid #eee1d5;padding-top:6px;margin-top:4px;}' +
        '</style></head><body>' +
        receiptEl.innerHTML +
        '<script>window.onload=function(){window.print();}<\/script>' +
        '</body></html>'
    );
    w.document.close();
}

// ==========================================
// 13. ETKİLEŞİM & CANLI GÜNCELLEME
// ==========================================
window.addEventListener('click', function (event) {
    const bookingModal = document.getElementById('booking-modal');
    if (event.target === bookingModal) closeModal();
    const checkoutModal = document.getElementById('checkout-modal');
    if (event.target === checkoutModal) closeCartModal();
    const ordersModal = document.getElementById('orders-modal');
    if (event.target === ordersModal) closeOrdersModal();
    const confirmModal = document.getElementById('confirm-modal');
    if (event.target === confirmModal) confirmCancel();
    const limitModal = document.getElementById('limit-modal');
    if (event.target === limitModal) closeLimitModal();
});

window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        const confirmModal = document.getElementById('confirm-modal');
        if (confirmModal && !confirmModal.classList.contains('hidden')) { confirmCancel(); return; }
        const limitModal = document.getElementById('limit-modal');
        if (limitModal && !limitModal.classList.contains('hidden')) { closeLimitModal(); return; }
        closeModal();
        closeCartModal();
        closeOrdersModal();
    }
});

// Her 30 saniyede geri sayımları ve sipariş durumlarını güncelle
let countdownTimer = null;
function startCountdown() {
    if (countdownTimer) return;
    countdownTimer = setInterval(function () {
        updateReservationStatusBar();
        renderOrdersList();
    }, 30000);
}

document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.form-row-2').forEach(el => {
        el.style.display = 'grid';
        el.style.gridTemplateColumns = '1fr 1fr';
        el.style.gap = '10px';
    });

    // Tarih girişinin minimumunu bugüne sabitle
    const dateInput = document.getElementById('booking-date');
    if (dateInput) {
        dateInput.min = todayStr();
        if (!dateInput.value) dateInput.value = todayStr();
        currentSelectedDate = dateInput.value;
    }

    saveOrders();
    updateReservationStatusBar();
    updateOrdersBadge();
    renderOrdersList();
    startCountdown();
});
