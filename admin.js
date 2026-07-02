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
      tableBody.innerHTML = `<tr><td colspan="7" class="loading"><div class="spinner"></div> Refreshing data...</td></tr>`;

      const data = await apiRequest('/api/donations');

      const totalAmount = data.reduce((sum, item) => sum + (item.amount || 0), 0);
      const totalDonors = data.length;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentCount = data.filter(item => new Date(item.date) >= sevenDaysAgo).length;

      totalAmountEl.textContent = formatCurrency(totalAmount);
      totalDonorsEl.textContent = totalDonors;
      recentCountEl.textContent = `${recentCount} (Last 7 days)`;

      if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 3rem; color: #6B7280;">No donations found yet.</td></tr>`;
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
        </tr>
      `).join('');

    } catch (error) {
      console.error(error);
      if (error.message === 'Authentication required' || error.message === 'Invalid or expired token') {
        clearAuthSession();
        window.location.href = 'admin-login.html';
        return;
      }
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: #EF4444;">Error loading data. Is the backend server running?</td></tr>`;
    }
  };

  refreshBtn.addEventListener('click', fetchDonations);
  fetchDonations();
});
