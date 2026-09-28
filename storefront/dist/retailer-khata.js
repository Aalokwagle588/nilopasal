/**
 * Nilopasal Retailer ERP — Digital Customer Khata & Ledgers Controller
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

  // Khata State
  const khataState = {
    customers: [],
    summary: null,
    search: '',
    balanceStatus: 'ALL',
    page: 1,
    limit: 20,
    totalPages: 1,
    activeStore: null,
    currentUser: null,
    selectedCustomer: null,
  };

  // 1. Auth & Store Context
  async function loadContext() {
    try {
      const auth = await request('/api/auth/me');
      if (!auth?.user || !auth.retailer?.access?.allowed) {
        location.href = './retailer-dashboard.html';
        return false;
      }
      khataState.currentUser = auth.user;
      khataState.activeStore = auth.retailer.business;

      setText('#retailer-user-name', `${auth.user.firstName} ${auth.user.lastName}`);
      setText('#retailer-user-email', `${auth.retailer.role || 'Staff'}`);
      setText('#retailer-business-name', auth.retailer.business?.businessName || 'Store');
      setText('#statement-store-name', auth.retailer.business?.businessName || 'Store');
      setText('#statement-store-pan', `PAN / VAT: ${auth.retailer.business?.panNumber || auth.retailer.business?.vatNumber || 'N/A'}`);
      return true;
    } catch {
      location.href = './retailer-dashboard.html';
      return false;
    }
  }

  // 2. Fetch Customers
  async function loadCustomers() {
    const tbody = document.querySelector('#khata-customers-tbody');
    try {
      const queryParams = new URLSearchParams({
        page: khataState.page.toString(),
        limit: khataState.limit.toString(),
        balanceStatus: khataState.balanceStatus,
      });
      if (khataState.search) {
        queryParams.set('search', khataState.search);
      }

      const res = await request(`/api/retailer/customers?${queryParams.toString()}`);
      khataState.customers = res.customers || [];
      khataState.summary = res.summary || {};
      khataState.totalPages = res.pagination?.totalPages || 1;

      // Update KPI Cards
      setText('#kpi-total-receivables', formatNpr(res.summary?.totalReceivables));
      setText('#kpi-customers-with-debt', (res.summary?.customersWithDebt || 0).toLocaleString());
      setText('#kpi-today-collections', formatNpr(res.summary?.todayCollections));
      setText('#kpi-total-customers', (res.summary?.totalCustomers || 0).toLocaleString());

      // Update Pagination info
      setText('#khata-pagination-info', `Showing ${khataState.customers.length} of ${res.pagination?.total || 0} customers (Page ${khataState.page} of ${khataState.totalPages})`);
      const prevBtn = document.querySelector('#khata-prev-page-btn');
      const nextBtn = document.querySelector('#khata-next-page-btn');
      if (prevBtn) prevBtn.disabled = khataState.page <= 1;
      if (nextBtn) nextBtn.disabled = khataState.page >= khataState.totalPages;

      renderTable();
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="p-8 text-center text-rose-500 font-semibold">
              <i class="fa-solid fa-triangle-exclamation text-lg mb-2"></i>
              <p>Failed to load customer Khata data: ${err.message}</p>
            </td>
          </tr>
        `;
      }
    }
  }

  // 3. Render Customers Table
  function renderTable() {
    const tbody = document.querySelector('#khata-customers-tbody');
    if (!tbody) return;

    if (!khataState.customers.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="p-10 text-center text-slate-400">
            <i class="fa-solid fa-book-open text-2xl mb-2 text-slate-300"></i>
            <p class="font-bold text-slate-600">No customers found</p>
            <p class="text-xs text-slate-400 mt-0.5">Click "Add Customer" to start tracking customer credit &amp; khata.</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = khataState.customers
      .map((c) => {
        const balance = Number(c.currentBalance || 0);
        const creditLimit = c.creditLimit ? Number(c.creditLimit) : null;

        // Health Status Badge
        let statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">Settled (Rs. 0)</span>';
        let balanceClass = 'text-slate-800 font-bold';
        if (balance > 0) {
          balanceClass = 'text-rose-600 font-black';
          statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">Due (उधारो)</span>';
          if (creditLimit && balance >= creditLimit) {
            statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white animate-pulse">Limit Exceeded</span>';
          } else if (creditLimit && balance >= creditLimit * 0.8) {
            statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Near Limit</span>';
          }
        } else if (balance < 0) {
          balanceClass = 'text-blue-600 font-bold';
          statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">Advance Credit</span>';
        }

        // Limit progress bar
        let limitHtml = '<span class="text-slate-400">No Limit</span>';
        if (creditLimit) {
          const pct = Math.min(100, Math.round((balance / creditLimit) * 100));
          const barColor = pct >= 90 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500';
          limitHtml = `
            <div>
              <span class="font-bold text-slate-700">${formatNpr(creditLimit)}</span>
              <div class="w-24 bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                <div class="${barColor} h-1.5 rounded-full" style="width: ${Math.max(0, pct)}%"></div>
              </div>
            </div>
          `;
        }

        return `
          <tr class="hover:bg-slate-50/80 transition" data-customer-id="${c.id}">
            <td class="px-5 py-3">
              <div class="font-bold text-slate-900">${c.name}</div>
              <div class="text-[11px] text-slate-400">${c._count?.sales || 0} purchases &bull; ${c._count?.khataTransactions || 0} ledger entries</div>
            </td>
            <td class="px-5 py-3">
              <div class="font-semibold text-slate-800 flex items-center gap-1.5">
                <i class="fa-solid fa-phone text-[10px] text-slate-400"></i> ${c.phone}
              </div>
              <div class="text-[11px] text-slate-400">${c.address || 'No address specified'}</div>
            </td>
            <td class="px-5 py-3">${limitHtml}</td>
            <td class="px-5 py-3">
              <span class="${balanceClass} text-sm">${formatNpr(balance)}</span>
            </td>
            <td class="px-5 py-3">${statusBadge}</td>
            <td class="px-5 py-3 text-right">
              <div class="inline-flex items-center gap-1.5">
                <button
                  class="record-payment-btn px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition"
                  data-id="${c.id}"
                  data-name="${c.name}"
                  data-balance="${balance}"
                  title="Record payment collected from customer"
                >
                  <i class="fa-solid fa-hand-holding-dollar mr-1"></i> Pay
                </button>
                <button
                  class="view-statement-btn px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition"
                  data-id="${c.id}"
                  title="View full Khata statement &amp; transactions"
                >
                  <i class="fa-solid fa-file-invoice mr-1 text-blue-600"></i> Statement
                </button>
                <button
                  class="record-adjustment-btn px-2 py-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition"
                  data-id="${c.id}"
                  data-name="${c.name}"
                  title="Manual balance adjustment"
                >
                  <i class="fa-solid fa-sliders"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    // Attach row button listeners
    tbody.querySelectorAll('.record-payment-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        openPaymentModal(btn.dataset.id, btn.dataset.name, btn.dataset.balance);
      });
    });

    tbody.querySelectorAll('.view-statement-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        openStatementModal(btn.dataset.id);
      });
    });

    tbody.querySelectorAll('.record-adjustment-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        openAdjustmentModal(btn.dataset.id, btn.dataset.name);
      });
    });
  }

  // 4. Modals Management
  function closeModal(modalId) {
    const modal = document.querySelector(`#${modalId}`);
    if (modal) modal.classList.add('hidden');
  }

  function openModal(modalId) {
    const modal = document.querySelector(`#${modalId}`);
    if (modal) modal.classList.remove('hidden');
  }

  // Open Payment Modal
  function openPaymentModal(customerId, customerName, currentBalance) {
    const balNum = Number(currentBalance || 0);
    document.querySelector('#record-payment-customer-id').value = customerId;
    setText('#record-payment-customer-name', customerName);
    setText('#record-payment-current-balance', formatNpr(balNum));

    const amountInput = document.querySelector('#record-payment-amount');
    amountInput.value = balNum > 0 ? balNum : '';
    document.querySelector('#record-payment-reference').value = '';
    document.querySelector('#record-payment-notes').value = '';

    const errEl = document.querySelector('#record-payment-error');
    errEl.classList.add('hidden');
    errEl.textContent = '';

    openModal('record-payment-modal');
    amountInput.focus();
  }

  // Open Adjustment Modal
  function openAdjustmentModal(customerId, customerName) {
    document.querySelector('#record-adj-customer-id').value = customerId;
    setText('#record-adj-customer-name', customerName);
    document.querySelector('#record-adj-amount').value = '';
    document.querySelector('#record-adj-reason').value = '';

    const errEl = document.querySelector('#record-adj-error');
    errEl.classList.add('hidden');
    errEl.textContent = '';

    openModal('record-adjustment-modal');
  }

  // Open Statement Modal & Fetch Ledger
  async function openStatementModal(customerId) {
    openModal('statement-modal');
    setText('#statement-generated-date', `Generated: ${formatDate(new Date().toISOString())}`);

    const tbody = document.querySelector('#statement-transactions-tbody');
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="p-6 text-center text-slate-400">
          <i class="fa-solid fa-spinner fa-spin text-base mb-1"></i>
          <p>Loading customer statement...</p>
        </td>
      </tr>
    `;

    try {
      const [profileData, txData] = await Promise.all([
        request(`/api/retailer/customers/${customerId}`),
        request(`/api/retailer/customers/${customerId}/transactions`),
      ]);

      const c = profileData.customer;
      const stats = profileData.stats;

      setText('#statement-customer-header', `${c.name} — Khata Statement`);
      setText('#statement-customer-name', c.name);
      setText('#statement-customer-phone', c.phone);
      setText('#statement-customer-address', c.address || 'Address not recorded');
      setText('#statement-current-balance', formatNpr(stats.currentBalance));

      const creditLimitNum = stats.creditLimit ? Number(stats.creditLimit) : null;
      if (creditLimitNum) {
        setText('#statement-credit-limit', formatNpr(creditLimitNum));
        const pct = stats.creditUtilizationPercent || 0;
        setText('#statement-utilization-copy', `${pct}% limit utilized`);
        const pbar = document.querySelector('#statement-limit-progress-bar');
        if (pbar) pbar.style.width = `${pct}%`;
      } else {
        setText('#statement-credit-limit', 'No Limit Set');
        setText('#statement-utilization-copy', 'Unrestricted credit');
      }

      // Render Transaction rows
      const transactions = txData.transactions || [];
      if (!transactions.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="p-6 text-center text-slate-400">
              No Khata transactions recorded yet.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = transactions
        .map((t) => {
          let debitHtml = '-';
          let creditHtml = '-';
          let badge = '<span class="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700">OTHER</span>';

          if (t.type === 'SALE_CREDIT') {
            badge = '<span class="px-1.5 py-0.5 rounded font-bold text-[10px] bg-rose-100 text-rose-800">CREDIT SALE</span>';
            debitHtml = `<span class="font-bold text-rose-600">+${formatNpr(t.amount)}</span>`;
          } else if (t.type === 'OPENING_BALANCE') {
            badge = '<span class="px-1.5 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-800">OPENING BAL</span>';
            debitHtml = `<span class="font-bold text-slate-800">+${formatNpr(t.amount)}</span>`;
          } else if (t.type === 'PAYMENT_RECEIVED') {
            badge = '<span class="px-1.5 py-0.5 rounded font-bold text-[10px] bg-emerald-100 text-emerald-800">PAYMENT</span>';
            creditHtml = `<span class="font-bold text-emerald-600">-${formatNpr(t.amount)}</span>`;
          } else if (t.type === 'ADJUSTMENT') {
            badge = '<span class="px-1.5 py-0.5 rounded font-bold text-[10px] bg-purple-100 text-purple-800">ADJUSTMENT</span>';
            if (t.notes?.startsWith('DEBIT')) {
              debitHtml = `<span class="font-bold text-rose-600">+${formatNpr(t.amount)}</span>`;
            } else {
              creditHtml = `<span class="font-bold text-emerald-600">-${formatNpr(t.amount)}</span>`;
            }
          }

          const recorder = t.creator ? `${t.creator.firstName}` : 'System';

          return `
            <tr class="hover:bg-slate-50 transition">
              <td class="px-4 py-2 font-mono text-[10px] text-slate-500 whitespace-nowrap">${formatDate(t.createdAt)}</td>
              <td class="px-4 py-2">${badge}</td>
              <td class="px-4 py-2">
                <div class="font-medium text-slate-800">${t.notes || '-'}</div>
                <div class="text-[10px] text-slate-400">By: ${recorder} ${t.referenceId ? `&bull; Ref: ${t.referenceId}` : ''}</div>
              </td>
              <td class="px-4 py-2 text-right">${debitHtml}</td>
              <td class="px-4 py-2 text-right">${creditHtml}</td>
              <td class="px-4 py-2 text-right font-black text-slate-900">${formatNpr(t.balanceAfter)}</td>
            </tr>
          `;
        })
        .join('');
    } catch (err) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="p-6 text-center text-rose-500 font-semibold">
            Failed to load statement: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  // 5. Setup Form Submissions
  function setupForms() {
    // Add Customer Form
    const addForm = document.querySelector('#add-customer-form');
    if (addForm) {
      addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.querySelector('#add-customer-error');
        const submitBtn = document.querySelector('#add-customer-submit-btn');
        errEl.classList.add('hidden');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';

        try {
          const name = document.querySelector('#add-customer-name').value.trim();
          const phone = document.querySelector('#add-customer-phone').value.trim();
          const address = document.querySelector('#add-customer-address').value.trim() || undefined;
          const creditLimitVal = document.querySelector('#add-customer-credit-limit').value;
          const creditLimit = creditLimitVal ? Number(creditLimitVal) : undefined;
          const openingBalVal = document.querySelector('#add-customer-opening-balance').value;
          const openingBalance = openingBalVal ? Number(openingBalVal) : 0;

          await request('/api/retailer/customers', {
            method: 'POST',
            body: JSON.stringify({
              name,
              phone,
              address,
              creditLimit,
              openingBalance,
            }),
          });

          addForm.reset();
          closeModal('add-customer-modal');
          await loadCustomers();
        } catch (err) {
          errEl.textContent = err.message;
          errEl.classList.remove('hidden');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Customer';
        }
      });
    }

    // Record Payment Form
    const payForm = document.querySelector('#record-payment-form');
    if (payForm) {
      payForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.querySelector('#record-payment-error');
        const submitBtn = document.querySelector('#record-payment-submit-btn');
        errEl.classList.add('hidden');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        try {
          const customerId = document.querySelector('#record-payment-customer-id').value;
          const amount = Number(document.querySelector('#record-payment-amount').value);
          const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value || 'CASH';
          const reference = document.querySelector('#record-payment-reference').value.trim() || undefined;
          const notes = document.querySelector('#record-payment-notes').value.trim() || undefined;

          await request(`/api/retailer/customers/${customerId}/payments`, {
            method: 'POST',
            body: JSON.stringify({
              amount,
              paymentMethod,
              reference,
              notes,
            }),
          });

          payForm.reset();
          closeModal('record-payment-modal');
          await loadCustomers();
        } catch (err) {
          errEl.textContent = err.message;
          errEl.classList.remove('hidden');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Confirm Payment';
        }
      });
    }

    // Pay full balance helper
    const payFullBtn = document.querySelector('#pay-full-balance-btn');
    if (payFullBtn) {
      payFullBtn.addEventListener('click', () => {
        const rawBal = document.querySelector('#record-payment-current-balance').textContent.replace(/[^0-9.]/g, '');
        const val = parseFloat(rawBal) || 0;
        if (val > 0) {
          document.querySelector('#record-payment-amount').value = val;
        }
      });
    }

    // Record Adjustment Form
    const adjForm = document.querySelector('#record-adjustment-form');
    if (adjForm) {
      adjForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.querySelector('#record-adj-error');
        const submitBtn = document.querySelector('#record-adj-submit-btn');
        errEl.classList.add('hidden');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Applying...';

        try {
          const customerId = document.querySelector('#record-adj-customer-id').value;
          const direction = document.querySelector('input[name="adj-direction"]:checked')?.value || 'DEBIT';
          const amount = Number(document.querySelector('#record-adj-amount').value);
          const reason = document.querySelector('#record-adj-reason').value.trim();

          await request(`/api/retailer/customers/${customerId}/adjustments`, {
            method: 'POST',
            body: JSON.stringify({
              amount,
              direction,
              reason,
            }),
          });

          adjForm.reset();
          closeModal('record-adjustment-modal');
          await loadCustomers();
        } catch (err) {
          errEl.textContent = err.message;
          errEl.classList.remove('hidden');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Apply Adjustment';
        }
      });
    }

    // Modal close triggers
    document.querySelectorAll('.close-modal-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeModal('add-customer-modal');
        closeModal('record-payment-modal');
        closeModal('record-adjustment-modal');
        closeModal('statement-modal');
      });
    });

    // Open Add Customer
    const openAddBtn = document.querySelector('#open-add-customer-modal-btn');
    if (openAddBtn) {
      openAddBtn.addEventListener('click', () => {
        openModal('add-customer-modal');
        document.querySelector('#add-customer-name')?.focus();
      });
    }

    // Print Statement
    const printBtn = document.querySelector('#statement-print-btn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }

    // Payment Method Radio styling
    document.querySelectorAll('#payment-method-selector label').forEach((label) => {
      label.addEventListener('click', () => {
        document.querySelectorAll('#payment-method-selector label').forEach((l) => {
          l.classList.remove('border-2', 'border-emerald-500', 'bg-emerald-50', 'text-emerald-800');
          l.classList.add('border', 'border-slate-200', 'text-slate-700');
        });
        label.classList.remove('border', 'border-slate-200', 'text-slate-700');
        label.classList.add('border-2', 'border-emerald-500', 'bg-emerald-50', 'text-emerald-800');
      });
    });

    // Adjustment Direction Radio styling
    document.querySelectorAll('#adj-direction-selector label').forEach((label) => {
      label.addEventListener('click', () => {
        document.querySelectorAll('#adj-direction-selector label').forEach((l) => {
          l.classList.remove('border-2', 'border-rose-500', 'bg-rose-50');
          l.classList.add('border', 'border-slate-200');
        });
        label.classList.remove('border', 'border-slate-200');
        label.classList.add('border-2', 'border-rose-500', 'bg-rose-50');
      });
    });

    // Search input with debounce
    let searchTimeout;
    const searchInput = document.querySelector('#khata-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          khataState.search = e.target.value.trim();
          khataState.page = 1;
          loadCustomers();
        }, 300);
      });
    }

    // Filter Tabs
    document.querySelectorAll('.khata-filter-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.khata-filter-tab').forEach((t) => {
          t.classList.remove('bg-white', 'text-slate-900', 'shadow-sm');
          t.classList.add('text-slate-500');
        });
        tab.classList.remove('text-slate-500');
        tab.classList.add('bg-white', 'text-slate-900', 'shadow-sm');

        khataState.balanceStatus = tab.dataset.filter || 'ALL';
        khataState.page = 1;
        loadCustomers();
      });
    });

    // Pagination buttons
    const prevBtn = document.querySelector('#khata-prev-page-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (khataState.page > 1) {
          khataState.page--;
          loadCustomers();
        }
      });
    }

    const nextBtn = document.querySelector('#khata-next-page-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (khataState.page < khataState.totalPages) {
          khataState.page++;
          loadCustomers();
        }
      });
    }

    // Logout
    const logoutBtn = document.querySelector('#retailer-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await request('/api/auth/logout', { method: 'POST' });
        } catch {
          // ignore
        }
        location.href = './index.html';
      });
    }
  }

  // Initialization
  async function init() {
    setupForms();
    const ok = await loadContext();
    if (ok) {
      await loadCustomers();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
