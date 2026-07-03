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
    userAvatarEl.textContent = (user.fullName || 'A').charAt(0).toUpperCase();
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
            <div style="font-weight: 500; color: #111827;">${new Date(item.date).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'})}</div>
            <div style="font-size: 0.75rem; color: #6B7280;">${new Date(item.date).toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'})}</div>
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

  // --- Registrations Section Logic ---
  const ADMIN_ROLES = [
    'Executive Member',
    'President',
    'Office Secretary',
    'Secretary',
    'Board Member'
  ];

  const navDashboard = document.querySelector('.nav-item.active');
  const navRegistrations = document.getElementById('nav-registrations');
  const statsGrid = document.querySelector('.stats-grid');
  const donationsSection = document.querySelector('.data-section');
  const registrationsSection = document.getElementById('registrationsSection');
  const refreshRegBtn = document.getElementById('refreshRegBtn');
  const registrationsContainer = document.getElementById('registrationsContainer');
  const regFilterBtns = document.querySelectorAll('.reg-filter-btn');

  // Modal elements
  const forwardModal = document.getElementById('forwardModal');
  const forwardRoleSelect = document.getElementById('forwardRoleSelect');
  const cancelForwardBtn = document.getElementById('cancelForwardBtn');
  const confirmForwardBtn = document.getElementById('confirmForwardBtn');

  let allRegistrations = [];
  let currentRegFilter = 'pending';
  let currentForwardTarget = null; // { type, id }

  navDashboard.addEventListener('click', (e) => {
    e.preventDefault();
    navDashboard.classList.add('active');
    navRegistrations.classList.remove('active');
    statsGrid.style.display = 'grid';
    donationsSection.style.display = 'block';
    registrationsSection.style.display = 'none';
  });

  navRegistrations.addEventListener('click', (e) => {
    e.preventDefault();
    navRegistrations.classList.add('active');
    navDashboard.classList.remove('active');
    statsGrid.style.display = 'none';
    donationsSection.style.display = 'none';
    registrationsSection.style.display = 'block';
    fetchRegistrations();
  });

  regFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      regFilterBtns.forEach(b => {
        b.style.background = 'white';
        b.style.color = 'var(--text-main)';
        b.classList.remove('active');
      });
      btn.style.background = 'var(--primary)';
      btn.style.color = 'white';
      btn.classList.add('active');
      currentRegFilter = btn.getAttribute('data-filter');
      renderRegistrations();
    });
  });

  const fetchRegistrations = async () => {
    try {
      registrationsContainer.innerHTML = '<div style="padding: 2rem; text-align: center;"><div class="spinner"></div> Loading registrations...</div>';
      const data = await apiRequest('/api/admin/registrations');
      allRegistrations = data;
      renderRegistrations();
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
    
    // Populate select, exclude current user's role
    forwardRoleSelect.innerHTML = ADMIN_ROLES
      .filter(role => role !== user.role)
      .map(role => `<option value="${role}">${role}</option>`)
      .join('');
      
    forwardModal.style.display = 'flex';
  };

  cancelForwardBtn.addEventListener('click', () => {
    forwardModal.style.display = 'none';
    currentForwardTarget = null;
  });

  confirmForwardBtn.addEventListener('click', async () => {
    if (!currentForwardTarget) return;
    const newRole = forwardRoleSelect.value;
    const { type, id } = currentForwardTarget;
    
    try {
      const confirmBtn = confirmForwardBtn;
      const originalText = confirmBtn.textContent;
      confirmBtn.textContent = 'Forwarding...';
      confirmBtn.disabled = true;

      const res = await apiRequest(`/api/admin/registrations/${type}/${id}/forward`, {
        method: 'PATCH',
        body: JSON.stringify({ newRole })
      });

      if (res.success) {
        const index = allRegistrations.findIndex(r => r._id === id);
        if (index > -1) {
          allRegistrations[index].assignedToRole = newRole;
          allRegistrations[index].status = 'forwarded';
        }
        renderRegistrations();
        forwardModal.style.display = 'none';
      } else {
        alert(res.error || 'Failed to forward');
      }
    } catch (error) {
      console.error(error);
      alert('An error occurred');
    } finally {
      confirmForwardBtn.textContent = 'Forward';
      confirmForwardBtn.disabled = false;
    }
  });

  const renderRegistrations = () => {
    const filtered = allRegistrations.filter(r => (r.status || 'pending') === currentRegFilter);

    if (filtered.length === 0) {
      registrationsContainer.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-muted); background: white; border-radius: 8px; border: 1px solid var(--border);">No ${currentRegFilter} registrations found.</div>`;
      return;
    }

    registrationsContainer.innerHTML = filtered.map(reg => {
      const isVol = reg.type === 'volunteer';
      
      let docsHtml = '';
      if (isVol) {
        docsHtml += `<div><strong>ID Proofs:</strong> ${reg.idProofs && reg.idProofs.length ? reg.idProofs.map(p => `<a href="${p}" target="_blank" style="color:var(--accent); text-decoration:underline; margin-right:5px;">View</a>`).join('') : 'None'}</div>`;
        docsHtml += `<div><strong>Address Proofs:</strong> ${reg.addressProofs && reg.addressProofs.length ? reg.addressProofs.map(p => `<a href="${p}" target="_blank" style="color:var(--accent); text-decoration:underline; margin-right:5px;">View</a>`).join('') : 'None'}</div>`;
      } else {
        docsHtml += `<div><strong>PAN Card:</strong> ${reg.panCard ? `<a href="${reg.panCard}" target="_blank" style="color:var(--accent); text-decoration:underline;">View</a>` : 'None'}</div>`;
        docsHtml += `<div><strong>Aadhar Card:</strong> ${reg.aadharCard ? `<a href="${reg.aadharCard}" target="_blank" style="color:var(--accent); text-decoration:underline;">View</a>` : 'None'}</div>`;
        docsHtml += `<div><strong>DOB Proof:</strong> ${reg.dobProof ? `<a href="${reg.dobProof}" target="_blank" style="color:var(--accent); text-decoration:underline;">View</a>` : 'None'}</div>`;
        docsHtml += `<div><strong>Education Docs:</strong> ${reg.educationDocs && reg.educationDocs.length ? reg.educationDocs.map(p => `<a href="${p}" target="_blank" style="color:var(--accent); text-decoration:underline; margin-right:5px;">View</a>`).join('') : 'None'}</div>`;
      }

      return `
        <div style="background: white; border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="display: flex; gap: 1rem;">
              ${reg.photo ? `<img src="${reg.photo}" alt="Photo" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border);" />` : `<div style="width: 60px; height: 60px; border-radius: 50%; background: #eee; display: flex; align-items:center; justify-content:center;">No Photo</div>`}
              <div>
                <h3 style="margin-bottom: 0.25rem; font-size: 1.1rem;">${reg.fullName} <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; background: #E5E7EB; color: #4B5563; margin-left: 8px; text-transform: uppercase;">${reg.type}</span></h3>
                <div style="font-size: 0.875rem; color: var(--text-muted);">${reg.email} | ${reg.phone}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Applied: ${new Date(reg.date).toLocaleString()}</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 4px;">Current Access</div>
              <div style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 50px; font-size: 0.875rem; background: ${user.role === reg.assignedToRole ? 'var(--primary)' : '#E5E7EB'}; color: ${user.role === reg.assignedToRole ? 'white' : 'var(--text-main)'}; font-weight: 500;">
                ${reg.assignedToRole}
              </div>
            </div>
          </div>
          
          <div style="background: var(--bg-color); padding: 1rem; border-radius: 6px; font-size: 0.875rem; line-height: 1.5; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            ${docsHtml}
          </div>
          
          ${(currentRegFilter === 'pending' || currentRegFilter === 'forwarded') && user.role === reg.assignedToRole ? `
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem; border-top: 1px solid var(--border); padding-top: 1rem;">
              <button onclick="window.updateRegStatus('${reg.type}', '${reg._id}', 'accepted')" style="padding: 0.5rem 1rem; background: var(--success); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">Accept</button>
              <button onclick="window.updateRegStatus('${reg.type}', '${reg._id}', 'rejected')" style="padding: 0.5rem 1rem; background: var(--danger); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">Reject</button>
              <button onclick="window.openForwardModal('${reg.type}', '${reg._id}')" style="padding: 0.5rem 1rem; background: #3B82F6; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">Forward</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  };

  // Expose to window for inline onclick handlers
  window.updateRegStatus = updateRegistrationStatus;
  window.openForwardModal = openForwardModal;

  refreshRegBtn.addEventListener('click', fetchRegistrations);
});
