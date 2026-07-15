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

  // --- Registrations Section Logic ---
  const ADMIN_ROLES = [
    'Executive Member',
    'President',
    'Office Secretary',
    'Secretary',
    'Program Incharge',
    'Treasurer',
    'Communication Public Relations Officer'
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
  const cancelForwardBtn = document.getElementById('cancelForwardBtn');
  const confirmForwardBtn = document.getElementById('confirmForwardBtn');

  let allRegistrations = [];
  let currentRegFilter = 'pending';
  let currentSort = 'latest';
  let currentForwardTarget = null; // { type, id }
  
  const regSortSelect = document.getElementById('regSortSelect');
  if (regSortSelect) {
    regSortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderRegistrations();
    });
  }

  const pendingBtn = document.getElementById('nav-pending');
  const forwardedBtn = document.getElementById('nav-forwarded');

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
        const filterName = currentRegFilter.replace('_', ' ');
        headerTitle.textContent = filterName.charAt(0).toUpperCase() + filterName.slice(1) + ' Registrations';
      }
      
      renderRegistrations();

    });
  });

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

      // Verified badge — applications that completed the review chain, awaiting Secretary's final decision
      const verifiedCount = allRegistrations.filter(r => r.status === 'verified').length;
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
      const forwardedCount = allRegistrations.filter(r => r.status === 'forwarded' && r.assignedToRole === user.role).length;
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
    const { type, id } = currentForwardTarget;

    try {
      const confirmBtn = confirmForwardBtn;
      const originalText = confirmBtn.textContent;
      confirmBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.4);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></span> Forwarding...</span>';
      confirmBtn.disabled = true;

      // Build FormData to support file attachments
      const formData = new FormData();
      formData.append('newRole', newRole);
      if (typeof forwardSelectedFiles !== 'undefined' && forwardSelectedFiles.length > 0) {
        forwardSelectedFiles.forEach(file => formData.append('attachments', file));
      }

      const token = getAuthToken(); // Use the global function from admin-auth.js
      const response = await fetch(`http://localhost:3000/api/admin/registrations/${type}/${id}/forward`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const res = await response.json();

      if (res.success) {
        const index = allRegistrations.findIndex(r => r._id === id);
        if (index > -1) {
          allRegistrations[index].assignedToRole = newRole;
          allRegistrations[index].status = 'forwarded';
          if (res.data && res.data.forwardAttachments) {
            allRegistrations[index].forwardAttachments = res.data.forwardAttachments;
          }
        }
        renderRegistrations();
        updateSidebarBadges();
        forwardModal.style.display = 'none';
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
    let filtered = allRegistrations.filter(r => (r.status || 'pending') === currentRegFilter);

    // Apply sort
    filtered.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return currentSort === 'oldest' ? dateA - dateB : dateB - dateA;
    });

    if (filtered.length === 0) {
      registrationsContainer.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-muted); background: white; border-radius: 8px; border: 1px solid var(--border);">No ${currentRegFilter} registrations found.</div>`;
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

      return `
        <div style="background: white; border: 1px solid #E5E7EB; border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06); transition: box-shadow 0.3s ease, transform 0.3s ease;"
             onmouseover="this.style.boxShadow='0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'; this.style.transform='translateY(-2px)'"
             onmouseout="this.style.boxShadow='0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'; this.style.transform='translateY(0)'">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
            <div style="display: flex; gap: 1.25rem; align-items: center;">
              ${reg.photo
                ? `<div style="position:relative; width:64px; height:64px; flex-shrink:0; cursor:pointer;" onclick="window.openPhotoLightbox('${reg.photo.replace(/'/g, "&apos;")}', '${reg.fullName.replace(/'/g, "&apos;")}')"
                     title="Click to view full photo">
                    <img src="${reg.photo}" alt="Photo" style="width:64px; height:64px; border-radius:50%; object-fit:cover; border:2px solid white; box-shadow:0 0 0 2px var(--primary); display:block; transition:filter 0.2s;" />
                    <div style="position:absolute; inset:0; border-radius:50%; background:rgba(0,0,0,0); display:flex; align-items:center; justify-content:center; transition:background 0.2s;"
                         onmouseover="this.style.background='rgba(0,0,0,0.38)'; this.previousElementSibling.style.filter='brightness(0.7)'"
                         onmouseout="this.style.background='rgba(0,0,0,0)'; this.previousElementSibling.style.filter='none'">
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0; transition:opacity 0.2s;"
                           onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0'">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                      </svg>
                    </div>
                  </div>`
                : `<div style="width:64px; height:64px; border-radius:50%; background:#F3F4F6; color:#9CA3AF; font-size:0.8rem; font-weight:500; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 0 0 2px #D1D5DB; flex-shrink:0;">No Photo</div>`}
              <div>
                <h3 style="margin: 0 0 0.35rem 0; font-size: 1.2rem; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 0.75rem;">
                  ${index + 1}. ${reg.fullName} 
                  <span style="font-size: 0.7rem; font-weight: 700; padding: 4px 10px; border-radius: 20px; background: rgba(59, 130, 246, 0.1); color: #2563EB; text-transform: uppercase; letter-spacing: 0.5px;">${reg.type}</span>
                </h3>
                <div style="font-size: 0.9rem; color: #4B5563; display: flex; align-items: center; gap: 0.5rem;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                  ${reg.email} 
                  <span style="color: #D1D5DB;">|</span> 
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                  ${reg.phone}
                </div>
              </div>
            </div>
            
            <div style="display: flex; gap: 1rem; align-items: stretch; flex-wrap: wrap; justify-content: flex-end;">
              <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; background: #F0FDF4; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid #BBF7D0;">
                <span style="font-size: 0.7rem; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px;">Applied On</span>
                <div style="display: flex; align-items: center; gap: 6px; font-weight: 600; color: #15803D; font-size: 0.9rem;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  ${new Date(reg.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  <span style="color: #86EFAC; margin: 0 2px;">|</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  ${new Date(reg.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>

              ${(() => {
                const isSecretaryForwardedView = (user.role === 'Secretary' || user.role === 'President') && currentRegFilter === 'forwarded';
                if (isSecretaryForwardedView) {
                  // Build the Review Chain: verified roles (✓ green) + current in-progress role (⏳ amber)
                  // Normalize verifiedBy — old DB docs may have a plain object instead of an array
                  const verifiedList = Array.isArray(reg.verifiedBy) ? reg.verifiedBy : (reg.verifiedBy ? [reg.verifiedBy] : []);
                  const verifiedRoleNames = verifiedList.map(v => v.role);
                  const currentRole = reg.assignedToRole;

                  const checkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>`;
                  const clockSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
                  const arrowSpan = `<span style="color:#CBD5E1;font-size:0.75rem;line-height:1;">→</span>`;

                  const chainParts = verifiedList.map(v =>
                    `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 9px;border-radius:20px;background:#10B981;color:white;font-size:0.7rem;font-weight:700;white-space:nowrap;">${checkSvg}${v.role}</span>`
                  );

                  // Show current assignedToRole if it's not Secretary/President (still with an intermediate reviewer)
                  const isCurrentIntermediate = currentRole && currentRole !== 'Secretary' && currentRole !== 'President';
                  if (isCurrentIntermediate) {
                    chainParts.push(`<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 9px;border-radius:20px;background:#F59E0B;color:white;font-size:0.7rem;font-weight:700;white-space:nowrap;">${clockSvg}${currentRole}</span>`);
                  }

                  const chainHtml = chainParts.reduce((acc, part, i) => {
                    return i === 0 ? part : acc + arrowSpan + part;
                  }, '');

                  return `
                    <div style="background:#F8FAFC;padding:0.75rem 1rem;border-radius:8px;border:1px solid #E2E8F0;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;min-width:0;">
                      <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748B;margin-bottom:8px;">Review Chain</div>
                      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;justify-content:flex-end;row-gap:4px;">
                        ${chainHtml || `<span style="color:#9CA3AF;font-size:0.8rem;">Pending review</span>`}
                      </div>
                    </div>
                  `;
                } else {
                  return `
                    <div style="text-align:right;background:#F8FAFC;padding:0.75rem 1rem;border-radius:8px;border:1px solid #E2E8F0;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;">
                      <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748B;margin-bottom:6px;">Current Access</div>
                      <div style="display:inline-flex;align-items:center;gap:6px;padding:0.35rem 1rem;border-radius:50px;font-size:0.85rem;background:${user.role === reg.assignedToRole ? 'var(--primary)' : '#E2E8F0'};color:${user.role === reg.assignedToRole ? 'white' : '#475569'};font-weight:600;box-shadow:${user.role === reg.assignedToRole ? '0 2px 4px rgba(27,67,50,0.2)' : 'none'};">
                        ${user.role === reg.assignedToRole ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                        ${reg.assignedToRole}
                      </div>
                    </div>
                  `;
                }
              })()}
            </div>
          </div>
          
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 1.25rem; border-radius: 8px; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
            ${docsHtml}
          </div>
          ${forwardAttachmentsHtml}
          
          ${(() => {
            // Normalize verifiedBy — old DB docs may store a plain object instead of an array
            const verifiedByList = Array.isArray(reg.verifiedBy) ? reg.verifiedBy : (reg.verifiedBy ? [reg.verifiedBy] : []);
            return verifiedByList.length > 0 ? `
            <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.15); padding: 1rem 1.25rem; border-radius: 8px; margin-top: 1rem;">
              <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.6rem;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#059669" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#059669;">Verification History (${verifiedByList.length})</span>
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">
                ${verifiedByList.map(v => `<span style="display:inline-flex; align-items:center; background:#10B981; color:white; padding:4px 10px; border-radius:50px; font-size:0.75rem; font-weight:600;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg> ${v.name} (${v.role})</span>`).join('')}
              </div>
            </div>
          ` : '';
          })()}

          ${reg.status === 'issue_reported' ? `
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); padding: 1rem; border-radius: 8px; margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem; color: #B91C1C; font-weight: 500; font-size: 0.9rem;">
              <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 700;">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                Issue Reported
              </div>
              <div style="background: white; padding: 0.75rem; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.1); color: #7F1D1D; font-size: 0.85rem; line-height: 1.4;">
                ${reg.issueText}
              </div>
            </div>
          ` : ''}
          
          ${(user.role === 'Secretary' || user.role === 'President') && ['pending', 'forwarded', 'verified', 'issue_reported'].includes(currentRegFilter) ? `
            <div style="display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 0.5rem; border-top: 1px solid #E5E7EB; padding-top: 1.25rem;">
              <button onclick="window.updateRegStatus('${reg.type}', '${reg._id}', 'accepted')" style="padding: 0.6rem 1.25rem; background: var(--success); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: all 0.2s; box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);" onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 6px rgba(16, 185, 129, 0.3)'" onmouseout="this.style.transform='none'; this.style.boxShadow='0 2px 4px rgba(16, 185, 129, 0.2)'">Final Accept</button>
              <button onclick="window.updateRegStatus('${reg.type}', '${reg._id}', 'rejected')" style="padding: 0.6rem 1.25rem; background: white; color: var(--danger); border: 1px solid var(--danger); border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: all 0.2s;" onmouseover="this.style.background='var(--danger)'; this.style.color='white'" onmouseout="this.style.background='white'; this.style.color='var(--danger)'">Final Reject</button>
              <button onclick="window.openForwardModal('${reg.type}', '${reg._id}')" style="padding: 0.6rem 1.25rem; background: #3B82F6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: all 0.2s; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);" onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 6px rgba(59, 130, 246, 0.3)'" onmouseout="this.style.transform='none'; this.style.boxShadow='0 2px 4px rgba(59, 130, 246, 0.2)'">Forward</button>
            </div>
          ` : ''}

          ${user.role !== 'Secretary' && user.role !== 'President' && currentRegFilter === 'forwarded' && user.role === reg.assignedToRole ? `
            <div style="display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 0.5rem; border-top: 1px solid #E5E7EB; padding-top: 1.25rem;">
              <button onclick="window.openReportIssueModal('${reg.type}', '${reg._id}')" style="padding: 0.6rem 1.25rem; background: white; color: #EF4444; border: 1px solid #EF4444; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: all 0.2s;" onmouseover="this.style.background='#EF4444'; this.style.color='white'" onmouseout="this.style.background='white'; this.style.color='#EF4444'">Report Issue</button>
              <button onclick="window.openVerifyForwardModal('${reg.type}', '${reg._id}')" style="padding: 0.6rem 1.25rem; background: var(--success); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: all 0.2s; box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);" onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 6px rgba(16, 185, 129, 0.3)'" onmouseout="this.style.transform='none'; this.style.boxShadow='0 2px 4px rgba(16, 185, 129, 0.2)'">Verify & Forward</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  };

  // Expose to window for inline onclick handlers
  window.updateRegStatus = updateRegistrationStatus;
  window.openForwardModal = openForwardModal;

  const verifyForwardModal = document.getElementById('verifyForwardModal');
  const verifyForwardRoleSelect = document.getElementById('verifyForwardRoleSelect');
  const cancelVerifyForwardBtn = document.getElementById('cancelVerifyForwardBtn');
  const confirmVerifyForwardBtn = document.getElementById('confirmVerifyForwardBtn');
  let currentVerifyForwardTarget = null;

  window.openVerifyForwardModal = (type, id) => {
    currentVerifyForwardTarget = { type, id };
    
    // Populate select, exclude current user's role
    if (verifyForwardRoleSelect) {
      verifyForwardRoleSelect.innerHTML = ADMIN_ROLES
        .filter(role => role !== user.role)
        .map(role => `<option value="${role}">${role}</option>`)
        .join('');
    }

    if (verifyForwardModal) verifyForwardModal.style.display = 'flex';
  };

  if (cancelVerifyForwardBtn) {
    cancelVerifyForwardBtn.addEventListener('click', () => {
      if (verifyForwardModal) verifyForwardModal.style.display = 'none';
      currentVerifyForwardTarget = null;
    });
  }

  if (confirmVerifyForwardBtn) {
    confirmVerifyForwardBtn.addEventListener('click', async () => {
      if (!currentVerifyForwardTarget) return;
      const newRole = verifyForwardRoleSelect.value;
      
      confirmVerifyForwardBtn.innerHTML = 'Verifying...';
      confirmVerifyForwardBtn.disabled = true;

      try {
        const formData = new FormData();
        formData.append('newRole', newRole);
        if (typeof verifyForwardSelectedFiles !== 'undefined' && verifyForwardSelectedFiles.length > 0) {
          verifyForwardSelectedFiles.forEach(file => formData.append('attachments', file));
        }

        const token = getAuthToken();
        const response = await fetch(`http://localhost:3000/api/admin/registrations/${currentVerifyForwardTarget.type}/${currentVerifyForwardTarget.id}/verify_and_forward`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          alert('Successfully verified and forwarded!');
          if (verifyForwardModal) verifyForwardModal.style.display = 'none';
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
        const response = await fetch(`${API_URL}/api/admin/registrations/${currentIssueTarget.type}/${currentIssueTarget.id}/report-issue`, {
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

  window.fetchAdminGallery = function() {
    fetch(`${API_URL}/api/gallery`)
      .then(res => res.json())
      .then(photos => {
        const grid = document.getElementById('adminGalleryGrid');
        if (!grid) return;
        if (photos.length === 0) {
          grid.innerHTML = '<p>No photos found.</p>';
          return;
        }
        
        grid.innerHTML = photos.map(photo => `
          <div style="background:white; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.1); display:flex; flex-direction:column;">
            <img src="${photo.imageUrl}" alt="${photo.title}" style="width:100%; height:150px; object-fit:cover;">
            <div style="padding: 1rem; flex: 1; display:flex; flex-direction:column; gap:0.5rem;">
              <span style="background:var(--saffron); color:white; font-size:0.7rem; padding:0.2rem 0.6rem; border-radius:20px; align-self:flex-start;">${photo.category}</span>
              <h4 style="margin:0; font-size:1rem;">${photo.title}</h4>
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
      })
      .catch(err => console.error('Error fetching gallery:', err));
  }

  const uploadForm = document.getElementById('uploadPhotoForm');
  if(uploadForm) {
    uploadForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const title = document.getElementById('uploadTitle').value;
      const category = document.getElementById('uploadCategory').value;
      const featured = document.getElementById('uploadFeatured').checked;
      const file = document.getElementById('uploadFile').files[0];
      
      if (!file) return alert('Please select an image file');
      
      const formData = new FormData();
      formData.append('title', title);
      formData.append('category', category);
      formData.append('featured', featured);
      formData.append('photo', file);
      
      const progress = document.getElementById('uploadProgress');
      progress.style.display = 'block';
      
      fetch(`${API_URL}/api/gallery/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAuthToken()}` },
        body: formData
      })
      .then(res => res.json())
      .then(data => {
        progress.style.display = 'none';
        if (data.success) {
          alert('Photo uploaded successfully!');
          this.reset();
          fetchAdminGallery();
        } else {
          alert(data.error || 'Failed to upload photo');
        }
      })
      .catch(err => {
        progress.style.display = 'none';
        console.error(err);
        alert('An error occurred during upload');
      });
    });
  }

  window.toggleFeatured = function(id, featured) {
    fetch(`${API_URL}/api/gallery/${id}/featured`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}` 
      },
      body: JSON.stringify({ featured })
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
    
    fetch(`${API_URL}/api/gallery/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
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
  // --- Edit Profile Logic ---
  const editProfileModal = document.getElementById('editProfileModal');
  const openEditProfileBtn = document.getElementById('openEditProfileBtn');
  const cancelProfileBtn = document.getElementById('cancelProfileBtn');
  const saveProfileBtn = document.getElementById('saveProfileBtn');
  const editProfileName = document.getElementById('editProfileName');
  const editProfilePhone = document.getElementById('editProfilePhone');
  const otpSection = document.getElementById('otpSection');
  const sendOtpBtn = document.getElementById('sendOtpBtn');
  const otpInputGroup = document.getElementById('otpInputGroup');
  const editProfileOtp = document.getElementById('editProfileOtp');
  
  let originalPhone = '';

  if (openEditProfileBtn) {
    openEditProfileBtn.addEventListener('click', () => {
      const currentUser = getAuthUser();
      if (currentUser) {
        editProfileName.value = currentUser.fullName || '';
        // If current user is loaded but phone isn't in token payload, try to handle it.
        // But we added phone in the login response (if it's not there, it might be empty).
        // Since we didn't add phone to login token initially, we might not have it in getAuthUser() right away unless they relogin.
        editProfilePhone.value = currentUser.phone || '';
        originalPhone = currentUser.phone || '';
      }
      otpSection.style.display = 'none';
      otpInputGroup.style.display = 'none';
      editProfileOtp.value = '';
      if (editProfileModal) editProfileModal.style.display = 'flex';
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
        
        const response = await fetch(`${API_URL}/api/admin/profile/send-otp`, {
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
          sendOtpBtn.textContent = 'Send OTP to Gmail';
          sendOtpBtn.disabled = false;
        }
      } catch (err) {
        console.error(err);
        alert('Error sending OTP');
        sendOtpBtn.textContent = 'Send OTP to Gmail';
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

        const response = await fetch(`${API_URL}/api/admin/profile`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`
          },
          body: formData
        });
        const data = await response.json();

        if (data.success) {
          alert('Profile updated successfully!');
          if (data.token) localStorage.setItem('token', data.token);
          if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
          
          userNameEl.textContent = data.user.fullName || 'Admin';
          if (data.user.photo) {
            userAvatarEl.innerHTML = `<img src="${data.user.photo}" alt="Avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            userAvatarEl.style.backgroundColor = 'transparent';
          } else {
            userAvatarEl.innerHTML = (data.user.fullName || 'A').charAt(0).toUpperCase();
            userAvatarEl.style.backgroundColor = 'var(--accent)';
          }
          if (document.getElementById('dynamicGreeting')) {
            document.getElementById('dynamicGreeting').textContent = `Welcome back, ${data.user.fullName.split(' ')[0]}!`;
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

});
