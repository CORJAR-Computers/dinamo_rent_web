/**
 * DINAMO RENT A CAR — INTERACTIVE APPLICATION LOGIC
 * Engine: Booking On-Request, Digital Touch Signature, Contract Renderer & ERP Simulator
 */

// ==========================================
// 1. DATA & STATE MANAGEMENT
// ==========================================

const FLEET_DATABASE = [
  {
    id: 'onix-turbo',
    name: 'Chevrolet Onix Turbo',
    category: 'economico',
    categoryLabel: 'Económico • 2024',
    badge: 'Más Alquilado en Cartagena',
    priceCOP: 160000,
    depositCOP: 1000000,
    passengers: 5,
    transmission: 'Automático',
    luggage: '2 Maletas',
    fuel: 'Gasolina',
    ac: true,
    plate: 'LMY-842',
    image: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'renault-kwid',
    name: 'Renault Kwid Iconic',
    category: 'economico',
    categoryLabel: 'Económico Compacto • 2024',
    badge: 'Ultra Económico',
    priceCOP: 135000,
    depositCOP: 900000,
    passengers: 4,
    transmission: 'Mecánico',
    luggage: '2 Maletas',
    fuel: 'Gasolina',
    ac: true,
    plate: 'WHT-210',
    image: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'nissan-versa',
    name: 'Nissan Versa Advance',
    category: 'sedan',
    categoryLabel: 'Sedán Familiar • 2024',
    badge: 'Espacioso & Cómodo',
    priceCOP: 180000,
    depositCOP: 1200000,
    passengers: 5,
    transmission: 'Automático',
    luggage: '3 Maletas',
    fuel: 'Gasolina',
    ac: true,
    plate: 'KLM-409',
    image: 'https://images.unsplash.com/photo-1590362891988-f77804703088?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'renault-duster',
    name: 'Renault Duster 1.3 Turbo 4x2',
    category: 'suv',
    categoryLabel: 'SUV / Camioneta • 2024',
    badge: 'Ideal Playas & Turismo',
    priceCOP: 220000,
    depositCOP: 1500000,
    passengers: 5,
    transmission: 'Automático',
    luggage: '4 Maletas',
    fuel: 'Gasolina',
    ac: true,
    plate: 'FRK-551',
    image: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'chevrolet-tracker',
    name: 'Chevrolet Tracker Turbo Premier',
    category: 'suv',
    categoryLabel: 'SUV Familiar • 2024',
    badge: 'Máximo Confort',
    priceCOP: 240000,
    depositCOP: 1500000,
    passengers: 5,
    transmission: 'Automático',
    luggage: '3 Maletas',
    fuel: 'Gasolina',
    ac: true,
    plate: 'UJM-992',
    image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'toyota-prado-txl',
    name: 'Toyota Prado TXL 4x4 Diésel',
    category: 'premium',
    categoryLabel: 'Gama Alta / Blindada • 2024',
    badge: 'VIP & Blindaje Ligero',
    priceCOP: 650000,
    depositCOP: 3500000,
    passengers: 7,
    transmission: 'Automático 4x4',
    luggage: '5 Maletas',
    fuel: 'Diésel',
    ac: true,
    plate: 'TXR-007',
    image: 'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=600&q=80'
  }
];

