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
      // If forwarded to a specific President/Secretary, only show to that specific admin
      if (r.assignedToAdminId) {
        return r.assignedToAdminId === user._id || r.assignedToAdminEmail === user.email;
      }
      if (r.assignedToRole) {
        return r.assignedToRole === user.role;
      }
      return true;
    }

    if (filter === 'pending') {
      return isSecOrPres;
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
      // Pending badge
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
      const response = await fetch(`${API_BASE}/api/admin/registrations/${type}/${id}/forward`, {
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
          allRegistrations[index].status = 'forwarded';
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

  const renderRegistrations = () => {
    let filtered = allRegistrations.filter(r => isRegistrationVisibleToUser(r, currentRegFilter));

    // Apply sort
    filtered.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return currentSort === 'oldest' ? dateA - dateB : dateB - dateA;
    });

    if (filtered.length === 0) {
      const isSecOrPres = user && (user.role === 'Secretary' || user.role === 'President');
      const emptyText = (currentRegFilter === 'forwarded' && isSecOrPres) ? 'No applications are currently being tracked or forwarded.' : `No ${currentRegFilter} registrations found.`;
      registrationsContainer.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-muted); background: white; border-radius: 8px; border: 1px solid var(--border);">${emptyText}</div>`;
      return;
    }

    registrationsContainer.innerHTML = filtered.map((reg, index) => {
      const isVol = reg.type === 'volunteer';
      const isEmp = reg.type === 'employee';
      const isMem = reg.type === 'member';

      let docsHtml = '';
      const linkStyle = "display:inline-flex; align-items:center; color:var(--primary); text-decoration:none; font-weight:600; font-size:0.8rem; background:rgba(27,67,50,0.08); padding:4px 10px; border-radius:6px; margin-right:6px; transition:all 0.2s;";
      const linkHover = "onmouseover=\"this.style.background='var(--primary)'; this.style.color='white'\" onmouseout=\"this.style.background='rgba(27,67,50,0.08)'; this.style.color='var(--primary)'\"";

      const formatDetail = (label, value) => `
        <div style="display: flex; flex-direction: column; gap: 4px; background: white; padding: 12px 16px; border-radius: 8px; border: 1px solid #E2E8F0; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
          <span style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">
            ${label}
          </span>
          <div style="font-size: 0.9rem; font-weight: 500; color: #1E293B; display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
            ${value}
          </div>
        </div>
      `;

      const formatPdfUrl = (url) => {
        return url;
      };

      if (isVol) {
        docsHtml += formatDetail('Blood Group', reg.bloodGroup || 'N/A');
        docsHtml += formatDetail('WhatsApp', reg.whatsapp || 'N/A');
        docsHtml += formatDetail('Address Proofs', reg.addressProofs && reg.addressProofs.length ? reg.addressProofs.map(p => `<a href="${formatPdfUrl(p)}" target="_blank" style="${linkStyle}" ${linkHover}>View</a>`).join('') : '<span style="color:#9CA3AF; font-size:0.85rem;">None</span>');
      } else if (isEmp) {
        docsHtml += formatDetail('Blood Group', reg.bloodGroup || 'N/A');
        docsHtml += formatDetail('WhatsApp', reg.whatsapp || 'N/A');
        docsHtml += formatDetail('PAN Card', reg.panCard ? `<a href="${formatPdfUrl(reg.panCard)}" target="_blank" style="${linkStyle}" ${linkHover}>View</a>` : '<span style="color:#9CA3AF; font-size:0.85rem;">None</span>');
        docsHtml += formatDetail('Aadhar Card', reg.aadharCard ? `<a href="${formatPdfUrl(reg.aadharCard)}" target="_blank" style="${linkStyle}" ${linkHover}>View</a>` : '<span style="color:#9CA3AF; font-size:0.85rem;">None</span>');
        docsHtml += formatDetail('DOB Proof', reg.dobProof ? `<a href="${formatPdfUrl(reg.dobProof)}" target="_blank" style="${linkStyle}" ${linkHover}>View</a>` : '<span style="color:#9CA3AF; font-size:0.85rem;">None</span>');
        docsHtml += formatDetail('Education Docs', reg.educationDocs && reg.educationDocs.length ? reg.educationDocs.map(p => `<a href="${formatPdfUrl(p)}" target="_blank" style="${linkStyle}" ${linkHover}>View</a>`).join('') : '<span style="color:#9CA3AF; font-size:0.85rem;">None</span>');
      } else if (isMem) {
        docsHtml += formatDetail('Blood Group', reg.bloodGroup || 'N/A');
        docsHtml += formatDetail('WhatsApp', reg.whatsapp || 'N/A');
        docsHtml += formatDetail('Address', `${reg.address1 || ''} ${reg.address2 || ''}, ${reg.district || ''} - ${reg.pin || ''}`);
        docsHtml += formatDetail('Validity & Fees', `${reg.validity || 'N/A'} (Paid: ₹${reg.amount || 0})`);
        docsHtml += formatDetail('Payment ID', reg.paymentId || 'N/A');
      }

      // Forward Attachments section
      let forwardAttachmentsHtml = '';
      if (reg.forwardAttachments && reg.forwardAttachments.length > 0) {
        const pdfLinkStyle = "display:inline-flex; align-items:center; gap:4px; color:#EF4444; text-decoration:none; font-weight:600; font-size:0.8rem; background:rgba(239,68,68,0.08); padding:4px 10px; border-radius:6px; margin-right:6px; transition:all 0.2s;";
        const pdfLinkHover = "onmouseover=\"this.style.background='#EF4444'; this.style.color='white'\" onmouseout=\"this.style.background='rgba(239,68,68,0.08)'; this.style.color='#EF4444'\"";
        const imgLinkStyle = "display:inline-flex; align-items:center; gap:4px; color:#3B82F6; text-decoration:none; font-weight:600; font-size:0.8rem; background:rgba(59,130,246,0.08); padding:4px 10px; border-radius:6px; margin-right:6px; transition:all 0.2s;";
        const imgLinkHover = "onmouseover=\"this.style.background='#3B82F6'; this.style.color='white'\" onmouseout=\"this.style.background='rgba(59,130,246,0.08)'; this.style.color='#3B82F6'\"";

        const attachLinks = reg.forwardAttachments.map((attachment, idx) => {
          const isObject = typeof attachment === 'object' && attachment !== null;
          const url = isObject ? attachment.url : attachment;
          const uploaderName = isObject && attachment.uploadedBy ? attachment.uploadedBy : 'Admin';

          const isPdf = url.toLowerCase().includes('.pdf') || url.includes('/raw/');
          const style = isPdf ? pdfLinkStyle : imgLinkStyle;
          const hover = isPdf ? pdfLinkHover : imgLinkHover;
          const pdfIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`;
          const imgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
          return `<a href="${formatPdfUrl(url)}" target="_blank" style="${style}" ${hover} title="Attached by ${uploaderName}">${isPdf ? pdfIcon : imgIcon} Attachment ${idx + 1} (${uploaderName})</a>`;
        }).join('');

        forwardAttachmentsHtml = `
          <div style="background: rgba(59,130,246,0.04); border: 1px solid rgba(59,130,246,0.15); border-radius: 8px; padding: 1rem 1.25rem; margin-top: 0.25rem;">
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.6rem;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#3B82F6" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
              <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#3B82F6;">Admin Attachments (${reg.forwardAttachments.length})</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:0.25rem;">${attachLinks}</div>
          </div>`;
      }

      // Forward Notes / Written Messages section
      let forwardNotesHtml = '';
      if (reg.forwardNotes && reg.forwardNotes.length > 0) {
        const notesContent = reg.forwardNotes.map(n => {
          const author = `${n.authorName || 'Admin'}${n.authorRole ? ` (${n.authorRole})` : ''}`;
          const formattedDate = n.date ? new Date(n.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
          return `
            <div style="background: white; border: 1px solid #E2E8F0; border-radius: 8px; padding: 0.75rem 1rem; margin-top: 0.5rem; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem; font-size: 0.78rem;">
                <span style="font-weight: 700; color: var(--primary);">${author}</span>
                <span style="color: #9CA3AF;">${formattedDate}</span>
              </div>
              <div style="font-size: 0.875rem; color: #334155; white-space: pre-wrap; line-height: 1.45;">${n.note}</div>
            </div>
          `;
        }).join('');

        forwardNotesHtml = `
          <div style="background: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 8px; padding: 1rem 1.25rem; margin-top: 0.25rem;">
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#D97706" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/></svg>
              <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#D97706;">Admin Written Messages (${reg.forwardNotes.length})</span>
            </div>
            ${notesContent}
          </div>`;
      }

      return `
        <div style="background: white; border: 1px solid #E5E7EB; border-radius: 12px; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; box-shadow: 0 1px 3px 0 rgba(0,0,0,0.08); transition: box-shadow 0.3s ease, transform 0.3s ease; overflow: hidden;"
             onmouseover="this.style.boxShadow='0 8px 20px rgba(0,0,0,0.1)'; this.style.transform='translateY(-2px)'"
             onmouseout="this.style.boxShadow='0 1px 3px 0 rgba(0,0,0,0.08)'; this.style.transform='translateY(0)'">

          <!-- Identity Row: photo + name/contact -->
          <div style="display: flex; gap: 0.85rem; align-items: center; min-width: 0;">
            ${reg.photo
              ? `<div style="position:relative; width:56px; height:56px; flex-shrink:0; cursor:pointer;" onclick="window.openPhotoLightbox('${reg.photo.replace(/'/g, "&apos;")}', '${reg.fullName.replace(/'/g, "&apos;")}')" title="Click to view full photo">
                  <img src="${reg.photo}" alt="Photo" style="width:56px; height:56px; border-radius:50%; object-fit:cover; border:2px solid white; box-shadow:0 0 0 2px var(--primary); display:block;" />
                </div>`
              : `<div style="width:56px; height:56px; border-radius:50%; background:#F3F4F6; color:#9CA3AF; font-size:0.75rem; font-weight:600; display:flex; align-items:center; justify-content:center; box-shadow:0 0 0 2px #D1D5DB; flex-shrink:0;">No<br>Photo</div>`}
            <div style="min-width:0; flex:1;">
              <div style="display:flex; flex-wrap:wrap; align-items:center; gap:0.4rem; margin-bottom:0.25rem;">
                <span style="font-size:1.05rem; font-weight:700; color:#111827;">${index + 1}. ${reg.fullName}</span>
                <span style="font-size:0.65rem; font-weight:700; padding:3px 9px; border-radius:20px; background:rgba(59,130,246,0.1); color:#2563EB; text-transform:uppercase; letter-spacing:0.5px; flex-shrink:0;">${reg.type}</span>
              </div>
              <div style="font-size:0.82rem; color:#4B5563; display:flex; flex-wrap:wrap; align-items:center; gap:0.35rem; min-width:0;">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">${reg.email}</span>
                <span style="color:#D1D5DB; flex-shrink:0;">|</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                <span style="flex-shrink:0;">${reg.phone}</span>
              </div>
            </div>
          </div>

          <!-- Meta Row: Applied On + Status Badge -->
          <div style="display:flex; flex-wrap:wrap; gap:0.6rem; align-items:stretch;">
            <div style="display:flex; flex-direction:column; justify-content:center; background:#F0FDF4; padding:0.6rem 0.9rem; border-radius:8px; border:1px solid #BBF7D0; flex:1; min-width:160px;">
              <span style="font-size:0.65rem; font-weight:700; color:#166534; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:3px;">Applied On</span>
              <div style="display:flex; flex-wrap:wrap; align-items:center; gap:4px; font-weight:600; color:#15803D; font-size:0.82rem;">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                ${new Date(reg.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                <span style="color:#86EFAC;">|</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                ${new Date(reg.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            ${(() => {
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

                return `
                  <div style="background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%); border: 1.5px solid #93C5FD; border-radius: 10px; padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.85rem; width: 100%; box-sizing: border-box;">
                    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; border-bottom: 1px solid rgba(59, 130, 246, 0.2); padding-bottom: 0.6rem;">
                      <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#1D4ED8" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        <span style="font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #1E40AF;">
                          Application Tracking Status
                        </span>
                      </div>
                      <span style="display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 20px; background: #2563EB; color: white; font-size: 0.75rem; font-weight: 700; box-shadow: 0 1px 2px rgba(37,99,235,0.3);">
                        <span style="width:7px; height:7px; border-radius:50%; background:#60A5FA; display:inline-block;"></span>
                        Currently Forwarded
                      </span>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.85rem;">
                      <div style="background: white; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid #BFDBFE;">
                        <span style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: #64748B; display: block; margin-bottom: 3px;">
                          Forwarded To (Where)
                        </span>
                        <div style="font-size: 0.92rem; font-weight: 700; color: #1E3A8A; display: flex; align-items: center; gap: 6px;">
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-4 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                          ${currentRole}
                        </div>
                      </div>

                      <div style="background: white; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid #BFDBFE;">
                        <span style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: #64748B; display: block; margin-bottom: 3px;">
                          Assigned Person (Who)
                        </span>
                        <div style="font-size: 0.92rem; font-weight: 700; color: #1E3A8A; display: flex; align-items: center; gap: 6px;">
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                          ${currentName ? currentName : 'All Admins in Role'}
                        </div>
                        ${currentEmail ? `<div style="font-size:0.75rem; color:#3B82F6; margin-top:2px;">${currentEmail}</div>` : ''}
                      </div>
                    </div>

                    <div style="background: white; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid #BFDBFE;">
                      <span style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: #64748B; display: block; margin-bottom: 6px;">
                        Review Chain Progress
                      </span>
                      <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px; row-gap: 6px;">
                        ${chainHtml}
                      </div>
                    </div>
                  </div>`;
              } else {
                return `
                  <div style="background:#F8FAFC;padding:0.6rem 0.9rem;border-radius:8px;border:1px solid #E2E8F0;display:flex;flex-direction:column;justify-content:center;flex:1;min-width:160px;">
                    <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748B;margin-bottom:6px;">Current Access</div>
                    <div style="display:inline-flex;align-items:center;gap:5px;padding:0.3rem 0.8rem;border-radius:50px;font-size:0.8rem;background:${user.role === reg.assignedToRole ? 'var(--primary)' : '#E2E8F0'};color:${user.role === reg.assignedToRole ? 'white' : '#475569'};font-weight:600;width:fit-content;">
                      ${user.role === reg.assignedToRole ? `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
                      ${reg.assignedToRole || 'Admin'}${reg.assignedToAdminName ? ' (' + reg.assignedToAdminName + ')' : ''}
                    </div>
                  </div>`;
              }
            })()}
          </div>

          <!-- Details Grid -->
          <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:1rem; border-radius:8px; display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:0.75rem;">
            ${docsHtml}
          </div>

          ${forwardAttachmentsHtml}
          ${forwardNotesHtml}

          ${(() => {
            const verifiedByList = Array.isArray(reg.verifiedBy) ? reg.verifiedBy : (reg.verifiedBy ? [reg.verifiedBy] : []);
            return verifiedByList.length > 0 ? `
            <div style="background:rgba(16,185,129,0.05); border:1px solid rgba(16,185,129,0.15); padding:0.85rem 1rem; border-radius:8px;">
              <div style="display:flex; align-items:center; gap:0.4rem; margin-bottom:0.5rem;">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#059669" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#059669;">Verification History (${verifiedByList.length})</span>
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:0.35rem;">
                ${verifiedByList.map(v => `<span style="display:inline-flex; align-items:center; background:#10B981; color:white; padding:3px 9px; border-radius:50px; font-size:0.72rem; font-weight:600;"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>${v.name} (${v.role})</span>`).join('')}
              </div>
            </div>` : '';
          })()}

          ${reg.status === 'issue_reported' ? `
            <div style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); padding:0.85rem 1rem; border-radius:8px; display:flex; flex-direction:column; gap:0.4rem;">
              <div style="display:flex; align-items:center; gap:0.4rem; font-weight:700; color:#B91C1C; font-size:0.88rem;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                Issue Reported
              </div>
              <div style="background:white; padding:0.65rem 0.85rem; border-radius:6px; border:1px solid rgba(239,68,68,0.1); color:#7F1D1D; font-size:0.83rem; line-height:1.45;">${reg.issueText}</div>
            </div>` : ''}

          ${(user.role === 'Secretary' || user.role === 'President') && ['pending', 'verified', 'issue_reported'].includes(currentRegFilter) ? `
            <div style="display:flex; flex-wrap:wrap; gap:0.6rem; justify-content:flex-end; border-top:1px solid #F1F5F9; padding-top:0.85rem; margin-top:0.25rem;">
              <button onclick="window.updateRegStatus('${reg.type}', '${reg._id}', 'accepted')" style="flex:1; min-width:110px; padding:0.6rem 1rem; background:var(--success); color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600; font-size:0.875rem; transition:all 0.2s;" onmouseover="this.style.opacity='0.88'" onmouseout="this.style.opacity='1'">✓ Final Accept</button>
              <button onclick="window.updateRegStatus('${reg.type}', '${reg._id}', 'rejected')" style="flex:1; min-width:110px; padding:0.6rem 1rem; background:white; color:var(--danger); border:1px solid var(--danger); border-radius:6px; cursor:pointer; font-weight:600; font-size:0.875rem; transition:all 0.2s;" onmouseover="this.style.background='var(--danger)'; this.style.color='white'" onmouseout="this.style.background='white'; this.style.color='var(--danger)'">✕ Final Reject</button>
              <button onclick="window.openForwardModal('${reg.type}', '${reg._id}')" style="flex:1; min-width:110px; padding:0.6rem 1rem; background:#3B82F6; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600; font-size:0.875rem; transition:all 0.2s;" onmouseover="this.style.opacity='0.88'" onmouseout="this.style.opacity='1'">→ Forward</button>
              <button onclick="window.deleteRegistration('${reg.type}', '${reg._id}', '${reg.fullName.replace(/'/g, "&apos;")}')" style="padding:0.6rem 1rem; background:white; color:#DC2626; border:1.5px solid #DC2626; border-radius:6px; cursor:pointer; font-weight:600; font-size:0.875rem; transition:all 0.2s; display:inline-flex; align-items:center; gap:5px;" onmouseover="this.style.background='#DC2626'; this.style.color='white'" onmouseout="this.style.background='white'; this.style.color='#DC2626'"><svg xmlns='http://www.w3.org/2000/svg' width='13' height='13' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='3 6 5 6 21 6'/><path d='M19 6l-1 14H6L5 6'/><path d='M10 11v6'/><path d='M14 11v6'/><path d='M9 6V4h6v2'/></svg>Delete</button>
            </div>` : ''}

          ${(user.role === 'Secretary' || user.role === 'President') && ['accepted', 'rejected'].includes(currentRegFilter) ? `
            <div style="display:flex; flex-wrap:wrap; gap:0.6rem; justify-content:flex-end; border-top:1px solid #F1F5F9; padding-top:0.85rem; margin-top:0.25rem;">
              <button onclick="window.deleteRegistration('${reg.type}', '${reg._id}', '${reg.fullName.replace(/'/g, "&apos;")}')" style="padding:0.6rem 1.1rem; background:white; color:#DC2626; border:1.5px solid #DC2626; border-radius:6px; cursor:pointer; font-weight:600; font-size:0.875rem; transition:all 0.2s; display:inline-flex; align-items:center; gap:6px;" onmouseover="this.style.background='#DC2626'; this.style.color='white'" onmouseout="this.style.background='white'; this.style.color='#DC2626'"><svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='3 6 5 6 21 6'/><path d='M19 6l-1 14H6L5 6'/><path d='M10 11v6'/><path d='M14 11v6'/><path d='M9 6V4h6v2'/></svg>Delete Application</button>
            </div>` : ''}

          ${user.role !== 'Secretary' && user.role !== 'President' && currentRegFilter === 'forwarded' && user.role === reg.assignedToRole ? `
            <div style="display:flex; flex-wrap:wrap; gap:0.6rem; justify-content:flex-end; border-top:1px solid #F1F5F9; padding-top:0.85rem; margin-top:0.25rem;">
              <button onclick="window.openReportIssueModal('${reg.type}', '${reg._id}')" style="flex:1; min-width:120px; padding:0.6rem 1rem; background:white; color:#EF4444; border:1px solid #EF4444; border-radius:6px; cursor:pointer; font-weight:600; font-size:0.875rem; transition:all 0.2s;" onmouseover="this.style.background='#EF4444'; this.style.color='white'" onmouseout="this.style.background='white'; this.style.color='#EF4444'">⚠ Report Issue</button>
              <button onclick="window.openVerifyForwardModal('${reg.type}', '${reg._id}')" style="flex:1; min-width:120px; padding:0.6rem 1rem; background:var(--success); color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600; font-size:0.875rem; transition:all 0.2s;" onmouseover="this.style.opacity='0.88'" onmouseout="this.style.opacity='1'">✓ Verify & Forward</button>
            </div>` : ''}
        </div>
      `;
    }).join('');
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
          ${m.reply && m.reply.replyText ? `
            <div style="margin-top: 0.85rem; padding: 1rem; background: #F0FDF4; border: 1px solid #BBF7D0; border-left: 4px solid #16A34A; border-radius: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.4rem;">
                <span style="font-size: 0.85rem; font-weight: 700; color: #15803D; display: flex; align-items: center; gap: 6px;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                  Reply from ${m.reply.senderName} (${m.reply.senderRole})
                </span>
                <span style="font-size: 0.75rem; color: #166534; font-weight: 500;">
                  ${m.reply.createdAt ? new Date(m.reply.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              <div style="font-size: 0.9rem; color: #1E293B; white-space: pre-wrap; line-height: 1.5;">
                ${m.reply.replyText}
              </div>
              ${m.reply.attachments && m.reply.attachments.length > 0 ? `
                <div style="margin-top: 0.5rem; font-size: 0.8rem; display: flex; flex-wrap: wrap; gap: 0.5rem;">
                  ${m.reply.attachments.map((att, idx) => {
                    const url = typeof att === 'object' ? att.url : att;
                    const name = typeof att === 'object' && att.name ? att.name : `Attachment ${idx + 1}`;
                    return `<a href="${url}" target="_blank" style="color: #15803D; text-decoration: underline; font-weight: 600; font-size: 0.8rem;">📎 ${name}</a>`;
                  }).join(' ')}
                </div>` : ''}
              <div style="margin-top: 0.65rem; display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 0.72rem; font-weight: 700; color: #15803D; background: rgba(22,163,74,0.15); padding: 3px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px;">
                  🔒 Thread Closed (1/1 Reply Used)
                </span>
              </div>
            </div>
          ` : `
            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #F1F5F9; display: flex; flex-direction: column; gap: 0.75rem;">
              <button onclick="window.toggleAdminReplyForm('${m._id}')" style="align-self: flex-start; background: #F3F4F6; color: #374151; border: 1px solid #D1D5DB; padding: 0.4rem 0.9rem; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: all 0.2s;" onmouseover="this.style.background='var(--primary)'; this.style.color='white';" onmouseout="this.style.background='#F3F4F6'; this.style.color='#374151';">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                Reply (1 Option Available)
              </button>

              <form id="replyForm_${m._id}" onsubmit="window.submitAdminReply(event, '${m._id}')" style="display: none; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 1rem; border-radius: 8px; flex-direction: column; gap: 0.75rem;">
                <div style="font-size: 0.82rem; font-weight: 700; color: var(--primary);">
                  Send Final Reply to ${m.senderName} (Thread will be closed after this reply)
                </div>
                <textarea id="replyText_${m._id}" required rows="3" placeholder="Write your response..." style="width: 100%; padding: 0.6rem 0.75rem; border: 1px solid #CBD5E1; border-radius: 6px; font-family: inherit; font-size: 0.88rem; outline: none; resize: vertical;"></textarea>
                
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                  <input type="file" id="replyFile_${m._id}" multiple style="font-size: 0.78rem; color: #64748B;">
                  <div style="display: flex; gap: 0.5rem;">
                    <button type="button" onclick="window.toggleAdminReplyForm('${m._id}')" style="padding: 0.4rem 0.85rem; background: #E2E8F0; color: #475569; border: none; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer;">Cancel</button>
                    <button type="submit" id="replySubmitBtn_${m._id}" style="padding: 0.4rem 1rem; background: var(--primary); color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                      Send Reply & Close Thread
                    </button>
                  </div>
                </div>
              </form>
            </div>
          `}
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
        alert(data.message || 'Reply sent successfully! Message thread is now closed.');
        fetchAdminMessages();
      } else {
        alert(data.error || 'Failed to send reply');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.style.opacity = '1';
          submitBtn.textContent = 'Send Reply & Close Thread';
        }
      }
    } catch (err) {
      console.error('Error submitting reply:', err);
      alert('An error occurred while sending reply');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.textContent = 'Send Reply & Close Thread';
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
