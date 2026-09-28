/**
 * Nilopasal Retailer ERP — Supplier Purchasing & Inbound Stock Controller
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

  function formatDate(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const page = document.body.dataset.page;

  async function loadContext() {
    try {
      const auth = await request('/api/auth/me');
      if (!auth?.user || !auth.retailer?.access?.allowed) {
        location.href = './retailer-dashboard.html';
        return false;
      }
      setText('#retailer-user-name', `${auth.user.firstName} ${auth.user.lastName}`);
      setText('#retailer-user-email', `${auth.retailer.role || 'Staff'}`);
      setText('#retailer-business-name', auth.retailer.business?.businessName || 'Store');
      setText('#sup-stmt-store-name', auth.retailer.business?.businessName || 'Store');
      setText('#view-po-store-name', auth.retailer.business?.businessName || 'Store');
      return true;
    } catch {
      location.href = './retailer-dashboard.html';
      return false;
    }
  }

  function openModal(id) {
    const el = document.querySelector(`#${id}`);
    if (el) el.classList.remove('hidden');
  }

  function closeModal(id) {
    const el = document.querySelector(`#${id}`);
    if (el) el.classList.add('hidden');
  }

  // ==========================================
  // 1. SUPPLIERS PAGE LOGIC
  // ==========================================
  if (page === 'retailer-suppliers') {
    const supplierState = {
      suppliers: [],
      search: '',
      hasBalance: 'ALL',
      page: 1,
      limit: 20,
      totalPages: 1,
    };

    async function fetchSuppliers() {
      const tbody = document.querySelector('#suppliers-tbody');
      try {
        const queryParams = new URLSearchParams({
          page: supplierState.page.toString(),
          limit: supplierState.limit.toString(),
          hasBalance: supplierState.hasBalance,
        });
        if (supplierState.search) {
          queryParams.set('search', supplierState.search);
        }

        const res = await request(`/api/retailer/suppliers?${queryParams.toString()}`);
        supplierState.suppliers = res.suppliers || [];
        supplierState.totalPages = res.pagination?.totalPages || 1;

        setText('#kpi-total-payables', formatNpr(res.summary?.totalPayables));
        setText('#kpi-suppliers-with-dues', (res.summary?.suppliersWithDues || 0).toLocaleString());
        setText('#kpi-total-suppliers', (res.summary?.totalSuppliers || 0).toLocaleString());

        setText('#supplier-pagination-info', `Showing ${supplierState.suppliers.length} of ${res.pagination?.total || 0} suppliers (Page ${supplierState.page} of ${supplierState.totalPages})`);
        const prevBtn = document.querySelector('#supplier-prev-page-btn');
        const nextBtn = document.querySelector('#supplier-next-page-btn');
        if (prevBtn) prevBtn.disabled = supplierState.page <= 1;
        if (nextBtn) nextBtn.disabled = supplierState.page >= supplierState.totalPages;

        renderSuppliersTable();
      } catch (err) {
        if (tbody) {
          tbody.innerHTML = `
            <tr>
              <td colspan="6" class="p-8 text-center text-rose-500 font-semibold">
                Failed to load suppliers: ${err.message}
              </td>
            </tr>
          `;
        }
      }
    }

    function renderSuppliersTable() {
      const tbody = document.querySelector('#suppliers-tbody');
      if (!tbody) return;

      if (!supplierState.suppliers.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="p-10 text-center text-slate-400">
              <i class="fa-solid fa-truck-field text-2xl mb-2 text-slate-300"></i>
              <p class="font-bold text-slate-600">No suppliers registered</p>
              <p class="text-xs text-slate-400 mt-0.5">Click "+ Add Supplier" to register your wholesale vendors.</p>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = supplierState.suppliers
        .map((s) => {
          const balance = Number(s.currentBalance || 0);
          let badge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">Settled (Rs. 0)</span>';
          let balClass = 'text-slate-800 font-bold';
          if (balance > 0) {
            balClass = 'text-rose-600 font-black';
            badge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">Pending Payable</span>';
          }

          return `
            <tr class="hover:bg-slate-50/80 transition" data-id="${s.id}">
              <td class="px-5 py-3">
                <div class="font-bold text-slate-900">${s.name}</div>
                <div class="text-[11px] text-slate-400">${s.companyName || 'Individual Trader'} &bull; ${s._count?.purchases || 0} orders</div>
              </td>
              <td class="px-5 py-3">
                <div class="font-semibold text-slate-800 flex items-center gap-1.5">
                  <i class="fa-solid fa-phone text-[10px] text-slate-400"></i> ${s.phone}
                </div>
                <div class="text-[11px] text-slate-400">${s.address || 'No address specified'}</div>
              </td>
              <td class="px-5 py-3">
                <div class="text-[11px] font-mono text-slate-600">PAN: ${s.panNumber || '-'}</div>
                <div class="text-[10px] text-slate-400">VAT: ${s.vatNumber || '-'}</div>
              </td>
              <td class="px-5 py-3">
                <span class="${balClass} text-sm">${formatNpr(balance)}</span>
              </td>
              <td class="px-5 py-3">${badge}</td>
              <td class="px-5 py-3 text-right">
                <div class="inline-flex items-center gap-1.5">
                  <button
                    class="pay-supplier-btn px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition"
                    data-id="${s.id}"
                    data-name="${s.name}"
                    data-due="${balance}"
                    title="Record payment made to supplier"
                  >
                    <i class="fa-solid fa-money-bill-transfer mr-1"></i> Pay
                  </button>
                  <button
                    class="sup-statement-btn px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition"
                    data-id="${s.id}"
                    title="View purchase &amp; payment ledger"
                  >
                    <i class="fa-solid fa-file-invoice mr-1 text-amber-600"></i> Statement
                  </button>
                  <a
                    href="./retailer-purchases.html?supplierId=${s.id}"
                    class="px-2 py-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                    title="New Purchase Order"
                  >
                    <i class="fa-solid fa-cart-plus"></i>
                  </a>
                </div>
              </td>
            </tr>
          `;
        })
        .join('');

      tbody.querySelectorAll('.pay-supplier-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          openPayModal(btn.dataset.id, btn.dataset.name, btn.dataset.due);
        });
      });

      tbody.querySelectorAll('.sup-statement-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          openSupStatementModal(btn.dataset.id);
        });
      });
    }

    function openPayModal(id, name, due) {
      document.querySelector('#supplier-payment-id').value = id;
      setText('#supplier-payment-name', name);
      const dueNum = Number(due || 0);
      setText('#supplier-payment-due', formatNpr(dueNum));

      const amtInput = document.querySelector('#supplier-payment-amount');
      amtInput.value = dueNum > 0 ? dueNum : '';
      document.querySelector('#supplier-payment-ref').value = '';
      document.querySelector('#supplier-payment-notes').value = '';

      const errEl = document.querySelector('#supplier-payment-error');
      errEl.classList.add('hidden');
      errEl.textContent = '';

      openModal('supplier-payment-modal');
      amtInput.focus();
    }

    async function openSupStatementModal(id) {
      openModal('supplier-statement-modal');
      setText('#sup-stmt-date', `Date: ${formatDate(new Date().toISOString())}`);
      const tbody = document.querySelector('#supplier-statement-tbody');
      tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading statement...</td></tr>`;

      try {
        const [profileData, txData] = await Promise.all([
          request(`/api/retailer/suppliers/${id}`),
          request(`/api/retailer/suppliers/${id}/transactions`),
        ]);

        const s = profileData.supplier;
        const stats = profileData.stats;

        setText('#statement-sup-title', `${s.name} — Vendor Statement`);
        setText('#sup-stmt-name', s.name);
        setText('#sup-stmt-company', s.companyName || 'Independent Wholesale Supplier');
        setText('#sup-stmt-contact', `Phone: ${s.phone} &bull; PAN: ${s.panNumber || 'N/A'}`);
        setText('#sup-stmt-balance', formatNpr(stats.currentBalance));

        const transactions = txData.transactions || [];
        if (!transactions.length) {
          tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">No transactions recorded yet.</td></tr>`;
          return;
        }

        tbody.innerHTML = transactions
          .map((t) => {
            let debitHtml = '-';
            let creditHtml = '-';
            let badge = '<span class="px-1.5 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700">OTHER</span>';

            if (t.type === 'PURCHASE') {
              badge = '<span class="px-1.5 py-0.5 rounded font-bold text-[10px] bg-rose-100 text-rose-800">PURCHASE</span>';
              debitHtml = `<span class="font-bold text-rose-600">+${formatNpr(t.amount)}</span>`;
            } else if (t.type === 'OPENING_BALANCE') {
              badge = '<span class="px-1.5 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-800">OPENING BAL</span>';
              debitHtml = `<span class="font-bold text-slate-800">+${formatNpr(t.amount)}</span>`;
            } else if (t.type === 'PAYMENT') {
              badge = '<span class="px-1.5 py-0.5 rounded font-bold text-[10px] bg-emerald-100 text-emerald-800">PAID</span>';
              creditHtml = `<span class="font-bold text-emerald-600">-${formatNpr(t.amount)}</span>`;
            }

            return `
              <tr class="hover:bg-slate-50 transition">
                <td class="px-4 py-2 font-mono text-[10px] text-slate-500 whitespace-nowrap">${formatDate(t.createdAt)}</td>
                <td class="px-4 py-2">${badge}</td>
                <td class="px-4 py-2">
                  <div class="font-medium text-slate-800">${t.notes || '-'}</div>
                  <div class="text-[10px] text-slate-400">${t.referenceId ? `Ref: ${t.referenceId}` : ''}</div>
                </td>
                <td class="px-4 py-2 text-right">${debitHtml}</td>
                <td class="px-4 py-2 text-right">${creditHtml}</td>
                <td class="px-4 py-2 text-right font-black text-slate-900">${formatNpr(t.balanceAfter)}</td>
              </tr>
            `;
          })
          .join('');
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-rose-500 font-semibold">Failed to load statement: ${err.message}</td></tr>`;
      }
    }

    function setupSupplierEvents() {
      // Add Supplier Form
      const addForm = document.querySelector('#add-supplier-form');
      if (addForm) {
        addForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const errEl = document.querySelector('#add-supplier-error');
          const submitBtn = document.querySelector('#add-supplier-submit-btn');
          errEl.classList.add('hidden');
          submitBtn.disabled = true;

          try {
            const name = document.querySelector('#add-supplier-name').value.trim();
            const companyName = document.querySelector('#add-supplier-company').value.trim() || undefined;
            const phone = document.querySelector('#add-supplier-phone').value.trim();
            const panNumber = document.querySelector('#add-supplier-pan').value.trim() || undefined;
            const address = document.querySelector('#add-supplier-address').value.trim() || undefined;
            const openingBalance = Number(document.querySelector('#add-supplier-opening-balance').value) || 0;

            await request('/api/retailer/suppliers', {
              method: 'POST',
              body: JSON.stringify({ name, companyName, phone, panNumber, address, openingBalance }),
            });

            addForm.reset();
            closeModal('add-supplier-modal');
            await fetchSuppliers();
          } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          } finally {
            submitBtn.disabled = false;
          }
        });
      }

      // Record Supplier Payment Form
      const payForm = document.querySelector('#supplier-payment-form');
      if (payForm) {
        payForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const errEl = document.querySelector('#supplier-payment-error');
          const submitBtn = document.querySelector('#supplier-payment-submit-btn');
          errEl.classList.add('hidden');
          submitBtn.disabled = true;

          try {
            const supplierId = document.querySelector('#supplier-payment-id').value;
            const amount = Number(document.querySelector('#supplier-payment-amount').value);
            const paymentMethod = document.querySelector('input[name="sup-pay-method"]:checked')?.value || 'BANK';
            const reference = document.querySelector('#supplier-payment-ref').value.trim() || undefined;
            const notes = document.querySelector('#supplier-payment-notes').value.trim() || undefined;

            await request(`/api/retailer/suppliers/${supplierId}/payments`, {
              method: 'POST',
              body: JSON.stringify({ amount, paymentMethod, reference, notes }),
            });

            payForm.reset();
            closeModal('supplier-payment-modal');
            await fetchSuppliers();
          } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          } finally {
            submitBtn.disabled = false;
          }
        });
      }

      // Pay Full Due helper
      const fullBtn = document.querySelector('#pay-full-supplier-btn');
      if (fullBtn) {
        fullBtn.addEventListener('click', () => {
          const raw = document.querySelector('#supplier-payment-due').textContent.replace(/[^0-9.]/g, '');
          const val = parseFloat(raw) || 0;
          if (val > 0) document.querySelector('#supplier-payment-amount').value = val;
        });
      }

      // Payment method radio selector styles
      document.querySelectorAll('#sup-payment-mode-selector label').forEach((label) => {
        label.addEventListener('click', () => {
          document.querySelectorAll('#sup-payment-mode-selector label').forEach((l) => {
            l.classList.remove('border-2', 'border-amber-500', 'bg-amber-50', 'text-amber-900');
            l.classList.add('border', 'border-slate-200', 'text-slate-700');
          });
          label.classList.remove('border', 'border-slate-200', 'text-slate-700');
          label.classList.add('border-2', 'border-amber-500', 'bg-amber-50', 'text-amber-900');
        });
      });

      // Filter tabs
      document.querySelectorAll('.supplier-filter-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.supplier-filter-tab').forEach((t) => {
            t.classList.remove('bg-white', 'text-slate-900', 'shadow-sm');
            t.classList.add('text-slate-500');
          });
          tab.classList.remove('text-slate-500');
          tab.classList.add('bg-white', 'text-slate-900', 'shadow-sm');

          supplierState.hasBalance = tab.dataset.filter || 'ALL';
          supplierState.page = 1;
          fetchSuppliers();
        });
      });

      // Search input debounce
      let st;
      document.querySelector('#supplier-search-input')?.addEventListener('input', (e) => {
        clearTimeout(st);
        st = setTimeout(() => {
          supplierState.search = e.target.value.trim();
          supplierState.page = 1;
          fetchSuppliers();
        }, 300);
      });

      // Modal buttons
      document.querySelector('#open-add-supplier-modal-btn')?.addEventListener('click', () => {
        openModal('add-supplier-modal');
        document.querySelector('#add-supplier-name')?.focus();
      });

      document.querySelector('#supplier-statement-print-btn')?.addEventListener('click', () => {
        window.print();
      });

      document.querySelectorAll('.close-modal-btn').forEach((b) => {
        b.addEventListener('click', () => {
          closeModal('add-supplier-modal');
          closeModal('supplier-payment-modal');
          closeModal('supplier-statement-modal');
        });
      });
    }

    (async function initSuppliers() {
      setupSupplierEvents();
      const ok = await loadContext();
      if (ok) await fetchSuppliers();
    })();
  }

  // ==========================================
  // 2. PURCHASES / INBOUND STOCK PAGE LOGIC
  // ==========================================
  if (page === 'retailer-purchases') {
    const poState = {
      purchases: [],
      products: [],
      suppliers: [],
      itemsToAdd: [],
      search: '',
      status: 'ALL',
      page: 1,
      limit: 20,
      totalPages: 1,
    };

    async function fetchPurchases() {
      const tbody = document.querySelector('#purchases-tbody');
      try {
        const queryParams = new URLSearchParams({
          page: poState.page.toString(),
          limit: poState.limit.toString(),
        });
        if (poState.status && poState.status !== 'ALL') {
          queryParams.set('status', poState.status);
        }
        if (poState.search) {
          queryParams.set('search', poState.search);
        }

        const res = await request(`/api/retailer/purchases?${queryParams.toString()}`);
        poState.purchases = res.purchases || [];
        poState.totalPages = res.pagination?.totalPages || 1;

        setText('#po-pagination-info', `Showing ${poState.purchases.length} of ${res.pagination?.total || 0} purchases (Page ${poState.page} of ${poState.totalPages})`);
        const prevBtn = document.querySelector('#po-prev-btn');
        const nextBtn = document.querySelector('#po-next-btn');
        if (prevBtn) prevBtn.disabled = poState.page <= 1;
        if (nextBtn) nextBtn.disabled = poState.page >= poState.totalPages;

        renderPurchasesTable();
      } catch (err) {
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-rose-500 font-semibold">Failed to load purchases: ${err.message}</td></tr>`;
        }
      }
    }

    function renderPurchasesTable() {
      const tbody = document.querySelector('#purchases-tbody');
      if (!tbody) return;

      if (!poState.purchases.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="p-10 text-center text-slate-400">
              <i class="fa-solid fa-dolly text-2xl mb-2 text-slate-300"></i>
              <p class="font-bold text-slate-600">No purchase orders found</p>
              <p class="text-xs text-slate-400 mt-0.5">Click "+ New Purchase Order" to receive inbound inventory.</p>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = poState.purchases
        .map((p) => {
          let badge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">ORDERED</span>';
          let receiveAction = '';
          if (p.status === 'RECEIVED') {
            badge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">RECEIVED</span>';
          } else if (p.status === 'ORDERED') {
            receiveAction = `
              <button
                class="receive-stock-btn px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition"
                data-id="${p.id}"
                data-num="${p.purchaseNumber}"
                title="Confirm delivery and add items to inventory"
              >
                <i class="fa-solid fa-check mr-1"></i> Receive Stock
              </button>
            `;
          }

          return `
            <tr class="hover:bg-slate-50 transition" data-id="${p.id}">
              <td class="px-5 py-3 font-mono font-bold text-blue-600">${p.purchaseNumber}</td>
              <td class="px-5 py-3 text-slate-500">${formatDate(p.orderedAt || p.createdAt)}</td>
              <td class="px-5 py-3">
                <div class="font-bold text-slate-900">${p.supplier?.name || 'Supplier'}</div>
                <div class="text-[11px] text-slate-400">${p.supplier?.companyName || ''}</div>
              </td>
              <td class="px-5 py-3 font-semibold text-slate-700">${p._count?.items || 0} line items</td>
              <td class="px-5 py-3 font-black text-slate-900">${formatNpr(p.totalAmount)}</td>
              <td class="px-5 py-3 font-semibold text-emerald-700">${formatNpr(p.paidAmount)}</td>
              <td class="px-5 py-3">${badge}</td>
              <td class="px-5 py-3 text-right">
                <div class="inline-flex items-center gap-1.5">
                  ${receiveAction}
                  <button
                    class="view-po-btn px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition"
                    data-id="${p.id}"
                  >
                    View Bill
                  </button>
                </div>
              </td>
            </tr>
          `;
        })
        .join('');

      tbody.querySelectorAll('.receive-stock-btn').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm(`Confirm receipt for ${b.dataset.num}? This will atomically increment store inventory.`)) return;
          try {
            await request(`/api/retailer/purchases/${b.dataset.id}/receive`, { method: 'POST' });
            await fetchPurchases();
          } catch (err) {
            alert(`Error receiving stock: ${err.message}`);
          }
        });
      });

      tbody.querySelectorAll('.view-po-btn').forEach((b) => {
        b.addEventListener('click', () => {
          openPoDetailsModal(b.dataset.id);
        });
      });
    }

    async function openPoDetailsModal(id) {
      openModal('view-po-modal');
      const tbody = document.querySelector('#view-po-items-tbody');
      tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading details...</td></tr>`;

      try {
        const po = await request(`/api/retailer/purchases/${id}`);
        setText('#view-po-num', `PO Number: ${po.purchaseNumber}`);
        setText('#view-po-date', `Date: ${formatDate(po.receivedAt || po.orderedAt || po.createdAt)}`);
        setText('#view-po-supplier-name', po.supplier?.name || 'Supplier');
        setText('#view-po-supplier-phone', `Phone: ${po.supplier?.phone || '-'} &bull; PAN: ${po.supplier?.panNumber || 'N/A'}`);

        const badgeEl = document.querySelector('#view-po-status-badge');
        if (badgeEl) {
          badgeEl.textContent = po.status;
          badgeEl.className = po.status === 'RECEIVED'
            ? 'inline-block px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase'
            : 'inline-block px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 text-[10px] font-black uppercase';
        }

        setText('#view-po-subtotal', formatNpr(po.subtotal));
        setText('#view-po-paid', formatNpr(po.paidAmount));
        setText('#view-po-grand-total', formatNpr(po.totalAmount));

        tbody.innerHTML = (po.items || [])
          .map((item) => {
            const label = item.variant ? `${item.product?.name} (${item.variant.title})` : item.product?.name;
            const sku = item.variant ? item.variant.sku : item.product?.sku;
            return `
              <tr class="hover:bg-slate-50 transition">
                <td class="px-4 py-2">
                  <div class="font-bold text-slate-900">${label}</div>
                  <div class="text-[10px] font-mono text-slate-400">${sku}</div>
                </td>
                <td class="px-4 py-2 text-right font-semibold">${formatNpr(item.unitCost)}</td>
                <td class="px-4 py-2 text-center font-bold">${item.quantity}</td>
                <td class="px-4 py-2 text-right font-black text-slate-900">${formatNpr(item.total)}</td>
              </tr>
            `;
          })
          .join('');
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-rose-500 font-semibold">Failed to load PO details: ${err.message}</td></tr>`;
      }
    }

    // Modal Item Adder helper
    function updateNewPoTotals() {
      let gross = 0;
      poState.itemsToAdd.forEach((item) => {
        gross += item.unitCost * item.quantity;
      });
      setText('#po-calculated-total', formatNpr(gross));

      const itemsTbody = document.querySelector('#po-items-tbody');
      if (!itemsTbody) return;

      if (!poState.itemsToAdd.length) {
        itemsTbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">No items added yet.</td></tr>`;
        return;
      }

      itemsTbody.innerHTML = poState.itemsToAdd
        .map((item, idx) => `
          <tr class="hover:bg-slate-50">
            <td class="px-3 py-2 font-bold text-slate-900">${item.productName}</td>
            <td class="px-3 py-2 text-right font-mono font-semibold">${formatNpr(item.unitCost)}</td>
            <td class="px-3 py-2 text-center font-bold">${item.quantity}</td>
            <td class="px-3 py-2 text-right font-mono font-black">${formatNpr(item.unitCost * item.quantity)}</td>
            <td class="px-2 py-2 text-center">
              <button type="button" class="remove-po-item-btn text-rose-500 hover:text-rose-700 p-1" data-index="${idx}">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </td>
          </tr>
        `)
        .join('');

      itemsTbody.querySelectorAll('.remove-po-item-btn').forEach((b) => {
        b.addEventListener('click', () => {
          poState.itemsToAdd.splice(Number(b.dataset.index), 1);
          updateNewPoTotals();
        });
      });
    }

    async function loadSuppliersAndProducts() {
      try {
        const [supData, prodData] = await Promise.all([
          request('/api/retailer/suppliers?limit=100'),
          request('/api/retailer/products?limit=100'),
        ]);

        poState.suppliers = supData.suppliers || [];
        poState.products = prodData.products || [];

        // Fill suppliers dropdown
        const supSelect = document.querySelector('#po-supplier-select');
        if (supSelect) {
          supSelect.innerHTML = '<option value="">Choose Supplier...</option>' +
            poState.suppliers.map((s) => `<option value="${s.id}">${s.name} ${s.companyName ? `(${s.companyName})` : ''}</option>`).join('');

          // Auto-select if in URL query
          const urlParams = new URLSearchParams(location.search);
          const preSelectedSup = urlParams.get('supplierId');
          if (preSelectedSup) {
            supSelect.value = preSelectedSup;
            openModal('new-po-modal');
          }
        }

        // Fill products dropdown
        const prodSelect = document.querySelector('#po-item-product');
        if (prodSelect) {
          prodSelect.innerHTML = '<option value="">Select product...</option>' +
            poState.products.map((p) => `<option value="${p.id}" data-cost="${p.costPrice}">${p.name} (${p.sku})</option>`).join('');

          prodSelect.addEventListener('change', () => {
            const opt = prodSelect.selectedOptions[0];
            if (opt && opt.dataset.cost) {
              document.querySelector('#po-item-cost').value = opt.dataset.cost;
            }
          });
        }
      } catch {
        // ignore
      }
    }

    function setupPoEvents() {
      // Add Item to PO list
      document.querySelector('#po-add-item-btn')?.addEventListener('click', () => {
        const prodSelect = document.querySelector('#po-item-product');
        const productId = prodSelect.value;
        const opt = prodSelect.selectedOptions[0];
        const cost = parseFloat(document.querySelector('#po-item-cost').value);
        const qty = parseInt(document.querySelector('#po-item-qty').value, 10);

        if (!productId || isNaN(cost) || cost < 0 || isNaN(qty) || qty <= 0) {
          alert('Please select a product and enter a valid cost and quantity (>= 1).');
          return;
        }

        poState.itemsToAdd.push({
          productId,
          productName: opt ? opt.textContent : 'Product',
          unitCost: cost,
          quantity: qty,
        });

        // Reset item adder inputs
        prodSelect.value = '';
        document.querySelector('#po-item-cost').value = '';
        document.querySelector('#po-item-qty').value = '1';
        updateNewPoTotals();
      });

      // Submit PO Form
      document.querySelector('#new-po-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.querySelector('#new-po-error');
        const submitBtn = document.querySelector('#new-po-submit-btn');
        errEl.classList.add('hidden');

        if (!poState.itemsToAdd.length) {
          errEl.textContent = 'Please add at least one line item to the purchase order.';
          errEl.classList.remove('hidden');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting PO...';

        try {
          const supplierId = document.querySelector('#po-supplier-select').value;
          const status = document.querySelector('#po-status-select').value;
          const paidAmount = parseFloat(document.querySelector('#po-paid-amount').value) || 0;
          const notes = document.querySelector('#po-notes').value.trim() || undefined;

          await request('/api/retailer/purchases', {
            method: 'POST',
            body: JSON.stringify({
              supplierId,
              status,
              items: poState.itemsToAdd.map((it) => ({
                productId: it.productId,
                quantity: it.quantity,
                unitCost: it.unitCost,
              })),
              paidAmount,
              notes,
              updateCostPrice: true,
            }),
          });

          poState.itemsToAdd = [];
          document.querySelector('#new-po-form').reset();
          updateNewPoTotals();
          closeModal('new-po-modal');
          await fetchPurchases();
        } catch (err) {
          errEl.textContent = err.message;
          errEl.classList.remove('hidden');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Purchase Order';
        }
      });

      // Open New PO
      document.querySelector('#open-new-po-modal-btn')?.addEventListener('click', () => {
        openModal('new-po-modal');
      });

      document.querySelector('#view-po-print-btn')?.addEventListener('click', () => {
        window.print();
      });

      document.querySelectorAll('.close-modal-btn').forEach((b) => {
        b.addEventListener('click', () => {
          closeModal('new-po-modal');
          closeModal('view-po-modal');
        });
      });

      // Filter tabs
      document.querySelectorAll('.po-filter-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.po-filter-tab').forEach((t) => {
            t.classList.remove('bg-white', 'text-slate-900', 'shadow-sm');
            t.classList.add('text-slate-500');
          });
          tab.classList.remove('text-slate-500');
          tab.classList.add('bg-white', 'text-slate-900', 'shadow-sm');

          poState.status = tab.dataset.filter || 'ALL';
          poState.page = 1;
          fetchPurchases();
        });
      });

      // Search input debounce
      let st;
      document.querySelector('#po-search-input')?.addEventListener('input', (e) => {
        clearTimeout(st);
        st = setTimeout(() => {
          poState.search = e.target.value.trim();
          poState.page = 1;
          fetchPurchases();
        }, 300);
      });
    }

    (async function initPurchases() {
      setupPoEvents();
      const ok = await loadContext();
      if (ok) {
        await Promise.all([fetchPurchases(), loadSuppliersAndProducts()]);
      }
    })();
  }

  // Logout listener on all pages
  document.querySelector('#retailer-logout-btn')?.addEventListener('click', async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    location.href = './index.html';
  });
})();
