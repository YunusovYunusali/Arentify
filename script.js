const firebaseConfig = {
  apiKey: "AIzaSyDT_D7qXJ8wwPpLPt0BqkmIwugAadFIamI",
  authDomain: "rentify-8b7eb.firebaseapp.com",
  projectId: "rentify-8b7eb",
  storageBucket: "rentify-8b7eb.firebasestorage.app",
  messagingSenderId: "984447754339",
  appId: "1:984447754339:web:78bf5ecf3da9ed3220d856"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let allShops = [];
let allItems = [];
let userLat = null, userLng = null;
let activeFilter = 'all';
let activeShop = null;
let searchQuery = '';

const CAT_ICONS = { tools:'🔧', cars:'🚗', gaming:'🎮' };
const CAT_NAMES = { tools:'Asboblar', cars:'Avtomobil', gaming:'Gaming' };

function dist(lat1,lng1,lat2,lng2) {
  const R=6371;
  const dLat=(lat2-lat1)*Math.PI/180;
  const dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)*Math.sin(dLat/2)+
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
    Math.sin(dLng/2)*Math.sin(dLng/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

async function loadData() {
  try {
    const usersSnap = await db.collection('rentify').doc('users').get();
    if (!usersSnap.exists) { showEmpty('Hali ijarachilar yo\'q'); return; }
    const users = usersSnap.data().list || {};

    const shopPromises = Object.entries(users).map(async ([username, info]) => {
      try {
        const [toolsSnap, itemsSnap] = await Promise.all([
          db.collection('shops').doc(username).collection('data').doc('tools').get(),
          db.collection('shops').doc(username).collection('data').doc('items').get()
        ]);
        const rentalsSnap = await db.collection('shops').doc(username).collection('data').doc('rentals').get();
        const rentals = (rentalsSnap.exists && rentalsSnap.data().list) ? rentalsSnap.data().list : [];
        const tools = (toolsSnap.exists && toolsSnap.data().list) ? toolsSnap.data().list : [];
        const items = (itemsSnap.exists && itemsSnap.data().list) ? itemsSnap.data().list : [];
        return { username, info, tools, items, rentals };
      } catch(e) { return null; }
    });

    const results = (await Promise.all(shopPromises)).filter(Boolean);

    allShops = [];
    allItems = [];

    results.forEach(({ username, info, tools, items, rentals }) => {
      if (!tools.length && !items.length) return;
      const shop = {
        username,
        name: username,
        phone: info.phone || '',
        category: info.category || 'tools',
        lat: parseFloat(info.locationLat) || null,
        lng: parseFloat(info.locationLng) || null,
        address: info.locationAddress || '',
      };
      allShops.push(shop);

      const activeRentals = rentals.filter(r => r.status === 'active' || r.status === 'jarayonda');
      const busyCountMap = {};
      activeRentals.forEach(r => {
        if (r.items) r.items.forEach(it => {
          const id = String(it.itemId !== undefined ? it.itemId : it.toolId);
          busyCountMap[id] = (busyCountMap[id] || 0) + (it.qty || 1);
        });
      });

      const allProducts = [...tools, ...items];
      allProducts.forEach(item => {
        allItems.push({
          ...item,
          shopUsername: username,
          shopName: username,
          shopPhone: info.phone || '',
          shopLat: shop.lat,
          shopLng: shop.lng,
          shopAddress: shop.address,
          shopCategory: info.category || 'tools',
          isBusy: (busyCountMap[String(item.id)] || 0) > 0,
          busyQty: busyCountMap[String(item.id)] || 0,
          availableQty: Math.max(0, (item.qty || 1) - (busyCountMap[String(item.id)] || 0))
        });
      });
    });

    renderShops();
    renderItems();
  } catch(e) {
    console.error(e);
    showEmpty('Ma\'lumot yuklanmadi. Internetni tekshiring.');
  }
}

function getItemName(item) {
  return item.name || (item.brand ? item.brand + (item.model?' '+item.model:'') : 'Nomsiz');
}

function getItemImage(item) {
  const src = item.imageBase64 || (item.images && item.images[0] && item.images[0].base64) || null;
  if (!src) return null;
  if (src.startsWith('http')) return src;
  if (src.startsWith('data:')) return src;
  return 'data:image/jpeg;base64,' + src;
}

function km(d) {
  if (d < 1) return Math.round(d*1000)+'m';
  return d.toFixed(1)+'km';
}

function renderShops() {
  const row = document.getElementById('shops-row');
  let shops = [...allShops];
  if (userLat && userLng) {
    shops.forEach(s => {
      s.distKm = (s.lat && s.lng) ? dist(userLat,userLng,s.lat,s.lng) : 9999;
    });
    shops.sort((a,b) => a.distKm - b.distKm);
  }
  document.getElementById('shops-count').textContent = shops.length ? '('+shops.length+' ta)' : '';
  row.innerHTML = shops.map(s => {
    const initial = s.name[0].toUpperCase();
    const distText = (userLat && s.distKm < 9999) ? km(s.distKm)+' uzoqda' : s.address ? s.address.substring(0,20) : '';
    const isActive = activeShop === s.username;
    return `<div class="shop-chip${isActive?' active':''}" onclick="selectShop('${s.username}')">
      <div class="shop-avatar">${initial}</div>
      <div>
        <div class="shop-info-name">${s.name}</div>
        <div class="shop-info-dist">${distText || CAT_NAMES[s.category]||''}</div>
      </div>
      <div class="shop-dot"></div>
    </div>`;
  }).join('') || '<div style="color:var(--muted);font-size:14px;padding:16px 0">Ijarachilar topilmadi</div>';
}

function selectShop(username) {
  activeShop = activeShop === username ? null : username;
  renderShops();
  renderItems();
}

function setFilter(f, el) {
  activeFilter = f;
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  renderItems();
}

function filterItems() {
  searchQuery = document.getElementById('search-input').value.toLowerCase();
  renderItems();
}

function getFilteredItems() {
  let list = [...allItems];
  if (activeShop) list = list.filter(i => i.shopUsername === activeShop);
  if (activeFilter === 'tools') list = list.filter(i => i.shopCategory === 'tools');
  else if (activeFilter === 'cars') list = list.filter(i => i.shopCategory === 'cars');
  else if (activeFilter === 'gaming') list = list.filter(i => i.shopCategory === 'gaming');
  else if (activeFilter === 'free') list = list.filter(i => !i.isBusy);
  else if (activeFilter === 'cheap') list = list.sort((a,b) => (a.dayRate||0)-(b.dayRate||0));
  if (searchQuery) list = list.filter(i => getItemName(i).toLowerCase().includes(searchQuery) || (i.type||'').toLowerCase().includes(searchQuery));
  if (userLat && userLng) {
    list.forEach(i => { i._dist = (i.shopLat && i.shopLng) ? dist(userLat,userLng,i.shopLat,i.shopLng) : 9999; });
    if (activeFilter !== 'cheap') list.sort((a,b) => a._dist - b._dist);
  }
  return list;
}

function renderItems() {
  const grid = document.getElementById('items-grid');
  const sub = document.getElementById('items-sub');
  const list = getFilteredItems();
  // update summary (available vs rented) for current list
    try {
    const total = list.length;
    const rented = list.filter(i => typeof i.availableQty !== 'undefined' ? i.availableQty === 0 : (i.isBusy?1:0)).length;
    const available = total - rented;
    const summaryEl = document.getElementById('items-summary');
    if (summaryEl) summaryEl.textContent = `Bo'sh: ${available} · Ijarada: ${rented} · Jami: ${total}`;
    const headerAvail = document.getElementById('available-count');
    if (headerAvail) headerAvail.textContent = `Bo'sh: ${available}`;
  } catch(e) { console.warn('Summary update failed', e); }
  if (!list.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty-icon">📦</div><p>Mahsulot topilmadi</p></div>';
    sub.textContent = '';
    return;
  }
  sub.textContent = list.length + ' ta mahsulot';
  grid.innerHTML = list.map(item => {
    const name = getItemName(item);
    const img = getItemImage(item);
    const icon = CAT_ICONS[item.shopCategory] || '📦';
    const price = Number(item.dayRate||0).toLocaleString('uz-UZ');
    const distText = (userLat && item._dist && item._dist < 9999) ? ' · '+km(item._dist) : '';
    return `<div class="item-card" onclick="openItem(${JSON.stringify(item).split('"').join('&quot;')})">
      <div class="item-img">${img ? `<img src="${img}" alt="${name}" loading="lazy">` : icon}</div>
      <div class="item-body">
        <div class="item-cat">${CAT_NAMES[item.shopCategory]||''}</div>
        <div class="item-name">${name}</div>
        <div class="item-shop">🏪 ${item.shopName}${distText}</div>
        ${item.qty ? `<div style="font-size:13px;color:var(--muted);margin:6px 0 8px">Umumiy soni: ${item.qty} ta${typeof item.availableQty !== 'undefined' ? ' · Bo\'sh: '+item.availableQty+' ta' : ''}</div>` : ''}
        <div class="item-footer">
          <div class="item-price">${price} <span>so'm/kun</span></div>
          <span class="${item.isBusy?'badge-busy':'badge-free'}">${item.availableQty===0?'Ijarada':item.availableQty+' ta qoldi'}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openItem(item) {
  if (typeof item.availableQty === 'undefined' && item && item.id) {
    const orig = allItems.find(i => i.id === item.id);
    if (orig) item = orig;
  }
  const name = getItemName(item);
  const img = getItemImage(item);
  const icon = CAT_ICONS[item.shopCategory] || '📦';
  const price = Number(item.dayRate||0).toLocaleString('uz-UZ');
  const mapUrl = (item.shopLat && item.shopLng)
    ? `https://maps.google.com/maps?q=${item.shopLat},${item.shopLng}&z=15&output=embed`
    : null;
  const initial = item.shopName[0].toUpperCase();

  document.getElementById('modal-content').innerHTML = `
    <div class="modal-img">${img ? `<img src="${img}" alt="${name}">` : icon}</div>
    <div class="modal-cat">${CAT_NAMES[item.shopCategory]||''}</div>
    <div class="modal-name">${name}</div>
    ${item.type ? `<div style="font-size:13px;color:var(--muted);margin-bottom:8px">Turi: ${item.type}</div>` : ''}
    ${item.qty ? `<div style="font-size:13px;color:var(--muted);margin-bottom:8px">
  Umumiy: ${item.qty} ta  · 
  Bo'sh: ${item.availableQty} ta  · 
  Ijarada: ${item.busyQty} ta
</div>` : ''}
    <div class="modal-price-row">
      <div class="modal-price">${price}</div>
      <div class="modal-price-label">so'm / kun</div>
      <span class="${item.isBusy?'badge-busy':'badge-free'}" style="margin-left:auto">${item.availableQty===0?'Ijarada':item.availableQty+' ta qoldi'}</span>
    </div>
    <div class="modal-divider"></div>
    <div class="modal-shop-row">
      <div class="modal-shop-avatar">${initial}</div>
      <div>
        <div class="modal-shop-name">🏪 ${item.shopName}</div>
        <div class="modal-shop-addr">${item.shopAddress || ''}</div>
      </div>
    </div>
    ${mapUrl ? `<iframe class="modal-map" src="${mapUrl}" loading="lazy" allowfullscreen frameborder="0"></iframe>` : ''}
    ${item.shopPhone ? `<button class="btn-call" onclick="window.location.href='tel:${item.shopPhone}'">
      📞 Qo'ng'iroq qilish — ${item.shopPhone}
    </button>` : '<div style="text-align:center;color:var(--muted);font-size:13px">Telefon raqam ko\'rsatilmagan</div>'}
  `;
  document.getElementById('modal-bg').classList.add('open');
}

function closeModal(e) { if(e.target.id==='modal-bg') closeModalBtn(); }
function closeModalBtn() { document.getElementById('modal-bg').classList.remove('open'); }

function showEmpty(msg) {
  document.getElementById('items-grid').innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🏗️</div><p>${msg}</p></div>`;
  document.getElementById('shops-row').innerHTML = '';
}

function getLocation() {
  if (!navigator.geolocation) return;
  document.getElementById('loc-label').textContent = 'Aniqlanmoqda...';
  navigator.geolocation.getCurrentPosition(pos => {
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;
    document.getElementById('loc-label').textContent = 'Joylashuv ✓';
    document.getElementById('loc-banner').style.display = 'none';
    renderShops();
    renderItems();
  }, () => {
    document.getElementById('loc-label').textContent = 'Joylashuv';
  });
}

document.getElementById('loc-banner').style.display = 'flex';
loadData();
