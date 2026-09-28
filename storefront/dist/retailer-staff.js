/**
 * Nilopasal Retailer ERP — Staff Multi-Role RBAC & Audit Trails Controller
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

  function showBanner(message, isError = false) {
    const banner = document.getElementById('status-banner');
    const inner = document.getElementById('status-banner-inner');
    const text = document.getElementById('status-banner-text');
    const icon = document.getElementById('status-banner-icon');
    if (!banner || !inner || !text || !icon) return;

    banner.classList.remove('hidden');
    text.textContent = message;
    if (isError) {
      inner.className = 'rounded-xl p-3 flex items-center justify-between text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200';
      icon.className = 'fa-solid fa-circle-exclamation text-rose-600';
    } else {
      inner.className = 'rounded-xl p-3 flex items-center justify-between text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200';
      icon.className = 'fa-solid fa-circle-check text-emerald-600';
    }
    setTimeout(() => {
      banner.classList.add('hidden');
    }, 6000);
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

  function getRoleBadge(role) {
    switch (role) {
      case 'OWNER':
        return `<span class="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-extrabold text-purple-800"><i class="fa-solid fa-crown text-[9px]"></i> OWNER</span>`;
      case 'ADMIN':
        return `<span class="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-extrabold text-blue-800"><i class="fa-solid fa-user-shield text-[9px]"></i> ADMIN</span>`;
      case 'MANAGER':
        return `<span class="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-extrabold text-indigo-800"><i class="fa-solid fa-user-tie text-[9px]"></i> MANAGER</span>`;
      case 'CASHIER':
        return `<span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-800"><i class="fa-solid fa-cash-register text-[9px]"></i> CASHIER</span>`;
      default:
        return `<span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-extrabold text-slate-800">${role}</span>`;
    }
  }

  let currentAuth = null;
  let auditLogsData = [];
  let currentAuditPage = 1;
  const auditLimit = 20;

  async function loadContext() {
    try {
      const auth = await request('/api/auth/me');
      if (!auth?.user || !auth.retailer?.access?.allowed) {
        location.href = './retailer-dashboard.html';
        return false;
      }
      currentAuth = auth;
      setText('#retailer-user-name', `${auth.user.firstName} ${auth.user.lastName}`);
      setText('#retailer-user-email', `${auth.retailer.role || 'Staff'}`);
      setText('#retailer-business-name', auth.retailer.business?.businessName || 'Store');
      return true;
    } catch {
      location.href = './retailer-dashboard.html';
      return false;
    }
  }

  // TAB SWITCHING
  function setupTabs() {
    const tabTeam = document.getElementById('tab-btn-team');
    const tabAudit = document.getElementById('tab-btn-audit');
    const contentTeam = document.getElementById('tab-content-team');
    const contentAudit = document.getElementById('tab-content-audit');

    tabTeam?.addEventListener('click', () => {
      tabTeam.className = 'tab-btn pb-2.5 text-xs font-bold border-b-2 border-blue-600 text-blue-600 flex items-center gap-2';
      tabAudit.className = 'tab-btn pb-2.5 text-xs font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 transition';
      contentTeam.classList.remove('hidden');
      contentAudit.classList.add('hidden');
    });

    tabAudit?.addEventListener('click', () => {
      tabAudit.className = 'tab-btn pb-2.5 text-xs font-bold border-b-2 border-blue-600 text-blue-600 flex items-center gap-2';
      tabTeam.className = 'tab-btn pb-2.5 text-xs font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-2 transition';
      contentAudit.classList.remove('hidden');
      contentTeam.classList.add('hidden');
      loadAuditLogs();
    });
  }

  // LOAD STAFF MEMBERS
  async function loadStaffMembers() {
    const tbody = document.getElementById('members-table-body');
    if (!tbody) return;

    try {
      const res = await request('/api/retailer/staff/members');
      const members = res.members || [];
      setText('#card-active-staff', members.filter(m => m.isActive).length.toString());
      setText('#tab-members-count-badge', members.length.toString());

      if (members.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">No staff members found.</td></tr>`;
        return;
      }

      tbody.innerHTML = members.map((m) => {
        const isOwner = m.role === 'OWNER';
        const isCurrentUser = currentAuth?.user?.id === m.userId;
        const initial = (m.user?.firstName || 'U')[0].toUpperCase();

        return `
          <tr class="hover:bg-slate-50 transition border-b border-slate-100">
            <td class="px-5 py-3.5">
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 text-xs">
                  ${initial}
                </div>
                <div>
                  <p class="font-bold text-slate-900">${m.user?.firstName || ''} ${m.user?.lastName || ''} ${isCurrentUser ? '<span class="text-[10px] text-blue-600 font-semibold">(You)</span>' : ''}</p>
                  <p class="text-[11px] text-slate-500 font-mono">${m.user?.email || '-'}</p>
                </div>
              </div>
            </td>
            <td class="px-4 py-3.5 text-slate-600 font-mono text-[11px]">
              ${m.user?.phone || '-'}
            </td>
            <td class="px-4 py-3.5">
              ${getRoleBadge(m.role)}
            </td>
            <td class="px-4 py-3.5">
              <span class="inline-flex items-center gap-1.5 text-xs font-semibold ${m.isActive ? 'text-emerald-700' : 'text-slate-400'}">
                <span class="h-1.5 w-1.5 rounded-full ${m.isActive ? 'bg-emerald-500' : 'bg-slate-300'}"></span>
                ${m.isActive ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td class="px-4 py-3.5 text-slate-500 text-[11px]">
              ${formatDate(m.joinedAt || m.createdAt)}
            </td>
            <td class="px-5 py-3.5 text-right">
              ${isOwner ? `
                <span class="text-[11px] font-semibold text-slate-400 italic">Protected Owner</span>
              ` : `
                <div class="flex items-center justify-end gap-2">
                  <button onclick="window.retailerStaff.openEditRole('${m.id}', '${m.user?.firstName || ''} ${m.user?.lastName || ''}', '${m.user?.email || ''}', '${m.role}')" class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition">
                    Edit Role
                  </button>
                  <button onclick="window.retailerStaff.removeMember('${m.id}', '${m.user?.firstName || ''}')" class="rounded-lg border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 transition" title="Remove staff member">
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              `}
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-rose-500">${err.message}</td></tr>`;
    }
  }

  // LOAD PENDING INVITES
  async function loadPendingInvites() {
    const tbody = document.getElementById('invites-table-body');
    if (!tbody) return;

    try {
      const res = await request('/api/retailer/staff/invites');
      const invites = res.invites || [];
      setText('#card-pending-invites', invites.length.toString());

      if (invites.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">No pending staff invitations.</td></tr>`;
        return;
      }

      tbody.innerHTML = invites.map((inv) => {
        return `
          <tr class="hover:bg-slate-50 transition border-b border-slate-100">
            <td class="px-5 py-3.5 font-bold text-slate-900 font-mono">
              ${inv.email}
            </td>
            <td class="px-4 py-3.5">
              ${getRoleBadge(inv.role)}
            </td>
            <td class="px-4 py-3.5 text-slate-600 text-xs">
              ${inv.invitedByUser ? `${inv.invitedByUser.firstName} ${inv.invitedByUser.lastName}` : 'Store Owner'}
            </td>
            <td class="px-4 py-3.5 text-slate-500 text-[11px]">
              ${formatDate(inv.expiresAt)}
            </td>
            <td class="px-4 py-3.5">
              <span class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                Pending Acceptance
              </span>
            </td>
            <td class="px-5 py-3.5 text-right">
              <span class="text-[11px] text-slate-400 font-medium">Token issued</span>
            </td>
          </tr>
        `;
      }).join('');
    } catch {
      // If user lacks permission to list invites (e.g. Cashier), show silent placeholder
      tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-4 text-center text-slate-400">Restricted to Store Owner and Administrators.</td></tr>`;
    }
  }

  // LOAD AUDIT LOGS
  async function loadAuditLogs(page = 1) {
    const tbody = document.getElementById('audit-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Fetching audit records...</td></tr>`;

    try {
      const entityType = document.getElementById('audit-filter-entity')?.value || '';
      const action = document.getElementById('audit-filter-action')?.value?.trim() || '';

      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: auditLimit.toString(),
      });
      if (entityType) queryParams.set('entityType', entityType);
      if (action) queryParams.set('action', action);

      const res = await request(`/api/retailer/staff/audit-logs?${queryParams.toString()}`);
      currentAuditPage = page;
      auditLogsData = res.logs || [];

      setText('#audit-total-count', `Total: ${res.pagination?.total || 0} events`);
      setText('#audit-page-info', `Page ${res.pagination?.page || 1} of ${res.pagination?.totalPages || 1}`);

      const prevBtn = document.getElementById('audit-prev-btn');
      const nextBtn = document.getElementById('audit-next-btn');
      if (prevBtn) prevBtn.disabled = currentAuditPage <= 1;
      if (nextBtn) nextBtn.disabled = currentAuditPage >= (res.pagination?.totalPages || 1);

      if (auditLogsData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-slate-400">No audit logs matching criteria.</td></tr>`;
        return;
      }

      tbody.innerHTML = auditLogsData.map((log, index) => {
        const actorName = log.user ? `${log.user.firstName} ${log.user.lastName}` : (log.actorRole || 'System');
        const actorEmail = log.user?.email || '-';

        return `
          <tr class="hover:bg-slate-50 transition border-b border-slate-100">
            <td class="px-5 py-3 text-slate-600 text-[11px] whitespace-nowrap">
              ${formatDate(log.createdAt)}
            </td>
            <td class="px-4 py-3">
              <span class="inline-block rounded bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-800 font-mono tracking-tight">
                ${log.action}
              </span>
            </td>
            <td class="px-4 py-3">
              <div class="text-xs font-bold text-slate-800">${log.entityType}</div>
              <div class="text-[10px] text-slate-400 font-mono truncate max-w-[120px]" title="${log.entityId}">${log.entityId}</div>
            </td>
            <td class="px-4 py-3">
              <div class="text-xs font-semibold text-slate-900">${actorName}</div>
              <div class="text-[10px] text-slate-400 font-mono">${actorEmail}</div>
            </td>
            <td class="px-4 py-3 text-slate-500 font-mono text-[11px]">
              ${log.ipAddress || 'Internal'}
            </td>
            <td class="px-5 py-3 text-right">
              <button onclick="window.retailerStaff.viewAuditPayload(${index})" class="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition">
                <i class="fa-solid fa-code text-[10px] mr-1"></i> Payload
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-rose-500">Access Restricted: ${err.message}</td></tr>`;
    }
  }

  // MODAL CONTROLS
  function setupModals() {
    // Invite Modal
    const inviteModal = document.getElementById('modal-invite-staff');
    const openInviteBtn = document.getElementById('open-invite-modal-btn');
    const closeInviteBtn = document.getElementById('close-invite-modal');
    const cancelInviteBtn = document.getElementById('cancel-invite-btn');
    const inviteForm = document.getElementById('invite-staff-form');

    openInviteBtn?.addEventListener('click', () => {
      document.getElementById('invite-token-output')?.classList.add('hidden');
      inviteForm?.reset();
      inviteModal?.classList.remove('hidden');
    });
    closeInviteBtn?.addEventListener('click', () => inviteModal?.classList.add('hidden'));
    cancelInviteBtn?.addEventListener('click', () => inviteModal?.classList.add('hidden'));

    // Invite Role selection hint
    const roleSelect = document.getElementById('invite-role');
    const roleHint = document.getElementById('role-hint');
    roleSelect?.addEventListener('change', () => {
      if (roleSelect.value === 'CASHIER') {
        roleHint.textContent = 'Cashiers can perform POS sales, customer billing, and record Khata payments. Cannot view audit logs or inventory costs.';
      } else if (roleSelect.value === 'MANAGER') {
        roleHint.textContent = 'Managers can create products, adjust stock, manage supplier POs, and review audit records. Cannot modify staff roles.';
      } else if (roleSelect.value === 'ADMIN') {
        roleHint.textContent = 'Admins have full operational access to invite staff, adjust inventory, view audit logs, and manage supplier transactions.';
      }
    });

    // Invite Form Submit
    inviteForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('submit-invite-btn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Inviting...';

      try {
        const email = document.getElementById('invite-email').value.trim();
        const role = document.getElementById('invite-role').value;

        const result = await request('/api/retailer/staff/invite', {
          method: 'POST',
          body: JSON.stringify({ email, role }),
        });

        showBanner(`Invitation created successfully for ${email}`);
        
        // Show token output
        const tokenOut = document.getElementById('invite-token-output');
        const tokenInput = document.getElementById('generated-token-input');
        if (tokenOut && tokenInput && result.token) {
          tokenOut.classList.remove('hidden');
          tokenInput.value = result.token;
        }

        loadPendingInvites();
      } catch (err) {
        showBanner(err.message, true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Send Invitation';
      }
    });

    // Copy Token Button
    document.getElementById('copy-token-btn')?.addEventListener('click', () => {
      const tokenInput = document.getElementById('generated-token-input');
      if (tokenInput) {
        navigator.clipboard.writeText(tokenInput.value).then(() => {
          showBanner('Invitation token copied to clipboard!');
        });
      }
    });

    // Accept Token Modal
    const tokenModal = document.getElementById('modal-accept-token');
    const openTokenBtn = document.getElementById('open-accept-token-btn');
    const closeTokenBtn = document.getElementById('close-token-modal');
    const cancelTokenBtn = document.getElementById('cancel-token-btn');
    const tokenForm = document.getElementById('accept-token-form');

    openTokenBtn?.addEventListener('click', () => {
      tokenForm?.reset();
      tokenModal?.classList.remove('hidden');
    });
    closeTokenBtn?.addEventListener('click', () => tokenModal?.classList.add('hidden'));
    cancelTokenBtn?.addEventListener('click', () => tokenModal?.classList.add('hidden'));

    tokenForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const token = document.getElementById('accept-token-input').value.trim();
        await request('/api/retailer/staff/invites/accept', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });
        showBanner('Invitation accepted! Refreshing store context...');
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        showBanner(err.message, true);
      }
    });

    // Update Role Modal
    const roleModal = document.getElementById('modal-update-role');
    const closeRoleBtn = document.getElementById('close-role-modal');
    const cancelRoleBtn = document.getElementById('cancel-role-btn');
    const updateRoleForm = document.getElementById('update-role-form');

    closeRoleBtn?.addEventListener('click', () => roleModal?.classList.add('hidden'));
    cancelRoleBtn?.addEventListener('click', () => roleModal?.classList.add('hidden'));

    updateRoleForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const memberId = document.getElementById('edit-member-id').value;
        const role = document.getElementById('edit-new-role').value;

        await request(`/api/retailer/staff/members/${memberId}/role`, {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        });

        roleModal?.classList.add('hidden');
        showBanner('Staff role updated successfully');
        loadStaffMembers();
      } catch (err) {
        showBanner(err.message, true);
      }
    });

    // Audit Details Modal
    const auditModal = document.getElementById('modal-audit-details');
    const closeAuditBtn = document.getElementById('close-audit-modal');
    const closeAuditDetailsBtn = document.getElementById('close-audit-details-btn');
    closeAuditBtn?.addEventListener('click', () => auditModal?.classList.add('hidden'));
    closeAuditDetailsBtn?.addEventListener('click', () => auditModal?.classList.add('hidden'));

    // Audit Filters
    document.getElementById('audit-filter-apply')?.addEventListener('click', () => {
      loadAuditLogs(1);
    });
    document.getElementById('audit-filter-reset')?.addEventListener('click', () => {
      const entity = document.getElementById('audit-filter-entity');
      const action = document.getElementById('audit-filter-action');
      if (entity) entity.value = '';
      if (action) action.value = '';
      loadAuditLogs(1);
    });

    // Audit Pagination
    document.getElementById('audit-prev-btn')?.addEventListener('click', () => {
      if (currentAuditPage > 1) loadAuditLogs(currentAuditPage - 1);
    });
    document.getElementById('audit-next-btn')?.addEventListener('click', () => {
      loadAuditLogs(currentAuditPage + 1);
    });

    // Refresh Members
    document.getElementById('refresh-members-btn')?.addEventListener('click', () => {
      loadStaffMembers();
      loadPendingInvites();
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

  // GLOBAL EXPORTS FOR INLINE ONCLICK HANDLERS
  window.retailerStaff = {
    openEditRole(id, name, email, currentRole) {
      document.getElementById('edit-member-id').value = id;
      document.getElementById('edit-member-name').textContent = name;
      document.getElementById('edit-member-email').textContent = email;
      document.getElementById('edit-new-role').value = currentRole;
      document.getElementById('modal-update-role')?.classList.remove('hidden');
    },

    async removeMember(id, name) {
      if (!confirm(`Are you sure you want to deactivate and remove staff access for ${name}?`)) {
        return;
      }
      try {
        await request(`/api/retailer/staff/members/${id}`, { method: 'DELETE' });
        showBanner(`Staff member ${name} deactivated successfully`);
        loadStaffMembers();
      } catch (err) {
        showBanner(err.message, true);
      }
    },

    viewAuditPayload(index) {
      const record = auditLogsData[index];
      if (!record) return;

      document.getElementById('audit-detail-title').textContent = `${record.action} on ${record.entityType} (${record.entityId})`;
      const jsonContainer = document.getElementById('audit-detail-json');
      if (jsonContainer) {
        jsonContainer.textContent = JSON.stringify({
          id: record.id,
          action: record.action,
          entityType: record.entityType,
          entityId: record.entityId,
          timestamp: record.createdAt,
          ipAddress: record.ipAddress,
          actor: record.user ? {
            name: `${record.user.firstName} ${record.user.lastName}`,
            email: record.user.email,
            role: record.actorRole,
          } : null,
          metadata: record.metadata,
        }, null, 2);
      }
      document.getElementById('modal-audit-details')?.classList.remove('hidden');
    }
  };

  // CHECK URL QUERY FOR INVITE TOKEN
  function checkUrlForInviteToken() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      const tokenInput = document.getElementById('accept-token-input');
      if (tokenInput) tokenInput.value = token;
      document.getElementById('modal-accept-token')?.classList.remove('hidden');
    }
  }

  // INITIALIZE
  document.addEventListener('DOMContentLoaded', async () => {
    const ok = await loadContext();
    if (!ok) return;

    setupTabs();
    setupModals();
    loadStaffMembers();
    loadPendingInvites();
    checkUrlForInviteToken();
  });
})();
