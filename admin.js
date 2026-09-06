document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  const tableBody = document.getElementById('donationsTableBody');
  const totalAmountEl = document.getElementById('totalAmount');
  const totalDonorsEl = document.getElementById('totalDonors');
  const recentCountEl = document.getElementById('recentCount');
  const refreshBtn = document.getElementById('refreshBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userNameEl = document.getElementById('userName');
  const userRoleEl = document.getElementById('userRole');
  const userAvatarEl = document.getElementById('userAvatar');

  const user = getAuthUser();
  if (user) {
    userNameEl.textContent = user.fullName || 'Admin';
    userRoleEl.textContent = user.role || '';

    const sidebarUserNameEl = document.getElementById('sidebarUserName');
    const sidebarUserRoleEl = document.getElementById('sidebarUserRole');
    if (sidebarUserNameEl) sidebarUserNameEl.textContent = user.fullName || 'Admin';
    if (sidebarUserRoleEl) sidebarUserRoleEl.textContent = user.role || 'Role';

    if (user.photo) {
      userAvatarEl.innerHTML = `<img src="${user.photo}" alt="Avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
      userAvatarEl.style.backgroundColor = 'transparent';
    } else {
      userAvatarEl.innerHTML = (user.fullName || 'A').charAt(0).toUpperCase();
      userAvatarEl.style.backgroundColor = 'var(--accent)';
    }

    // Dynamic Greeting
    const hour = new Date().getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';

    const greetingEl = document.getElementById('dynamicGreeting');
    if (greetingEl) {
      greetingEl.textContent = `${greeting}, ${user.fullName.split(' ')[0]}!`;
    }
  }

  logoutBtn.addEventListener('click', () => {
    clearAuthSession();
    window.location.href = 'admin-login.html';
  });

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const fetchDonations = async () => {
    try {
      tableBody.innerHTML = `<tr><td colspan="8" class="loading"><div class="spinner"></div> Refreshing data...</td></tr>`;

      const data = await apiRequest('/api/donations');
      window.__allPayments = data; // store for receipt download lookup

      const totalAmount = data.reduce((sum, item) => sum + (item.amount || 0), 0);
      const totalDonors = data.length;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentCount = data.filter(item => new Date(item.date) >= sevenDaysAgo).length;

      totalAmountEl.textContent = formatCurrency(totalAmount);
      totalDonorsEl.textContent = totalDonors;
      recentCountEl.textContent = `${recentCount} (Last 7 days)`;

      if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 3rem; color: #6B7280;">No donations found yet.</td></tr>`;
        return;
      }

      tableBody.innerHTML = data.map(item => `
        <tr>
          <td>
            <div style="font-weight: 500; color: #111827;">${new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            <div style="font-size: 0.75rem; color: #6B7280;">${new Date(item.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
          </td>
          <td>
            <div style="font-weight: 500;">${item.fullName || 'Anonymous'}</div>
          </td>
          <td>
            <div>${item.email || '-'}</div>
            <div style="font-size: 0.75rem; color: #6B7280;">${item.phone || '-'}</div>
          </td>
          <td style="font-weight: 600; color: #1B4332;">${formatCurrency(item.amount)}</td>
          <td>
            ${item.with80G ? `<span class="badge badge-info">80G Requested</span><br><span style="font-size: 0.75rem; color: #6B7280;">PAN: ${item.pan}</span>` : '<span style="color: #6B7280;">No</span>'}
          </td>
          <td style="font-family: monospace; font-size: 0.75rem;">
            ${item.paymentId || 'N/A'}
          </td>
          <td>
            <span class="badge badge-success">Successful</span>
          </td>
          <td>
            <button
              onclick="window.downloadReceipt('${item._id}')"
              style="display:inline-flex;align-items:center;gap:6px;padding:0.45rem 0.9rem;background:var(--primary);color:white;border:none;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity 0.2s;"
              onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              PDF
            </button>
          </td>
        </tr>
      `).join('');

    } catch (error) {
      console.error(error);
      if (error.message === 'Authentication required' || error.message === 'Invalid or expired token') {
        clearAuthSession();
        window.location.href = 'admin-login.html';
        return;
      }
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem; color: #EF4444;">Error loading data. Is the backend server running?</td></tr>`;
    }
  };

  refreshBtn.addEventListener('click', fetchDonations);
  fetchDonations();

  // --- Receipt Download ---
  // Build a local index of donation data keyed by _id so the inline onclick can look it up
  window.downloadReceipt = (id) => {
    // allPayments is kept in closure scope below; we store it on window for inline handlers
    const item = window.__allPayments && window.__allPayments.find(d => String(d._id) === String(id));
    if (!item) { alert('Receipt data not found.'); return; }
    if (typeof window.generateDonationCertificate !== 'function') {
      alert('PDF library not loaded. Please refresh the page.');
      return;
    }
    window.generateDonationCertificate(item);
  };

  window.resendReceiptEmail = async (id) => {
    const item = window.__allPayments && window.__allPayments.find(d => String(d._id) === String(id));
    if (!item) { alert('Donation record not found.'); return; }

    const targetEmail = prompt(`Resend receipt email to:`, item.email || '');
    if (!targetEmail || !targetEmail.trim()) return;

    try {
      const data = await apiRequest('/api/admin/resend-receipt', {
        method: 'POST',
        body: JSON.stringify({ id, email: targetEmail.trim() })
      });
      alert(data.message || 'Receipt email sent successfully!');
    } catch (err) {
      alert(err.message || 'Failed to send receipt email.');
    }
  };

  // --- Registrations Section Logic ---
  const ADMIN_ROLES = [
    'President',
    'Secretary',
    'Treasurer',
    'Communication Public Relations Officer',
    'Office Secretary',
    'Program Incharge',
    'Executive Member'
  ];

  const navDashboard = document.querySelector('.nav-item.active');
  const dashboardSection = document.getElementById('dashboardSection');
  const registrationsSection = document.getElementById('registrationsSection');
  const refreshRegBtn = document.getElementById('refreshRegBtn');
  const registrationsContainer = document.getElementById('registrationsContainer');
  const regFilterBtns = document.querySelectorAll('.reg-filter-btn');

  // Modal elements
  const forwardModal = document.getElementById('forwardModal');
  const forwardRoleSelect = document.getElementById('forwardRoleSelect');
  const forwardUserSelect = document.getElementById('forwardUserSelect');
  const cancelForwardBtn = document.getElementById('cancelForwardBtn');
  const confirmForwardBtn = document.getElementById('confirmForwardBtn');

  let allRegistrations = [];
  let allAdminUsers = [];
  let currentRegFilter = 'pending';
  let currentSort = 'latest';
  let currentForwardTarget = null; // { type, id }

  const fetchAdminUsers = async () => {
    try {
      const users = await apiRequest('/api/admin/users');
      if (Array.isArray(users)) {
        allAdminUsers = users;
      }
    } catch (err) {
      console.error('Failed to fetch admin users:', err);
    }
  };

  const populateUserSelect = (selectedRole, selectEl) => {
    if (!selectEl) return;
    const matchingAdmins = allAdminUsers.filter(u => u.role === selectedRole);

    if (matchingAdmins.length === 0) {
      selectEl.innerHTML = `<option value="">No registered admins in this role</option>`;
    } else {
      let optionsHtml = `<option value="">-- Select Person / Admin --</option>`;
      optionsHtml += matchingAdmins.map(u => {
        const isCurrent = user && (u._id === user._id || u.email === user.email);
        const label = `${u.fullName} (${u.email})${isCurrent ? ' - You' : ''}`;
        return `<option value="${u._id}">${label}</option>`;
      }).join('');
      selectEl.innerHTML = optionsHtml;
      if (matchingAdmins.length === 1) {
        selectEl.value = matchingAdmins[0]._id;
      } else {
        selectEl.value = '';
      }
    }
  };
  
  const regSortSelect = document.getElementById('regSortSelect');
  if (regSortSelect) {
    regSortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderRegistrations();
    });
  }

  let currentTypeFilter = 'all';
  const regTypeFilterSelect = document.getElementById('regTypeFilterSelect');
  if (regTypeFilterSelect) {
    regTypeFilterSelect.addEventListener('change', (e) => {
      currentTypeFilter = e.target.value;
      renderRegistrations();
    });
  }

  const regSearchInput = document.getElementById('regSearchInput');
  if (regSearchInput) {
    regSearchInput.addEventListener('input', () => {
      renderRegistrations();
    });
  }

  const pendingBtn = document.getElementById('nav-pending');
  const forwardedBtn = document.getElementById('nav-forwarded');
  const forwardedText = document.getElementById('nav-forwarded-text');

  if (user && (user.role === 'Secretary' || user.role === 'President')) {
    if (forwardedText) {
      forwardedText.textContent = 'Track';
    } else if (forwardedBtn) {
      const textNode = Array.from(forwardedBtn.childNodes).find(n => n.nodeType === Node.TEXT_NODE || n.tagName === 'SPAN');
      if (textNode) textNode.textContent = 'Track';
    }
  }

  // Hide Pending nav for President — Presidents only work from Verified / Track
  if (user && user.role === 'President') {
    if (pendingBtn) {
      pendingBtn.style.display = 'none';
      pendingBtn.classList.remove('active');
    }
    // Default President to Verified section on load
    const verifiedNavBtn = document.getElementById('nav-verified');
    if (verifiedNavBtn) {
      regFilterBtns.forEach(b => b.classList.remove('active'));
      verifiedNavBtn.classList.add('active');
      currentRegFilter = 'verified';
    }
  }

  if (user && user.role !== 'Secretary' && user.role !== 'President') {
    if (pendingBtn) {
      pendingBtn.style.display = 'none';
      pendingBtn.classList.remove('active');
    }
    const acceptedBtn = document.getElementById('nav-accepted');
    if (acceptedBtn) acceptedBtn.style.display = 'none';
    const rejectedBtn = document.getElementById('nav-rejected');
    if (rejectedBtn) rejectedBtn.style.display = 'none';
    const verifiedBtn = document.getElementById('nav-verified');
    if (verifiedBtn) verifiedBtn.style.display = 'none';
    const issueBtn = document.getElementById('nav-issues');
    if (issueBtn) issueBtn.style.display = 'none';
    
    if (forwardedBtn) {
      forwardedBtn.classList.add('active');
      currentRegFilter = 'forwarded';
    }
  }

  navDashboard.addEventListener('click', (e) => {
    e.preventDefault();
    navDashboard.classList.add('active');
    regFilterBtns.forEach(b => b.classList.remove('active'));
    if (dashboardSection) dashboardSection.style.display = 'block';
    registrationsSection.style.display = 'none';
  });

  regFilterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      
      navDashboard.classList.remove('active');
      regFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      currentRegFilter = btn.getAttribute('data-filter');
      
      if (dashboardSection) dashboardSection.style.display = 'none';
      registrationsSection.style.display = 'block';
      
      // Update section header
      const headerTitle = registrationsSection.querySelector('h2');
      if (headerTitle) {
        if (currentRegFilter === 'forwarded' && user && (user.role === 'Secretary' || user.role === 'President')) {
          headerTitle.textContent = 'Track Forwarded Applications';
        } else {
          const filterName = currentRegFilter.replace('_', ' ');
          headerTitle.textContent = filterName.charAt(0).toUpperCase() + filterName.slice(1) + ' Registrations';
        }
      }
      
      renderRegistrations();

    });
  });

  const isRegistrationVisibleToUser = (r, filter) => {
    const status = r.status || 'pending';
    const isSecOrPres = user && (user.role === 'Secretary' || user.role === 'President');

    if (filter === 'forwarded') {
      // Secretary and President can track ALL forwarded registrations across the system
      if (isSecOrPres) {
        return status === 'forwarded' || (r.assignedToRole && r.assignedToRole !== 'Secretary' && r.assignedToRole !== 'President' && status !== 'accepted' && status !== 'rejected');
      }
      if (r.assignedToAdminId) {
        return (r.assignedToAdminId === user._id || r.assignedToAdminEmail === user.email) && status === 'forwarded';
      }
      if (r.assignedToRole) {
        return r.assignedToRole === user.role && status === 'forwarded';
      }
      return status === 'forwarded';
    }

    if (status !== filter) return false;

    if (filter === 'verified') {
      if (!isSecOrPres) return false;
      // If forwarded to a specific President/Secretary, only show to that specific admin.
      // Use string comparison to avoid ObjectId vs string type mismatch.
      if (r.assignedToAdminId) {
        const idMatch = String(r.assignedToAdminId) === String(user._id);
        const emailMatch = r.assignedToAdminEmail && user.email &&
          r.assignedToAdminEmail.toLowerCase() === user.email.toLowerCase();
        return idMatch || emailMatch;
      }
      if (r.assignedToRole) {
        return r.assignedToRole === user.role;
      }
      return true;
    }

    if (filter === 'pending') {
      // Only Secretary can see the Pending section; President has it removed
      return user && user.role === 'Secretary';
    }

    if (filter === 'accepted' || filter === 'rejected' || filter === 'issue_reported') {
      return isSecOrPres;
    }

    return true;
  };

  const updateSidebarBadges = () => {
    // Remove existing badges
    document.querySelectorAll('.sidebar-badge').forEach(el => el.remove());

    const isSecretaryOrPresident = user && (user.role === 'Secretary' || user.role === 'President');
    
    if (isSecretaryOrPresident) {
      // Pending badge — only for Secretary (President has no Pending section)
      if (user && user.role === 'Secretary') {
        const pendingCount = allRegistrations.filter(r => (r.status || 'pending') === 'pending').length;
        if (pendingCount > 0) {
          const pendingNav = document.getElementById('nav-pending');
          if (pendingNav) {
            const badge = document.createElement('span');
            badge.className = 'sidebar-badge';
            badge.style.cssText = 'background: #EF4444; color: white; font-size: 0.7rem; font-weight: bold; padding: 2px 6px; border-radius: 10px; margin-left: auto; display: flex; align-items: center; justify-content: center; height: 18px; min-width: 18px;';
            badge.textContent = pendingCount;
            pendingNav.appendChild(badge);
          }
        }
      }

      // Forwarded badge for Secretary & President to track items currently in review chain
      const forwardedCount = allRegistrations.filter(r => isRegistrationVisibleToUser(r, 'forwarded')).length;
      if (forwardedCount > 0) {
        const forwardedNav = document.getElementById('nav-forwarded');
        if (forwardedNav) {
          const badge = document.createElement('span');
          badge.className = 'sidebar-badge';
          badge.style.cssText = 'background: #F59E0B; color: white; font-size: 0.7rem; font-weight: bold; padding: 2px 6px; border-radius: 10px; margin-left: auto; display: flex; align-items: center; justify-content: center; height: 18px; min-width: 18px;';
          badge.textContent = forwardedCount;
          forwardedNav.appendChild(badge);
        }
      }

      // Verified badge — applications that completed the review chain, awaiting Secretary's final decision
      const verifiedCount = allRegistrations.filter(r => isRegistrationVisibleToUser(r, 'verified')).length;
      if (verifiedCount > 0) {
        const verifiedNav = document.getElementById('nav-verified');
        if (verifiedNav) {
          const badge = document.createElement('span');
          badge.className = 'sidebar-badge';
          badge.style.cssText = 'background: #10B981; color: white; font-size: 0.7rem; font-weight: bold; padding: 2px 6px; border-radius: 10px; margin-left: auto; display: flex; align-items: center; justify-content: center; height: 18px; min-width: 18px;';
          badge.textContent = verifiedCount;
          verifiedNav.appendChild(badge);
        }
      }
    } else {
      const forwardedCount = allRegistrations.filter(r => {
        if (r.status !== 'forwarded') return false;
        if (r.assignedToAdminId) return r.assignedToAdminId === user._id;
        if (r.assignedToAdminEmail) return r.assignedToAdminEmail === user.email;
        return r.assignedToRole === user.role;
      }).length;
      if (forwardedCount > 0) {
        const forwardedNav = document.getElementById('nav-forwarded');
        if (forwardedNav) {
          const badge = document.createElement('span');
          badge.className = 'sidebar-badge';
          badge.style.cssText = 'background: #F59E0B; color: white; font-size: 0.7rem; font-weight: bold; padding: 2px 6px; border-radius: 10px; margin-left: auto; display: flex; align-items: center; justify-content: center; height: 18px; min-width: 18px;';
          badge.textContent = forwardedCount;
          forwardedNav.appendChild(badge);
        }
      }
    }
  };

  const fetchRegistrations = async () => {
    try {
      registrationsContainer.innerHTML = '<div style="padding: 2rem; text-align: center;"><div class="spinner"></div> Loading registrations...</div>';
      await fetchAdminUsers();
      const data = await apiRequest('/api/admin/registrations');
      allRegistrations = data;
      renderRegistrations();
      updateSidebarBadges();
    } catch (error) {
      console.error(error);
      registrationsContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--danger);">Failed to load registrations.</div>';
    }
  };

  const updateRegistrationStatus = async (type, id, status) => {
    try {
      const res = await apiRequest(`/api/admin/registrations/${type}/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      if (res.success) {
        // Update local state
        const index = allRegistrations.findIndex(r => r._id === id);
        if (index > -1) {
          allRegistrations[index].status = status;
        }
        renderRegistrations();
        updateSidebarBadges();
      } else {
        alert(res.error || 'Failed to update status');
      }
    } catch (error) {
      console.error(error);
      alert('An error occurred');
    }
  };

  const openForwardModal = (type, id) => {
    currentForwardTarget = { type, id };

    // Clear written message input
    const msgInput = document.getElementById('forwardMessageInput');
    if (msgInput) msgInput.value = '';

    // Populate select, exclude current user's role
    const roles = ADMIN_ROLES.filter(role => role !== user.role);
    forwardRoleSelect.innerHTML = roles
      .map(role => `<option value="${role}">${role}</option>`)
      .join('');

    if (roles.length > 0) {
      populateUserSelect(roles[0], forwardUserSelect);
    }

    forwardModal.style.display = 'flex';
  };

  if (forwardRoleSelect && forwardUserSelect) {
    forwardRoleSelect.addEventListener('change', (e) => {
      populateUserSelect(e.target.value, forwardUserSelect);
    });
  }

  cancelForwardBtn.addEventListener('click', () => {
    forwardModal.style.display = 'none';
    currentForwardTarget = null;
    const msgInput = document.getElementById('forwardMessageInput');
    if (msgInput) msgInput.value = '';
    // Clear file selection
    if (typeof forwardSelectedFiles !== 'undefined') {
      forwardSelectedFiles = [];
      const list = document.getElementById('forwardFileList');
      if (list) list.innerHTML = '';
    }
  });

  confirmForwardBtn.addEventListener('click', async () => {
    if (!currentForwardTarget) return;
    const newRole = forwardRoleSelect.value;
    const selectedUserId = forwardUserSelect ? forwardUserSelect.value : '';

    if (!selectedUserId) {
      alert('Please select a specific person / admin to forward this registration to.');
      if (forwardUserSelect) forwardUserSelect.focus();
      return;
    }

    const selectedUserObj = allAdminUsers.find(u => u._id === selectedUserId);
    const targetName = selectedUserObj ? `${selectedUserObj.fullName} (${newRole})` : newRole;

    // 1st Confirmation
    const confirm1 = confirm(`[CONFIRMATION 1 of 2]\nAre you sure you want to forward this registration to ${targetName}?`);
    if (!confirm1) return;

    // 2nd Confirmation
    const confirm2 = confirm(`[CONFIRMATION 2 of 2 - FINAL CONFIRMATION]\nConfirm forwarding to ${targetName}?\nYou will lose direct access to edit this registration once forwarded.`);
    if (!confirm2) return;

    const { type, id } = currentForwardTarget;
    const msgInput = document.getElementById('forwardMessageInput');
    const messageVal = msgInput ? msgInput.value.trim() : '';

    try {
      const confirmBtn = confirmForwardBtn;
      const originalText = confirmBtn.textContent;
      confirmBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.4);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></span> Forwarding...</span>';
      confirmBtn.disabled = true;

      // Build FormData to support file attachments & person assignment & written message
      const formData = new FormData();
      formData.append('newRole', newRole);
      if (selectedUserObj) {
        formData.append('assignedToAdminId', selectedUserObj._id);
        formData.append('assignedToAdminName', selectedUserObj.fullName);
        formData.append('assignedToAdminEmail', selectedUserObj.email);
      }
      if (messageVal) {
        formData.append('message', messageVal);
      }
      if (typeof forwardSelectedFiles !== 'undefined' && forwardSelectedFiles.length > 0) {
        forwardSelectedFiles.forEach(file => formData.append('attachments', file));
      }

      const token = getAuthToken(); // Use the global function from admin-auth.js

      // When Secretary/President forwards to another Secretary/President, the backend
      // automatically sets status='verified' (peer-verified forward) so the recipient
      // sees it in their Verified section. Mirror this logic for local state updates.
      const isSenderPeer = user.role === 'Secretary' || user.role === 'President';
      const isTargetPeer = newRole === 'Secretary' || newRole === 'President';
      const isPeerVerifiedForward = isSenderPeer && isTargetPeer;

      // Always use the regular /forward endpoint — the server now handles peer-forward
      // status resolution internally. Only non-Secretary/President members use verify_and_forward.
      const forwardEndpoint = `${API_BASE}/api/admin/registrations/${type}/${id}/forward`;

      const response = await fetch(forwardEndpoint, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const res = await response.json();

      if (res.success) {
        const index = allRegistrations.findIndex(r => r._id === id);
        if (index > -1) {
          allRegistrations[index].assignedToRole = newRole;
          allRegistrations[index].assignedToAdminId = selectedUserObj ? selectedUserObj._id : null;
          allRegistrations[index].assignedToAdminName = selectedUserObj ? selectedUserObj.fullName : null;
          allRegistrations[index].assignedToAdminEmail = selectedUserObj ? selectedUserObj.email : null;
          // Peer Sec↔Pres forwards from Verified keep status as 'verified' so the
          // target sees it in their Verified section; all other forwards become 'forwarded'.
          allRegistrations[index].status = isPeerVerifiedForward ? 'verified' : 'forwarded';
          if (res.data && res.data.forwardAttachments) {
            allRegistrations[index].forwardAttachments = res.data.forwardAttachments;
          }
          if (res.data && res.data.forwardNotes) {
            allRegistrations[index].forwardNotes = res.data.forwardNotes;
          }
        }
        renderRegistrations();
        updateSidebarBadges();
        forwardModal.style.display = 'none';
        if (msgInput) msgInput.value = '';
        // Reset file selection
        if (typeof forwardSelectedFiles !== 'undefined') {
          forwardSelectedFiles = [];
          const list = document.getElementById('forwardFileList');
          if (list) list.innerHTML = '';
        }
      } else {
        alert(res.error || 'Failed to forward');
      }
    } catch (error) {
      console.error(error);
      alert('An error occurred');
    } finally {
      confirmForwardBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-5M13 5l6 6M13 5v6h6"/></svg> Forward';
      confirmForwardBtn.disabled = false;
    }
  });

  window.toggleRegDetail = (id) => {
    const detailRow = document.getElementById(`reg-detail-${id}`);
    const mainRow = document.getElementById(`reg-row-${id}`);
    const expandBtn = document.getElementById(`reg-expand-btn-${id}`);
    if (!detailRow) return;
    const isHidden = detailRow.style.display === 'none' || !detailRow.style.display;
    if (isHidden) {
      detailRow.style.display = 'table-row';
      if (mainRow) mainRow.classList.add('row-expanded');
      if (expandBtn) expandBtn.innerHTML = '▲';
    } else {
      detailRow.style.display = 'none';
      if (mainRow) mainRow.classList.remove('row-expanded');
      if (expandBtn) expandBtn.innerHTML = '▼';
    }
  };

  window.toggleAllRegDetails = () => {
    const detailRows = document.querySelectorAll('.excel-detail-row');
    if (detailRows.length === 0) return;
    const anyClosed = Array.from(detailRows).some(r => r.style.display === 'none');
    detailRows.forEach(r => {
      r.style.display = anyClosed ? 'table-row' : 'none';
    });
    document.querySelectorAll('.excel-row').forEach(r => {
      if (anyClosed) r.classList.add('row-expanded');
      else r.classList.remove('row-expanded');
    });
    document.querySelectorAll('.excel-expand-btn').forEach(b => {
      b.innerHTML = anyClosed ? '▲' : '▼';
    });
    const toggleBtn = document.getElementById('regToggleAllBtn');
    if (toggleBtn) {
      toggleBtn.textContent = anyClosed ? 'Collapse All' : 'Expand All';
    }
  };

  window.exportRegToCsv = () => {
    let filtered = allRegistrations.filter(r => isRegistrationVisibleToUser(r, currentRegFilter));
    if (currentTypeFilter && currentTypeFilter !== 'all') {
      filtered = filtered.filter(r => r.type === currentTypeFilter);
    }
    const searchInput = document.getElementById('regSearchInput');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (query) {
      filtered = filtered.filter(r => {
        const name = (r.fullName || r.patientName || '').toLowerCase();
        const email = (r.email || '').toLowerCase();
        const phone = (r.contactNo || r.phone || r.mobileNo || '').toLowerCase();
        const blood = (r.bloodGroup || r.patientBloodGroup || '').toLowerCase();
        const type = (r.type || '').toLowerCase();
        const assignedRole = (r.assignedToRole || '').toLowerCase();
        const assignedAdmin = (r.assignedToAdminName || '').toLowerCase();
        const dist = (r.district || '').toLowerCase();
        const village = (r.villageTownWard || '').toLowerCase();
        const hosp = (r.admittedHospital || r.bloodHospitalDetails || '').toLowerCase();
        return name.includes(query) || email.includes(query) || phone.includes(query) || blood.includes(query) ||
               type.includes(query) || assignedRole.includes(query) || assignedAdmin.includes(query) ||
               dist.includes(query) || village.includes(query) || hosp.includes(query);
      });
    }

    if (filtered.length === 0) {
      alert('No application records to export.');
      return;
    }

    const headers = ['#', 'Type', 'Name', 'Date Applied', 'Contact Phone', 'Email', 'WhatsApp', 'Blood Group', 'Status', 'Assigned Role', 'Assigned Admin', 'District', 'Address', 'Extra Info'];
    const csvRows = filtered.map((r, idx) => {
      const isReq = r.type === 'blood_request';
      const isBdn = r.type === 'blood_donor';
      const isMem = r.type === 'member';
      const name = r.fullName || r.patientName || '';
      const date = r.date ? new Date(r.date).toLocaleString('en-IN') : '';
      const phone = r.contactNo || r.phone || r.mobileNo || '';
      const email = r.email || '';
      const whatsapp = r.whatsappNo || r.whatsapp || '';
      const blood = r.bloodGroup || r.patientBloodGroup || '';
      const status = r.status || 'pending';
      const assignedRole = r.assignedToRole || '';
      const assignedName = r.assignedToAdminName || '';
      const district = r.district || '';
      const address = (r.address || `${r.address1 || ''} ${r.address2 || ''} ${r.villageTownWard || ''}`).trim();
      let extra = '';
      if (isReq) extra = `Hospital: ${r.admittedHospital || ''} | Qty: ${r.bloodQuantity || ''} | Date: ${r.requiredDate || ''}`;
      else if (isBdn) extra = `Donations: ${r.totalTimesDonated || 0} | Last: ${r.lastDonationDate || ''}`;
      else if (isMem) extra = `Validity: ${r.validity || ''} | Amount: Rs.${r.amount || 0}`;

      return [
        idx + 1,
        `"${r.type}"`,
        `"${name.replace(/"/g, '""')}"`,
        `"${date.replace(/"/g, '""')}"`,
        `"${phone}"`,
        `"${email.replace(/"/g, '""')}"`,
        `"${whatsapp}"`,
        `"${blood}"`,
        `"${status}"`,
        `"${assignedRole}"`,
        `"${assignedName.replace(/"/g, '""')}"`,
        `"${district.replace(/"/g, '""')}"`,
        `"${address.replace(/"/g, '""')}"`,
        `"${extra.replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvString = '\uFEFF' + [headers.join(','), ...csvRows].join('\r\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `udyam_applicants_${currentRegFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  const renderRegistrations = () => {
    let filtered = allRegistrations.filter(r => isRegistrationVisibleToUser(r, currentRegFilter));

    if (currentTypeFilter && currentTypeFilter !== 'all') {
      filtered = filtered.filter(r => r.type === currentTypeFilter);
    }

    const searchInput = document.getElementById('regSearchInput');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (query) {
      filtered = filtered.filter(r => {
        const name = (r.fullName || r.patientName || '').toLowerCase();
        const email = (r.email || '').toLowerCase();
        const phone = (r.contactNo || r.phone || r.mobileNo || '').toLowerCase();
        const blood = (r.bloodGroup || r.patientBloodGroup || '').toLowerCase();
        const type = (r.type || '').toLowerCase();
        const assignedRole = (r.assignedToRole || '').toLowerCase();
        const assignedAdmin = (r.assignedToAdminName || '').toLowerCase();
        const dist = (r.district || '').toLowerCase();
        const village = (r.villageTownWard || '').toLowerCase();
        const hosp = (r.admittedHospital || r.bloodHospitalDetails || '').toLowerCase();
        return name.includes(query) || email.includes(query) || phone.includes(query) || blood.includes(query) ||
               type.includes(query) || assignedRole.includes(query) || assignedAdmin.includes(query) ||
               dist.includes(query) || village.includes(query) || hosp.includes(query);
      });
    }

    // Apply sort
    filtered.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return currentSort === 'oldest' ? dateA - dateB : dateB - dateA;
    });

    const countBadge = document.getElementById('regCountBadge');
    if (countBadge) {
      countBadge.textContent = `${filtered.length} applicant${filtered.length !== 1 ? 's' : ''}`;
    }

    if (filtered.length === 0) {
      const isSecOrPres = user && (user.role === 'Secretary' || user.role === 'President');
      const emptyText = query ? `No applicants matching "${query}".` : (currentRegFilter === 'forwarded' && isSecOrPres) ? 'No applications are currently being tracked or forwarded.' : `No ${currentRegFilter} registrations found.`;
      registrationsContainer.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-muted); background: white; border-radius: 8px; border: 1px solid var(--border);">${emptyText}</div>`;
      return;
    }

    const rowsHtml = filtered.map((reg, index) => {
      const isVol = reg.type === 'volunteer';
      const isEmp = reg.type === 'employee';
      const isMem = reg.type === 'member';
      const isBdn = reg.type === 'blood_donor';
      const isReq = reg.type === 'blood_request';

      const applicantName = reg.fullName || reg.patientName || 'Unnamed';
      const safeName = applicantName.replace(/'/g, "&apos;");
      const photoSrc = reg.photo || reg.patientPhoto;
      const phone = reg.contactNo || reg.phone || reg.mobileNo || 'N/A';
      const whatsapp = reg.whatsappNo || reg.whatsapp || '';

      const typeLabelMap = {
        volunteer: 'Volunteer',
        employee: 'Employee',
        member: 'Member',
        blood_donor: 'Blood Donor',
        blood_request: 'Blood Request'
      };
      const typeLabel = typeLabelMap[reg.type] || reg.type;

      const formatPdfUrl = url => url;
      const docLinkStyle = "display:inline-flex; align-items:center; color:var(--primary); text-decoration:none; font-weight:600; font-size:0.72rem; background:rgba(27,67,50,0.08); padding:2px 7px; border-radius:4px; margin-right:4px; border:1px solid rgba(27,67,50,0.12); transition:all 0.15s;";

      // Document links summary
      const docChips = [];
      if (isVol) {
        if (reg.addressProofs && reg.addressProofs.length) {
          reg.addressProofs.forEach((p, i) => {
            docChips.push(`<a href="${formatPdfUrl(p)}" target="_blank" onclick="event.stopPropagation();" style="${docLinkStyle}">Proof ${i+1}</a>`);
          });
        }
      } else if (isEmp) {
        if (reg.panCard) docChips.push(`<a href="${formatPdfUrl(reg.panCard)}" target="_blank" onclick="event.stopPropagation();" style="${docLinkStyle}">PAN</a>`);
        if (reg.aadharCard) docChips.push(`<a href="${formatPdfUrl(reg.aadharCard)}" target="_blank" onclick="event.stopPropagation();" style="${docLinkStyle}">Aadhar</a>`);
        if (reg.dobProof) docChips.push(`<a href="${formatPdfUrl(reg.dobProof)}" target="_blank" onclick="event.stopPropagation();" style="${docLinkStyle}">DOB</a>`);
        if (reg.educationDocs && reg.educationDocs.length) docChips.push(`<a href="${formatPdfUrl(reg.educationDocs[0])}" target="_blank" onclick="event.stopPropagation();" style="${docLinkStyle}">Edu (${reg.educationDocs.length})</a>`);
      } else if (isBdn) {
        if (reg.aadharCard) docChips.push(`<a href="${formatPdfUrl(reg.aadharCard)}" target="_blank" onclick="event.stopPropagation();" style="${docLinkStyle}">Aadhar</a>`);
        if (reg.signature) docChips.push(`<a href="${formatPdfUrl(reg.signature)}" target="_blank" onclick="event.stopPropagation();" style="${docLinkStyle}">Sign</a>`);
      } else if (isReq) {
        if (reg.patientPhoto) docChips.push(`<a href="${formatPdfUrl(reg.patientPhoto)}" target="_blank" onclick="event.stopPropagation();" style="${docLinkStyle}">Patient Pic</a>`);
      }

      if (reg.forwardAttachments && reg.forwardAttachments.length > 0) {
        docChips.push(`<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(59,130,246,0.1);color:#2563EB;border:1px solid rgba(59,130,246,0.2);padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:700;">📎 ${reg.forwardAttachments.length} Files</span>`);
      }
      if (reg.forwardNotes && reg.forwardNotes.length > 0) {
        docChips.push(`<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(245,158,11,0.12);color:#D97706;border:1px solid rgba(245,158,11,0.3);padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:700;">💬 ${reg.forwardNotes.length} Notes</span>`);
      }

      // Key info snippet
      let keyInfoHtml = '';
      if (isReq) {
        const bg = reg.patientBloodGroup || reg.bloodGroup || 'N/A';
        keyInfoHtml = `
          <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
            <span style="color:#DC2626; font-weight:800; font-size:0.8rem; background:#FEF2F2; padding:1px 6px; border-radius:4px; border:1px solid #FECDD3;">🩸 ${bg}</span>
            <span style="font-weight:600; font-size:0.75rem; color:#334155;">${reg.bloodQuantity || 'N/A'}</span>
          </div>
          ${reg.admittedHospital ? `<div style="font-size:0.7rem; color:#64748B; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${reg.admittedHospital}">🏥 ${reg.admittedHospital}</div>` : ''}
        `;
      } else if (isBdn) {
        keyInfoHtml = `
          <span style="color:#DC2626; font-weight:800; font-size:0.8rem; background:#FEF2F2; padding:1px 6px; border-radius:4px; border:1px solid #FECDD3;">🩸 ${reg.bloodGroup || 'N/A'}</span>
          <div style="font-size:0.7rem; color:#64748B;">Donations: <strong>${reg.totalTimesDonated || 0}x</strong></div>
        `;
      } else if (isMem) {
        keyInfoHtml = `
          <div style="font-weight:700; color:#059669; font-size:0.82rem;">₹${reg.amount || 0}</div>
          <div style="font-size:0.7rem; color:#64748B;">${reg.validity || 'N/A'}</div>
        `;
      } else {
        keyInfoHtml = `
          <span style="color:#1D4ED8; font-weight:700; font-size:0.8rem; background:#EFF6FF; padding:1px 6px; border-radius:4px; border:1px solid #BFDBFE;">🩸 ${reg.bloodGroup || 'N/A'}</span>
          ${reg.district ? `<div style="font-size:0.7rem; color:#64748B; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📍 ${reg.district}</div>` : ''}
        `;
      }

      // Tracking / Status snippet
      let trackingHtml = '';
      const isSecOrPres = user && (user.role === 'Secretary' || user.role === 'President');
      if (currentRegFilter === 'forwarded' && isSecOrPres) {
        const assignedRole = reg.assignedToRole || 'Unassigned';
        const assignedName = reg.assignedToAdminName || '';
        const vCount = (Array.isArray(reg.verifiedBy) ? reg.verifiedBy.length : (reg.verifiedBy ? 1 : 0));
        trackingHtml = `
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="display:inline-flex; align-items:center; gap:4px; background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; padding:2px 7px; border-radius:4px; font-weight:700; font-size:0.72rem; white-space:nowrap;">
              <span style="width:6px; height:6px; border-radius:50%; background:#2563EB;"></span>
              → ${assignedRole}
            </span>
            ${assignedName ? `<span style="font-size:0.7rem; color:#475569; font-weight:600; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">👤 ${assignedName}</span>` : ''}
            ${vCount > 0 ? `<span style="font-size:0.68rem; color:#059669; font-weight:700;">✓ ${vCount} Verified</span>` : ''}
          </div>
        `;
      } else {
        const st = reg.status || 'pending';
        const statusMap = {
          pending: { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A', label: 'Pending Review' },
          forwarded: { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE', label: `Forwarded (${reg.assignedToRole || 'Admin'})` },
          verified: { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0', label: 'Verified' },
          accepted: { bg: '#D1FAE5', color: '#047857', border: '#6EE7B7', label: 'Accepted' },
          rejected: { bg: '#FEE2E2', color: '#DC2626', border: '#FECDD3', label: 'Rejected' },
          issue_reported: { bg: '#FEF2F2', color: '#B91C1C', border: '#FCA5A5', label: 'Issue Reported' }
        };
        const sInfo = statusMap[st] || { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1', label: st };
        trackingHtml = `
          <span style="display:inline-block; padding:2px 8px; border-radius:4px; background:${sInfo.bg}; color:${sInfo.color}; border:1px solid ${sInfo.border}; font-size:0.72rem; font-weight:700; white-space:nowrap;">
            ${sInfo.label}
          </span>
        `;
      }

      // Action buttons in the row
      let rowActionsHtml = `
        <button type="button" class="excel-act-btn" style="background:#F1F5F9; color:#334155; border:1px solid #CBD5E1;" onclick="event.stopPropagation(); window.toggleRegDetail('${reg._id}')" title="View Full Details">👁 Details</button>
      `;

      if ((user.role === 'Secretary' && ['pending', 'verified', 'issue_reported'].includes(currentRegFilter)) || (user.role === 'President' && ['verified', 'issue_reported'].includes(currentRegFilter))) {
        rowActionsHtml += `
          <button type="button" class="excel-act-btn" style="background:var(--success); color:white;" onclick="event.stopPropagation(); window.updateRegStatus('${reg.type}', '${reg._id}', 'accepted')" title="Final Accept">✓</button>
          <button type="button" class="excel-act-btn" style="background:white; color:var(--danger); border:1px solid var(--danger);" onclick="event.stopPropagation(); window.updateRegStatus('${reg.type}', '${reg._id}', 'rejected')" title="Final Reject">✕</button>
          <button type="button" class="excel-act-btn" style="background:#3B82F6; color:white;" onclick="event.stopPropagation(); window.openForwardModal('${reg.type}', '${reg._id}')" title="Forward Application">➔</button>
          <button type="button" class="excel-act-btn" style="background:white; color:#DC2626; border:1px solid #FCA5A5;" onclick="event.stopPropagation(); window.deleteRegistration('${reg.type}', '${reg._id}', '${safeName}')" title="Delete">🗑</button>
        `;
      } else if ((user.role === 'Secretary' || user.role === 'President') && ['accepted', 'rejected'].includes(currentRegFilter)) {
        rowActionsHtml += `
          <button type="button" class="excel-act-btn" style="background:white; color:#DC2626; border:1px solid #FCA5A5;" onclick="event.stopPropagation(); window.deleteRegistration('${reg.type}', '${reg._id}', '${safeName}')" title="Delete Application">🗑 Delete</button>
        `;
      } else if (user.role !== 'Secretary' && user.role !== 'President' && currentRegFilter === 'forwarded' && user.role === reg.assignedToRole) {
        rowActionsHtml += `
          <button type="button" class="excel-act-btn" style="background:white; color:#EF4444; border:1px solid #EF4444;" onclick="event.stopPropagation(); window.openReportIssueModal('${reg.type}', '${reg._id}')" title="Report Issue">⚠ Issue</button>
          <button type="button" class="excel-act-btn" style="background:var(--success); color:white;" onclick="event.stopPropagation(); window.openVerifyForwardModal('${reg.type}', '${reg._id}')" title="Verify & Forward">✓ Verify</button>
        `;
      } else if (isSecOrPres && currentRegFilter === 'forwarded') {
        rowActionsHtml += `
          <button type="button" class="excel-act-btn" style="background:#3B82F6; color:white;" onclick="event.stopPropagation(); window.openForwardModal('${reg.type}', '${reg._id}')" title="Re-forward Application">➔</button>
          <button type="button" class="excel-act-btn" style="background:white; color:#DC2626; border:1px solid #FCA5A5;" onclick="event.stopPropagation(); window.deleteRegistration('${reg.type}', '${reg._id}', '${safeName}')" title="Delete">🗑</button>
        `;
      }

      // ==========================================
      // BUILD THE DETAIL DRAWER
      // ==========================================
      const formatDetail = (label, val) => `
        <div style="background: white; padding: 10px 14px; border-radius: 6px; border: 1px solid #E2E8F0; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
          <span style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748B; display: block; margin-bottom: 2px;">${label}</span>
          <div style="font-size: 0.85rem; font-weight: 600; color: #1E293B; word-break: break-word;">${val || 'N/A'}</div>
        </div>
      `;

      let detailFieldsHtml = '';
      if (isVol) {
        detailFieldsHtml += formatDetail('Blood Group', reg.bloodGroup || 'N/A');
        detailFieldsHtml += formatDetail('WhatsApp', reg.whatsapp ? `<a href="https://wa.me/91${reg.whatsapp}" target="_blank" style="color:#16A34A; text-decoration:none;">${reg.whatsapp}</a>` : 'N/A');
        detailFieldsHtml += formatDetail('Address Proofs', reg.addressProofs && reg.addressProofs.length ? reg.addressProofs.map(p => `<a href="${formatPdfUrl(p)}" target="_blank" style="${docLinkStyle}">View Proof</a>`).join(' ') : '<span style="color:#94A3B8;">None</span>');
      } else if (isEmp) {
        detailFieldsHtml += formatDetail('Blood Group', reg.bloodGroup || 'N/A');
        detailFieldsHtml += formatDetail('WhatsApp', reg.whatsapp ? `<a href="https://wa.me/91${reg.whatsapp}" target="_blank" style="color:#16A34A; text-decoration:none;">${reg.whatsapp}</a>` : 'N/A');
        detailFieldsHtml += formatDetail('PAN Card', reg.panCard ? `<a href="${formatPdfUrl(reg.panCard)}" target="_blank" style="${docLinkStyle}">View PAN</a>` : '<span style="color:#94A3B8;">None</span>');
        detailFieldsHtml += formatDetail('Aadhar Card', reg.aadharCard ? `<a href="${formatPdfUrl(reg.aadharCard)}" target="_blank" style="${docLinkStyle}">View Aadhar</a>` : '<span style="color:#94A3B8;">None</span>');
        detailFieldsHtml += formatDetail('DOB Proof', reg.dobProof ? `<a href="${formatPdfUrl(reg.dobProof)}" target="_blank" style="${docLinkStyle}">View DOB Proof</a>` : '<span style="color:#94A3B8;">None</span>');
        detailFieldsHtml += formatDetail('Education Docs', reg.educationDocs && reg.educationDocs.length ? reg.educationDocs.map(p => `<a href="${formatPdfUrl(p)}" target="_blank" style="${docLinkStyle}">View Doc</a>`).join(' ') : '<span style="color:#94A3B8;">None</span>');
      } else if (isMem) {
        detailFieldsHtml += formatDetail('Blood Group', reg.bloodGroup || 'N/A');
        detailFieldsHtml += formatDetail('WhatsApp', reg.whatsapp ? `<a href="https://wa.me/91${reg.whatsapp}" target="_blank" style="color:#16A34A; text-decoration:none;">${reg.whatsapp}</a>` : 'N/A');
        detailFieldsHtml += formatDetail('Address', `${reg.address1 || ''} ${reg.address2 || ''}, ${reg.district || ''} - ${reg.pin || ''}`);
        detailFieldsHtml += formatDetail('Validity & Fees', `${reg.validity || 'N/A'} (Paid: ₹${reg.amount || 0})`);
        detailFieldsHtml += formatDetail('Payment ID', reg.paymentId || 'N/A');
      } else if (isBdn) {
        detailFieldsHtml += formatDetail('Blood Group', `<span style="color:#DC2626; font-weight:800; font-size:1rem; background:#FEF2F2; padding:1px 8px; border-radius:4px; border:1px solid #FECDD3;">${reg.bloodGroup || 'N/A'}</span>`);
        detailFieldsHtml += formatDetail('Guardian Name', reg.guardianName || 'N/A');
        detailFieldsHtml += formatDetail('Date of Birth', reg.dob || 'N/A');
        detailFieldsHtml += formatDetail('Aadhar Number', reg.aadharNo ? `${reg.aadharNo.slice(0,4)} ${reg.aadharNo.slice(4,8)} ${reg.aadharNo.slice(8)}` : 'N/A');
        detailFieldsHtml += formatDetail('WhatsApp', reg.whatsappNo || reg.whatsapp ? `<a href="https://wa.me/91${reg.whatsappNo || reg.whatsapp}" target="_blank" style="color:#16A34A; text-decoration:none;">${reg.whatsappNo || reg.whatsapp}</a>` : 'N/A');
        detailFieldsHtml += formatDetail('Full Address', `${reg.address || ''}, ${reg.villageTownWard || ''}, PO: ${reg.postOffice || ''}, PS: ${reg.policeStation || ''}, ${reg.district || ''} - ${reg.pinCode || reg.pin || ''}`);
        detailFieldsHtml += formatDetail('Donation History', `Donated ${reg.totalTimesDonated || 0} times · Last: ${reg.lastDonationDate || 'None'}`);
        detailFieldsHtml += formatDetail('Aadhar Card', reg.aadharCard ? `<a href="${formatPdfUrl(reg.aadharCard)}" target="_blank" style="${docLinkStyle}">View Aadhar</a>` : '<span style="color:#94A3B8;">None</span>');
        detailFieldsHtml += formatDetail('Signature', reg.signature ? `<a href="${formatPdfUrl(reg.signature)}" target="_blank" style="${docLinkStyle}">View Signature</a>` : '<span style="color:#94A3B8;">None</span>');
      } else if (isReq) {
        detailFieldsHtml += formatDetail('Blood Group Needed', `<span style="color:#DC2626; font-weight:800; font-size:1rem; background:#FEF2F2; padding:1px 8px; border-radius:4px; border:1px solid #FECDD3;">${reg.patientBloodGroup || reg.bloodGroup || 'N/A'}</span>`);
        detailFieldsHtml += formatDetail('Required Quantity', reg.bloodQuantity || 'N/A');
        detailFieldsHtml += formatDetail('Date Required', reg.requiredDate || 'N/A');
        detailFieldsHtml += formatDetail('Guardian Name', reg.guardianName || 'N/A');
        detailFieldsHtml += formatDetail('Patient Age', `${reg.patientAge || 'N/A'} Years`);
        detailFieldsHtml += formatDetail('Contact Phone', `<a href="tel:${reg.contactNo}" style="${docLinkStyle}">${reg.contactNo || 'N/A'}</a>`);
        detailFieldsHtml += formatDetail('WhatsApp', `<a href="https://wa.me/91${reg.whatsappNo}" target="_blank" style="${docLinkStyle}">${reg.whatsappNo || 'N/A'}</a>`);
        detailFieldsHtml += formatDetail('Hospital Admitted', reg.admittedHospital || 'N/A');
        detailFieldsHtml += formatDetail('Blood Needed At', reg.bloodHospitalDetails || 'N/A');
        detailFieldsHtml += formatDetail('Patient Address', `${reg.address || ''}, ${reg.villageTownWard || ''}, PO: ${reg.postOffice || ''}, PS: ${reg.policeStation || ''}, ${reg.district || ''} - ${reg.pinCode || ''}`);
        detailFieldsHtml += formatDetail('Patient Photo', reg.patientPhoto ? `<a href="${formatPdfUrl(reg.patientPhoto)}" target="_blank" style="${docLinkStyle}">View Patient Photo</a>` : '<span style="color:#94A3B8;">None</span>');
      }

      // Tracking box in detail drawer
      let detailTrackingHtml = '';
      const isSecretaryForwardedView = (user.role === 'Secretary' || user.role === 'President') && currentRegFilter === 'forwarded';
      if (isSecretaryForwardedView) {
        const verifiedList = Array.isArray(reg.verifiedBy) ? reg.verifiedBy : (reg.verifiedBy ? [reg.verifiedBy] : []);
        const currentRole = reg.assignedToRole || 'Unassigned';
        const currentName = reg.assignedToAdminName || '';
        const currentEmail = reg.assignedToAdminEmail || '';
        const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>`;
        const clockSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
        const arrowSpan = `<span style="color:#94A3B8; font-size:0.85rem; font-weight:bold;">→</span>`;

        const chainParts = [];
        if (verifiedList.length === 0) {
          chainParts.push(`<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 9px;border-radius:20px;background:#10B981;color:white;font-size:0.68rem;font-weight:700;white-space:nowrap;">${checkSvg}Forwarded</span>`);
        }
        verifiedList.forEach(v => {
          chainParts.push(`<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 9px;border-radius:20px;background:#10B981;color:white;font-size:0.68rem;font-weight:700;white-space:nowrap;">${checkSvg}${v.role}${v.name ? ` (${v.name})` : ''}</span>`);
        });
        if (currentRole) {
          const roleLabel = currentRole + (currentName ? ` (${currentName})` : '');
          chainParts.push(`<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 9px;border-radius:20px;background:#F59E0B;color:white;font-size:0.68rem;font-weight:700;white-space:nowrap;">${clockSvg}Pending: ${roleLabel}</span>`);
        }
        const chainHtml = chainParts.join(` ${arrowSpan} `);

        detailTrackingHtml = `
          <div style="background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%); border: 1.5px solid #93C5FD; border-radius: 8px; padding: 0.85rem 1rem; display: flex; flex-direction: column; gap: 0.65rem; width: 100%; box-sizing: border-box;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; border-bottom: 1px solid rgba(59, 130, 246, 0.2); padding-bottom: 0.5rem;">
              <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #1E40AF; display: flex; align-items: center; gap: 5px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#1D4ED8" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                Application Tracking Status
              </span>
              <span style="display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; background: #2563EB; color: white; font-size: 0.72rem; font-weight: 700;">
                <span style="width:6px; height:6px; border-radius:50%; background:#60A5FA; display:inline-block;"></span>
                Currently Forwarded
              </span>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.65rem;">
              <div style="background: white; padding: 0.6rem 0.85rem; border-radius: 6px; border: 1px solid #BFDBFE;">
                <span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: #64748B; display: block; margin-bottom: 2px;">Forwarded To (Where)</span>
                <div style="font-size: 0.88rem; font-weight: 700; color: #1E3A8A;">${currentRole}</div>
              </div>

              <div style="background: white; padding: 0.6rem 0.85rem; border-radius: 6px; border: 1px solid #BFDBFE;">
                <span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: #64748B; display: block; margin-bottom: 2px;">Assigned Person (Who)</span>
                <div style="font-size: 0.88rem; font-weight: 700; color: #1E3A8A;">${currentName ? currentName : 'All Admins in Role'}</div>
                ${currentEmail ? `<div style="font-size:0.72rem; color:#3B82F6;">${currentEmail}</div>` : ''}
              </div>
            </div>

            <div style="background: white; padding: 0.6rem 0.85rem; border-radius: 6px; border: 1px solid #BFDBFE;">
              <span style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: #64748B; display: block; margin-bottom: 4px;">Review Chain Progress</span>
              <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 5px;">${chainHtml}</div>
            </div>
          </div>
        `;
      } else {
        detailTrackingHtml = `
          <div style="background:#F8FAFC; padding:0.65rem 0.85rem; border-radius:6px; border:1px solid #E2E8F0; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
            <div>
              <span style="font-size:0.65rem; font-weight:700; text-transform:uppercase; color:#64748B; display:block;">Current Access</span>
              <div style="font-size:0.85rem; font-weight:700; color:#1E293B;">${reg.assignedToRole || 'Admin'}${reg.assignedToAdminName ? ' (' + reg.assignedToAdminName + ')' : ''}</div>
            </div>
            <div style="font-size:0.75rem; color:#64748B;">
              Status: <strong style="text-transform:uppercase; color:var(--primary);">${reg.status || 'pending'}</strong>
            </div>
          </div>
        `;
      }

      // Forward Attachments section
      let detailAttachmentsHtml = '';
      if (reg.forwardAttachments && reg.forwardAttachments.length > 0) {
        const attachLinks = reg.forwardAttachments.map((attachment, idx) => {
          const isObject = typeof attachment === 'object' && attachment !== null;
          const url = isObject ? attachment.url : attachment;
          const uploaderName = isObject && attachment.uploadedBy ? attachment.uploadedBy : 'Admin';
          const isPdf = url.toLowerCase().includes('.pdf') || url.includes('/raw/');
          return `<a href="${formatPdfUrl(url)}" target="_blank" style="${docLinkStyle}" title="Attached by ${uploaderName}">📎 Attachment ${idx + 1} (${uploaderName})</a>`;
        }).join('');

        detailAttachmentsHtml = `
          <div style="background: rgba(59,130,246,0.04); border: 1px solid rgba(59,130,246,0.15); border-radius: 6px; padding: 0.75rem 1rem;">
            <span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; color:#3B82F6; display:block; margin-bottom:0.4rem;">Admin Attached Files (${reg.forwardAttachments.length})</span>
            <div style="display:flex; flex-wrap:wrap; gap:0.25rem;">${attachLinks}</div>
          </div>`;
      }

      // Forward Notes section
      let detailNotesHtml = '';
      if (reg.forwardNotes && reg.forwardNotes.length > 0) {
        const notesContent = reg.forwardNotes.map(n => {
          const author = `${n.authorName || 'Admin'}${n.authorRole ? ` (${n.authorRole})` : ''}`;
          const formattedDate = n.date ? new Date(n.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
          return `
            <div style="background: white; border: 1px solid #E2E8F0; border-radius: 6px; padding: 0.6rem 0.85rem; margin-top: 0.4rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem; font-size: 0.75rem;">
                <span style="font-weight: 700; color: var(--primary);">${author}</span>
                <span style="color: #9CA3AF;">${formattedDate}</span>
              </div>
              <div style="font-size: 0.82rem; color: #334155; white-space: pre-wrap; line-height: 1.4;">${n.note}</div>
            </div>
          `;
        }).join('');

        detailNotesHtml = `
          <div style="background: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 6px; padding: 0.75rem 1rem;">
            <span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; color:#D97706; display:block;">Admin Written Messages (${reg.forwardNotes.length})</span>
            ${notesContent}
          </div>`;
      }

      // Verification history
      let detailVerificationHtml = '';
      const verifiedByList = Array.isArray(reg.verifiedBy) ? reg.verifiedBy : (reg.verifiedBy ? [reg.verifiedBy] : []);
      if (verifiedByList.length > 0) {
        detailVerificationHtml = `
          <div style="background: rgba(16,185,129,0.05); border: 1px solid rgba(16,185,129,0.15); padding: 0.65rem 0.85rem; border-radius: 6px;">
            <span style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: #059669; display: block; margin-bottom: 0.35rem;">Verification History (${verifiedByList.length})</span>
            <div style="display: flex; flex-wrap: wrap; gap: 0.3rem;">
              ${verifiedByList.map(v => `<span style="display:inline-flex; align-items:center; background:#10B981; color:white; padding:2px 8px; border-radius:50px; font-size:0.7rem; font-weight:600;">✓ ${v.name} (${v.role})</span>`).join('')}
            </div>
          </div>`;
      }

      // Issue text
      let detailIssueHtml = '';
      if (reg.status === 'issue_reported') {
        detailIssueHtml = `
          <div style="background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); padding: 0.75rem 1rem; border-radius: 6px;">
            <div style="font-weight: 700; color: #B91C1C; font-size: 0.82rem; margin-bottom: 0.25rem;">⚠ Reported Issue:</div>
            <div style="background: white; padding: 0.5rem 0.75rem; border-radius: 4px; border: 1px solid rgba(239,68,68,0.1); color: #7F1D1D; font-size: 0.8rem; line-height: 1.4;">${reg.issueText}</div>
          </div>`;
      }

      // Full action buttons inside the expanded drawer
      let detailActionButtonsHtml = '';
      if ((user.role === 'Secretary' && ['pending', 'verified', 'issue_reported'].includes(currentRegFilter)) || (user.role === 'President' && ['verified', 'issue_reported'].includes(currentRegFilter))) {
        detailActionButtonsHtml = `
          <div style="display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: flex-end; width: 100%;">
            <button onclick="window.updateRegStatus('${reg.type}', '${reg._id}', 'accepted')" style="padding: 0.55rem 1.25rem; background: var(--success); color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 0.82rem; cursor: pointer;">✓ Final Accept</button>
            <button onclick="window.updateRegStatus('${reg.type}', '${reg._id}', 'rejected')" style="padding: 0.55rem 1.25rem; background: white; color: var(--danger); border: 1px solid var(--danger); border-radius: 6px; font-weight: 600; font-size: 0.82rem; cursor: pointer;">✕ Final Reject</button>
            <button onclick="window.openForwardModal('${reg.type}', '${reg._id}')" style="padding: 0.55rem 1.25rem; background: #3B82F6; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 0.82rem; cursor: pointer;">➔ Forward</button>
            <button onclick="window.deleteRegistration('${reg.type}', '${reg._id}', '${safeName}')" style="padding: 0.55rem 1.25rem; background: white; color: #DC2626; border: 1.5px solid #DC2626; border-radius: 6px; font-weight: 600; font-size: 0.82rem; cursor: pointer;">🗑 Delete</button>
          </div>
        `;
      } else if ((user.role === 'Secretary' || user.role === 'President') && ['accepted', 'rejected'].includes(currentRegFilter)) {
        detailActionButtonsHtml = `
          <div style="display: flex; justify-content: flex-end; width: 100%;">
            <button onclick="window.deleteRegistration('${reg.type}', '${reg._id}', '${safeName}')" style="padding: 0.55rem 1.25rem; background: white; color: #DC2626; border: 1.5px solid #DC2626; border-radius: 6px; font-weight: 600; font-size: 0.82rem; cursor: pointer;">🗑 Permanently Delete Application</button>
          </div>
        `;
      } else if (user.role !== 'Secretary' && user.role !== 'President' && currentRegFilter === 'forwarded' && user.role === reg.assignedToRole) {
        detailActionButtonsHtml = `
          <div style="display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: flex-end; width: 100%;">
            <button onclick="window.openReportIssueModal('${reg.type}', '${reg._id}')" style="padding: 0.55rem 1.25rem; background: white; color: #EF4444; border: 1px solid #EF4444; border-radius: 6px; font-weight: 600; font-size: 0.82rem; cursor: pointer;">⚠ Report Issue</button>
            <button onclick="window.openVerifyForwardModal('${reg.type}', '${reg._id}')" style="padding: 0.55rem 1.25rem; background: var(--success); color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 0.82rem; cursor: pointer;">✓ Verify & Forward</button>
          </div>
        `;
      } else if (isSecOrPres && currentRegFilter === 'forwarded') {
        detailActionButtonsHtml = `
          <div style="display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: flex-end; width: 100%;">
            <button onclick="window.openForwardModal('${reg.type}', '${reg._id}')" style="padding: 0.55rem 1.25rem; background: #3B82F6; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 0.82rem; cursor: pointer;">➔ Re-Forward</button>
            <button onclick="window.deleteRegistration('${reg.type}', '${reg._id}', '${safeName}')" style="padding: 0.55rem 1.25rem; background: white; color: #DC2626; border: 1.5px solid #DC2626; border-radius: 6px; font-weight: 600; font-size: 0.82rem; cursor: pointer;">🗑 Delete Application</button>
          </div>
        `;
      }

      return `
        <!-- Main Spreadsheet Row -->
        <tr class="excel-row" id="reg-row-${reg._id}" onclick="window.toggleRegDetail('${reg._id}')" style="cursor: pointer;">
          <td style="text-align: center; white-space: nowrap;">
            <div style="display: inline-flex; align-items: center; gap: 4px;">
              <span style="font-weight: 700; color: #64748B; font-size: 0.75rem;">${index + 1}</span>
              <button type="button" class="excel-expand-btn" id="reg-expand-btn-${reg._id}" onclick="event.stopPropagation(); window.toggleRegDetail('${reg._id}')" title="Toggle full applicant details">▼</button>
            </div>
          </td>
          <td style="text-align: center;">
            <div style="display: flex; justify-content: center; align-items: center;">
              ${photoSrc ? `<img src="${photoSrc}" alt="Photo" onclick="event.stopPropagation(); window.openPhotoLightbox('${photoSrc.replace(/'/g, "&apos;")}', '${safeName}')" style="width:34px; height:34px; border-radius:50%; object-fit:cover; border:1.5px solid ${isReq ? '#DC2626' : 'var(--primary)'}; cursor:pointer;" title="Click to view full photo" />` : `<div style="width:34px; height:34px; border-radius:50%; background:#F1F5F9; color:#94A3B8; font-size:0.65rem; font-weight:700; display:flex; align-items:center; justify-content:center; border:1px solid #CBD5E1;">N/A</div>`}
            </div>
          </td>
          <td>
            <div style="font-weight: 700; color: #0F172A; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;" title="${applicantName}">${applicantName}</div>
            <div style="margin-top: 2px;">
              <span class="excel-badge-type excel-type-${reg.type}">${typeLabel}</span>
            </div>
          </td>
          <td style="white-space: nowrap;">
            <div style="font-weight: 600; color: #1E293B; font-size: 0.78rem;">${new Date(reg.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            <div style="font-size: 0.7rem; color: #64748B;">${new Date(reg.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
          </td>
          <td style="white-space: nowrap;">
            <div style="display: flex; align-items: center; gap: 5px;">
              <a href="tel:${phone}" onclick="event.stopPropagation();" style="color: #1E293B; text-decoration: none; font-weight: 600; font-size: 0.78rem;" title="Call">${phone}</a>
              ${whatsapp ? `<a href="https://wa.me/91${whatsapp}" target="_blank" onclick="event.stopPropagation();" style="display:inline-flex; align-items:center; color:#16A34A; text-decoration:none;" title="Open WhatsApp: ${whatsapp}"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.196 8.196 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.98-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.24-.74-.66-1.25-1.48-1.39-1.73-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.49-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.77 2.71 4.3 3.8 2.53 1.09 2.53.73 2.98.69.46-.04 1.47-.6 1.68-1.18.21-.59.21-1.09.15-1.19-.06-.11-.23-.17-.48-.29z"/></svg></a>` : ''}
            </div>
            ${reg.email ? `<div style="font-size:0.7rem; color:#64748B; max-width:170px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${reg.email}">${reg.email}</div>` : ''}
          </td>
          <td>
            ${keyInfoHtml}
          </td>
          <td>
            ${trackingHtml}
          </td>
          <td>
            <div style="display: flex; flex-wrap: wrap; gap: 3px; align-items: center;">
              ${docChips.length > 0 ? docChips.join('') : '<span style="color:#94A3B8; font-size:0.75rem;">None</span>'}
            </div>
          </td>
          <td style="text-align: center; white-space: nowrap;">
            <div style="display: inline-flex; align-items: center; gap: 4px; justify-content: center;">
              ${rowActionsHtml}
            </div>
          </td>
        </tr>

        <!-- Expandable Detail Drawer Row -->
        <tr class="excel-detail-row" id="reg-detail-${reg._id}" style="display: none;">
          <td colspan="9" class="excel-detail-cell">
            <div style="display: flex; flex-direction: column; gap: 0.85rem;">
              <!-- Header Bar of the Detail Drawer -->
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; border-bottom: 1px solid #CBD5E1; padding-bottom: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-weight: 700; font-size: 1rem; color: #0F172A;">${applicantName}</span>
                  <span class="excel-badge-type excel-type-${reg.type}">${typeLabel}</span>
                  <span style="font-size: 0.75rem; color: #64748B;">ID: ${reg._id}</span>
                </div>
                <button type="button" class="excel-act-btn" style="background: white; border: 1px solid #CBD5E1; color: #475569;" onclick="window.toggleRegDetail('${reg._id}')">▲ Close Details</button>
              </div>

              <!-- Information Grid -->
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.65rem;">
                ${detailFieldsHtml}
              </div>

              <!-- Tracking / Progress Section -->
              ${detailTrackingHtml}

              <!-- Attachments & Notes -->
              ${detailAttachmentsHtml}
              ${detailNotesHtml}
              ${detailVerificationHtml}
              ${detailIssueHtml}

              <!-- Bottom Action Bar -->
              <div style="border-top: 1px solid #E2E8F0; padding-top: 0.75rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                <span style="font-size: 0.75rem; color: #64748B;">
                  Applied on: <strong>${new Date(reg.date).toLocaleString('en-IN')}</strong>
                </span>
                ${detailActionButtonsHtml}
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    registrationsContainer.innerHTML = `
      <div class="excel-container-wrapper">
        <div class="excel-table-scroll">
          <table class="excel-table">
            <thead>
              <tr>
                <th style="width: 50px; text-align: center;">#</th>
                <th style="width: 50px; text-align: center;">Photo</th>
                <th>Applicant Name & Type</th>
                <th>Applied Date</th>
                <th>Contact Info</th>
                <th>Key Details</th>
                <th>Tracking / Status</th>
                <th>Documents & Files</th>
                <th style="text-align: center; min-width: 140px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  // Expose to window for inline onclick handlers
  window.updateRegStatus = updateRegistrationStatus;
  window.openForwardModal = openForwardModal;

  const deleteRegistration = async (type, id, name) => {
    // First confirmation
    const first = confirm(`Are you sure you want to permanently delete the registration for "${name}"?\n\nThis action cannot be undone.`);
    if (!first) return;
    // Second confirmation
    const second = confirm(`⚠ Final Warning!\n\nYou are about to PERMANENTLY DELETE the application of "${name}".\n\nClick OK to confirm deletion.`);
    if (!second) return;

    try {
      const res = await apiRequest(`/api/admin/registrations/${type}/${id}`, { method: 'DELETE' });
      if (res.success) {
        allRegistrations = allRegistrations.filter(r => r._id !== id);
        renderRegistrations();
        updateSidebarBadges();
      } else {
        alert(res.error || 'Failed to delete registration.');
      }
    } catch (err) {
      console.error(err);
      alert(err.message || 'An error occurred while deleting.');
    }
  };

  window.deleteRegistration = deleteRegistration;

  const verifyForwardModal = document.getElementById('verifyForwardModal');
  const verifyForwardRoleSelect = document.getElementById('verifyForwardRoleSelect');
  const verifyForwardUserSelect = document.getElementById('verifyForwardUserSelect');
  const cancelVerifyForwardBtn = document.getElementById('cancelVerifyForwardBtn');
  const confirmVerifyForwardBtn = document.getElementById('confirmVerifyForwardBtn');
  let currentVerifyForwardTarget = null;

  window.openVerifyForwardModal = (type, id) => {
    currentVerifyForwardTarget = { type, id };
    
    const vMsgInput = document.getElementById('verifyForwardMessageInput');
    if (vMsgInput) vMsgInput.value = '';

    // Populate select, exclude current user's role
    if (verifyForwardRoleSelect) {
      const roles = ADMIN_ROLES.filter(role => role !== user.role);
      verifyForwardRoleSelect.innerHTML = roles
        .map(role => `<option value="${role}">${role}</option>`)
        .join('');
      if (roles.length > 0) {
        populateUserSelect(roles[0], verifyForwardUserSelect);
      }
    }

    if (verifyForwardModal) verifyForwardModal.style.display = 'flex';
  };

  if (verifyForwardRoleSelect && verifyForwardUserSelect) {
    verifyForwardRoleSelect.addEventListener('change', (e) => {
      populateUserSelect(e.target.value, verifyForwardUserSelect);
    });
  }

  if (cancelVerifyForwardBtn) {
    cancelVerifyForwardBtn.addEventListener('click', () => {
      if (verifyForwardModal) verifyForwardModal.style.display = 'none';
      currentVerifyForwardTarget = null;
      const vMsgInput = document.getElementById('verifyForwardMessageInput');
      if (vMsgInput) vMsgInput.value = '';
    });
  }

  if (confirmVerifyForwardBtn) {
    confirmVerifyForwardBtn.addEventListener('click', async () => {
      if (!currentVerifyForwardTarget) return;
      const newRole = verifyForwardRoleSelect.value;
      const selectedUserId = verifyForwardUserSelect ? verifyForwardUserSelect.value : '';

      if (!selectedUserId) {
        alert('Please select a specific person / admin to forward this registration to.');
        if (verifyForwardUserSelect) verifyForwardUserSelect.focus();
        return;
      }

      const selectedUserObj = allAdminUsers.find(u => u._id === selectedUserId);
      const targetName = selectedUserObj ? `${selectedUserObj.fullName} (${newRole})` : newRole;

      // 1st Confirmation
      const confirm1 = confirm(`[CONFIRMATION 1 of 2]\nAre you sure you want to VERIFY and forward this registration to ${targetName}?`);
      if (!confirm1) return;

      // 2nd Confirmation
      const confirm2 = confirm(`[CONFIRMATION 2 of 2 - FINAL CONFIRMATION]\nPlease confirm once again: Are you completely sure you want to finalize verification and forward this registration to ${targetName}?`);
      if (!confirm2) return;

      const vMsgInput = document.getElementById('verifyForwardMessageInput');
      const vMessageVal = vMsgInput ? vMsgInput.value.trim() : '';

      confirmVerifyForwardBtn.innerHTML = 'Verifying...';
      confirmVerifyForwardBtn.disabled = true;

      try {
        const formData = new FormData();
        formData.append('newRole', newRole);
        if (selectedUserObj) {
          formData.append('assignedToAdminId', selectedUserObj._id);
          formData.append('assignedToAdminName', selectedUserObj.fullName);
          formData.append('assignedToAdminEmail', selectedUserObj.email);
        }
        if (vMessageVal) {
          formData.append('message', vMessageVal);
        }
        if (typeof verifyForwardSelectedFiles !== 'undefined' && verifyForwardSelectedFiles.length > 0) {
          verifyForwardSelectedFiles.forEach(file => formData.append('attachments', file));
        }

        const token = getAuthToken();
        const response = await fetch(`${API_BASE}/api/admin/registrations/${currentVerifyForwardTarget.type}/${currentVerifyForwardTarget.id}/verify_and_forward`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          alert('Successfully verified and forwarded!');
          if (verifyForwardModal) verifyForwardModal.style.display = 'none';
          if (vMsgInput) vMsgInput.value = '';
          if (typeof verifyForwardSelectedFiles !== 'undefined') {
            verifyForwardSelectedFiles = [];
            const list = document.getElementById('verifyForwardFileList');
            if (list) list.innerHTML = '';
          }
          fetchRegistrations();
        } else {
          alert(data.error || 'Failed to verify and forward');
        }
      } catch (err) {
        console.error(err);
        alert(err.message || 'An error occurred during verification and forwarding');
      } finally {
        confirmVerifyForwardBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-5M13 5l6 6M13 5v6h6"/></svg> Verify & Forward';
        confirmVerifyForwardBtn.disabled = false;
      }
    });
  }

  const reportIssueModal = document.getElementById('reportIssueModal');
  const issueTextInput = document.getElementById('issueTextInput');
  const cancelIssueBtn = document.getElementById('cancelIssueBtn');
  const confirmIssueBtn = document.getElementById('confirmIssueBtn');
  let currentIssueTarget = null;

  window.openReportIssueModal = (type, id) => {
    currentIssueTarget = { type, id };
    if (issueTextInput) issueTextInput.value = '';
    if (reportIssueModal) reportIssueModal.style.display = 'flex';
  };

  if (cancelIssueBtn) {
    cancelIssueBtn.addEventListener('click', () => {
      if (reportIssueModal) reportIssueModal.style.display = 'none';
      currentIssueTarget = null;
    });
  }

  if (confirmIssueBtn) {
    confirmIssueBtn.addEventListener('click', async () => {
      if (!currentIssueTarget) return;
      const issueText = issueTextInput.value.trim();
      if (!issueText) {
        alert('Please enter a description of the issue.');
        return;
      }
      
      confirmIssueBtn.innerText = 'Submitting...';
      confirmIssueBtn.disabled = true;

      try {
        const response = await fetch(`${API_BASE}/api/admin/registrations/${currentIssueTarget.type}/${currentIssueTarget.id}/report-issue`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`
          },
          body: JSON.stringify({ issueText })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          alert('Issue reported successfully!');
          if (reportIssueModal) reportIssueModal.style.display = 'none';
          fetchRegistrations();
        } else {
          alert(data.error || 'Failed to report issue');
        }
      } catch (err) {
        console.error(err);
        alert('An error occurred while reporting issue');
      } finally {
        confirmIssueBtn.innerText = 'Submit Issue';
        confirmIssueBtn.disabled = false;
      }
    });
  }

  refreshRegBtn.addEventListener('click', fetchRegistrations);
  
  // Fetch registrations initially to populate badges
  fetchRegistrations();

  // ── Photo Lightbox ──────────────────────────────────────────────────────────
  window.openPhotoLightbox = (src, name) => {
    const lb = document.getElementById('photoLightbox');
    const img = document.getElementById('lightboxImg');
    const caption = document.getElementById('lightboxCaption');
    if (!lb || !img) return;
    img.src = src;
    caption.textContent = name || '';
    lb.style.display = 'flex';
    // Animate in
    lb.style.opacity = '0';
    requestAnimationFrame(() => {
      lb.style.transition = 'opacity 0.22s ease';
      lb.style.opacity = '1';
    });
  };

  window.closePhotoLightbox = () => {
    const lb = document.getElementById('photoLightbox');
    if (!lb) return;
    lb.style.transition = 'opacity 0.18s ease';
    lb.style.opacity = '0';
    setTimeout(() => { lb.style.display = 'none'; lb.style.opacity = '1'; }, 190);
  };

  // Close lightbox with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const lb = document.getElementById('photoLightbox');
      if (lb && lb.style.display !== 'none') window.closePhotoLightbox();
    }
  });

  // ─── GALLERY MANAGEMENT ──────────────────────────────────────────────
  const navGallery = document.getElementById('nav-gallery');
  const gallerySection = document.getElementById('gallerySection');
  const navItems = document.querySelectorAll('.nav-item');

  if(navGallery) {
    navGallery.addEventListener('click', (e) => {
      e.preventDefault();
      navItems.forEach(n => n.classList.remove('active'));
      navGallery.classList.add('active');
      
      if(dashboardSection) dashboardSection.style.display = 'none';
      if(registrationsSection) registrationsSection.style.display = 'none';
      if(gallerySection) gallerySection.style.display = 'block';
      
      fetchAdminGallery();
    });
  }

  // Handle other navigation clicks to hide gallery
  document.querySelectorAll('.nav-item').forEach(nav => {
    if(nav.id === 'nav-gallery') return;
    nav.addEventListener('click', (e) => {
      if(nav.target === '_blank') return;
      if(gallerySection) gallerySection.style.display = 'none';
    });
  });

  window.adminGalleryPhotos = [];
  window.adminCategoryDescriptions = {};

  window.fetchAdminGallery = function() {
    fetch(`${GALLERY_API}?action=list`)
      .then(res => res.json())
      .then(photos => {
        window.adminGalleryPhotos = photos || [];
        updateAdminCategoryFilterOptions();
        populateAdminCategoryDescSelectOptions();
        window.filterAdminGallery();
      })
      .catch(err => console.error('Error fetching gallery:', err));

    fetch(`${GALLERY_API}?action=category-descriptions`)
      .then(res => {
        if (!res.ok) return {};
        return res.json().catch(() => ({}));
      })
      .then(descMap => {
        window.adminCategoryDescriptions = descMap || {};
        populateAdminCategoryDescSelectOptions();
        onAdminCategoryDescSelectChange();
      })
      .catch(err => console.error('Error fetching category descriptions:', err));
  }

  function populateAdminCategoryDescSelectOptions() {
    const select = document.getElementById('editCategoryDescSelect');
    if (!select) return;

    const currentVal = select.value || '';
    const categories = Array.from(new Set(window.adminGalleryPhotos.map(p => p.category).filter(Boolean))).sort();
    
    Object.keys(window.adminCategoryDescriptions || {}).forEach(cat => {
      if (cat && !categories.includes(cat)) categories.push(cat);
    });
    categories.sort();

    let html = '<option value="">-- Choose Category --</option>';
    categories.forEach(cat => {
      const hasDesc = !!(window.adminCategoryDescriptions && window.adminCategoryDescriptions[cat]);
      const badge = hasDesc ? ' (Has description)' : '';
      html += `<option value="${escapeHtml(cat)}"${cat === currentVal ? ' selected' : ''}>${escapeHtml(cat)}${badge}</option>`;
    });

    select.innerHTML = html;
  }

  window.getAdminCategoryDescription = function(catName) {
    if (!catName || !window.adminCategoryDescriptions) return '';
    if (window.adminCategoryDescriptions[catName]) return window.adminCategoryDescriptions[catName];
    const target = String(catName).trim().toLowerCase();
    const match = Object.keys(window.adminCategoryDescriptions).find(k => k.trim().toLowerCase() === target);
    return match ? window.adminCategoryDescriptions[match] : '';
  };

  window.onAdminCategoryDescSelectChange = function() {
    const select = document.getElementById('editCategoryDescSelect');
    const textarea = document.getElementById('editCategoryDescText');
    const status = document.getElementById('categoryDescStatus');
    if (!select || !textarea) return;

    const selectedCategory = select.value;
    if (status) status.style.display = 'none';

    if (!selectedCategory) {
      textarea.value = '';
      return;
    }

    textarea.value = getAdminCategoryDescription(selectedCategory);
  }

  window.saveAdminCategoryDescription = function() {
    const select = document.getElementById('editCategoryDescSelect');
    const textarea = document.getElementById('editCategoryDescText');
    const status = document.getElementById('categoryDescStatus');

    const categoryName = select ? select.value.trim() : '';
    const description = textarea ? textarea.value.trim() : '';

    if (!categoryName) {
      return alert('Please select a category to save description for.');
    }

    fetch(`${GALLERY_API}?action=update-description&_token=${encodeURIComponent(getAuthToken())}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ category: categoryName, description, _token: getAuthToken() })
    })
    .then(async res => {
      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        data = { error: res.status === 404 ? 'The backend API route is not running on your live server yet. Please redeploy/restart your backend server code.' : `Server error (${res.status})` };
      }
      return { ok: res.ok, data };
    })
    .then(({ ok, data }) => {
      if (ok && data.success) {
        if (!window.adminCategoryDescriptions) window.adminCategoryDescriptions = {};
        window.adminCategoryDescriptions[categoryName] = description;
        populateAdminCategoryDescSelectOptions();
        
        if (status) {
          status.style.display = 'block';
          status.style.color = 'var(--success)';
          status.textContent = `✓ Description for "${categoryName}" saved successfully!`;
          setTimeout(() => { status.style.display = 'none'; }, 4000);
        }
      } else {
        alert(data.error || 'Failed to save category description');
      }
    })
    .catch(err => {
      console.error(err);
      alert('Error saving category description');
    });
  }

  function updateAdminCategoryFilterOptions() {
    const filterSelect = document.getElementById('adminCategoryFilter');
    if (!filterSelect) return;
    
    const currentVal = filterSelect.value || 'all';
    const categories = Array.from(new Set(window.adminGalleryPhotos.map(p => p.category).filter(Boolean))).sort();
    
    let html = '<option value="all">All Categories</option>';
    categories.forEach(cat => {
      html += `<option value="${escapeHtml(cat)}"${cat === currentVal ? ' selected' : ''}>${escapeHtml(cat)}</option>`;
    });
    
    filterSelect.innerHTML = html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.filterAdminGallery = function() {
    const filterSelect = document.getElementById('adminCategoryFilter');
    const deleteBtn = document.getElementById('deleteCategoryBtn');
    const selectedCategory = filterSelect ? filterSelect.value : 'all';
    
    if (deleteBtn) {
      deleteBtn.style.display = 'inline-flex';
      if (selectedCategory !== 'all') {
        deleteBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete Category ("${escapeHtml(selectedCategory)}")`;
      } else {
        deleteBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete Category`;
      }
    }
    
    const grid = document.getElementById('adminGalleryGrid');
    if (!grid) return;
    
    const displayPhotos = selectedCategory === 'all' 
      ? window.adminGalleryPhotos 
      : window.adminGalleryPhotos.filter(p => p.category === selectedCategory);
      
    if (displayPhotos.length === 0) {
      grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No photos found in this category.</p>';
      return;
    }
    
    grid.innerHTML = displayPhotos.map(photo => `
      <div style="background:white; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.1); display:flex; flex-direction:column;">
        <img src="${photo.imageUrl && photo.imageUrl.startsWith('http') ? photo.imageUrl : '/' + photo.imageUrl}" alt="${photo.category || 'Gallery Photo'}" style="width:100%; height:150px; object-fit:cover;">
        <div style="padding: 1rem; flex: 1; display:flex; flex-direction:column; gap:0.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.3rem;">
            <span style="background:var(--saffron); color:white; font-size:0.7rem; padding:0.2rem 0.6rem; border-radius:20px;">${photo.category}</span>
            ${photo.date ? `<span style="font-size:0.75rem; color:var(--text-muted); font-weight:500;">${photo.date}</span>` : ''}
          </div>
          <div style="margin-top:auto; display:flex; justify-content:space-between; align-items:center; padding-top:1rem; border-top:1px solid var(--border);">
            <label style="font-size:0.8rem; display:flex; align-items:center; gap:0.3rem; cursor:pointer;">
              <input type="checkbox" ${photo.featured ? 'checked' : ''} onchange="toggleFeatured('${photo._id}', this.checked)">
              Featured
            </label>
            <button onclick="deleteGalleryPhoto('${photo._id}')" style="background:var(--danger); color:white; border:none; padding:0.3rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.8rem;">Delete</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  const uploadForm = document.getElementById('uploadPhotoForm');
  if(uploadForm) {
    uploadForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const categoryEl = document.getElementById('uploadCategory');
      const dateEl = document.getElementById('uploadDate');
      const descEl = document.getElementById('uploadCategoryDescription');
      const featuredEl = document.getElementById('uploadFeatured');
      const fileInput = document.getElementById('uploadFile');
      
      const category = categoryEl ? categoryEl.value.trim() : '';
      const date = dateEl ? dateEl.value.trim() : '';
      const description = descEl ? descEl.value.trim() : '';
      const featured = featuredEl ? featuredEl.checked : false;
      const files = fileInput ? fileInput.files : null;
      
      if (!category) return alert('Please enter a category name');
      if (!files || files.length === 0) return alert('Please select at least one image file');
      
      const formData = new FormData();
      formData.append('_token', getAuthToken());
      formData.append('category', category);
      formData.append('date', date);
      formData.append('categoryDescription', description);
      formData.append('featured', featured);
      
      for (let i = 0; i < files.length; i++) {
        formData.append('photos[]', files[i]);
      }
      
      const progressContainer = document.getElementById('uploadProgressContainer');
      const progressBar = document.getElementById('uploadProgressBar');
      const progressText = document.getElementById('uploadStatusText');
      const progressPercent = document.getElementById('uploadPercentage');
      const submitBtn = document.getElementById('uploadSubmitBtn') || this.querySelector('button[type="submit"]');

      if (progressContainer) {
        progressContainer.style.display = 'block';
        if (progressBar) progressBar.style.width = '0%';
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressText) progressText.textContent = `Uploading ${files.length} photo(s)...`;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.65';
        submitBtn.style.cursor = 'not-allowed';
      }

      const resetUploadUI = () => {
        if (progressContainer) progressContainer.style.display = 'none';
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.style.opacity = '1';
          submitBtn.style.cursor = 'pointer';
        }
      };

      const xhr = new XMLHttpRequest();
      const uploadUrl = `${GALLERY_API}?action=upload&_token=${encodeURIComponent(getAuthToken())}`;

      xhr.open('POST', uploadUrl, true);
      xhr.setRequestHeader('Authorization', `Bearer ${getAuthToken()}`);

      xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          if (progressBar) progressBar.style.width = `${percent}%`;
          if (progressPercent) progressPercent.textContent = `${percent}%`;
          if (progressText) {
            if (percent < 100) {
              progressText.textContent = `Uploading ${files.length} photo(s)...`;
            } else {
              progressText.textContent = `Processing ${files.length} photo(s) on server...`;
            }
          }
        }
      };

      xhr.onload = function() {
        resetUploadUI();
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch(err) {
          data = { error: `Server error (${xhr.status})` };
        }

        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          alert(data.message || 'Photo(s) uploaded successfully!');
          uploadForm.reset();
          fetchAdminGallery();
        } else {
          alert(data.error || 'Failed to upload photo(s)');
        }
      };

      xhr.onerror = function() {
        resetUploadUI();
        alert('An error occurred during upload. Please check your connection.');
      };

      xhr.send(formData);
    });
  }

  window.toggleFeatured = function(id, featured) {
    fetch(`${GALLERY_API}?action=toggle-featured&_token=${encodeURIComponent(getAuthToken())}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}` 
      },
      body: JSON.stringify({ id, featured, _token: getAuthToken() })
    })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        alert('Failed to update featured status');
        fetchAdminGallery(); // Revert checkbox
      }
    })
    .catch(err => console.error(err));
  }

  window.deleteGalleryPhoto = function(id) {
    if (!confirm('Are you sure you want to delete this photo?')) return;
    
    fetch(`${GALLERY_API}?action=delete&_token=${encodeURIComponent(getAuthToken())}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}` 
      },
      body: JSON.stringify({ id, _token: getAuthToken() })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        fetchAdminGallery();
      } else {
        alert(data.error || 'Failed to delete photo');
      }
    })
    .catch(err => console.error(err));
  }

  window.deleteSelectedCategory = function() {
    const filterSelect = document.getElementById('adminCategoryFilter');
    let selectedCategory = filterSelect ? filterSelect.value : 'all';
    
    const categories = Array.from(new Set(window.adminGalleryPhotos.map(p => p.category).filter(Boolean))).sort();
    if (categories.length === 0) {
      return alert('No categories found in the gallery.');
    }

    if (selectedCategory === 'all' || !selectedCategory) {
      const categoryPrompt = prompt(
        `Which category would you like to delete?\n\nAvailable Categories:\n• ${categories.join('\n• ')}\n\nEnter category name:`
      );
      if (!categoryPrompt) return; // User cancelled
      
      const matchedCategory = categories.find(c => c.toLowerCase() === categoryPrompt.trim().toLowerCase());
      if (!matchedCategory) {
        return alert(`Category "${categoryPrompt.trim()}" was not found.\nAvailable categories: ${categories.join(', ')}`);
      }
      selectedCategory = matchedCategory;
    }
    
    if (!confirm(`Are you sure you want to delete ALL photos in the category "${selectedCategory}"?\nThis action cannot be undone.`)) {
      return;
    }
    
    fetch(`${GALLERY_API}?action=delete-category&_token=${encodeURIComponent(getAuthToken())}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}` 
      },
      body: JSON.stringify({ category: selectedCategory, _token: getAuthToken() })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        alert(data.message || `Successfully deleted category "${selectedCategory}"`);
        if (filterSelect) filterSelect.value = 'all';
        fetchAdminGallery();
      } else {
        alert(data.error || 'Failed to delete category');
      }
    })
    .catch(err => {
      console.error(err);
      alert('An error occurred while deleting the category');
    });
  }
  // --- Edit Profile Logic ---
  const editProfileModal = document.getElementById('editProfileModal');
  const openEditProfileBtn = document.getElementById('openEditProfileBtn');
  const cancelProfileBtn = document.getElementById('cancelProfileBtn');
  const saveProfileBtn = document.getElementById('saveProfileBtn');
  const editProfileName = document.getElementById('editProfileName');
  const editProfileEmail = document.getElementById('editProfileEmail');
  const editProfilePhone = document.getElementById('editProfilePhone');
  const otpSection = document.getElementById('otpSection');
  const sendOtpBtn = document.getElementById('sendOtpBtn');
  const otpInputGroup = document.getElementById('otpInputGroup');
  const editProfileOtp = document.getElementById('editProfileOtp');
  
  let originalPhone = '';

  if (openEditProfileBtn) {
    openEditProfileBtn.addEventListener('click', async () => {
      const currentUser = getAuthUser();
      if (currentUser) {
        editProfileName.value = currentUser.fullName || '';
        if (editProfileEmail) editProfileEmail.value = currentUser.email || '';
        editProfilePhone.value = currentUser.phone || '';
        originalPhone = currentUser.phone || '';
      }
      otpSection.style.display = 'none';
      otpInputGroup.style.display = 'none';
      editProfileOtp.value = '';
      if (editProfileModal) editProfileModal.style.display = 'flex';

      try {
        const response = await fetch(`${API_BASE}/api/admin/profile`, {
          headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const data = await response.json();
        if (data.success && data.user) {
          editProfileName.value = data.user.fullName || '';
          if (editProfileEmail) editProfileEmail.value = data.user.email || '';
          editProfilePhone.value = data.user.phone || '';
          originalPhone = data.user.phone || '';
          
          const storedUser = getAuthUser();
          if (storedUser) {
            storedUser.phone = data.user.phone;
            localStorage.setItem('udyam_admin_user', JSON.stringify(storedUser));
          }
        }
      } catch (err) {
        console.error('Failed to fetch latest profile info', err);
      }
    });
  }

  if (cancelProfileBtn) {
    cancelProfileBtn.addEventListener('click', () => {
      if (editProfileModal) editProfileModal.style.display = 'none';
    });
  }

  if (editProfilePhone) {
    editProfilePhone.addEventListener('input', () => {
      // If originalPhone is missing because it wasn't in the initial token payload, 
      // let's assume if they change anything, they need an OTP.
      if (editProfilePhone.value.trim() !== originalPhone) {
        otpSection.style.display = 'block';
      } else {
        otpSection.style.display = 'none';
        otpInputGroup.style.display = 'none';
        editProfileOtp.value = '';
      }
    });
  }

  if (sendOtpBtn) {
    sendOtpBtn.addEventListener('click', async () => {
      try {
        sendOtpBtn.textContent = 'Sending...';
        sendOtpBtn.disabled = true;
        
        const response = await fetch(`${API_BASE}/api/admin/profile/send-otp`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const data = await response.json();
        
        if (data.success) {
          alert('OTP sent to your email.');
          sendOtpBtn.textContent = 'OTP Sent';
          otpInputGroup.style.display = 'block';
        } else {
          alert(data.error || 'Failed to send OTP');
          sendOtpBtn.textContent = 'Send OTP to Email';
          sendOtpBtn.disabled = false;
        }
      } catch (err) {
        console.error(err);
        alert('Error sending OTP');
        sendOtpBtn.textContent = 'Send OTP to Email';
        sendOtpBtn.disabled = false;
      }
    });
  }

  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
      const fullName = editProfileName.value.trim();
      const phone = editProfilePhone.value.trim();
      const otp = editProfileOtp.value.trim();

      if (!fullName || !phone) {
        alert('Name and Mobile Number are required.');
        return;
      }

      if (phone !== originalPhone && !otp) {
        alert('OTP is required to change mobile number.');
        return;
      }

      saveProfileBtn.textContent = 'Saving...';
      saveProfileBtn.disabled = true;

      try {
        const formData = new FormData();
        formData.append('fullName', fullName);
        formData.append('phone', phone);
        if (otp) formData.append('otp', otp);
        
        const photoFile = document.getElementById('editProfilePhoto').files[0];
        if (photoFile) {
          formData.append('photo', photoFile);
        }

        const response = await fetch(`${API_BASE}/api/admin/profile`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`
          },
          body: formData
        });
        const data = await response.json();

        if (data.success) {
          alert('Profile updated successfully!');
          if (typeof setAuthSession === 'function' && data.token && data.user) {
            setAuthSession(data.token, data.user);
          } else {
            if (data.token) localStorage.setItem('udyam_admin_token', data.token);
            if (data.user) localStorage.setItem('udyam_admin_user', JSON.stringify(data.user));
          }
          
          if (userNameEl) userNameEl.textContent = data.user.fullName || 'Admin';
          const sidebarUserNameEl = document.getElementById('sidebarUserName');
          if (sidebarUserNameEl) sidebarUserNameEl.textContent = data.user.fullName || 'Admin';

          if (userAvatarEl) {
            if (data.user.photo) {
              userAvatarEl.innerHTML = `<img src="${data.user.photo}" alt="Avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
              userAvatarEl.style.backgroundColor = 'transparent';
            } else {
              userAvatarEl.innerHTML = (data.user.fullName || 'A').charAt(0).toUpperCase();
              userAvatarEl.style.backgroundColor = 'var(--accent)';
            }
          }
          if (document.getElementById('dynamicGreeting')) {
            const hour = new Date().getHours();
            let greeting = 'Good evening';
            if (hour < 12) greeting = 'Good morning';
            else if (hour < 17) greeting = 'Good afternoon';
            document.getElementById('dynamicGreeting').textContent = `${greeting}, ${data.user.fullName.split(' ')[0]}!`;
          }
          originalPhone = data.user.phone || '';

          if (editProfileModal) editProfileModal.style.display = 'none';
        } else {
          alert(data.error || 'Failed to update profile');
        }
      } catch (err) {
        console.error(err);
        alert('Error updating profile');
      } finally {
        saveProfileBtn.textContent = 'Save Changes';
        saveProfileBtn.disabled = false;
      }
    });
  }

  // ══════════════════════════════════════════
  //  EXPORT REPORT MODAL CONTROLLER
  // ══════════════════════════════════════════

  const exportReportModal   = document.getElementById('exportReportModal');
  const openExportReportBtn = document.getElementById('openExportReportBtn');
  const closeExportModal    = document.getElementById('closeExportReportModal');
  const exportListEl        = document.getElementById('exportDonationsList');
  const exportSearchInput   = document.getElementById('exportSearchInput');
  const exportFilterSelect  = document.getElementById('exportFilterSelect');
  const exportCountLabel    = document.getElementById('exportCountLabel');

  // Currency formatter (reuse pattern from above)
  const fmtCurrency = (n) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n);

  // Render the filterable donation list inside the modal
  function renderExportList() {
    const payments = window.__allPayments || [];
    const query    = (exportSearchInput ? exportSearchInput.value : '').trim().toLowerCase();
    const filter   = exportFilterSelect ? exportFilterSelect.value : 'all';

    const filtered = payments.filter(item => {
      // 80G filter
      if (filter === '80g'    && !item.with80G) return false;
      if (filter === 'non80g' &&  item.with80G) return false;
      // Text search
      if (query) {
        const haystack = [
          item.fullName, item.email, item.phone,
          item.paymentId, item.pan
        ].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    // Update count label
    if (exportCountLabel) {
      exportCountLabel.textContent = `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`;
    }

    if (filtered.length === 0) {
      exportListEl.innerHTML = `
        <div style="text-align:center; padding:3rem; color:var(--text-muted);">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="#D1D5DB" stroke-width="1.5" style="margin:0 auto 1rem; display:block;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          No donations match your search.
        </div>`;
      return;
    }

    exportListEl.innerHTML = filtered.map((item, idx) => {
      const date = new Date(item.date);
      const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const badge80G = item.with80G
        ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;background:rgba(59,130,246,0.1);color:#2563EB;border-radius:20px;font-size:0.7rem;font-weight:700;">80G</span>`
        : '';

      return `
        <div style="display:flex;align-items:center;gap:1rem;padding:0.9rem 0.75rem;border-bottom:1px solid #F3F4F6;transition:background 0.15s;border-radius:8px;cursor:default;"
             onmouseover="this.style.background='#F9FAFB'" onmouseout="this.style.background='transparent'">
          <!-- Index badge -->
          <div style="width:32px;height:32px;border-radius:50%;background:rgba(27,67,50,0.08);color:var(--primary);font-size:0.75rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${idx + 1}</div>

          <!-- Donor info -->
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:0.9rem;color:#111827;display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
              ${item.fullName || 'Anonymous'} ${badge80G}
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;display:flex;gap:0.5rem;flex-wrap:wrap;">
              <span>${item.email || '—'}</span>
              ${item.phone ? `<span style="color:#D1D5DB;">|</span><span>${item.phone}</span>` : ''}
            </div>
            <div style="font-size:0.75rem;color:#9CA3AF;margin-top:2px;">
              ${dateStr} &nbsp;·&nbsp; ${timeStr}
              ${item.paymentId ? `&nbsp;·&nbsp; <span style="font-family:monospace;">${item.paymentId}</span>` : ''}
            </div>
          </div>

          <!-- Amount -->
          <div style="font-size:1rem;font-weight:700;color:var(--primary);white-space:nowrap;flex-shrink:0;">
            ${fmtCurrency(item.amount)}
          </div>

          <!-- Action Buttons -->
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <button
              onclick="window.downloadReceipt('${item._id}')"
              title="Download PDF receipt"
              style="display:inline-flex;align-items:center;gap:5px;padding:0.5rem 0.8rem;background:var(--primary);color:white;border:none;border-radius:8px;font-size:0.8rem;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.2s;white-space:nowrap;"
              onmouseover="this.style.background='var(--primary-light)';this.style.transform='translateY(-1px)'"
              onmouseout="this.style.background='var(--primary)';this.style.transform='translateY(0)'"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              PDF
            </button>
            <button
              onclick="window.resendReceiptEmail('${item._id}')"
              title="Resend receipt email to donor"
              style="display:inline-flex;align-items:center;gap:4px;padding:0.5rem 0.8rem;background:#10B981;color:white;border:none;border-radius:8px;font-size:0.8rem;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.2s;white-space:nowrap;"
              onmouseover="this.style.background='#059669';this.style.transform='translateY(-1px)'"
              onmouseout="this.style.background='#10B981';this.style.transform='translateY(0)'"
            >
              ✉️ Resend
            </button>
          </div>
        </div>`;
    }).join('');
  }

  // Open modal
  if (openExportReportBtn) {
    openExportReportBtn.addEventListener('click', () => {
      exportReportModal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      // Reset search
      if (exportSearchInput)  exportSearchInput.value = '';
      if (exportFilterSelect) exportFilterSelect.value = 'all';

      if (!window.__allPayments || window.__allPayments.length === 0) {
        exportListEl.innerHTML = `
          <div style="text-align:center;padding:3rem;color:var(--text-muted);">
            <div class="spinner" style="margin:0 auto 1rem;"></div>
            Loading donation records…
          </div>`;
        // Try to fetch if not yet loaded
        apiRequest('/api/donations').then(data => {
          window.__allPayments = data;
          renderExportList();
        }).catch(() => {
          exportListEl.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--danger);">Failed to load donations. Is the backend running?</div>`;
        });
      } else {
        renderExportList();
      }
    });
  }

  // Close modal
  function closeExportReportModal() {
    exportReportModal.style.display = 'none';
    document.body.style.overflow = '';
  }

  if (closeExportModal) {
    closeExportModal.addEventListener('click', closeExportReportModal);
  }

  // Close on backdrop click
  if (exportReportModal) {
    exportReportModal.addEventListener('click', (e) => {
      if (e.target === exportReportModal) closeExportReportModal();
    });
  }

  // Live search & filter
  if (exportSearchInput)  exportSearchInput.addEventListener('input', renderExportList);
  if (exportFilterSelect) exportFilterSelect.addEventListener('change', renderExportList);

  // ─── ADMIN DIRECT MESSAGES & FILES MODULE ──────────────────────────────────
  const navAdminMessages = document.getElementById('nav-admin-messages');
  const adminMessagesSection = document.getElementById('adminMessagesSection');
  const adminMessagesContainer = document.getElementById('adminMessagesContainer');
  const openSendAdminMsgBtn = document.getElementById('openSendAdminMsgBtn');
  const refreshAdminMsgBtn = document.getElementById('refreshAdminMsgBtn');
  const sendAdminMessageModal = document.getElementById('sendAdminMessageModal');
  const cancelSendAdminMsgBtn = document.getElementById('cancelSendAdminMsgBtn');
  const confirmSendAdminMsgBtn = document.getElementById('confirmSendAdminMsgBtn');
  const adminMsgRoleSelect = document.getElementById('adminMsgRoleSelect');
  const adminMsgUserSelect = document.getElementById('adminMsgUserSelect');
  const adminMsgSubjectInput = document.getElementById('adminMsgSubjectInput');
  const adminMsgTextInput = document.getElementById('adminMsgTextInput');
  const adminMsgSearchInput = document.getElementById('adminMsgSearchInput');
  const adminMsgFilterTabs = document.querySelectorAll('.admin-msg-filter-btn');

  let allAdminMessages = [];
  let currentAdminMsgFilter = 'all';

  // Navigation switching
  if (navAdminMessages) {
    navAdminMessages.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      navAdminMessages.classList.add('active');

      if (dashboardSection) dashboardSection.style.display = 'none';
      if (registrationsSection) registrationsSection.style.display = 'none';
      if (gallerySection) gallerySection.style.display = 'none';
      if (adminMessagesSection) adminMessagesSection.style.display = 'block';

      fetchAdminMessages();
    });
  }

  // Ensure clicking other nav items hides adminMessagesSection
  document.querySelectorAll('.nav-item').forEach(nav => {
    if (nav.id === 'nav-admin-messages') return;
    nav.addEventListener('click', () => {
      if (adminMessagesSection) adminMessagesSection.style.display = 'none';
    });
  });

  // Populate recipient role select in modal
  const populateMsgRoleOptions = () => {
    if (!adminMsgRoleSelect) return;
    let rolesHtml = `<option value="All">All Admins (Broadcast)</option>`;
    rolesHtml += ADMIN_ROLES.map(r => `<option value="${r}">${r}</option>`).join('');
    adminMsgRoleSelect.innerHTML = rolesHtml;
    populateMsgUserSelect('All');
  };

  const populateMsgUserSelect = (selectedRole) => {
    if (!adminMsgUserSelect) return;
    let matchingAdmins = allAdminUsers;
    if (selectedRole !== 'All') {
      matchingAdmins = allAdminUsers.filter(u => u.role === selectedRole);
    }
    
    if (matchingAdmins.length === 0) {
      adminMsgUserSelect.innerHTML = `<option value="">Any admin in role (No registered admins)</option>`;
    } else {
      let optionsHtml = `<option value="">Any admin in role (${matchingAdmins.length} available)</option>`;
      optionsHtml += matchingAdmins.map(u => {
        const isCurrent = user && (u._id === user._id || u.email === user.email);
        return `<option value="${u._id}">${u.fullName} (${u.role})${isCurrent ? ' - You' : ''}</option>`;
      }).join('');
      adminMsgUserSelect.innerHTML = optionsHtml;
    }
  };

  if (adminMsgRoleSelect) {
    adminMsgRoleSelect.addEventListener('change', (e) => {
      populateMsgUserSelect(e.target.value);
    });
  }

  // Open compose modal
  if (openSendAdminMsgBtn) {
    openSendAdminMsgBtn.addEventListener('click', async () => {
      if (allAdminUsers.length === 0) {
        await fetchAdminUsers();
      }
      populateMsgRoleOptions();
      if (adminMsgSubjectInput) adminMsgSubjectInput.value = '';
      if (adminMsgTextInput) adminMsgTextInput.value = '';
      if (typeof adminMsgSelectedFiles !== 'undefined') {
        adminMsgSelectedFiles = [];
        if (typeof renderAdminMsgFileList === 'function') renderAdminMsgFileList();
      }
      if (sendAdminMessageModal) sendAdminMessageModal.style.display = 'flex';
    });
  }

  // Close compose modal
  if (cancelSendAdminMsgBtn) {
    cancelSendAdminMsgBtn.addEventListener('click', () => {
      if (sendAdminMessageModal) sendAdminMessageModal.style.display = 'none';
      if (adminMsgSubjectInput) adminMsgSubjectInput.value = '';
      if (adminMsgTextInput) adminMsgTextInput.value = '';
      if (typeof adminMsgSelectedFiles !== 'undefined') {
        adminMsgSelectedFiles = [];
        if (typeof renderAdminMsgFileList === 'function') renderAdminMsgFileList();
      }
    });
  }

  // Confirm Send Message
  if (confirmSendAdminMsgBtn) {
    confirmSendAdminMsgBtn.addEventListener('click', async () => {
      const recipientRole = adminMsgRoleSelect ? adminMsgRoleSelect.value : 'All';
      const selectedUserId = adminMsgUserSelect ? adminMsgUserSelect.value : '';
      const selectedUserObj = allAdminUsers.find(u => u._id === selectedUserId);
      const subject = adminMsgSubjectInput ? adminMsgSubjectInput.value.trim() : '';
      const message = adminMsgTextInput ? adminMsgTextInput.value.trim() : '';

      if (!message) {
        alert('Please enter a message text.');
        return;
      }

      confirmSendAdminMsgBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.4);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></span> Sending...</span>';
      confirmSendAdminMsgBtn.disabled = true;

      try {
        const formData = new FormData();
        formData.append('recipientRole', recipientRole);
        if (selectedUserObj) {
          formData.append('recipientAdminId', selectedUserObj._id);
          formData.append('recipientAdminName', selectedUserObj.fullName);
          formData.append('recipientAdminEmail', selectedUserObj.email);
        }
        if (subject) formData.append('subject', subject);
        formData.append('message', message);

        if (typeof adminMsgSelectedFiles !== 'undefined' && adminMsgSelectedFiles.length > 0) {
          adminMsgSelectedFiles.forEach(file => formData.append('attachments', file));
        }

        const token = getAuthToken();
        const response = await fetch(`${API_BASE}/api/admin/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });

        const resData = await response.json();

        if (response.ok && resData.success) {
          alert('Message sent successfully!');
          if (sendAdminMessageModal) sendAdminMessageModal.style.display = 'none';
          if (adminMsgSubjectInput) adminMsgSubjectInput.value = '';
          if (adminMsgTextInput) adminMsgTextInput.value = '';
          if (typeof adminMsgSelectedFiles !== 'undefined') {
            adminMsgSelectedFiles = [];
            if (typeof renderAdminMsgFileList === 'function') renderAdminMsgFileList();
          }
          fetchAdminMessages();
        } else {
          alert(resData.error || 'Failed to send message');
        }
      } catch (err) {
        console.error(err);
        alert('An error occurred while sending message');
      } finally {
        confirmSendAdminMsgBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send Message';
        confirmSendAdminMsgBtn.disabled = false;
      }
    });
  }

  // Fetch admin messages
  const fetchAdminMessages = async () => {
    if (!adminMessagesContainer) return;
    try {
      adminMessagesContainer.innerHTML = '<div style="padding: 2rem; text-align: center;"><div class="spinner"></div> Loading messages...</div>';
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/admin/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        allAdminMessages = data;
        renderAdminMessages();
      } else {
        adminMessagesContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--danger);">Failed to load messages.</div>';
      }
    } catch (err) {
      console.error('Fetch admin messages error:', err);
      adminMessagesContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--danger);">Error connecting to backend server.</div>';
    }
  };

  // Filter tabs click handlers
  adminMsgFilterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      adminMsgFilterTabs.forEach(t => {
        t.classList.remove('active');
        t.style.background = '#F3F4F6';
        t.style.color = '#4B5563';
      });
      tab.classList.add('active');
      tab.style.background = 'var(--primary)';
      tab.style.color = 'white';
      currentAdminMsgFilter = tab.getAttribute('data-msg-filter');
      renderAdminMessages();
    });
  });

  if (adminMsgSearchInput) {
    adminMsgSearchInput.addEventListener('input', () => {
      renderAdminMessages();
    });
  }

  if (refreshAdminMsgBtn) {
    refreshAdminMsgBtn.addEventListener('click', fetchAdminMessages);
  }

  // Render Admin Messages
  const renderAdminMessages = () => {
    if (!adminMessagesContainer) return;

    const searchTerm = adminMsgSearchInput ? adminMsgSearchInput.value.toLowerCase().trim() : '';

    let filtered = allAdminMessages.filter(m => {
      const isSentByMe = user && (m.senderId === user._id || m.senderEmail === user.email);
      if (currentAdminMsgFilter === 'inbox' && isSentByMe) return false;
      if (currentAdminMsgFilter === 'sent' && !isSentByMe) return false;

      if (searchTerm) {
        const textMatch = (m.message || '').toLowerCase().includes(searchTerm);
        const subjectMatch = (m.subject || '').toLowerCase().includes(searchTerm);
        const senderMatch = (m.senderName || '').toLowerCase().includes(searchTerm) || (m.senderRole || '').toLowerCase().includes(searchTerm);
        return textMatch || subjectMatch || senderMatch;
      }
      return true;
    });

    if (filtered.length === 0) {
      adminMessagesContainer.innerHTML = `
        <div style="padding: 3rem; text-align: center; color: var(--text-muted); background: white; border-radius: 12px; border: 1px solid var(--border);">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" stroke-width="1.5" style="margin-bottom: 0.5rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
          <div style="font-weight: 600; font-size: 0.95rem; color: #374151;">No admin messages found</div>
          <p style="font-size: 0.8rem; margin-top: 0.25rem;">Send a direct message or share files with admins using the button above.</p>
        </div>`;
      return;
    }

    adminMessagesContainer.innerHTML = filtered.map(m => {
      const isSentByMe = user && (m.senderId === user._id || m.senderEmail === user.email);
      const isSecretaryOrPresident = user && (user.role === 'Secretary' || user.role === 'President');
      const canDelete = isSentByMe || isSecretaryOrPresident;

      // Check if the current admin has already replied to this message
      const hasCurrentUserReplied = user && m.replies && m.replies.some(
        r => r.senderId && (r.senderId === user._id || r.senderEmail === user.email)
      );


      const formattedDate = m.createdAt
        ? new Date(m.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '';

      const recipientText = m.recipientAdminName
        ? `${m.recipientAdminName} (${m.recipientRole})`
        : (m.recipientRole === 'All' ? 'All Admins' : `Role: ${m.recipientRole}`);

      // Attachments HTML
      let attachmentsHtml = '';
      if (m.attachments && m.attachments.length > 0) {
        const attachLinks = m.attachments.map((attachment, idx) => {
          const isObject = typeof attachment === 'object' && attachment !== null;
          const url = isObject ? attachment.url : attachment;
          const name = isObject && attachment.name ? attachment.name : `Attachment ${idx + 1}`;
          
          const isPdf = url.toLowerCase().includes('.pdf') || url.includes('/raw/');
          const icon = isPdf
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#EF4444" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#3B82F6" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
          
          const style = isPdf
            ? "display:inline-flex; align-items:center; gap:5px; color:#EF4444; text-decoration:none; font-weight:600; font-size:0.8rem; background:rgba(239,68,68,0.08); padding:5px 12px; border-radius:6px; transition:all 0.2s;"
            : "display:inline-flex; align-items:center; gap:5px; color:#3B82F6; text-decoration:none; font-weight:600; font-size:0.8rem; background:rgba(59,130,246,0.08); padding:5px 12px; border-radius:6px; transition:all 0.2s;";

          return `<a href="${url}" target="_blank" style="${style}" title="${name}">${icon} ${name}</a>`;
        }).join('');

        attachmentsHtml = `
          <div style="margin-top: 0.85rem; padding-top: 0.75rem; border-top: 1px dashed #E2E8F0; display: flex; flex-direction: column; gap: 0.5rem;">
            <div style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: #64748B; letter-spacing: 0.05em;">Attachments (${m.attachments.length})</div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">${attachLinks}</div>
          </div>`;
      }

      return `
        <div style="background: white; border: 1px solid #E5E7EB; border-radius: 12px; padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); position: relative;">
          <!-- Top Header -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div style="width: 40px; height: 40px; border-radius: 50%; background: ${isSentByMe ? 'var(--primary)' : '#3B82F6'}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; flex-shrink: 0;">
                ${(m.senderName || 'A').charAt(0).toUpperCase()}
              </div>
              <div>
                <div style="font-size: 0.95rem; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                  ${m.senderName}
                  <span style="font-size: 0.7rem; font-weight: 600; padding: 2px 8px; border-radius: 12px; background: #F3F4F6; color: #4B5563;">${m.senderRole}</span>
                  ${isSentByMe ? '<span style="font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 12px; background: rgba(27,67,50,0.1); color: var(--primary);">You</span>' : ''}
                </div>
                <div style="font-size: 0.85rem; color: #6B7280; display: flex; align-items: center; gap: 0.35rem; margin-top: 2px;">
                  <span>To: <strong style="color: #374151;">${recipientText}</strong></span>
                  <span>•</span>
                  <span>${formattedDate}</span>
                </div>
              </div>
            </div>

            ${canDelete ? `
              <button onclick="window.deleteAdminMessage('${m._id}')" style="background: transparent; border: none; cursor: pointer; color: #9CA3AF; padding: 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='#9CA3AF'" title="Delete Message">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            ` : ''}
          </div>

          <!-- Subject Line -->
          ${m.subject ? `
            <div style="font-size: 1rem; font-weight: 700; color: #1E293B; margin-top: 0.25rem;">
              ${m.subject}
            </div>
          ` : ''}

          <!-- Written Message Body -->
          <div style="font-size: 0.92rem; color: #334155; white-space: pre-wrap; line-height: 1.5; background: #F8FAFC; padding: 0.85rem 1rem; border-radius: 8px; border: 1px solid #F1F5F9;">
            ${m.message}
          </div>

          <!-- Attachments -->
          ${attachmentsHtml}

          <!-- Reply Section -->
          <div style="margin-top: 0.85rem; padding-top: 0.75rem; border-top: 1px solid #F1F5F9; display: flex; flex-direction: column; gap: 0.75rem;">

            ${(m.replies && m.replies.length > 0) ? m.replies.map((reply, rIdx) => `
              <div style="padding: 1rem; background: #F0FDF4; border: 1px solid #BBF7D0; border-left: 4px solid #16A34A; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.4rem;">
                  <span style="font-size: 0.85rem; font-weight: 700; color: #15803D; display: flex; align-items: center; gap: 6px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                    Reply from ${reply.senderName} (${reply.senderRole})
                  </span>
                  <span style="font-size: 0.75rem; color: #166534; font-weight: 500;">
                    ${reply.createdAt ? new Date(reply.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <div style="font-size: 0.9rem; color: #1E293B; white-space: pre-wrap; line-height: 1.5;">
                  ${reply.replyText}
                </div>
                ${reply.attachments && reply.attachments.length > 0 ? `
                  <div style="margin-top: 0.5rem; font-size: 0.8rem; display: flex; flex-wrap: wrap; gap: 0.5rem;">
                    ${reply.attachments.map((att, idx) => {
                      const url = typeof att === 'object' ? att.url : att;
                      const name = typeof att === 'object' && att.name ? att.name : `Attachment ${idx + 1}`;
                      return `<a href="${url}" target="_blank" style="color: #15803D; text-decoration: underline; font-weight: 600; font-size: 0.8rem;">📎 ${name}</a>`;
                    }).join(' ')}
                  </div>` : ''}
              </div>
            `).join('') : ''}

            ${hasCurrentUserReplied ? `
              <div style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; font-weight: 700; color: #15803D; background: rgba(22,163,74,0.12); padding: 4px 12px; border-radius: 12px; align-self: flex-start;">
                ✅ You have already replied to this message
              </div>
            ` : `
              <button onclick="window.toggleAdminReplyForm('${m._id}')" style="align-self: flex-start; background: #F3F4F6; color: #374151; border: 1px solid #D1D5DB; padding: 0.4rem 0.9rem; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: all 0.2s;" onmouseover="this.style.background='var(--primary)'; this.style.color='white';" onmouseout="this.style.background='#F3F4F6'; this.style.color='#374151';">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                Reply
              </button>

              <form id="replyForm_${m._id}" onsubmit="window.submitAdminReply(event, '${m._id}')" style="display: none; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 1rem; border-radius: 8px; flex-direction: column; gap: 0.75rem;">
                <div style="font-size: 0.82rem; font-weight: 700; color: var(--primary);">
                  Reply to this message (you can only reply once)
                </div>
                <textarea id="replyText_${m._id}" required rows="3" placeholder="Write your response..." style="width: 100%; padding: 0.6rem 0.75rem; border: 1px solid #CBD5E1; border-radius: 6px; font-family: inherit; font-size: 0.88rem; outline: none; resize: vertical;"></textarea>
                
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                  <input type="file" id="replyFile_${m._id}" multiple style="font-size: 0.78rem; color: #64748B;">
                  <div style="display: flex; gap: 0.5rem;">
                    <button type="button" onclick="window.toggleAdminReplyForm('${m._id}')" style="padding: 0.4rem 0.85rem; background: #E2E8F0; color: #475569; border: none; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer;">Cancel</button>
                    <button type="submit" id="replySubmitBtn_${m._id}" style="padding: 0.4rem 1rem; background: var(--primary); color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                      Send Reply
                    </button>
                  </div>
                </div>
              </form>
            `}
          </div>
        </div>
      `;
    }).join('');
  };

  // Toggle inline reply form
  window.toggleAdminReplyForm = (id) => {
    const form = document.getElementById(`replyForm_${id}`);
    if (!form) return;
    if (form.style.display === 'none' || !form.style.display) {
      form.style.display = 'flex';
    } else {
      form.style.display = 'none';
    }
  };

  // Submit admin message reply
  window.submitAdminReply = async (e, id) => {
    e.preventDefault();
    const textarea = document.getElementById(`replyText_${id}`);
    const fileInput = document.getElementById(`replyFile_${id}`);
    const submitBtn = document.getElementById(`replySubmitBtn_${id}`);

    const replyText = textarea ? textarea.value.trim() : '';
    if (!replyText) return alert('Please enter a reply message.');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.6';
      submitBtn.textContent = 'Sending...';
    }

    try {
      const formData = new FormData();
      formData.append('replyText', replyText);

      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        for (let i = 0; i < fileInput.files.length; i++) {
          formData.append('attachments', fileInput.files[i]);
        }
      }

      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/admin/messages/${id}/reply`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert(data.message || 'Reply sent successfully!');
        fetchAdminMessages();
      } else {
        alert(data.error || 'Failed to send reply');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.style.opacity = '1';
          submitBtn.textContent = 'Send Reply';
        }
      }
    } catch (err) {
      console.error('Error submitting reply:', err);
      alert('An error occurred while sending reply');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.textContent = 'Send Reply';
      }
    }
  };

  // Delete message window function
  window.deleteAdminMessage = async (id) => {
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/admin/messages/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        allAdminMessages = allAdminMessages.filter(m => m._id !== id);
        renderAdminMessages();
      } else {
        alert(data.error || 'Failed to delete message');
      }
    } catch (err) {
      console.error('Delete message error:', err);
      alert('An error occurred while deleting message');
    }
  };
});
