/**
 * Nilopasal Retailer ERP — POS Counter & Invoicing Controller
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

  // POS State
  const posState = {
    cart: [],
    overallDiscount: 0,
    paymentMethod: 'CASH',
    cashTendered: 0,
    paymentReference: '',
    customerType: 'WALK_IN', // 'WALK_IN' | 'KHATA'
    customerName: '',
    customerPhone: '',
    selectedCustomerId: null,
    isSubmitting: false,
    activeStore: null,
    currentUser: null,
  };

  // Check auth and load store header
  async function loadContext() {
    try {
      const auth = await request('/api/auth/me');
      if (!auth?.user || !auth.retailer?.access?.allowed) {
        location.href = './retailer-dashboard.html';
        return false;
      }
      posState.currentUser = auth.user;
      posState.activeStore = auth.retailer.business;

      setText('#retailer-user-name', `${auth.user.firstName} ${auth.user.lastName}`);
      setText('#retailer-topbar-shop-name', auth.retailer.business?.businessName || 'POS Terminal');
      setText('#pos-cashier-badge', `${auth.user.firstName} (Cashier)`);
      setText('#pos-store-name', auth.retailer.business?.businessName || 'Store');
      return true;
    } catch {
      location.href = './retailer-dashboard.html';
      return false;
    }
  }

  // Calculate bill totals
  function calculateTotals() {
    let grossSubtotal = 0;
    let lineDiscountTotal = 0;
    let taxableBase = 0;
    let nonTaxableBase = 0;
    let vatAmount = 0;

    for (const item of posState.cart) {
      const lineGross = item.price * item.quantity;
      const lineDisc = item.discount || 0;
      const netBase = Math.max(0, lineGross - lineDisc);

      grossSubtotal += lineGross;
      lineDiscountTotal += lineDisc;

      if (item.taxType === 'TAXABLE' && item.taxRate > 0) {
        const itemTax = netBase * (item.taxRate / 100);
        vatAmount += itemTax;
        taxableBase += netBase;
      } else {
        nonTaxableBase += netBase;
      }
    }

    const totalDiscount = lineDiscountTotal + (posState.overallDiscount || 0);
    const netSubtotal = Math.max(0, grossSubtotal - totalDiscount);
    const grandTotal = netSubtotal + vatAmount;

    return {
      grossSubtotal,
      totalDiscount,
      taxableBase,
      nonTaxableBase,
      vatAmount,
      grandTotal,
    };
  }

  // Render cart table and bill summary
  function renderCart() {
    const tbody = document.querySelector('#pos-cart-tbody');
    const emptyState = document.querySelector('#pos-cart-empty');
    const totals = calculateTotals();

    if (!tbody) return;

    if (posState.cart.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
    } else {
      if (emptyState) emptyState.classList.add('hidden');
      tbody.innerHTML = posState.cart.map((item, idx) => {
        const lineTotal = (item.price * item.quantity) - (item.discount || 0);
        return `
          <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition text-sm">
            <td class="px-4 py-3">
              <div class="font-bold text-slate-900">${item.name}</div>
              <div class="text-[11px] font-mono text-slate-400 font-medium">${item.sku} · ${item.taxType === 'TAXABLE' ? '13% VAT' : 'No VAT'}</div>
            </td>
            <td class="px-3 py-3 font-semibold text-slate-700">Rs. ${item.price.toFixed(2)}</td>
            <td class="px-3 py-3">
              <div class="inline-flex items-center rounded-lg border border-slate-200 bg-white">
                <button data-cart-minus="${idx}" class="px-2 py-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-l-lg transition font-bold text-xs">-</button>
                <input data-cart-qty="${idx}" type="number" min="1" max="${item.maxStock}" value="${item.quantity}" class="w-12 text-center text-xs font-black text-slate-900 focus:outline-none py-1">
                <button data-cart-plus="${idx}" class="px-2 py-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-r-lg transition font-bold text-xs">+</button>
              </div>
            </td>
            <td class="px-3 py-3 font-black text-slate-900">Rs. ${lineTotal.toFixed(2)}</td>
            <td class="px-3 py-3 text-right">
              <button data-cart-remove="${idx}" title="Remove" class="text-slate-400 hover:text-rose-600 p-1.5 transition">
                <i class="fa-solid fa-trash-can text-xs"></i>
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // Wire quantity stepper
      document.querySelectorAll('[data-cart-minus]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.currentTarget.dataset.cartMinus, 10);
          if (posState.cart[idx].quantity > 1) {
            posState.cart[idx].quantity--;
            renderCart();
          } else {
            posState.cart.splice(idx, 1);
            renderCart();
          }
        });
      });

      document.querySelectorAll('[data-cart-plus]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.currentTarget.dataset.cartPlus, 10);
          const item = posState.cart[idx];
          if (item.trackInventory && item.quantity >= item.maxStock) {
            alert(`Only ${item.maxStock} units available in stock!`);
            return;
          }
          item.quantity++;
          renderCart();
        });
      });

      document.querySelectorAll('[data-cart-qty]').forEach((input) => {
        input.addEventListener('change', (e) => {
          const idx = parseInt(e.currentTarget.dataset.cartQty, 10);
          const val = parseInt(e.target.value, 10);
          const item = posState.cart[idx];
          if (isNaN(val) || val < 1) {
            item.quantity = 1;
          } else if (item.trackInventory && val > item.maxStock) {
            alert(`Only ${item.maxStock} units in stock!`);
            item.quantity = item.maxStock;
          } else {
            item.quantity = val;
          }
          renderCart();
        });
      });

      document.querySelectorAll('[data-cart-remove]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.currentTarget.dataset.cartRemove, 10);
          posState.cart.splice(idx, 1);
          renderCart();
        });
      });
    }

    // Update Totals Display
    setText('#summary-item-count', `${posState.cart.reduce((a, b) => a + b.quantity, 0)} items`);
    setText('#summary-subtotal', formatNpr(totals.grossSubtotal));
    setText('#summary-taxable', formatNpr(totals.taxableBase));
    setText('#summary-non-taxable', formatNpr(totals.nonTaxableBase));
    setText('#summary-vat', formatNpr(totals.vatAmount));
    setText('#summary-discount', formatNpr(totals.totalDiscount));
    setText('#summary-grand-total', formatNpr(totals.grandTotal));

    // Update Change Due calculator if Cash payment
    updateChangeCalculator(totals.grandTotal);
  }

  function updateChangeCalculator(grandTotal) {
    const cashContainer = document.querySelector('#cash-tendered-container');
    const changeDisplay = document.querySelector('#cash-change-display');
    const tenderedInput = document.querySelector('#input-cash-tendered');

    if (posState.paymentMethod === 'CASH') {
      cashContainer?.classList.remove('hidden');
      const tendered = parseFloat(tenderedInput?.value || 0);
      const change = tendered - grandTotal;
      if (changeDisplay) {
        if (change >= 0) {
          changeDisplay.textContent = formatNpr(change);
          changeDisplay.className = 'font-black text-emerald-600 text-sm';
        } else {
          changeDisplay.textContent = `${formatNpr(Math.abs(change))} due`;
          changeDisplay.className = 'font-bold text-amber-600 text-sm';
        }
      }
    } else {
      cashContainer?.classList.add('hidden');
    }
  }

  // Add Item to Cart
  function addItemToCart(product, variant = null) {
    const pId = product.id;
    const vId = variant ? variant.id : null;
    const existingIdx = posState.cart.findIndex((c) => c.productId === pId && c.variantId === vId);

    const price = variant ? parseFloat(variant.sellingPrice) : parseFloat(product.sellingPrice);
    const maxStock = variant ? variant.quantityAvailable : product.totalQuantity;
    const name = variant ? `${product.name} (${variant.title})` : product.name;
    const sku = variant ? variant.sku : product.sku;

    if (product.trackInventory && maxStock <= 0) {
      alert(`"${name}" is out of stock!`);
      return;
    }

    if (existingIdx >= 0) {
      const currentQty = posState.cart[existingIdx].quantity;
      if (product.trackInventory && currentQty >= maxStock) {
        alert(`Cannot add more. Only ${maxStock} units in stock.`);
        return;
      }
      posState.cart[existingIdx].quantity++;
    } else {
      posState.cart.push({
        productId: pId,
        variantId: vId,
        name,
        sku,
        unit: product.unit,
        price,
        quantity: 1,
        maxStock,
        trackInventory: product.trackInventory,
        taxType: product.taxType,
        taxRate: parseFloat(product.taxRate || 0),
        discount: 0,
      });
    }

    renderCart();
  }

  // Search / Barcode Scanner input
  function initBarcodeScanner() {
    const searchInput = document.querySelector('#pos-barcode-input');
    const dropdown = document.querySelector('#pos-search-dropdown');

    let debounceTimer;

    searchInput?.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      const query = e.target.value.trim();

      if (!query) {
        if (dropdown) dropdown.classList.add('hidden');
        return;
      }

      debounceTimer = setTimeout(async () => {
        try {
          const res = await request(`/api/retailer/pos/lookup?query=${encodeURIComponent(query)}`);
          const items = res.items || [];

          // Exact single match on barcode? Immediately auto-add!
          const exactBarcodeMatch = items.find((p) => p.barcode === query);
          if (exactBarcodeMatch && items.length === 1) {
            addItemToCart(exactBarcodeMatch);
            searchInput.value = '';
            if (dropdown) dropdown.classList.add('hidden');
            return;
          }

          if (dropdown) {
            if (items.length === 0) {
              dropdown.innerHTML = `<div class="p-4 text-xs text-slate-400 text-center">No products found matching "${query}"</div>`;
              dropdown.classList.remove('hidden');
            } else {
              dropdown.innerHTML = items.map((p) => `
                <div data-product-select="${p.id}" class="p-3 hover:bg-blue-50 cursor-pointer border-b border-slate-100 flex items-center justify-between transition">
                  <div>
                    <p class="font-bold text-slate-900 text-xs">${p.name}</p>
                    <p class="text-[11px] text-slate-400 font-mono">${p.sku} ${p.barcode ? `· ${p.barcode}` : ''}</p>
                  </div>
                  <div class="text-right">
                    <p class="font-bold text-slate-900 text-xs">Rs. ${parseFloat(p.sellingPrice).toFixed(2)}</p>
                    <p class="text-[11px] ${p.totalQuantity <= 0 ? 'text-rose-600 font-bold' : 'text-slate-500'}">${p.totalQuantity} in stock</p>
                  </div>
                </div>
              `).join('');

              dropdown.querySelectorAll('[data-product-select]').forEach((row) => {
                row.addEventListener('click', (ev) => {
                  const id = ev.currentTarget.dataset.productSelect;
                  const chosen = items.find((x) => x.id === id);
                  if (chosen) {
                    addItemToCart(chosen);
                    searchInput.value = '';
                    dropdown.classList.add('hidden');
                  }
                });
              });

              dropdown.classList.remove('hidden');
            }
          }
        } catch (err) {
          console.error('POS lookup error', err);
        }
      }, 250);
    });

    // Enter key support: if scanner hits enter with exact match or single item
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const firstRow = dropdown?.querySelector('[data-product-select]');
        if (firstRow) {
          firstRow.click();
        }
      }
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!searchInput?.contains(e.target) && !dropdown?.contains(e.target)) {
        if (dropdown) dropdown.classList.add('hidden');
      }
    });
  }

  // Payment method switcher
  function initPaymentMethods() {
    const paymentButtons = document.querySelectorAll('.payment-method-btn');
    const refContainer = document.querySelector('#payment-reference-container');

    paymentButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        paymentButtons.forEach((b) => {
          b.classList.remove('border-blue-600', 'bg-blue-50/50', 'text-blue-900');
          b.classList.add('border-slate-200', 'text-slate-700');
        });
        e.currentTarget.classList.add('border-blue-600', 'bg-blue-50/50', 'text-blue-900');
        e.currentTarget.classList.remove('border-slate-200', 'text-slate-700');

        posState.paymentMethod = e.currentTarget.dataset.method;

        if (posState.paymentMethod === 'ESEWA' || posState.paymentMethod === 'KHALTI' || posState.paymentMethod === 'CARD' || posState.paymentMethod === 'BANK') {
          refContainer?.classList.remove('hidden');
        } else {
          refContainer?.classList.add('hidden');
        }

        renderCart();
      });
    });

    // Cash tendered input
    document.querySelector('#input-cash-tendered')?.addEventListener('input', () => {
      const totals = calculateTotals();
      updateChangeCalculator(totals.grandTotal);
    });

    // Customer mode switcher
    const custWalkinRadio = document.querySelector('#customer-mode-walkin');
    const custKhataRadio = document.querySelector('#customer-mode-khata');
    const khataFields = document.querySelector('#khata-customer-fields');

    custWalkinRadio?.addEventListener('change', () => {
      posState.customerType = 'WALK_IN';
      khataFields?.classList.add('hidden');
    });

    custKhataRadio?.addEventListener('change', () => {
      posState.customerType = 'KHATA';
      khataFields?.classList.remove('hidden');
    });
  }

  // Checkout Execution
  function initCheckout() {
    const checkoutBtn = document.querySelector('#btn-checkout-sale');
    const msgEl = document.querySelector('#pos-checkout-message');

    checkoutBtn?.addEventListener('click', async () => {
      if (posState.cart.length === 0) {
        alert('Cart is empty. Scan or select items before checking out.');
        return;
      }

      const totals = calculateTotals();

      const customerName = document.querySelector('#input-customer-name')?.value.trim();
      const customerPhone = document.querySelector('#input-customer-phone')?.value.trim();
      const reference = document.querySelector('#input-payment-reference')?.value.trim();

      if (posState.paymentMethod === 'CREDIT_KHATA' && !customerPhone) {
        alert('Customer phone number is required to make a Credit / Khata sale!');
        document.querySelector('#input-customer-phone')?.focus();
        return;
      }

      checkoutBtn.disabled = true;
      checkoutBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Generating Invoice...';

      const payload = {
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        items: posState.cart.map((item) => ({
          productId: item.productId,
          variantId: item.variantId || undefined,
          quantity: item.quantity,
          unitPrice: item.price,
          discount: item.discount || 0,
        })),
        discount: posState.overallDiscount || 0,
        payments: [
          {
            method: posState.paymentMethod,
            amount: totals.grandTotal,
            reference: reference || undefined,
          },
        ],
      };

      try {
        const sale = await request('/api/retailer/sales', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        // Open Printable Invoice Receipt
        showReceiptModal(sale);

        // Reset Cart
        posState.cart = [];
        posState.overallDiscount = 0;
        document.querySelector('#input-customer-name').value = '';
        document.querySelector('#input-customer-phone').value = '';
        document.querySelector('#input-payment-reference').value = '';
        document.querySelector('#input-cash-tendered').value = '';
        renderCart();
      } catch (err) {
        alert(err.message || 'Checkout failed. Please check stock and amounts.');
      } finally {
        checkoutBtn.disabled = false;
        checkoutBtn.innerHTML = '<i class="fa-solid fa-check-circle mr-2"></i> Complete Sale &amp; Print';
      }
    });

    // Clear Cart button
    document.querySelector('#btn-clear-cart')?.addEventListener('click', () => {
      if (posState.cart.length > 0 && confirm('Clear current cart items?')) {
        posState.cart = [];
        renderCart();
      }
    });
  }

  // Receipt Modal & Thermal / A4 Print
  function showReceiptModal(sale) {
    const modal = document.querySelector('#modal-sale-receipt');
    if (!modal) return;

    setText('#receipt-store-name', sale.retailerBusiness?.businessName || posState.activeStore?.businessName || 'Nilopasal Store');
    setText('#receipt-store-address', `${sale.retailerBusiness?.addressLine || ''}, ${sale.retailerBusiness?.district || ''}`);
    setText('#receipt-store-pan', `PAN/VAT: ${sale.retailerBusiness?.panNumber || sale.retailerBusiness?.vatNumber || 'N/A'}`);
    setText('#receipt-invoice-number', `Invoice: ${sale.invoiceNumber}`);
    setText('#receipt-datetime', new Date(sale.createdAt).toLocaleString());
    setText('#receipt-cashier', `Cashier: ${sale.creator ? `${sale.creator.firstName}` : posState.currentUser?.firstName || 'Staff'}`);
    setText('#receipt-customer', `Customer: ${sale.customer?.name || 'Walk-in'}${sale.customer?.phone ? ` (${sale.customer.phone})` : ''}`);

    const tbody = document.querySelector('#receipt-items-tbody');
    if (tbody) {
      tbody.innerHTML = sale.items.map((it) => `
        <tr class="border-b border-dashed border-slate-200 text-xs">
          <td class="py-1.5 text-left">${it.productNameSnapshot}</td>
          <td class="py-1.5 text-center">${it.quantity}</td>
          <td class="py-1.5 text-right">Rs. ${parseFloat(it.unitPrice).toFixed(2)}</td>
          <td class="py-1.5 text-right font-bold">Rs. ${parseFloat(it.subtotal).toFixed(2)}</td>
        </tr>
      `).join('');
    }

    setText('#receipt-subtotal', `Rs. ${parseFloat(sale.subtotal).toFixed(2)}`);
    setText('#receipt-tax', `Rs. ${parseFloat(sale.tax).toFixed(2)}`);
    setText('#receipt-grand-total', `Rs. ${parseFloat(sale.grandTotal).toFixed(2)}`);
    setText('#receipt-payment-method', `Paid via ${sale.payments?.[0]?.method || 'CASH'}`);

    modal.classList.remove('hidden');
  }

  function initReceiptActions() {
    document.querySelector('#btn-close-receipt')?.addEventListener('click', () => {
      document.querySelector('#modal-sale-receipt')?.classList.add('hidden');
    });

    document.querySelector('#btn-print-receipt')?.addEventListener('click', () => {
      window.print();
    });
  }

  // Keyboard Shortcuts (F1: Focus Search, F2: Checkout, Escape: Close Modal)
  function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        document.querySelector('#pos-barcode-input')?.focus();
      } else if (e.key === 'F2') {
        e.preventDefault();
        document.querySelector('#btn-checkout-sale')?.click();
      } else if (e.key === 'Escape') {
        document.querySelector('#modal-sale-receipt')?.classList.add('hidden');
      }
    });
  }

  // ==========================================
  // SALES INVOICES LISTING PAGE CONTROLLER
  // ==========================================
  async function initSalesPage() {
    const isSalesPage = document.body.matches('[data-page="retailer-sales"]');
    if (!isSalesPage) return;

    const ok = await loadContext();
    if (!ok) return;

    let search = '';
    let status = '';

    async function loadSales() {
      const tbody = document.querySelector('#sales-tbody');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2 text-blue-500 block"></i>Loading sales history...</td></tr>`;
      }

      try {
        let url = '/api/retailer/sales?limit=30';
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (status) url += `&paymentStatus=${encodeURIComponent(status)}`;

        const data = await request(url);
        const sales = data.items || [];

        if (!tbody) return;

        if (sales.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="7" class="px-6 py-12 text-center text-slate-400">
                <i class="fa-solid fa-receipt text-3xl mb-3 text-slate-300 block"></i>
                <p class="font-bold text-slate-600 text-sm">No sales recorded yet</p>
                <p class="text-xs text-slate-400 mt-1">Open POS Counter to make your first retail sale.</p>
              </td>
            </tr>
          `;
          return;
        }

        tbody.innerHTML = sales.map((s) => {
          const pm = s.payments?.[0]?.method || 'CASH';
          return `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition text-sm">
              <td class="px-6 py-4 font-mono font-bold text-slate-900">${s.invoiceNumber}</td>
              <td class="px-6 py-4 text-xs text-slate-500 font-mono">${new Date(s.saleDate).toLocaleString()}</td>
              <td class="px-6 py-4">
                <div class="font-semibold text-slate-900">${s.customerName}</div>
                ${s.customerPhone ? `<div class="text-xs text-slate-400 font-mono">${s.customerPhone}</div>` : ''}
              </td>
              <td class="px-6 py-4 text-xs font-semibold text-slate-600">${s.itemCount} items</td>
              <td class="px-6 py-4 font-black text-slate-900">Rs. ${parseFloat(s.grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              <td class="px-6 py-4">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${s.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                  ${s.paymentStatus} (${pm})
                </span>
              </td>
              <td class="px-6 py-4 text-right">
                <button data-view-invoice="${s.id}" class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition">
                  <i class="fa-solid fa-file-invoice text-blue-600 mr-1"></i> View Bill
                </button>
              </td>
            </tr>
          `;
        }).join('');

        document.querySelectorAll('[data-view-invoice]').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            const saleId = e.currentTarget.dataset.viewInvoice;
            try {
              const fullSale = await request(`/api/retailer/sales/${saleId}`);
              showReceiptModal(fullSale);
            } catch (err) {
              alert(err.message || 'Could not load invoice');
            }
          });
        });
      } catch (err) {
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-rose-500 font-semibold text-xs">${err.message || 'Error loading sales'}</td></tr>`;
        }
      }
    }

    // Search filter
    const searchInput = document.querySelector('#search-sales');
    let searchDebounce;
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        search = e.target.value.trim();
        loadSales();
      }, 300);
    });

    await loadSales();
  }

  // Initialize
  async function init() {
    if (document.body.matches('[data-page="retailer-pos"]')) {
      const ok = await loadContext();
      if (ok) {
        initBarcodeScanner();
        initPaymentMethods();
        initCheckout();
        initReceiptActions();
        initKeyboardShortcuts();
        renderCart();
      }
    } else if (document.body.matches('[data-page="retailer-sales"]')) {
      initReceiptActions();
      initSalesPage();
    }
  }

  init();
})();
