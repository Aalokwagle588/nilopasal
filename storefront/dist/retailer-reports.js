/**
 * Nilopasal Retailer ERP — Business Reports & Financial Analytics Controller
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

  let currentSort = 'revenue';

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
      setText('#print-store-name', auth.retailer.business?.businessName || 'Nilopasal Store');
      return true;
    } catch {
      location.href = './retailer-dashboard.html';
      return false;
    }
  }

  function getPaymentMethodBadge(method) {
    switch (method) {
      case 'CASH':
        return `<span class="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800"><i class="fa-solid fa-money-bill-wave text-[9px]"></i> CASH</span>`;
      case 'ESEWA':
        return `<span class="inline-flex items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800"><i class="fa-solid fa-mobile-screen text-[9px]"></i> eSewa</span>`;
      case 'KHALTI':
        return `<span class="inline-flex items-center gap-1 rounded bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800"><i class="fa-solid fa-wallet text-[9px]"></i> Khalti</span>`;
      case 'BANK':
        return `<span class="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800"><i class="fa-solid fa-building-columns text-[9px]"></i> Bank</span>`;
      case 'CREDIT_KHATA':
        return `<span class="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800"><i class="fa-solid fa-book-bookmark text-[9px]"></i> Digital Khata</span>`;
      default:
        return `<span class="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-800">${method}</span>`;
    }
  }

  function buildQueryParams() {
    const period = document.getElementById('report-period-select')?.value || 'this_month';
    const params = new URLSearchParams({ period });

    if (period === 'custom') {
      const start = document.getElementById('custom-start-date')?.value;
      const end = document.getElementById('custom-end-date')?.value;
      if (start) params.set('startDate', start);
      if (end) params.set('endDate', end);
    }
    return params.toString();
  }

  async function loadReports() {
    const queryStr = buildQueryParams();

    try {
      const [overview, taxReport, prodReport] = await Promise.all([
        request(`/api/retailer/reports/overview?${queryStr}`),
        request(`/api/retailer/reports/tax?${queryStr}`),
        request(`/api/retailer/reports/products?${queryStr}&sortBy=${currentSort}`),
      ]);

      renderOverview(overview);
      renderTaxReport(taxReport);
      renderProductPerformance(prodReport);
    } catch (err) {
      console.error('Failed to load reports:', err);
    }
  }

  function renderOverview(data) {
    if (!data) return;
    const s = data.summary;

    setText('#kpi-total-revenue', formatNpr(s.grandTotalRevenue));
    setText('#kpi-net-sales', formatNpr(s.netSales));
    setText('#kpi-invoices-count', `${s.totalInvoices} sales`);
    setText('#kpi-cogs', formatNpr(s.costOfGoodsSold));
    setText('#kpi-gross-profit', formatNpr(s.grossProfit));
    setText('#kpi-vat-collected', formatNpr(s.totalTax));
    setText('#kpi-aov', formatNpr(s.averageOrderValue));

    const marginEl = document.getElementById('kpi-gross-margin');
    if (marginEl) {
      marginEl.textContent = `${s.grossMarginPercentage}%`;
      if (s.grossMarginPercentage >= 25) {
        marginEl.className = 'rounded-full bg-emerald-100 px-2 py-0.5 font-black text-emerald-800';
      } else if (s.grossMarginPercentage >= 10) {
        marginEl.className = 'rounded-full bg-amber-100 px-2 py-0.5 font-black text-amber-800';
      } else {
        marginEl.className = 'rounded-full bg-rose-100 px-2 py-0.5 font-black text-rose-800';
      }
    }

    // P&L Statement
    setText('#pl-gross-sales', formatNpr(s.grossSales));
    setText('#pl-total-discount', `- ${formatNpr(s.totalDiscount)}`);
    setText('#pl-net-sales', formatNpr(s.netSales));
    setText('#pl-cogs', `- ${formatNpr(s.costOfGoodsSold)}`);
    setText('#pl-gross-profit', formatNpr(s.grossProfit));
    setText('#pl-vat-collected', `+ ${formatNpr(s.totalTax)}`);
    setText('#pl-grand-total', formatNpr(s.grandTotalRevenue));
    setText('#pl-statement-subtitle', `Period: ${data.period?.label || 'Selected Range'}`);
    setText('#print-date-range', `Period: ${formatDate(data.period?.from)} to ${formatDate(data.period?.to)}`);

    // Working Capital
    const b = data.balanceSnapshot;
    if (b) {
      setText('#balance-khata-receivables', formatNpr(b.outstandingKhataReceivables));
      setText('#balance-khata-debtors-count', `${b.debtorCount || 0} customer(s) with debit`);
      setText('#balance-supplier-payables', formatNpr(b.outstandingSupplierPayables));
      setText('#balance-supplier-creditors-count', `${b.creditorCount || 0} supplier(s) with payable`);
    }

    // Payments Breakdown
    const pmContainer = document.getElementById('payment-methods-list');
    if (pmContainer) {
      if (!data.paymentsBreakdown || data.paymentsBreakdown.length === 0) {
        pmContainer.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">No payments recorded in this period.</p>`;
      } else {
        pmContainer.innerHTML = data.paymentsBreakdown.map((pm) => {
          const pct = Math.round((pm.percentage || 0) * 10) / 10;
          return `
            <div class="p-3 rounded-xl border border-slate-100 bg-slate-50/50">
              <div class="flex items-center justify-between text-xs font-bold">
                <div class="flex items-center gap-2">
                  ${getPaymentMethodBadge(pm.method)}
                  <span class="text-slate-500 font-normal text-[11px]">${pm.count} tx</span>
                </div>
                <span class="text-slate-900">${formatNpr(pm.totalAmount)}</span>
              </div>
              <div class="mt-2 flex items-center gap-2">
                <div class="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div class="h-full bg-purple-600 rounded-full" style="width: ${pct}%"></div>
                </div>
                <span class="text-[10px] font-bold text-slate-500 w-8 text-right">${pct}%</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  function renderTaxReport(data) {
    if (!data) return;
    const v = data.vatSummary;

    setText('#vat-report-pan', data.business?.panNumber || data.business?.vatNumber || 'Not Registered');
    setText('#vat-taxable-sales', formatNpr(v.totalTaxableSales));
    setText('#vat-total-collected', formatNpr(v.totalVatCollected));
    setText('#vat-exempt-sales', formatNpr(v.totalExemptSales));
    setText('#vat-gross-turnover', formatNpr(v.totalSalesGross));
    setText('#vat-invoice-count', `${v.invoiceCount} invoices`);

    const tbody = document.getElementById('vat-registers-table-body');
    if (tbody) {
      const registers = data.invoiceRegisters || [];
      if (registers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-5 py-6 text-center text-slate-400">No invoices issued during this period.</td></tr>`;
      } else {
        tbody.innerHTML = registers.map((inv) => {
          return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100">
              <td class="px-5 py-3 font-mono font-bold text-slate-900">${inv.invoiceNumber}</td>
              <td class="px-4 py-3 text-slate-500 text-[11px]">${formatDate(inv.saleDate)}</td>
              <td class="px-4 py-3">
                <p class="font-bold text-slate-900">${inv.customerName}</p>
                <p class="text-[10px] text-slate-400 font-mono">${inv.customerPhone || '-'}</p>
              </td>
              <td class="px-4 py-3 text-right font-mono font-semibold text-slate-800">${formatNpr(inv.taxableAmount)}</td>
              <td class="px-4 py-3 text-right font-mono font-bold text-purple-700">${formatNpr(inv.vatAmount)}</td>
              <td class="px-4 py-3 text-right font-mono text-slate-600">${formatNpr(inv.exemptAmount)}</td>
              <td class="px-5 py-3 text-right font-mono font-black text-slate-900">${formatNpr(inv.grandTotal)}</td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  function renderProductPerformance(data) {
    if (!data) return;
    const tbody = document.getElementById('products-table-body');
    if (!tbody) return;

    const products = data.products || [];
    if (products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-5 py-6 text-center text-slate-400">No product sales in this period.</td></tr>`;
      return;
    }

    tbody.innerHTML = products.map((p) => {
      const marginPct = p.marginPercentage || 0;
      const marginBadgeClass = marginPct >= 25
        ? 'bg-emerald-100 text-emerald-800'
        : (marginPct >= 10 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800');

      return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100">
          <td class="px-5 py-3.5 font-bold text-slate-900">${p.name}</td>
          <td class="px-4 py-3.5 font-mono text-[11px] text-slate-500">${p.sku}</td>
          <td class="px-4 py-3.5 text-right font-bold text-slate-800">${p.unitsSold}</td>
          <td class="px-4 py-3.5 text-right font-mono font-bold text-blue-700">${formatNpr(p.revenue)}</td>
          <td class="px-4 py-3.5 text-right font-mono text-slate-500">${formatNpr(p.costOfGoodsSold)}</td>
          <td class="px-4 py-3.5 text-right font-mono font-bold text-emerald-700">${formatNpr(p.grossProfit)}</td>
          <td class="px-5 py-3.5 text-right">
            <span class="inline-block rounded-full px-2 py-0.5 font-bold text-[10px] ${marginBadgeClass}">
              ${marginPct}%
            </span>
          </td>
        </tr>
      `;
    }).join('');
  }

  function setupControls() {
    const periodSelect = document.getElementById('report-period-select');
    const customContainer = document.getElementById('custom-date-container');

    periodSelect?.addEventListener('change', () => {
      if (periodSelect.value === 'custom') {
        customContainer?.classList.remove('hidden');
      } else {
        customContainer?.classList.add('hidden');
        loadReports();
      }
    });

    document.getElementById('refresh-reports-btn')?.addEventListener('click', () => {
      loadReports();
    });

    // Sorting
    const sortRev = document.getElementById('sort-prod-revenue');
    const sortUnits = document.getElementById('sort-prod-units');
    const sortProfit = document.getElementById('sort-prod-profit');

    function updateSortButtons(activeBtn) {
      [sortRev, sortUnits, sortProfit].forEach((btn) => {
        if (!btn) return;
        if (btn === activeBtn) {
          btn.className = 'rounded-lg px-2.5 py-1 font-bold text-white bg-purple-600 shadow-sm transition';
        } else {
          btn.className = 'rounded-lg px-2.5 py-1 font-semibold text-slate-600 hover:text-slate-900 transition';
        }
      });
    }

    sortRev?.addEventListener('click', () => {
      currentSort = 'revenue';
      updateSortButtons(sortRev);
      loadReports();
    });

    sortUnits?.addEventListener('click', () => {
      currentSort = 'units';
      updateSortButtons(sortUnits);
      loadReports();
    });

    sortProfit?.addEventListener('click', () => {
      currentSort = 'profit';
      updateSortButtons(sortProfit);
      loadReports();
    });

    // Logout
    document.getElementById('retailer-logout-btn')?.addEventListener('click', async () => {
      try {
        await request('/api/auth/signout', { method: 'POST' });
      } catch {
        // ignore
      }
      location.href = './index.html';
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const ok = await loadContext();
    if (!ok) return;

    setupControls();
    loadReports();
  });
})();
