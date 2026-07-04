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
  const dashboardSection = document.getElementById('dashboardSection');
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

  const pendingBtn = document.querySelector('.reg-filter-btn[data-filter="pending"]');
  const forwardedBtn = document.querySelector('.reg-filter-btn[data-filter="forwarded"]');
  
  if (user && user.role !== 'Secretary') {
    if (pendingBtn) {
      pendingBtn.style.display = 'none';
      pendingBtn.classList.remove('active');
      pendingBtn.style.background = 'white';
      pendingBtn.style.color = 'var(--text-main)';
    }
    if (forwardedBtn) {
      forwardedBtn.classList.add('active');
      forwardedBtn.style.background = 'var(--primary)';
      forwardedBtn.style.color = 'white';
      currentRegFilter = 'forwarded';
    }
  }

  navDashboard.addEventListener('click', (e) => {
    e.preventDefault();
    navDashboard.classList.add('active');
    navRegistrations.classList.remove('active');
    if (dashboardSection) dashboardSection.style.display = 'block';
    registrationsSection.style.display = 'none';
  });

  navRegistrations.addEventListener('click', (e) => {
    e.preventDefault();
    navRegistrations.classList.add('active');
    navDashboard.classList.remove('active');
    if (dashboardSection) dashboardSection.style.display = 'none';
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
      const linkStyle = "display:inline-flex; align-items:center; color:var(--primary); text-decoration:none; font-weight:600; font-size:0.8rem; background:rgba(27,67,50,0.08); padding:4px 10px; border-radius:6px; margin-right:6px; transition:all 0.2s;";
      const linkHover = "onmouseover=\"this.style.background='var(--primary)'; this.style.color='white'\" onmouseout=\"this.style.background='rgba(27,67,50,0.08)'; this.style.color='var(--primary)'\"";
      
      const formatLabel = (label) => `<span style="color:#6B7280; font-weight:500; margin-right:8px; font-size:0.85rem;">${label}</span>`;
      
      if (isVol) {
        docsHtml += `<div style="display:flex; align-items:center;">${formatLabel('ID Proofs:')} ${reg.idProofs && reg.idProofs.length ? reg.idProofs.map(p => `<a href="${p}" target="_blank" style="${linkStyle}" ${linkHover}>View</a>`).join('') : '<span style="color:#9CA3AF; font-size:0.85rem;">None</span>'}</div>`;
        docsHtml += `<div style="display:flex; align-items:center;">${formatLabel('Address Proofs:')} ${reg.addressProofs && reg.addressProofs.length ? reg.addressProofs.map(p => `<a href="${p}" target="_blank" style="${linkStyle}" ${linkHover}>View</a>`).join('') : '<span style="color:#9CA3AF; font-size:0.85rem;">None</span>'}</div>`;
      } else {
        docsHtml += `<div style="display:flex; align-items:center;">${formatLabel('PAN Card:')} ${reg.panCard ? `<a href="${reg.panCard}" target="_blank" style="${linkStyle}" ${linkHover}>View</a>` : '<span style="color:#9CA3AF; font-size:0.85rem;">None</span>'}</div>`;
        docsHtml += `<div style="display:flex; align-items:center;">${formatLabel('Aadhar Card:')} ${reg.aadharCard ? `<a href="${reg.aadharCard}" target="_blank" style="${linkStyle}" ${linkHover}>View</a>` : '<span style="color:#9CA3AF; font-size:0.85rem;">None</span>'}</div>`;
        docsHtml += `<div style="display:flex; align-items:center;">${formatLabel('DOB Proof:')} ${reg.dobProof ? `<a href="${reg.dobProof}" target="_blank" style="${linkStyle}" ${linkHover}>View</a>` : '<span style="color:#9CA3AF; font-size:0.85rem;">None</span>'}</div>`;
        docsHtml += `<div style="display:flex; align-items:center;">${formatLabel('Education Docs:')} ${reg.educationDocs && reg.educationDocs.length ? reg.educationDocs.map(p => `<a href="${p}" target="_blank" style="${linkStyle}" ${linkHover}>View</a>`).join('') : '<span style="color:#9CA3AF; font-size:0.85rem;">None</span>'}</div>`;
      }

      return `
        <div style="background: white; border: 1px solid #E5E7EB; border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06); transition: box-shadow 0.3s ease, transform 0.3s ease;"
             onmouseover="this.style.boxShadow='0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'; this.style.transform='translateY(-2px)'"
             onmouseout="this.style.boxShadow='0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'; this.style.transform='translateY(0)'">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
            <div style="display: flex; gap: 1.25rem; align-items: center;">
              ${reg.photo ? `<img src="${reg.photo}" alt="Photo" style="width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid white; box-shadow: 0 0 0 2px var(--primary);" />` : `<div style="width: 64px; height: 64px; border-radius: 50%; background: #F3F4F6; color: #9CA3AF; font-size: 0.8rem; font-weight: 500; display: flex; align-items:center; justify-content:center; border: 2px solid white; box-shadow: 0 0 0 2px #D1D5DB;">No Photo</div>`}
              <div>
                <h3 style="margin: 0 0 0.35rem 0; font-size: 1.2rem; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 0.75rem;">
                  ${reg.fullName} 
                  <span style="font-size: 0.7rem; font-weight: 700; padding: 4px 10px; border-radius: 20px; background: rgba(59, 130, 246, 0.1); color: #2563EB; text-transform: uppercase; letter-spacing: 0.5px;">${reg.type}</span>
                </h3>
                <div style="font-size: 0.9rem; color: #4B5563; display: flex; align-items: center; gap: 0.5rem;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                  ${reg.email} 
                  <span style="color: #D1D5DB;">|</span> 
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                  ${reg.phone}
                </div>
                <div style="font-size: 0.8rem; color: #9CA3AF; margin-top: 6px; display: flex; align-items: center; gap: 0.35rem;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  Applied: ${new Date(reg.date).toLocaleString()}
                </div>
              </div>
            </div>
            <div style="text-align: right; background: #F8FAFC; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid #E2E8F0;">
              <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748B; margin-bottom: 6px;">Current Access</div>
              <div style="display: inline-flex; align-items: center; gap: 6px; padding: 0.35rem 1rem; border-radius: 50px; font-size: 0.85rem; background: ${user.role === reg.assignedToRole ? 'var(--primary)' : '#E2E8F0'}; color: ${user.role === reg.assignedToRole ? 'white' : '#475569'}; font-weight: 600; box-shadow: ${user.role === reg.assignedToRole ? '0 2px 4px rgba(27,67,50,0.2)' : 'none'};">
                ${user.role === reg.assignedToRole ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                ${reg.assignedToRole}
              </div>
            </div>
          </div>
          
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 1.25rem; border-radius: 8px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
            ${docsHtml}
          </div>
          
          ${(currentRegFilter === 'pending' || currentRegFilter === 'forwarded') && user.role === reg.assignedToRole ? `
            <div style="display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 0.5rem; border-top: 1px solid #E5E7EB; padding-top: 1.25rem;">
              <button onclick="window.updateRegStatus('${reg.type}', '${reg._id}', 'accepted')" style="padding: 0.6rem 1.25rem; background: var(--success); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: all 0.2s; box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);" onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 6px rgba(16, 185, 129, 0.3)'" onmouseout="this.style.transform='none'; this.style.boxShadow='0 2px 4px rgba(16, 185, 129, 0.2)'">Accept</button>
              <button onclick="window.updateRegStatus('${reg.type}', '${reg._id}', 'rejected')" style="padding: 0.6rem 1.25rem; background: white; color: var(--danger); border: 1px solid var(--danger); border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: all 0.2s;" onmouseover="this.style.background='var(--danger)'; this.style.color='white'" onmouseout="this.style.background='white'; this.style.color='var(--danger)'">Reject</button>
              <button onclick="window.openForwardModal('${reg.type}', '${reg._id}')" style="padding: 0.6rem 1.25rem; background: #3B82F6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: all 0.2s; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);" onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 6px rgba(59, 130, 246, 0.3)'" onmouseout="this.style.transform='none'; this.style.boxShadow='0 2px 4px rgba(59, 130, 246, 0.2)'">Forward</button>
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