// Estado Global de la App
const AppState = {
  currency: 'COP',
  usdRate: 4000,
  currentCategory: 'all',
  selectedVehicle: null,
  rentalDays: 3,
  pickupPlace: 'Aeropuerto Rafael Núñez (CTG)',
  returnPlace: 'Aeropuerto Rafael Núñez (CTG)',
  pickupDate: '2026-08-17',
  pickupTime: '10:00',
  returnDate: '2026-08-20',
  returnTime: '10:00',
  
  // Extras
  extraInsurance: true,
  extraBabySeat: false,
  extraSecondDriver: false,
  extraFullTank: false,

  // Datos del Conductor
  driver: {
    docType: 'CC',
    docNumber: '1047458921',
    names: 'Carlos Andrés',
    lastnames: 'Gómez Martínez',
    phone: '+57 300 895 4422',
    email: 'carlos.gomez@gmail.com',
    license: '13001-998822',
    licenseExp: '2030-05-15',
    hotel: 'Hotel Almirante Cartagena'
  },

  // Firma
  signatureDataUrl: null,

  // ERP State (Simulación de BD Compartida)
  activeRentals: [
    {
      contractNo: 'DIN-2026-0842',
      clientName: 'Carlos Andrés Gómez',
      vehicleName: 'Chevrolet Onix Turbo (LMY-842)',
      dates: '17/08/2026 - 20/08/2026',
      deposit: '$1.000.000 COP',
      status: 'AUTHORIZED',
      statusLabel: 'Garantía Activa',
      ip: '186.84.92.115'
    },
    {
      contractNo: 'DIN-2026-0839',
      clientName: 'Alejandro Martínez (Medellín)',
      vehicleName: 'Renault Duster (FRK-551)',
      dates: '15/08/2026 - 18/08/2026',
      deposit: '$1.500.000 COP',
      status: 'ACTIVE_RENT',
      statusLabel: 'En Circulación',
      ip: '190.158.42.10'
    },
    {
      contractNo: 'DIN-2026-0835',
      clientName: 'Michael Brown (USA)',
      vehicleName: 'Toyota Prado TXL (TXR-007)',
      dates: '14/08/2026 - 19/08/2026',
      deposit: '$3.500.000 COP',
      status: 'ACTIVE_RENT',
      statusLabel: 'En Circulación',
      ip: '172.56.21.9'
    }
  ]
};

// ==========================================
// 2. DOM INITIALIZATION & EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  initDatePickers();
  renderFleetCards();
  initCategoryFilters();
  initCurrencySelector();
  initSearchForm();
  initBookingModal();
  initSignaturePad();
  initFaqAccordion();
  initErpSwitch();
  renderErpTable();
});

// Fechas por Defecto (Hoy y +3 días)
function initDatePickers() {
  const today = new Date();
  const returnD = new Date();
  returnD.setDate(today.getDate() + 3);

  const formatDate = (d) => d.toISOString().split('T')[0];

  const pDateInput = document.getElementById('pickup-date');
  const rDateInput = document.getElementById('return-date');

  if (pDateInput && rDateInput) {
    pDateInput.value = formatDate(today);
    rDateInput.value = formatDate(returnD);
    pDateInput.min = formatDate(today);
    rDateInput.min = formatDate(today);

    pDateInput.addEventListener('change', calculateDays);
    rDateInput.addEventListener('change', calculateDays);
    document.getElementById('pickup-time')?.addEventListener('change', calculateDays);
    document.getElementById('return-time')?.addEventListener('change', calculateDays);
    
    calculateDays();
  }
}

// Cálculo de días
function calculateDays() {
  const pDate = document.getElementById('pickup-date')?.value;
  const rDate = document.getElementById('return-date')?.value;

  if (pDate && rDate) {
    const d1 = new Date(pDate);
    const d2 = new Date(rDate);
    const diffTime = d2.getTime() - d1.getTime();
    let days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (days < 1) days = 1;

    AppState.rentalDays = days;
    AppState.pickupDate = pDate;
    AppState.returnDate = rDate;

    const daysBadge = document.getElementById('calculated-days');
    if (daysBadge) daysBadge.textContent = `${days} día${days > 1 ? 's' : ''}`;
  }
}

// ==========================================
// 3. RENDER FLEET CARDS
// ==========================================

function formatPrice(amountCOP) {
  if (AppState.currency === 'USD') {
    const usd = Math.round(amountCOP / AppState.usdRate);
    return `$${usd.toLocaleString('en-US')} USD`;
  }
  return `$${amountCOP.toLocaleString('es-CO')} COP`;
}

