/**
 * Nilopasal Retailer ERP Access Gate & Dashboard Controller
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

  function setLink(selector, href, text) {
    const element = document.querySelector(selector);
    if (!element) return;
    element.setAttribute('href', href);
    if (text) {
      if (element.firstElementChild) {
        element.childNodes[0].textContent = text;
      } else {
        element.textContent = text;
      }
    }
  }

  async function initDashboardGate() {
    const isDashboard = document.body.matches('[data-retailer-dashboard]');
    if (!isDashboard) return;

    try {
      const authData = await request('/api/auth/me');
      const user = authData.user;
      const retailer = authData.retailer;
      const access = retailer?.access;
      const business = retailer?.business;

      // Update user info in header
      if (user) {
        setText('#retailer-user-name', `${user.firstName} ${user.lastName}`);
        setText('#retailer-user-email', user.email);
        document.querySelector('#retailer-auth-panel')?.classList.remove('hidden');
      }

      if (!access || access.reason === 'NO_RETAILER') {
        setText('#retailer-business-name', 'No store connected');
        setText('#retailer-gate-title', 'Create your retailer business account.');
        setText('#retailer-gate-copy', 'Your user account is signed in, but no retailer business is registered yet. Complete store registration to continue.');
        setText('#retailer-status-verification', 'Not registered');
        setText('#retailer-status-subscription', 'Required');
        setText('#retailer-status-live-data', 'Hidden');
        setLink('#retailer-primary-cta', './retailer-register.html', 'Register Shop ');
        document.querySelector('#retailer-lock-banner')?.classList.remove('hidden');
        document.querySelector('#retailer-unlocked-erp')?.classList.add('hidden');
        return;
      }

      if (business?.businessName) {
        setText('#retailer-business-name', business.businessName);
        setText('#retailer-topbar-shop-name', business.businessName);
      }

      setText('#retailer-status-verification', String(business?.verificationStatus || 'DRAFT').replaceAll('_', ' '));
      setText('#retailer-status-subscription', String(business?.subscriptionStatus || 'NONE').replaceAll('_', ' '));

      if (access.reason === 'SUSPENDED') {
        setText('#retailer-gate-title', 'Your retailer account is suspended.');
        setText('#retailer-gate-copy', access.message || 'Access to this retailer business has been suspended by Nilopasal administrators. Please contact customer support.');
        setLink('#retailer-primary-cta', './contact.html', 'Contact Support ');
        document.querySelector('#retailer-lock-banner')?.classList.remove('hidden');
        document.querySelector('#retailer-unlocked-erp')?.classList.add('hidden');
        return;
      }

      if (access.reason === 'REJECTED') {
        setText('#retailer-gate-title', 'Store verification rejected.');
        setText('#retailer-gate-copy', access.message || 'Your retailer verification application was not approved. Please reach out to Nilopasal support for details or resubmission.');
        setLink('#retailer-primary-cta', './contact.html', 'Contact Support ');
        document.querySelector('#retailer-lock-banner')?.classList.remove('hidden');
        document.querySelector('#retailer-unlocked-erp')?.classList.add('hidden');
        return;
      }

      if (access.reason === 'VERIFICATION_REQUIRED') {
        setText('#retailer-gate-title', 'Store verification is under review.');
        setText('#retailer-gate-copy', 'Your shop details and tax documents are submitted. Nilopasal administrators review every retailer before enabling live billing. You will be notified once verified.');
        setLink('#retailer-primary-cta', './contact.html', 'Contact Support ');
        document.querySelector('#retailer-verification-info')?.classList.remove('hidden');
        document.querySelector('#retailer-lock-banner')?.classList.remove('hidden');
        document.querySelector('#retailer-unlocked-erp')?.classList.add('hidden');
        return;
      }

      if (access.reason === 'SUBSCRIPTION_REQUIRED') {
        setText('#retailer-gate-title', 'Verification approved! Subscribe to unlock ERP.');
        setText('#retailer-gate-copy', 'Your retailer store is verified. Choose a subscription plan or activate your 14-day free trial to unlock POS, Khata, Inventory, and Billing.');
        setLink('#retailer-primary-cta', './retailer-subscription.html', 'Choose Plan / Start Trial ');
        document.querySelector('#retailer-lock-banner')?.classList.remove('hidden');
        document.querySelector('#retailer-unlocked-erp')?.classList.add('hidden');
        return;
      }

      if (access.allowed) {
        // Unlock ERP dashboard!
        document.querySelector('#retailer-lock-banner')?.classList.add('hidden');
        document.querySelector('#retailer-unlocked-erp')?.classList.remove('hidden');
        setText('#retailer-status-live-data', 'Active & Connected');

        // Fetch live dashboard figures from backend database
        const dashboard = await request('/api/retailer/dashboard');
        const summary = dashboard.summary;

        setText('#retailer-sales-value', `Rs. ${Number(summary.todaySales || 0).toLocaleString('en-IN')}`);
        setText('#retailer-transactions-value', String(summary.transactions || 0));
        setText('#retailer-khata-value', `Rs. ${Number(summary.outstandingKhata || 0).toLocaleString('en-IN')}`);
        setText('#retailer-low-stock-value', String(summary.lowStockItems || 0));
        setText('#retailer-total-products-value', String(summary.totalProducts || 0));
        setText('#retailer-inventory-valuation-value', `Rs. ${Number(summary.inventoryValuation || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);

        const salesTbody = document.querySelector('#retailer-recent-sales-tbody');
        if (salesTbody) {
          if (!summary.recentSales || summary.recentSales.length === 0) {
            salesTbody.innerHTML = `
              <tr>
                <td colspan="5" class="px-6 py-8 text-center text-sm text-slate-400">
                  <i class="fa-solid fa-receipt text-2xl mb-2 text-slate-300 block"></i>
                  No sales recorded yet. Open POS to make your first sale.
                </td>
              </tr>
            `;
          } else {
            salesTbody.innerHTML = summary.recentSales.map((sale) => `
              <tr class="border-b border-slate-100 hover:bg-slate-50 text-sm">
                <td class="px-6 py-3 font-semibold text-slate-900">${sale.invoiceNumber}</td>
                <td class="px-6 py-3 text-slate-600">${new Date(sale.createdAt).toLocaleDateString()}</td>
                <td class="px-6 py-3 font-bold text-slate-900">Rs. ${Number(sale.grandTotal).toLocaleString('en-IN')}</td>
                <td class="px-6 py-3"><span class="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">${sale.paymentStatus}</span></td>
              </tr>
            `).join('');
          }
        }
      }
    } catch (err) {
      setText('#retailer-gate-title', 'Sign in to access Nilopasal Retailer ERP.');
      setText('#retailer-gate-copy', 'Please sign in to your Nilopasal account to access your store dashboard, inventory, and POS billing.');
      setText('#retailer-status-verification', 'Not connected');
      setText('#retailer-status-subscription', 'Required');
      setText('#retailer-status-live-data', 'Hidden');
      setLink('#retailer-primary-cta', './account.html', 'Sign In ');
      document.querySelector('#retailer-lock-banner')?.classList.remove('hidden');
      document.querySelector('#retailer-unlocked-erp')?.classList.add('hidden');
    }
  }

  async function initRegisterForm() {
    const form = document.querySelector('#retailer-register-form');
    if (!form) return;

    const message = document.querySelector('#retailer-register-message');
    let currentUser = null;

    // Check if user is already signed in
    try {
      const auth = await request('/api/auth/me');
      if (auth?.user) {
        currentUser = auth.user;
        const ownerSection = document.querySelector('#owner-fields-section');
        const loggedInSection = document.querySelector('#logged-in-user-badge');
        if (ownerSection) ownerSection.classList.add('hidden');
        if (loggedInSection) {
          loggedInSection.classList.remove('hidden');
          setText('#logged-in-user-name', `${currentUser.firstName} ${currentUser.lastName} (${currentUser.email})`);
        }

        // Remove required from hidden inputs
        document.querySelectorAll('#owner-fields-section input').forEach((inp) => {
          inp.removeAttribute('required');
        });
      }
    } catch {
      // User is not logged in, keep owner fields visible
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      message.textContent = 'Registering retailer business...';
      message.className = 'retailer-message text-blue-600 font-semibold mt-3 text-sm';

      const formData = Object.fromEntries(new FormData(form));

      const payload = {
        business: {
          businessName: formData.businessName,
          legalName: formData.legalName || undefined,
          panNumber: formData.panNumber || undefined,
          vatNumber: formData.vatNumber || undefined,
          province: formData.province,
          district: formData.district,
          municipality: formData.municipality,
          ward: formData.ward || undefined,
          addressLine: formData.addressLine,
          landmark: formData.landmark || undefined,
          contactNumber: formData.contactNumber,
          alternatePhone: formData.alternatePhone || undefined,
          email: formData.businessEmail || undefined,
        },
      };

      if (!currentUser) {
        payload.owner = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          email: formData.email,
          password: formData.password,
        };
      }

      try {
        await request('/api/retailer/register', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        message.textContent = 'Retailer store registered successfully! Redirecting to dashboard...';
        message.className = 'retailer-message text-emerald-600 font-bold mt-3 text-sm';

        setTimeout(() => {
          location.href = './retailer-dashboard.html';
        }, 1200);
      } catch (err) {
        message.textContent = err.message || 'Registration failed. Please check the form.';
        message.className = 'retailer-message text-rose-600 font-semibold mt-3 text-sm';
      }
    });
  }

  async function initSubscriptionPage() {
    const isSubscriptionPage = document.body.matches('[data-retailer-subscription]');
    if (!isSubscriptionPage) return;

    const plansContainer = document.querySelector('#plans-list');
    const statusNotice = document.querySelector('#subscription-status-notice');

    try {
      // Load real subscription plans from backend
      const data = await request('/api/retailer/subscription/plans');
      const plans = data.plans || [];

      let userContext = null;
      try {
        const auth = await request('/api/auth/me');
        userContext = auth.retailer;
      } catch {
        // Unauthenticated visitor
      }

      if (userContext && statusNotice) {
        const b = userContext.business;
        statusNotice.innerHTML = `
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div>
              <p class="text-xs font-bold text-slate-500 uppercase tracking-wide">Current Shop: <strong class="text-slate-900">${b?.businessName || 'Not registered'}</strong></p>
              <p class="text-sm font-semibold text-slate-700 mt-0.5">Verification: <span class="capitalize text-blue-700">${b?.verificationStatus || 'Not submitted'}</span> · Subscription: <span class="capitalize text-amber-700">${b?.subscriptionStatus || 'NONE'}</span></p>
            </div>
            ${b?.verificationStatus === 'VERIFIED' && b?.subscriptionStatus === 'NONE' ? `
              <button id="quick-start-trial-btn" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition shadow-sm">
                <i class="fa-solid fa-play mr-1"></i> Start 14-Day Free Trial
              </button>
            ` : ''}
          </div>
        `;

        document.querySelector('#quick-start-trial-btn')?.addEventListener('click', async () => {
          try {
            await request('/api/retailer/subscription/start-trial', { method: 'POST', body: JSON.stringify({}) });
            alert('Your 14-day free trial is now active! Redirecting to ERP Dashboard...');
            location.href = './retailer-dashboard.html';
          } catch (err) {
            alert(err.message || 'Could not start trial.');
          }
        });
      }

      if (plansContainer && plans.length > 0) {
        plansContainer.innerHTML = plans.map((plan) => {
          const isTrial = plan.slug === 'retailer-starter-trial';
          const isYearly = plan.billingPeriod === 'YEARLY';
          const features = Array.isArray(plan.features) ? plan.features : [];

          return `
            <div class="relative flex flex-col justify-between rounded-3xl border ${isTrial ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-200 bg-white'} p-6 shadow-sm hover:shadow-md transition">
              ${isTrial ? '<span class="absolute -top-3 right-6 bg-emerald-600 text-white font-black text-[11px] uppercase tracking-wider px-3 py-1 rounded-full">Free 14 Days</span>' : ''}
              <div>
                <h3 class="text-xl font-black text-slate-900">${plan.name}</h3>
                <p class="mt-1 text-xs text-slate-500">${plan.description || ''}</p>
                <div class="mt-4 flex items-baseline gap-1">
                  <span class="text-3xl font-black text-slate-900">Rs. ${Number(plan.price).toLocaleString('en-IN')}</span>
                  <span class="text-xs font-semibold text-slate-500">/${plan.billingPeriod.toLowerCase()}</span>
                </div>
                <hr class="my-5 border-slate-100" />
                <ul class="space-y-2 text-xs text-slate-700 font-medium">
                  ${features.map((f) => `<li class="flex items-center gap-2"><i class="fa-solid fa-check text-emerald-600"></i> ${f}</li>`).join('')}
                </ul>
              </div>
              <div class="mt-8">
                ${isTrial ? `
                  <button data-plan="${plan.slug}" class="select-plan-btn w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 text-sm transition">
                    Start 14-Day Free Trial
                  </button>
                ` : `
                  <button data-plan="${plan.slug}" class="select-plan-btn w-full rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold py-3 text-sm transition">
                    Subscribe
                  </button>
                `}
              </div>
            </div>
          `;
        }).join('');

        document.querySelectorAll('.select-plan-btn').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            const planSlug = e.currentTarget.dataset.plan;
            if (planSlug === 'retailer-starter-trial') {
              try {
                await request('/api/retailer/subscription/start-trial', {
                  method: 'POST',
                  body: JSON.stringify({ planSlug }),
                });
                alert('Your 14-day trial is now active! Redirecting to ERP Dashboard...');
                location.href = './retailer-dashboard.html';
              } catch (err) {
                alert(err.message || 'Trial activation failed. Ensure your store verification is approved.');
              }
            } else {
              alert('For Standard & Pro subscription activation with offline or digital payment recording, please contact Nilopasal support or your account manager.');
            }
          });
        });
      }
    } catch (err) {
      if (plansContainer) {
        plansContainer.innerHTML = '<p class="text-slate-500 text-sm">Failed to load real plans from backend. Make sure the API is reachable.</p>';
      }
    }
  }

  // Handle logout
  document.querySelector('#retailer-logout-btn')?.addEventListener('click', async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' });
      location.href = './account.html';
    } catch (err) {
      alert(err.message || 'Could not sign out');
    }
  });

  initDashboardGate();
  initRegisterForm();
  initSubscriptionPage();
})();
