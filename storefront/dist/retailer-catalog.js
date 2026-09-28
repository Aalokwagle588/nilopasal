/**
 * Nilopasal Retailer ERP — Catalog & Inventory Client
 */
(function () {
  const request = window.nilopasalApiRequest || async function (path, options = {}) {
    const base = window.NILOPASAL_API_BASE || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:4000' : '');
    const res = await fetch(`${base}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || payload?.success === false) {
      throw new Error(payload?.error?.message || 'Request failed');
    }
    return payload?.data;
  };

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((el) => {
      el.textContent = value;
    });
  }

  function formatNpr(amount) {
    return `Rs. ${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Common Header & Store Context Loader
  async function loadStoreContext() {
    try {
      const authData = await request('/api/auth/me');
      const user = authData.user;
      const retailer = authData.retailer;
      const access = retailer?.access;
      const business = retailer?.business;

      if (!user || !access || !access.allowed) {
        // Redirect to dashboard gate if not permitted
        location.href = './retailer-dashboard.html';
        return null;
      }

      setText('#retailer-user-name', `${user.firstName} ${user.lastName}`);
      setText('#retailer-user-email', user.email);
      setText('#retailer-business-name', business?.businessName || 'My Store');
      setText('#retailer-topbar-shop-name', business?.businessName || 'My Store');
      setText('#retailer-status-verification', String(business?.verificationStatus || 'VERIFIED').replaceAll('_', ' '));
      setText('#retailer-status-subscription', String(business?.subscriptionStatus || 'ACTIVE').replaceAll('_', ' '));

      return { user, retailer, business };
    } catch {
      location.href = './retailer-dashboard.html';
      return null;
    }
  }

  // ========================================================
  // PRODUCTS PAGE CONTROLLER
  // ========================================================
  async function initProductsPage() {
    const pageContainer = document.querySelector('[data-page="retailer-products"]');
    if (!pageContainer) return;

    const ctx = await loadStoreContext();
    if (!ctx) return;

    let categories = [];
    let currentFilter = 'ALL';
    let searchQuery = '';
    let selectedCategoryId = '';

    // Load categories for filter & modal dropdowns
    async function loadCategories() {
      try {
        const data = await request('/api/retailer/categories');
        categories = data.categories || [];

        const catSelect = document.querySelector('#filter-category');
        const modalCatSelect = document.querySelector('#modal-product-category');

        if (catSelect) {
          catSelect.innerHTML = '<option value="">All Categories</option>' +
            categories.map((c) => `<option value="${c.id}">${c.name} (${c._count?.products || 0})</option>`).join('');
        }

        if (modalCatSelect) {
          modalCatSelect.innerHTML = '<option value="">-- No Category --</option>' +
            categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
        }
      } catch (err) {
        console.error('Failed to load categories', err);
      }
    }

    // Load and render products
    async function loadProducts() {
      const tbody = document.querySelector('#products-tbody');
      const countEl = document.querySelector('#products-count-badge');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="px-6 py-12 text-center text-slate-400">
              <i class="fa-solid fa-spinner fa-spin text-2xl mb-2 text-blue-500 block"></i>
              Loading store catalog...
            </td>
          </tr>
        `;
      }

      try {
        let url = `/api/retailer/products?stockStatus=${encodeURIComponent(currentFilter)}`;
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
        if (selectedCategoryId) url += `&categoryId=${encodeURIComponent(selectedCategoryId)}`;

        const data = await request(url);
        const products = data.items || [];

        if (countEl) {
          countEl.textContent = `${products.length} Products`;
        }

        if (!tbody) return;

        if (products.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="7" class="px-6 py-12 text-center text-slate-400">
                <i class="fa-solid fa-box-open text-3xl mb-3 text-slate-300 block"></i>
                <p class="font-bold text-slate-600 text-sm">No products found</p>
                <p class="text-xs text-slate-400 mt-1">Add items to your catalog to start managing store stock and POS sales.</p>
                <button id="empty-add-product-btn" class="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition">
                  <i class="fa-solid fa-plus mr-1"></i> Add First Product
                </button>
              </td>
            </tr>
          `;
          document.querySelector('#empty-add-product-btn')?.addEventListener('click', openAddProductModal);
          return;
        }

        tbody.innerHTML = products.map((prod) => {
          let badgeClass = 'bg-emerald-100 text-emerald-800';
          let badgeText = 'In Stock';
          if (prod.stockStatus === 'OUT_OF_STOCK') {
            badgeClass = 'bg-rose-100 text-rose-800';
            badgeText = 'Out of Stock';
          } else if (prod.stockStatus === 'LOW_STOCK') {
            badgeClass = 'bg-amber-100 text-amber-800';
            badgeText = 'Low Stock';
          }

          const invId = prod.inventories?.[0]?.id || '';

          return `
            <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition text-sm">
              <td class="px-6 py-4">
                <div class="font-bold text-slate-900">${prod.name}</div>
                <div class="text-xs text-slate-400 font-medium">${prod.category?.name || 'Uncategorized'} · Unit: ${prod.unit}</div>
              </td>
              <td class="px-6 py-4 font-mono text-xs font-semibold text-slate-600">
                ${prod.sku}
                ${prod.barcode ? `<span class="block text-[11px] text-slate-400 font-mono">${prod.barcode}</span>` : ''}
              </td>
              <td class="px-6 py-4 font-semibold text-slate-600">Rs. ${Number(prod.costPrice).toFixed(2)}</td>
              <td class="px-6 py-4 font-bold text-slate-900">Rs. ${Number(prod.sellingPrice).toFixed(2)}</td>
              <td class="px-6 py-4 font-black text-slate-900">${prod.totalQuantity} <span class="text-xs font-normal text-slate-500">${prod.unit.toLowerCase()}</span></td>
              <td class="px-6 py-4">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${badgeClass}">
                  ${badgeText}
                </span>
              </td>
              <td class="px-6 py-4 text-right">
                <button data-adjust-id="${invId}" data-adjust-name="${encodeURIComponent(prod.name)}" data-adjust-sku="${prod.sku}" data-adjust-balance="${prod.totalQuantity}" class="btn-quick-adjust px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition">
                  <i class="fa-solid fa-sliders text-blue-600 mr-1"></i> Adjust
                </button>
              </td>
            </tr>
          `;
        }).join('');

        // Wire quick adjust buttons
        document.querySelectorAll('.btn-quick-adjust').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const b = e.currentTarget;
            openAdjustModal({
              inventoryId: b.dataset.adjustId,
              name: decodeURIComponent(b.dataset.adjustName),
              sku: b.dataset.adjustSku,
              balance: Number(b.dataset.adjustBalance || 0),
            });
          });
        });
      } catch (err) {
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-rose-500 font-semibold text-xs">${err.message || 'Error loading products'}</td></tr>`;
        }
      }
    }

    // Modal Handling: Add Product
    const modalAdd = document.querySelector('#modal-add-product');
    const formAdd = document.querySelector('#form-add-product');
    const msgAdd = document.querySelector('#modal-add-message');

    function openAddProductModal() {
      if (formAdd) formAdd.reset();
      if (msgAdd) msgAdd.textContent = '';
      modalAdd?.classList.remove('hidden');
    }

    function closeAddProductModal() {
      modalAdd?.classList.add('hidden');
    }

    document.querySelector('#btn-open-add-product')?.addEventListener('click', openAddProductModal);
    document.querySelector('#btn-close-add-product')?.addEventListener('click', closeAddProductModal);
    document.querySelector('#btn-cancel-add-product')?.addEventListener('click', closeAddProductModal);

    // Form Submission: Add Product
    formAdd?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!msgAdd) return;

      msgAdd.textContent = 'Saving product...';
      msgAdd.className = 'text-xs font-bold text-blue-600 block mt-2';

      const formData = new FormData(formAdd);
      const payload = {
        name: formData.get('name'),
        categoryId: formData.get('categoryId') || undefined,
        sku: formData.get('sku') || undefined,
        barcode: formData.get('barcode') || undefined,
        unit: formData.get('unit') || 'PCS',
        costPrice: Number(formData.get('costPrice') || 0),
        sellingPrice: Number(formData.get('sellingPrice') || 0),
        mrp: formData.get('mrp') ? Number(formData.get('mrp')) : undefined,
        taxType: formData.get('taxType') || 'NON_TAXABLE',
        taxRate: Number(formData.get('taxRate') || 0),
        initialStock: Number(formData.get('initialStock') || 0),
        lowStockThreshold: Number(formData.get('lowStockThreshold') || 5),
      };

      try {
        await request('/api/retailer/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        msgAdd.textContent = 'Product created successfully!';
        msgAdd.className = 'text-xs font-bold text-emerald-600 block mt-2';

        setTimeout(() => {
          closeAddProductModal();
          loadProducts();
          loadCategories();
        }, 600);
      } catch (err) {
        msgAdd.textContent = err.message || 'Failed to create product';
        msgAdd.className = 'text-xs font-bold text-rose-600 block mt-2';
      }
    });

    // Modal Handling: Quick Category Creator
    const btnNewCat = document.querySelector('#btn-quick-new-category');
    btnNewCat?.addEventListener('click', async () => {
      const name = prompt('Enter new category name:');
      if (!name || !name.trim()) return;
      try {
        const cat = await request('/api/retailer/categories', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim() }),
        });
        alert(`Category "${cat.name}" created!`);
        await loadCategories();
        const modalCatSelect = document.querySelector('#modal-product-category');
        if (modalCatSelect) modalCatSelect.value = cat.id;
      } catch (err) {
        alert(err.message || 'Could not create category');
      }
    });

    // Filter Listeners
    document.querySelectorAll('.filter-tab-btn').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-tab-btn').forEach((t) => {
          t.classList.remove('bg-white', 'text-slate-900', 'shadow-xs');
          t.classList.add('text-slate-600');
        });
        e.currentTarget.classList.add('bg-white', 'text-slate-900', 'shadow-xs');
        e.currentTarget.classList.remove('text-slate-600');
        currentFilter = e.currentTarget.dataset.filter || 'ALL';
        loadProducts();
      });
    });

    const searchInput = document.querySelector('#search-products');
    let searchDebounce;
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchQuery = e.target.value.trim();
        loadProducts();
      }, 300);
    });

    const catSelect = document.querySelector('#filter-category');
    catSelect?.addEventListener('change', (e) => {
      selectedCategoryId = e.target.value;
      loadProducts();
    });

    // Check query params (e.g. ?action=new)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'new') {
      openAddProductModal();
    }

    await loadCategories();
    await loadProducts();
  }

  // ========================================================
  // INVENTORY ERP PAGE CONTROLLER
  // ========================================================
  async function initInventoryPage() {
    const pageContainer = document.querySelector('[data-page="retailer-inventory"]');
    if (!pageContainer) return;

    const ctx = await loadStoreContext();
    if (!ctx) return;

    let currentTab = 'balances'; // 'balances' | 'audit'
    let currentStatusFilter = '';
    let searchQuery = '';

    // Load inventory balances & KPIs
    async function loadInventoryData() {
      const tbody = document.querySelector('#inventory-tbody');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="px-6 py-12 text-center text-slate-400">
              <i class="fa-solid fa-spinner fa-spin text-2xl mb-2 text-blue-500 block"></i>
              Calculating real-time inventory balances...
            </td>
          </tr>
        `;
      }

      try {
        let url = '/api/retailer/inventory?limit=50';
        if (currentStatusFilter) url += `&status=${encodeURIComponent(currentStatusFilter)}`;
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;

        const data = await request(url);
        const { kpis, items } = data;

        // Render KPI Cards
        setText('#kpi-total-skus', String(kpis.totalSkus || 0));
        setText('#kpi-total-units', String(kpis.totalUnits || 0));
        setText('#kpi-total-valuation', `Rs. ${Number(kpis.totalValuation || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
        setText('#kpi-low-stock', String(kpis.lowStockCount || 0));
        setText('#kpi-out-of-stock', String(kpis.outOfStockCount || 0));

        if (!tbody) return;

        if (items.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="8" class="px-6 py-12 text-center text-slate-400">
                <i class="fa-solid fa-warehouse text-3xl mb-3 text-slate-300 block"></i>
                <p class="font-bold text-slate-600 text-sm">No inventory records</p>
                <p class="text-xs text-slate-400 mt-1">Create products to begin tracking real stock levels and valuations.</p>
              </td>
            </tr>
          `;
          return;
        }

        tbody.innerHTML = items.map((inv) => {
          let badgeClass = 'bg-emerald-100 text-emerald-800';
          let badgeText = 'In Stock';
          if (inv.health === 'OUT_OF_STOCK') {
            badgeClass = 'bg-rose-100 text-rose-800';
            badgeText = 'Out of Stock';
          } else if (inv.health === 'LOW_STOCK') {
            badgeClass = 'bg-amber-100 text-amber-800';
            badgeText = 'Low Stock';
          }

          const displayName = inv.variantTitle ? `${inv.productName} (${inv.variantTitle})` : inv.productName;

          return `
            <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition text-sm">
              <td class="px-6 py-4">
                <div class="font-bold text-slate-900">${displayName}</div>
                <div class="text-xs text-slate-400 font-medium">${inv.categoryName}</div>
              </td>
              <td class="px-6 py-4 font-mono text-xs font-semibold text-slate-600">${inv.sku}</td>
              <td class="px-6 py-4 font-medium text-slate-600">Rs. ${Number(inv.costPrice).toFixed(2)}</td>
              <td class="px-6 py-4 font-medium text-slate-900">Rs. ${Number(inv.sellingPrice).toFixed(2)}</td>
              <td class="px-6 py-4 font-black text-slate-900 text-base">${inv.quantityAvailable} <span class="text-xs font-normal text-slate-500">${inv.unit.toLowerCase()}</span></td>
              <td class="px-6 py-4 font-bold text-blue-950">Rs. ${Number(inv.valuation).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              <td class="px-6 py-4">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${badgeClass}">
                  ${badgeText}
                </span>
              </td>
              <td class="px-6 py-4 text-right">
                <button data-adjust-id="${inv.id}" data-adjust-name="${encodeURIComponent(displayName)}" data-adjust-sku="${inv.sku}" data-adjust-balance="${inv.quantityAvailable}" class="btn-open-adjust px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition">
                  <i class="fa-solid fa-sliders mr-1"></i> Stock Adjust
                </button>
              </td>
            </tr>
          `;
        }).join('');

        // Wire adjust buttons
        document.querySelectorAll('.btn-open-adjust').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const b = e.currentTarget;
            openAdjustModal({
              inventoryId: b.dataset.adjustId,
              name: decodeURIComponent(b.dataset.adjustName),
              sku: b.dataset.adjustSku,
              balance: Number(b.dataset.adjustBalance || 0),
            });
          });
        });
      } catch (err) {
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-8 text-center text-rose-500 font-semibold text-xs">${err.message || 'Error loading inventory'}</td></tr>`;
        }
      }
    }

    // Load Stock Audit Log
    async function loadAuditLog() {
      const tbody = document.querySelector('#audit-tbody');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="px-6 py-12 text-center text-slate-400">
              <i class="fa-solid fa-spinner fa-spin text-2xl mb-2 text-blue-500 block"></i>
              Fetching immutable stock ledger...
            </td>
          </tr>
        `;
      }

      try {
        const data = await request('/api/retailer/inventory/transactions?limit=40');
        const transactions = data.items || [];

        if (!tbody) return;

        if (transactions.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="7" class="px-6 py-12 text-center text-slate-400">
                <i class="fa-solid fa-clock-rotate-left text-3xl mb-3 text-slate-300 block"></i>
                <p class="font-bold text-slate-600 text-sm">No stock transactions logged yet</p>
                <p class="text-xs text-slate-400 mt-1">Every stock-in, damage write-off, or inventory count adjustment is permanently recorded here.</p>
              </td>
            </tr>
          `;
          return;
        }

        tbody.innerHTML = transactions.map((tx) => {
          const inv = tx.inventory;
          const itemName = inv?.variant?.title ? `${inv.product.name} (${inv.variant.title})` : (inv?.product?.name || 'Item');
          const sku = inv?.variant?.sku ?? inv?.product?.sku ?? 'N/A';

          const isPlus = tx.type === 'STOCK_IN' || tx.type === 'ADJUSTMENT_IN' || tx.type === 'PURCHASE' || tx.type === 'SALE_RETURN';
          const changeSign = isPlus ? `+${tx.quantity}` : `-${tx.quantity}`;
          const badgeClass = isPlus ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800';

          const actorName = tx.user ? `${tx.user.firstName} ${tx.user.lastName}` : 'System';

          return `
            <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition text-sm">
              <td class="px-6 py-3.5 text-xs text-slate-500 font-mono">
                ${new Date(tx.createdAt).toLocaleString()}
              </td>
              <td class="px-6 py-3.5 font-bold text-slate-900">
                ${itemName}
                <span class="block text-xs font-mono font-medium text-slate-400">${sku}</span>
              </td>
              <td class="px-6 py-3.5">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${badgeClass}">
                  ${tx.type.replaceAll('_', ' ')}
                </span>
              </td>
              <td class="px-6 py-3.5 font-black text-slate-900">${changeSign}</td>
              <td class="px-6 py-3.5 text-xs font-semibold text-slate-600">
                ${tx.previousQuantity} &rarr; <span class="font-bold text-slate-900">${tx.newQuantity}</span>
              </td>
              <td class="px-6 py-3.5 text-xs text-slate-600 italic">
                ${tx.reason || 'None specified'}
              </td>
              <td class="px-6 py-3.5 text-xs font-semibold text-slate-600">
                ${actorName}
              </td>
            </tr>
          `;
        }).join('');
      } catch (err) {
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-rose-500 font-semibold text-xs">${err.message || 'Error loading audit transactions'}</td></tr>`;
        }
      }
    }

    // Tab Navigation
    document.querySelector('#tab-btn-balances')?.addEventListener('click', () => {
      currentTab = 'balances';
      document.querySelector('#panel-balances')?.classList.remove('hidden');
      document.querySelector('#panel-audit')?.classList.add('hidden');
      document.querySelector('#tab-btn-balances').className = 'px-4 py-2 border-b-2 border-blue-600 font-bold text-blue-600 text-sm';
      document.querySelector('#tab-btn-audit').className = 'px-4 py-2 border-b-2 border-transparent font-semibold text-slate-500 hover:text-slate-800 text-sm';
      loadInventoryData();
    });

    document.querySelector('#tab-btn-audit')?.addEventListener('click', () => {
      currentTab = 'audit';
      document.querySelector('#panel-audit')?.classList.remove('hidden');
      document.querySelector('#panel-balances')?.classList.add('hidden');
      document.querySelector('#tab-btn-audit').className = 'px-4 py-2 border-b-2 border-blue-600 font-bold text-blue-600 text-sm';
      document.querySelector('#tab-btn-balances').className = 'px-4 py-2 border-b-2 border-transparent font-semibold text-slate-500 hover:text-slate-800 text-sm';
      loadAuditLog();
    });

    // KPI Card Clickable Filters
    document.querySelector('#card-low-stock-kpi')?.addEventListener('click', () => {
      currentStatusFilter = 'LOW_STOCK';
      loadInventoryData();
    });

    document.querySelector('#card-out-of-stock-kpi')?.addEventListener('click', () => {
      currentStatusFilter = 'OUT_OF_STOCK';
      loadInventoryData();
    });

    // Search filter
    const invSearch = document.querySelector('#search-inventory');
    let invDebounce;
    invSearch?.addEventListener('input', (e) => {
      clearTimeout(invDebounce);
      invDebounce = setTimeout(() => {
        searchQuery = e.target.value.trim();
        loadInventoryData();
      }, 300);
    });

    // Check query params (e.g. ?filter=low-stock)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('filter') === 'low-stock') {
      currentStatusFilter = 'LOW_STOCK';
    }

    await loadInventoryData();
  }

  // ========================================================
  // SHARED MODAL: STOCK ADJUSTMENT
  // ========================================================
  let activeAdjustInventory = null;

  function openAdjustModal(inv) {
    activeAdjustInventory = inv;
    const modal = document.querySelector('#modal-adjust-stock');
    if (!modal) return;

    setText('#adjust-product-title', inv.name);
    setText('#adjust-product-sku', inv.sku);
    setText('#adjust-current-balance', `${inv.balance} units`);

    const qtyInput = document.querySelector('#adjust-quantity');
    const reasonInput = document.querySelector('#adjust-reason');
    const typeSelect = document.querySelector('#adjust-type');
    const previewEl = document.querySelector('#adjust-preview-balance');
    const msgEl = document.querySelector('#adjust-message');

    if (qtyInput) qtyInput.value = '1';
    if (reasonInput) reasonInput.value = '';
    if (msgEl) msgEl.textContent = '';

    function updatePreview() {
      const type = typeSelect?.value || 'STOCK_IN';
      const qty = parseInt(qtyInput?.value || '0', 10);
      const isPlus = type === 'STOCK_IN' || type === 'ADJUSTMENT_IN';
      const newBal = isPlus ? inv.balance + qty : inv.balance - qty;

      if (previewEl) {
        if (newBal < 0) {
          previewEl.textContent = `${newBal} units (ILLEGAL: Negative stock)`;
          previewEl.className = 'font-black text-rose-600';
        } else {
          previewEl.textContent = `${newBal} units`;
          previewEl.className = 'font-black text-blue-700';
        }
      }
    }

    qtyInput?.addEventListener('input', updatePreview);
    typeSelect?.addEventListener('change', updatePreview);
    updatePreview();

    modal.classList.remove('hidden');
  }

  function closeAdjustModal() {
    document.querySelector('#modal-adjust-stock')?.classList.add('hidden');
  }

  document.querySelector('#btn-close-adjust')?.addEventListener('click', closeAdjustModal);
  document.querySelector('#btn-cancel-adjust')?.addEventListener('click', closeAdjustModal);

  document.querySelector('#form-adjust-stock')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeAdjustInventory) return;

    const msgEl = document.querySelector('#adjust-message');
    if (msgEl) {
      msgEl.textContent = 'Processing stock adjustment...';
      msgEl.className = 'text-xs font-bold text-blue-600 block mt-2';
    }

    const type = document.querySelector('#adjust-type')?.value;
    const quantity = parseInt(document.querySelector('#adjust-quantity')?.value || '0', 10);
    const reason = document.querySelector('#adjust-reason')?.value.trim();

    try {
      await request('/api/retailer/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          inventoryId: activeAdjustInventory.inventoryId,
          type,
          quantity,
          reason,
        }),
      });

      if (msgEl) {
        msgEl.textContent = 'Stock updated and audited successfully!';
        msgEl.className = 'text-xs font-bold text-emerald-600 block mt-2';
      }

      setTimeout(() => {
        closeAdjustModal();
        // Refresh whichever page is currently active
        if (document.body.matches('[data-page="retailer-products"]')) {
          location.reload();
        } else if (document.body.matches('[data-page="retailer-inventory"]')) {
          location.reload();
        }
      }, 600);
    } catch (err) {
      if (msgEl) {
        msgEl.textContent = err.message || 'Failed to adjust stock';
        msgEl.className = 'text-xs font-bold text-rose-600 block mt-2';
      }
    }
  });

  // Handle logout
  document.querySelector('#retailer-logout-btn')?.addEventListener('click', async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' });
      location.href = './account.html';
    } catch (err) {
      alert(err.message || 'Could not sign out');
    }
  });

  // Initialize active page
  initProductsPage();
  initInventoryPage();
})();