function renderFleetCards() {
  const grid = document.getElementById('fleet-grid');
  if (!grid) return;

  grid.innerHTML = '';

  const filtered = FLEET_DATABASE.filter(car => {
    if (AppState.currentCategory === 'all') return true;
    return car.category === AppState.currentCategory;
  });

  filtered.forEach(car => {
    const card = document.createElement('div');
    card.className = 'vehicle-card';
    card.innerHTML = `
      <div class="vehicle-card-badge">${car.badge}</div>
      <div class="vehicle-card-image-wrap">
        <img src="${car.image}" alt="${car.name}" class="vehicle-card-img" loading="lazy">
      </div>
      <div class="vehicle-card-body">
        <div class="vehicle-title-row">
          <h3 class="vehicle-name">${car.name}</h3>
          <span class="vehicle-model-year">${car.categoryLabel}</span>
        </div>

        <div class="vehicle-features-grid">
          <div class="feature-item"><i class="fa-solid fa-users"></i> ${car.passengers} Pasajeros</div>
          <div class="feature-item"><i class="fa-solid fa-gears"></i> ${car.transmission}</div>
          <div class="feature-item"><i class="fa-solid fa-suitcase"></i> ${car.luggage}</div>
          <div class="feature-item"><i class="fa-solid fa-snowflake"></i> Aire Acondicionado</div>
        </div>

        <div class="vehicle-pricing-footer">
          <div class="pricing-box">
            <span class="pricing-label">Tarifa por día:</span>
            <span class="pricing-amount">${formatPrice(car.priceCOP)}</span>
            <span class="pricing-unit">Garantía: ${formatPrice(car.depositCOP)}</span>
          </div>
          <button class="btn-book-card" onclick="openBookingModal('${car.id}')">
            <i class="fa-solid fa-bolt"></i> Reservar
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// Filtros por Categoría
function initCategoryFilters() {
  const container = document.getElementById('category-filters');
  if (!container) return;

  container.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-btn')) {
      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      AppState.currentCategory = e.target.dataset.category;
      renderFleetCards();
    }
  });
}

// Selector de Moneda
function initCurrencySelector() {
  document.querySelectorAll('.currency-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.currency-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      AppState.currency = e.target.dataset.currency;
      renderFleetCards();
      if (AppState.selectedVehicle) updateQuoteCalculation();
    });
  });
}

// Buscador
function initSearchForm() {
  const form = document.getElementById('booking-search-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const pLoc = document.getElementById('pickup-location');
    const rLoc = document.getElementById('return-location');
    AppState.pickupPlace = pLoc.options[pLoc.selectedIndex].text;
    AppState.returnPlace = rLoc.options[rLoc.selectedIndex].text;
    AppState.pickupTime = document.getElementById('pickup-time').value;
    AppState.returnTime = document.getElementById('return-time').value;
    
    calculateDays();

    // Scroll suave a flota
    document.getElementById('flota')?.scrollIntoView({ behavior: 'smooth' });
  });
}

// ==========================================
// 4. BOOKING MODAL & QUOTE ENGINE
// ==========================================

function openBookingModal(carId) {
  const vehicle = FLEET_DATABASE.find(c => c.id === carId);
  if (!vehicle) return;

  AppState.selectedVehicle = vehicle;
  
  // Llenar datos de vehículo
  document.getElementById('modal-vehicle-title').textContent = vehicle.name;
  document.getElementById('modal-vehicle-category').textContent = vehicle.categoryLabel;
  document.getElementById('modal-vehicle-img').src = vehicle.image;
  
  document.getElementById('spec-passengers').innerHTML = `<i class="fa-solid fa-user-group"></i> ${vehicle.passengers} Pasajeros`;
  document.getElementById('spec-transmission').innerHTML = `<i class="fa-solid fa-gears"></i> ${vehicle.transmission}`;
  document.getElementById('spec-luggage').innerHTML = `<i class="fa-solid fa-suitcase"></i> ${vehicle.luggage}`;
  document.getElementById('spec-fuel').innerHTML = `<i class="fa-solid fa-gas-pump"></i> ${vehicle.fuel}`;

  // Itinerario
  document.getElementById('summary-pickup-place').textContent = AppState.pickupPlace;
  document.getElementById('summary-return-place').textContent = AppState.returnPlace;
  document.getElementById('summary-pickup-date').textContent = `${AppState.pickupDate} (${AppState.pickupTime})`;
  document.getElementById('summary-return-date').textContent = `${AppState.returnDate} (${AppState.returnTime})`;
  document.getElementById('summary-rental-days').textContent = `${AppState.rentalDays} día${AppState.rentalDays > 1 ? 's' : ''}`;

  // Reset steps
  switchModalStep(1);
  updateQuoteCalculation();

  document.getElementById('booking-modal').classList.add('open');
}

function initBookingModal() {
  const modal = document.getElementById('booking-modal');
  const closeBtn = document.getElementById('close-modal-btn');
  const finishBtn = document.getElementById('btn-finish-modal');
  const erpViewBtn = document.getElementById('btn-view-in-erp-demo');

  closeBtn?.addEventListener('click', () => modal.classList.remove('open'));
  finishBtn?.addEventListener('click', () => modal.classList.remove('open'));

  // Listeners de Extras en Cotización
  ['extra-insurance', 'extra-baby-seat', 'extra-second-driver', 'extra-full-tank'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateQuoteCalculation);
  });

  // Step Navigations
  document.getElementById('btn-goto-step-2')?.addEventListener('click', () => switchModalStep(2));
  document.getElementById('btn-back-to-step-1')?.addEventListener('click', () => switchModalStep(1));
  document.getElementById('btn-goto-step-3')?.addEventListener('click', () => {
    saveDriverFormData();
    switchModalStep(3);
  });
  document.getElementById('btn-back-to-step-2')?.addEventListener('click', () => switchModalStep(2));

  // Procesar Reserva Final y Firma
  document.getElementById('btn-process-booking')?.addEventListener('click', processFinalBooking);

  // Botón Ver en ERP
  erpViewBtn?.addEventListener('click', () => {
    modal.classList.remove('open');
    toggleErpView(true);
  });

  // Botón Imprimir Contrato
  document.getElementById('btn-print-contract')?.addEventListener('click', () => {
    window.print();
  });
}

function updateQuoteCalculation() {
  const car = AppState.selectedVehicle;
  if (!car) return;

  const days = AppState.rentalDays;
  const rentSubtotal = car.priceCOP * days;

  AppState.extraInsurance = document.getElementById('extra-insurance')?.checked || false;
  AppState.extraBabySeat = document.getElementById('extra-baby-seat')?.checked || false;
  AppState.extraSecondDriver = document.getElementById('extra-second-driver')?.checked || false;
  AppState.extraFullTank = document.getElementById('extra-full-tank')?.checked || false;

  const insuranceCost = AppState.extraInsurance ? (40000 * days) : 0;
  
  let otherExtras = 0;
  if (AppState.extraBabySeat) otherExtras += (25000 * days);
  if (AppState.extraSecondDriver) otherExtras += (20000 * days);
  if (AppState.extraFullTank) otherExtras += 180000;

  const totalFinal = rentSubtotal + insuranceCost + otherExtras;

  // Actualizar UI
  document.getElementById('calc-days-label').textContent = `${days} día${days > 1 ? 's' : ''}`;
  document.getElementById('calc-daily-rate').textContent = formatPrice(car.priceCOP);
  document.getElementById('calc-subtotal-rent').textContent = formatPrice(rentSubtotal);
  document.getElementById('calc-insurance-cost').textContent = formatPrice(insuranceCost);
  document.getElementById('calc-extras-cost').textContent = formatPrice(otherExtras);
  document.getElementById('calc-total-final').textContent = formatPrice(totalFinal);
  document.getElementById('calc-deposit-amount').textContent = formatPrice(car.depositCOP);

  // Para Step 3 y 4
  document.getElementById('card-deposit-amount').textContent = formatPrice(car.depositCOP);
  document.getElementById('card-rent-amount').textContent = formatPrice(totalFinal);
  document.getElementById('legal-deposit-val').textContent = formatPrice(car.depositCOP);
  document.getElementById('final-deposit-val').textContent = formatPrice(car.depositCOP);

  // Variables en memoria
  AppState.currentQuote = {
    rentSubtotal,
    insuranceCost,
    otherExtras,
    totalFinal,
    deposit: car.depositCOP
  };
}

function switchModalStep(stepNumber) {
  for (let i = 1; i <= 4; i++) {
    const content = document.getElementById(`modal-step-${i}`);
    const dot = document.getElementById(`dot-step-${i}`);
    if (content) content.classList.remove('active');
    if (dot) {
      dot.classList.remove('active');
      if (i < stepNumber) dot.classList.add('completed');
      else dot.classList.remove('completed');
    }
  }

  const currentContent = document.getElementById(`modal-step-${stepNumber}`);
  const currentDot = document.getElementById(`dot-step-${stepNumber}`);
  if (currentContent) currentContent.classList.add('active');
  if (currentDot) currentDot.classList.add('active');
}

function saveDriverFormData() {
  AppState.driver = {
    docType: document.getElementById('driver-doc-type').value,
    docNumber: document.getElementById('driver-doc-number').value,
    names: document.getElementById('driver-names').value,
    lastnames: document.getElementById('driver-lastnames').value,
    phone: document.getElementById('driver-phone').value,
    email: document.getElementById('driver-email').value,
    license: document.getElementById('driver-license').value,
    licenseExp: document.getElementById('driver-license-exp').value,
    hotel: document.getElementById('driver-hotel').value
  };

  // Actualizar textos legales
  const fullName = `${AppState.driver.names} ${AppState.driver.lastnames}`;
  document.getElementById('legal-client-name').textContent = fullName;
  document.getElementById('legal-client-doc').textContent = AppState.driver.docNumber;
}

// ==========================================
// 5. TOUCH & MOUSE CANVAS SIGNATURE PAD
// ==========================================

let signatureCanvas, signatureCtx, isDrawing = false, hasSigned = false;

function initSignaturePad() {
  signatureCanvas = document.getElementById('signature-canvas');
  if (!signatureCanvas) return;

  signatureCtx = signatureCanvas.getContext('2d');
  signatureCtx.lineWidth = 2.5;
  signatureCtx.lineCap = 'round';
  signatureCtx.lineJoin = 'round';
  signatureCtx.strokeStyle = '#0A2540';

  // Eventos Pointer (Soporta Touch en Móvil y Mouse en PC simultáneamente)
  signatureCanvas.addEventListener('pointerdown', startDrawing);
  signatureCanvas.addEventListener('pointermove', draw);
  signatureCanvas.addEventListener('pointerup', stopDrawing);
  signatureCanvas.addEventListener('pointercancel', stopDrawing);

  document.getElementById('clear-signature-btn')?.addEventListener('click', clearSignature);
}

function getCanvasPos(e) {
  const rect = signatureCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (signatureCanvas.width / rect.width),
    y: (e.clientY - rect.top) * (signatureCanvas.height / rect.height)
  };
}

function startDrawing(e) {
  isDrawing = true;
  hasSigned = true;
  document.getElementById('signature-placeholder').style.display = 'none';
  const pos = getCanvasPos(e);
  signatureCtx.beginPath();
  signatureCtx.moveTo(pos.x, pos.y);
}

function draw(e) {
  if (!isDrawing) return;
  const pos = getCanvasPos(e);
  signatureCtx.lineTo(pos.x, pos.y);
  signatureCtx.stroke();
}

function stopDrawing() {
  if (isDrawing) {
    signatureCtx.closePath();
    isDrawing = false;
  }
}

function clearSignature() {
  signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  hasSigned = false;
  document.getElementById('signature-placeholder').style.display = 'flex';
}

// ==========================================
// 6. PROCESS BOOKING & GENERATE CONTRACT
// ==========================================

function processFinalBooking() {
  if (!hasSigned) {
    // Si no dibujó firma en la demo, creamos un trazo elegante automático
    generateSimulatedSignature();
  }

  // Capturar firma en imagen base64
  AppState.signatureDataUrl = signatureCanvas.toDataURL('image/png');

  // Llenar el Contrato PDF
  const car = AppState.selectedVehicle;
  const driver = AppState.driver;
  const quote = AppState.currentQuote;
  const contractNumber = `DIN-${new Date().getFullYear()}-0${Math.floor(100 + Math.random() * 900)}`;

  document.getElementById('doc-contract-number').textContent = contractNumber;
  document.getElementById('doc-contract-date').textContent = new Date().toLocaleString('es-CO');
  
  // Cliente
  document.getElementById('doc-client-name').textContent = `${driver.names} ${driver.lastnames}`;
  document.getElementById('doc-client-doc').textContent = `${driver.docType} ${driver.docNumber}`;
  document.getElementById('doc-client-license').textContent = driver.license;
  document.getElementById('doc-client-phone').textContent = driver.phone;
  document.getElementById('doc-client-email').textContent = driver.email;
  document.getElementById('doc-client-hotel').textContent = driver.hotel || 'Cartagena de Indias';

  // Vehículo
  document.getElementById('doc-vehicle-name').textContent = car.name;
  document.getElementById('doc-vehicle-plate').textContent = `${car.plate} (Cartagena)`;
  document.getElementById('doc-pickup-loc').textContent = AppState.pickupPlace;
  document.getElementById('doc-pickup-dt').textContent = `${AppState.pickupDate} ${AppState.pickupTime}`;
  document.getElementById('doc-return-loc').textContent = AppState.returnPlace;
  document.getElementById('doc-return-dt').textContent = `${AppState.returnDate} ${AppState.returnTime}`;
  document.getElementById('doc-total-days').textContent = `${AppState.rentalDays} días`;

  // Finanzas
  document.getElementById('doc-total-paid').textContent = formatPrice(quote.totalFinal);
  document.getElementById('doc-deposit-blocked').textContent = formatPrice(quote.deposit);

  // Firma
  document.getElementById('contract-sig-img').src = AppState.signatureDataUrl;
  document.getElementById('doc-sig-name').textContent = `${driver.names} ${driver.lastnames}`;

  // Añadir a la base de datos compartida del ERP
  const newErpRecord = {
    contractNo: contractNumber,
    clientName: `${driver.names} ${driver.lastnames}`,
    vehicleName: `${car.name} (${car.plate})`,
    dates: `${AppState.pickupDate} - ${AppState.returnDate}`,
    deposit: formatPrice(quote.deposit),
    status: 'AUTHORIZED',
    statusLabel: 'Garantía Pre-autorizada',
    ip: '186.84.92.115'
  };

  AppState.activeRentals.unshift(newErpRecord);
  renderErpTable();

  // Avanzar a Paso 4
  switchModalStep(4);
}

function generateSimulatedSignature() {
  signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  signatureCtx.beginPath();
  signatureCtx.strokeStyle = '#0A2540';
  signatureCtx.lineWidth = 2.5;
  
  // Dibujo estilizado de firma
  signatureCtx.moveTo(40, 110);
  signatureCtx.bezierCurveTo(70, 40, 100, 130, 130, 70);
  signatureCtx.bezierCurveTo(150, 40, 170, 110, 200, 80);
  signatureCtx.lineTo(260, 80);
  signatureCtx.stroke();
  hasSigned = true;
  document.getElementById('signature-placeholder').style.display = 'none';
}

// ==========================================
// 7. ERP MOSTRADOR (TAURI V2 SIMULATOR)
// ==========================================

function initErpSwitch() {
  const btn = document.getElementById('toggle-erp-view-btn');
  btn?.addEventListener('click', () => {
    const isErpActive = !document.getElementById('erp-view').classList.contains('hidden');
    toggleErpView(!isErpActive);
  });

  document.getElementById('btn-refresh-erp')?.addEventListener('click', () => {
    renderErpTable();
  });
}

function toggleErpView(showErp) {
  const clientView = document.getElementById('client-view');
  const erpView = document.getElementById('erp-view');
  const label = document.getElementById('erp-switch-label');

  if (showErp) {
    clientView.classList.add('hidden');
    erpView.classList.remove('hidden');
    label.textContent = 'Volver a Web Cliente';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    clientView.classList.remove('hidden');
    erpView.classList.add('hidden');
    label.textContent = 'Vista Asesor ERP';
  }
}

function renderErpTable() {
  const tbody = document.getElementById('erp-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  AppState.activeRentals.forEach((rent, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${rent.contractNo}</strong></td>
      <td>${rent.clientName}</td>
      <td>${rent.vehicleName}</td>
      <td>${rent.dates}</td>
      <td><strong class="text-orange">${rent.deposit}</strong></td>
      <td><span class="erp-status-badge authorized">${rent.statusLabel}</span></td>
      <td>
        <button class="btn-erp-action btn-release-guarantee" onclick="releaseGuaranteeAction(${idx})" title="Liberar cupo de tarjeta en banco">
          <i class="fa-solid fa-unlock"></i> Liberar Garantía
        </button>
        <button class="btn-erp-action" onclick="viewContractAction('${rent.contractNo}')" title="Ver contrato firmado">
          <i class="fa-solid fa-file-pdf"></i> Ver PDF
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.releaseGuaranteeAction = function(index) {
  const rent = AppState.activeRentals[index];
  if (!rent) return;

  alert(`✅ Orden de Liberación (VOID) enviada a la pasarela PayU para el contrato ${rent.contractNo}.\n\nEl cupo de ${rent.deposit} será desbloqueado en la tarjeta de ${rent.clientName}.`);
  rent.statusLabel = 'Garantía Liberada (VOID)';
  renderErpTable();
};

window.viewContractAction = function(contractNo) {
  const modal = document.getElementById('booking-modal');
  modal.classList.add('open');
  switchModalStep(4);
};

// ==========================================
// 8. FAQ ACCORDION
// ==========================================

function initFaqAccordion() {
  document.querySelectorAll('.faq-question').forEach(item => {
    item.addEventListener('click', () => {
      const parent = item.parentElement;
      parent.classList.toggle('active');
    });
  });
}
