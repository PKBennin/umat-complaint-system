// UMaT Campus Complaint Management System - admin.js (Admin Portal Controller)

const adminApp = {
  // Application State
  state: {
    complaints: [],
    activeAdminComplaintId: null,
    loggedStaff: null, // { email, staffId, roleKey, name, roleName }
    currentInboxFilter: 'all', // 'all', 'pending', 'active', 'resolved'
    currentWorkspaceTab: 'overview', // 'overview', 'comments', 'notes'
    charts: {} // ChartJS references
  },

  // Initialize Application
  init() {
    window.API.configure({ tokenKey: 'umat_staff_token' });
    this.loadTheme();
    this.populateLoginSelectors();
    this.checkStaffSession();
    this.startAdminLoginBackgroundCycle();

    // Default view routing based on session
    if (this.state.loggedStaff) {
      this.showDashboard();
      this.loadAndRender();
    } else {
      this.showLogin();
    }

    // Bind beforeunload warning for unsaved workstation inputs
    window.addEventListener('beforeunload', (e) => {
      if (this.isFormDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    if (window.lucide) lucide.createIcons();
  },

  // State Management (backend API).
  // loadState/saveState are retained as no-ops so existing call sites keep
  // working; complaint data now comes from refreshComplaints().
  loadState() { /* data is fetched from the API via refreshComplaints() */ },
  saveState() { /* persistence is handled server-side per mutation */ },

  // Pull the complaints in this staff member's jurisdiction from the backend.
  async refreshComplaints() {
    if (!this.state.loggedStaff) { this.state.complaints = []; return; }
    try {
      const sid = this.state.loggedStaff.staffId;
      this.state.complaints = await window.API.get(`/complaints/staff/${encodeURIComponent(sid)}`);
    } catch (err) {
      if (err.status === 401) { this.forceLogout(); return; }
      console.error('Failed to load complaints:', err);
      this.showToast(err.message || 'Could not load complaints.', 'error');
    }
  },

  // Refresh from the API, then re-render the workstation + analytics.
  async loadAndRender() {
    await this.refreshComplaints();
    this.renderWorkstationSidebar();
    this.renderAdminWorkspace();
    if (typeof this.renderAnalytics === 'function') this.renderAnalytics();
  },

  // Refresh, then re-apply a single mutation's result to the active views.
  async refreshAndRenderActive() {
    await this.refreshComplaints();
    this.renderWorkstationSidebar();
    this.renderAdminWorkspace();
  },

  forceLogout() {
    window.API.clearToken();
    localStorage.removeItem('current_staff_session');
    this.state.loggedStaff = null;
    this.state.activeAdminComplaintId = null;
    this.state.complaints = [];
    this.showToast('Your session has expired. Please sign in again.', 'warning');
    this.showLogin();
  },

  // Check Staff Session
  checkStaffSession() {
    const session = localStorage.getItem('current_staff_session');
    // A restored session is only valid if we still hold a JWT.
    if (session && !window.API.getToken()) {
      localStorage.removeItem('current_staff_session');
      return;
    }
    if (session) {
      try {
        this.state.loggedStaff = JSON.parse(session);
        this.updateStaffUI();
        
        // Initialize default scope based on staff type
        if (!this.state.analyticsScope) {
          if (this.state.loggedStaff.type === 'HOD') {
            this.state.analyticsScope = 'department';
          } else if (this.state.loggedStaff.type === 'Dean' || this.state.loggedStaff.type === 'Finance') {
            this.state.analyticsScope = 'faculty';
          } else {
            this.state.analyticsScope = 'university';
          }
        }
      } catch (e) {
        localStorage.removeItem('current_staff_session');
        this.state.loggedStaff = null;
      }
    }
  },

  // Update Staff Header and Session badge UI
  updateStaffUI() {
    const staff = this.state.loggedStaff;
    if (!staff) return;

    const nameEl = document.getElementById('logged-staff-name');
    if (nameEl) nameEl.textContent = `${staff.name} (${staff.portfolio})`;
    const badgeEl = document.getElementById('staff-session-badge');
    if (badgeEl) badgeEl.style.display = 'flex';
    const jurEl = document.getElementById('active-jurisdiction-name');
    if (jurEl) jurEl.textContent = staff.portfolio;
    const navEl = document.getElementById('main-nav');
    if (navEl) navEl.style.display = 'flex';

    // Populate profile widget values in the header
    const dbName = document.getElementById('db-profile-name');
    const dbRole = document.getElementById('db-profile-role');
    if (dbName) dbName.textContent = staff.name;
    if (dbRole) dbRole.textContent = staff.type;

    // Toggle Workstation Tab based on HOD status (HOD is analytics-only)
    const tabWorkstation = document.getElementById('nav-tab-workstation');
    if (staff.type === 'HOD') {
      if (tabWorkstation) tabWorkstation.style.display = 'none';
    } else {
      if (tabWorkstation) tabWorkstation.style.display = 'inline-flex';
    }
  },

  // Populate Login Autocomplete
  populateLoginSelectors() {
    const listContainer = document.getElementById('login-faculty-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    Object.keys(window.FACULTIES).forEach(key => {
      const name = window.FACULTIES[key];
      const div = document.createElement('div');
      div.className = 'autocomplete-item';
      div.textContent = name;
      div.onclick = (e) => {
        e.stopPropagation();
        this.selectFaculty(key, name);
      };
      listContainer.appendChild(div);
    });
  },

  filterFaculties() {
    const inputVal = document.getElementById('login-faculty-search').value.trim().toLowerCase();
    const listContainer = document.getElementById('login-faculty-list');
    if (!listContainer) return;

    if (!inputVal) {
      listContainer.style.display = 'none';
      this.state.selectedFacultyKey = null;
      return;
    }

    let matches = 0;
    const items = listContainer.querySelectorAll('.autocomplete-item');
    items.forEach(item => {
      const match = item.textContent.toLowerCase().includes(inputVal);
      item.style.display = match ? 'block' : 'none';
      if (match) matches++;
    });

    listContainer.style.display = matches > 0 ? 'block' : 'none';
  },

  showFacultiesList() {
    const listContainer = document.getElementById('login-faculty-list');
    if (listContainer) {
      listContainer.style.display = 'block';
      this.filterFaculties();
    }
  },

  selectFaculty(key, name) {
    const inputField = document.getElementById('login-faculty-search');
    const listContainer = document.getElementById('login-faculty-list');
    
    if (inputField) {
      inputField.value = name;
    }
    if (listContainer) {
      listContainer.style.display = 'none';
    }

    this.state.selectedFacultyKey = key;
  },

  closeAllAutocompletes() {
    const listContainer = document.getElementById('login-faculty-list');
    if (listContainer) {
      listContainer.style.display = 'none';
    }
  },

  // Staff Login Submit (backend JWT auth)
  async handleLoginSubmit(e) {
    if (e) e.preventDefault();

    const staffIdVal = document.getElementById('login-staff-id').value.trim();
    const passwordVal = document.getElementById('login-password').value.trim();

    if (!staffIdVal || !passwordVal) {
      this.showToast("Please fill out all fields.", "warning");
      return;
    }

    let result;
    try {
      result = await window.API.post('/auth/staff/login', { staff_id: staffIdVal, password: passwordVal });
    } catch (err) {
      this.showToast(err.message || 'Login failed. Check your staff ID and password.', 'error');
      return;
    }

    window.API.setToken(result.token);
    const staff = result.staff; // { staffId, name, email, type, facultyKey, department, portfolio }
    localStorage.setItem('current_staff_session', JSON.stringify(staff));
    this.state.loggedStaff = staff;

    // Set default analytics scope based on staff type
    if (staff.type === 'HOD') {
      this.state.analyticsScope = 'department';
    } else if (staff.type === 'Dean' || staff.type === 'Finance') {
      this.state.analyticsScope = 'faculty';
    } else {
      this.state.analyticsScope = 'university';
    }

    this.updateStaffUI();
    this.showDashboard();
    await this.loadAndRender();
    this.showToast(`Authenticated successfully as ${staff.name} (${staff.type}).`, "success");
  },

  // Staff Logout
  handleLogout() {
    if (!confirm("Are you sure you want to log out of the admin workstation?")) {
      return;
    }
    window.API.clearToken();
    localStorage.removeItem('current_staff_session');
    this.state.loggedStaff = null;
    this.state.activeAdminComplaintId = null;
    this.state.complaints = [];
    this.state.analyticsScope = null;
    this.state.selectedFacultyKey = null;

    document.getElementById('staff-session-badge').style.display = 'none';
    document.getElementById('main-nav').style.display = 'none';

    this.showLogin();
    this.showToast("Logged out from workstation.", "info");
  },

  // Navigation Controllers
  showLogin() {
    const header = document.querySelector('header');
    if (header) header.style.display = 'flex';
    document.body.classList.add('logged-out');
    document.getElementById('login-view').style.display = 'flex';
    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('staff-login-form').reset();
    const facultySearch = document.getElementById('login-faculty-search');
    if (facultySearch) facultySearch.value = '';
    this.state.selectedFacultyKey = null;
    if (window.lucide) lucide.createIcons();
  },

  showDashboard() {
    const header = document.querySelector('header');
    if (header) header.style.display = 'flex';
    document.body.classList.remove('logged-out');
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'block';
    
    // Switch between Workstation and Analytics based on HOD status
    if (this.state.loggedStaff && this.state.loggedStaff.type === 'HOD') {
      this.switchTab('analytics');
    } else {
      this.switchTab('workstation');
    }
    if (window.lucide) lucide.createIcons();
  },

  // Switch between Workstation and Analytics Tab Panels
  switchTab(tabName) {
    if (this.isFormDirty()) {
      if (!confirm("You have unsaved changes in your workstation. Are you sure you want to switch tabs?")) {
        return;
      }
    }
    // Remove active highlights
    document.querySelectorAll('#main-nav .nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dashboard-panel-view').forEach(p => p.classList.remove('active'));
    
    // Set active highlights
    document.getElementById(`nav-tab-${tabName}`).classList.add('active');
    document.getElementById(`panel-${tabName}`).classList.add('active');

    // Load reports close overlay
    this.closeSemesterReportView();

    // Trigger tab-specific renders
    if (tabName === 'workstation') {
      this.renderWorkstation();
    } else if (tabName === 'analytics') {
      this.renderAnalytics();
    }

    if (window.lucide) lucide.createIcons();
  },

  isFormDirty() {
    const note = document.getElementById('admin-new-note')?.value.trim();
    const directive = document.getElementById('admin-new-directive')?.value.trim();
    const apptFeedback = document.getElementById('appt-completion-feedback')?.value.trim();
    return !!(note || directive || apptFeedback);
  },

  // HOD WORKSTATION LOGIC
  setInboxFilter(filterName) {
    this.state.currentInboxFilter = filterName;
    document.querySelectorAll('.admin-sidebar-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`admin-tab-${filterName}`).classList.add('active');
    this.renderWorkstationSidebar();
  },

  handleSearch() {
    this.renderWorkstationSidebar();
  },

  renderWorkstation() {
    this.state.activeAdminComplaintId = null;
    this.renderWorkstationSidebar();
    this.renderAdminWorkspace();
  },

  renderWorkstationSidebar() {
    const inbox = document.getElementById('admin-inbox-list');
    if (!inbox || !this.state.loggedStaff) return;

    const staff = this.state.loggedStaff;

    // Filter complaints based on Dean / Finance / IT staff routing scopes
    this.loadState();
    let filtered = [];
    if (staff.type === 'Dean') {
      filtered = this.state.complaints.filter(c => 
        c.studentFacultyKey === staff.facultyKey && 
        c.routingDept === staff.department
      );
    } else if (staff.type === 'Finance') {
      filtered = this.state.complaints.filter(c => 
        c.studentFacultyKey === staff.facultyKey && 
        c.routingDept === 'finance_dept'
      );
    } else if (staff.type === 'IT') {
      filtered = this.state.complaints.filter(c => 
        c.routingDept === 'ict_dept'
      );
    }

    // Apply sidebar status filters
    if (this.state.currentInboxFilter === 'pending') {
      filtered = filtered.filter(c => c.status === 'Submitted');
    } else if (this.state.currentInboxFilter === 'active') {
      filtered = filtered.filter(c => c.status === 'Under Review' || c.status === 'In Progress');
    } else if (this.state.currentInboxFilter === 'resolved') {
      filtered = filtered.filter(c => c.status === 'Resolved' || c.status === 'Rejected');
    }

    // Apply search query filter if input is present
    const searchInput = document.getElementById('admin-search-input');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (query) {
      filtered = filtered.filter(c => 
        c.id.toLowerCase().includes(query) || 
        c.studentName.toLowerCase().includes(query)
      );
    }

    // Sort complaints by newest updated/resent first so that bumped/resent complaints go to the top
    filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    inbox.innerHTML = '';

    if (filtered.length === 0) {
      inbox.innerHTML = `
        <div class="no-complaints-fallback animate-fade-in">
          <i data-lucide="inbox"></i>
          <p>No complaints in this queue.</p>
        </div>
      `;
    } else {
      filtered.forEach(c => {
        const item = document.createElement('div');
        item.className = `complaint-list-item animate-fade-in ${this.state.activeAdminComplaintId === c.id ? 'active' : ''}`;
        item.onclick = () => {
          this.state.activeAdminComplaintId = c.id;
          document.querySelectorAll('.complaint-list-item').forEach(el => el.classList.remove('active'));
          item.classList.add('active');
          this.renderAdminWorkspace();
        };

        item.innerHTML = `
          <div class="item-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
            <span class="item-id" style="font-weight: 700; color: var(--accent);">${c.id}</span>
            <span class="item-date" style="font-size: 0.75rem; color: var(--text-muted);">${this.formatDate(c.createdAt)}</span>
          </div>
          <div class="item-subject" style="font-weight: 600; margin-bottom: 0.25rem;">${c.subject}</div>
          <div class="item-details" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-muted);">
            <span>${c.category === 'Harassment' ? 'Anonymous Student' : `${c.studentName} (${c.studentLevel}L)`}</span>
            <span class="badge badge-urgency-${c.urgency.toLowerCase()}">${c.urgency}</span>
          </div>
          <div style="margin-top: 0.35rem; display: flex; justify-content: flex-end;">
            <span class="badge badge-status-${c.status.replace(' ', '-').toLowerCase()}">${c.status}</span>
          </div>
        `;
        inbox.appendChild(item);
      });
    }

    if (window.lucide) lucide.createIcons();
  },

  setWorkspaceTab(tabName) {
    if (tabName === 'comments') {
      tabName = 'overview';
    }
    this.state.currentWorkspaceTab = tabName;
    document.querySelectorAll('.workspace-tab-btn').forEach(btn => btn.classList.remove('active'));
    const tabEl = document.getElementById(`ws-tab-${tabName}`);
    if (tabEl) tabEl.classList.add('active');

    document.querySelectorAll('.workspace-panel').forEach(p => p.classList.remove('active'));
    const panelEl = document.getElementById(`ws-panel-${tabName}`);
    if (panelEl) panelEl.classList.add('active');
  },

  renderAdminWorkspace() {
    const placeholder = document.getElementById('admin-workspace-placeholder');
    const content = document.getElementById('admin-workspace-content');

    if (!this.state.activeAdminComplaintId) {
      placeholder.style.display = 'flex';
      content.style.display = 'none';
      return;
    }

    placeholder.style.display = 'none';
    content.style.display = 'flex';

    this.loadState();
    const complaint = this.state.complaints.find(c => c.id === this.state.activeAdminComplaintId);
    if (!complaint) {
      placeholder.style.display = 'flex';
      content.style.display = 'none';
      return;
    }

    const staff = this.state.loggedStaff;

    // Populate Fields
    document.getElementById('admin-work-id').textContent = complaint.id;
    document.getElementById('admin-work-subject').textContent = complaint.subject;
    document.getElementById('admin-work-student-name').textContent = complaint.category === 'Harassment' ? "Anonymous Student" : complaint.studentName;
    document.getElementById('admin-work-student-index').textContent = complaint.category === 'Harassment' ? "Hidden (Confidential)" : complaint.studentIndex;
    document.getElementById('admin-work-student-dept').textContent = complaint.studentProgramme;
    document.getElementById('admin-work-student-level').textContent = (complaint.category === 'Harassment' ? "N/A" : (complaint.studentLevel || "N/A")) + " L";
    document.getElementById('admin-work-date').textContent = this.formatDate(complaint.createdAt);
    document.getElementById('admin-work-email').textContent = complaint.category === 'Harassment' ? "Hidden (Confidential)" : complaint.studentEmail;
    document.getElementById('admin-work-phone').textContent = complaint.category === 'Harassment' ? "Hidden (Confidential)" : (complaint.studentPhone || "N/A");
    document.getElementById('admin-work-owner').textContent = complaint.assignedTo || "Unassigned";
    document.getElementById('admin-work-desc').textContent = complaint.description;

    const adminAttRow = document.getElementById('admin-work-attachment-row');
    if (complaint.attachment) {
      adminAttRow.style.display = 'block';
      document.getElementById('admin-work-attachment-name').textContent = complaint.attachment.originalName;
      document.getElementById('admin-work-attachment-link').onclick = (ev) => {
        ev.preventDefault();
        window.downloadComplaintAttachment(complaint.id, complaint.attachment.originalName,
          (err) => this.showToast(err.message || 'Could not download the attachment.', 'error'));
      };
    } else {
      adminAttRow.style.display = 'none';
    }

    // Badges
    const statusB = document.getElementById('admin-work-status-badge');
    statusB.innerHTML = `<span class="badge badge-status-${complaint.status.replace(' ', '-').toLowerCase()}">${complaint.status}</span>`;

    const urgB = document.getElementById('admin-work-urgency-badge');
    urgB.innerHTML = `<span class="badge badge-urgency-${complaint.urgency.toLowerCase()}">${complaint.urgency}</span>`;

    // Toggle Claim button
    const claimBtn = document.getElementById('admin-claim-btn');
    if (complaint.assignedTo === staff.name) {
      claimBtn.style.display = 'none';
    } else {
      claimBtn.style.display = 'inline-flex';
    }

    // Populate workflow selects
    document.getElementById('workflow-status').value = complaint.status;
    const quickResponseEl = document.getElementById('workflow-quick-response');
    if (quickResponseEl) {
      quickResponseEl.value = '';
    }

    // Set Quick Status Checkboxes
    const chkReview = document.getElementById('chk-status-review');
    const chkProgress = document.getElementById('chk-status-progress');
    const chkResolved = document.getElementById('chk-status-resolved');
    if (chkReview && chkProgress && chkResolved) {
      chkReview.checked = ['Under Review', 'In Progress', 'Resolved'].includes(complaint.status);
      chkProgress.checked = ['In Progress', 'Resolved'].includes(complaint.status);
      chkResolved.checked = complaint.status === 'Resolved';
    }

    const ownerSelect = document.getElementById('workflow-owner');
    ownerSelect.innerHTML = '';
    
    const optSelf = document.createElement('option');
    optSelf.value = staff.name;
    optSelf.textContent = `${staff.name} (${staff.portfolio})`;
    ownerSelect.appendChild(optSelf);

    const mockStaff = [
      { name: "Mr. Ebenezer Mensah", role: "Assistant Officer" },
      { name: "Mrs. Evelyn Boateng", role: "Principal Clerk" },
      { name: "Academic Registry Representative", role: "Registry Office" }
    ];

    mockStaff.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = `${s.name} (${s.role})`;
      ownerSelect.appendChild(opt);
    });

    if (complaint.assignedTo && complaint.assignedTo !== staff.name) {
      const optExist = document.createElement('option');
      optExist.value = complaint.assignedTo;
      optExist.textContent = `${complaint.assignedTo} (Current Officer)`;
      optExist.selected = true;
      ownerSelect.appendChild(optExist);
    } else {
      ownerSelect.value = staff.name;
    }

    // Render Active Scheduled Appointment Notice Card
    const apptDisplay = document.getElementById('ws-active-appointment-display');
    const apptDescText = document.getElementById('ws-appt-desc-text');
    if (apptDisplay && apptDescText) {
      if (complaint.appointment && !complaint.appointment.completed) {
        const typeStr = complaint.appointment.type === 'in-person' ? 'In-Person Meeting' : 'Guidance Counselor Session';
        apptDescText.innerHTML = `<strong>Type:</strong> ${typeStr} | <strong>Date:</strong> ${this.formatDate(complaint.appointment.dateTime)} | <strong>Venue:</strong> ${complaint.appointment.venue}<br><strong>Instructions:</strong> ${complaint.appointment.instructions}`;
        apptDisplay.style.display = 'block';
      } else {
        apptDisplay.style.display = 'none';
      }
    }

    // Render Instructions Sent Log
    const instSentLog = document.getElementById('admin-instructions-sent-log');
    if (instSentLog) {
      instSentLog.innerHTML = '';
      const officialComments = complaint.comments.filter(c => c.isAdmin);
      if (officialComments.length === 0) {
        instSentLog.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; text-align: center; padding: 0.5rem 0;">No instructions sent yet.</div>`;
      } else {
        officialComments.forEach(c => {
          const div = document.createElement('div');
          div.style.background = 'var(--bg-sidebar)';
          div.style.border = '1px solid var(--border-color)';
          div.style.padding = '0.5rem';
          div.style.borderRadius = '4px';
          div.style.fontSize = '0.8rem';
          div.style.lineHeight = '1.4';
          
          div.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); border-bottom: 1px dashed var(--border-color); padding-bottom: 0.25rem; margin-bottom: 0.25rem;">
              <span style="font-weight: 700; color: var(--accent);">By: ${c.by}</span>
              <span>${this.formatDate(c.date)}</span>
            </div>
            <div style="color: var(--text-color); white-space: pre-wrap;">${c.message}</div>
          `;
          instSentLog.appendChild(div);
        });
        setTimeout(() => {
          instSentLog.scrollTop = instSentLog.scrollHeight;
        }, 50);
      }
    }

    // Render Confidential Internal Notes
    const notesContainer = document.getElementById('admin-notes-list');
    notesContainer.innerHTML = '';
    document.getElementById('admin-new-note').value = '';

    if (!complaint.internalNotes || complaint.internalNotes.length === 0) {
      notesContainer.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 1.5rem 0;">No internal office notes recorded. Add observations below to document files/audits privately.</p>`;
    } else {
      complaint.internalNotes.forEach(n => {
        const item = document.createElement('div');
        item.className = 'internal-note-item';
        item.innerHTML = `
          <div class="internal-note-body" style="font-size: 0.9rem; margin-bottom: 0.4rem; color: var(--text-color);">${n.message}</div>
          <div class="internal-note-meta" style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted);">
            <span>By: ${n.by}</span>
            <span>${this.formatDate(n.date)}</span>
          </div>
        `;
        notesContainer.appendChild(item);
      });
    }

    // Render Directives checklist
    const adminDirList = document.getElementById('admin-directives-list');
    if (adminDirList) {
      if (!complaint.directives) complaint.directives = [];
      adminDirList.innerHTML = '';

      if (complaint.directives.length === 0) {
        adminDirList.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; padding: 0.5rem 0;">No directives issued yet.</p>`;
      } else {
        complaint.directives.forEach((dir, dirIndex) => {
          const item = document.createElement('div');
          item.style.display = 'flex';
          item.style.alignItems = 'center';
          item.style.justifyContent = 'space-between';
          item.style.background = 'rgba(0,0,0,0.02)';
          item.style.border = '1px solid var(--border-color)';
          item.style.padding = '0.5rem 0.75rem';
          item.style.borderRadius = '6px';
          
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = dir.completed;
          checkbox.style.cursor = 'pointer';
          checkbox.onchange = async () => {
            const desired = checkbox.checked;
            try {
              await window.API.put(`/complaints/${encodeURIComponent(complaint.id)}/directives/${dir.id}`, { completed: desired });
            } catch (err) {
              checkbox.checked = !desired; // revert on failure
              if (err.status === 401) { adminApp.forceLogout(); return; }
              adminApp.showToast(err.message || 'Could not update the directive.', 'error');
              return;
            }
            await adminApp.refreshAndRenderActive();
            adminApp.showToast(`Directive status updated.`, "info");
          };
          
          const textSpan = document.createElement('span');
          textSpan.textContent = dir.text;
          textSpan.style.fontSize = '0.85rem';
          textSpan.style.flexGrow = '1';
          textSpan.style.marginLeft = '0.75rem';
          if (dir.completed) {
            textSpan.style.textDecoration = 'line-through';
            textSpan.style.color = 'var(--text-muted)';
          }
          
          const deleteBtn = document.createElement('button');
          deleteBtn.style.background = 'transparent';
          deleteBtn.style.border = 'none';
          deleteBtn.style.color = 'var(--status-rejected)';
          deleteBtn.style.cursor = 'pointer';
          deleteBtn.style.padding = '0.25rem';
          deleteBtn.innerHTML = `<i data-lucide="trash-2" style="width: 14px; height: 14px; stroke: var(--status-rejected);"></i>`;
          deleteBtn.onclick = async () => {
            try {
              await window.API.del(`/complaints/${encodeURIComponent(complaint.id)}/directives/${dir.id}`);
            } catch (err) {
              if (err.status === 401) { adminApp.forceLogout(); return; }
              adminApp.showToast(err.message || 'Could not remove the directive.', 'error');
              return;
            }
            await adminApp.refreshAndRenderActive();
            adminApp.showToast(`Directive removed.`, "warning");
          };
          
          const leftWrap = document.createElement('div');
          leftWrap.style.display = 'flex';
          leftWrap.style.alignItems = 'center';
          leftWrap.style.flexGrow = '1';
          
          leftWrap.appendChild(checkbox);
          leftWrap.appendChild(textSpan);
          
          item.appendChild(leftWrap);
          item.appendChild(deleteBtn);
          
          adminDirList.appendChild(item);
        });
      }
    }

    // Refresh active layout tab
    this.setWorkspaceTab(this.state.currentWorkspaceTab);

    if (window.lucide) lucide.createIcons();
  },

  // Claim ticket
  async claimActiveComplaint() {
    const id = this.state.activeAdminComplaintId;
    if (!id) return;
    try {
      await window.API.post(`/complaints/${encodeURIComponent(id)}/claim`);
    } catch (err) {
      if (err.status === 401) { this.forceLogout(); return; }
      this.showToast(err.message || 'Could not claim this ticket.', 'error');
      return;
    }
    await this.refreshAndRenderActive();
    this.showToast('Claimed ticket successfully!', "success");
  },

  // Submit workflow resolution options (status / owner)
  async submitWorkflowActions() {
    const id = this.state.activeAdminComplaintId;
    if (!id) return;

    const complaint = this.state.complaints.find(c => c.id === id);
    if (!complaint) return;

    const newStatus = document.getElementById('workflow-status').value;
    const newOwner = document.getElementById('workflow-owner').value;

    const body = {};
    if (newStatus && newStatus !== complaint.status) body.status = newStatus;
    // Owner is edited by display name in the UI; map back to the routed staff id
    // when it is the current assignee (reassignment by name is not supported by
    // the scoped API, so only forward a status change here).
    if (!body.status) {
      this.showToast("No status change detected.", "info");
      return;
    }
    try {
      await window.API.put(`/complaints/${encodeURIComponent(id)}/status`, body);
    } catch (err) {
      if (err.status === 401) { this.forceLogout(); return; }
      this.showToast(err.message || 'Could not update the grievance.', 'error');
      return;
    }
    await this.refreshAndRenderActive();
    this.showToast("Grievance records successfully updated.", "success");
  },

  // Add Action Directive (Admin Side)
  async addDirective(e) {
    if (e) e.preventDefault();
    const id = this.state.activeAdminComplaintId;
    if (!id) return;

    const directiveInput = document.getElementById('admin-new-directive');
    const text = directiveInput.value.trim();
    if (!text) {
      this.showToast("Directive text cannot be empty.", "warning");
      return;
    }
    try {
      await window.API.post(`/complaints/${encodeURIComponent(id)}/directives`, { text });
    } catch (err) {
      if (err.status === 401) { this.forceLogout(); return; }
      this.showToast(err.message || 'Could not issue the directive.', 'error');
      return;
    }
    directiveInput.value = '';
    await this.refreshAndRenderActive();
    this.showToast("Directive prompt issued to student.", "success");
  },



  // Post Admin Confidential Note (Confidential note Tab)
  async postAdminInternalNote() {
    const id = this.state.activeAdminComplaintId;
    if (!id) return;

    const noteInput = document.getElementById('admin-new-note');
    const message = noteInput.value.trim();
    if (!message) {
      this.showToast("Note content cannot be empty.", "warning");
      return;
    }
    try {
      await window.API.post(`/complaints/${encodeURIComponent(id)}/notes`, { message });
    } catch (err) {
      if (err.status === 401) { this.forceLogout(); return; }
      this.showToast(err.message || 'Could not record the note.', 'error');
      return;
    }
    noteInput.value = '';
    await this.refreshAndRenderActive();
    this.showToast("Internal note recorded securely.", "info");
  },

  // Toggle inline scheduler forms
  toggleAppointmentForm(type) {
    const inPersonForm = document.getElementById('ws-appointment-inperson-form');
    const counselorForm = document.getElementById('ws-appointment-counselor-form');
    if (!inPersonForm || !counselorForm) return;

    if (type === 'in-person') {
      inPersonForm.style.display = inPersonForm.style.display === 'block' ? 'none' : 'block';
      counselorForm.style.display = 'none';
    } else if (type === 'counselor') {
      counselorForm.style.display = counselorForm.style.display === 'block' ? 'none' : 'block';
      inPersonForm.style.display = 'none';
    }
  },

  hideAppointmentForms() {
    const inPersonForm = document.getElementById('ws-appointment-inperson-form');
    const counselorForm = document.getElementById('ws-appointment-counselor-form');
    if (inPersonForm) {
      inPersonForm.style.display = 'none';
      inPersonForm.querySelector('form').reset();
    }
    if (counselorForm) {
      counselorForm.style.display = 'none';
      counselorForm.querySelector('form').reset();
    }
  },

  async submitDetailedAppointment(type, event) {
    if (event) event.preventDefault();
    const id = this.state.activeAdminComplaintId;
    if (!id) return;

    let dateTime, venue, instructions;
    if (type === 'in-person') {
      dateTime = document.getElementById('appt-inperson-time').value;
      venue = document.getElementById('appt-inperson-venue').value.trim();
      instructions = document.getElementById('appt-inperson-instructions').value.trim();
    } else {
      dateTime = document.getElementById('appt-counselor-time').value;
      venue = document.getElementById('appt-counselor-venue').value.trim();
      instructions = document.getElementById('appt-counselor-instructions').value.trim();
    }

    if (!dateTime || !venue || !instructions) {
      this.showToast("Please enter all appointment details.", "warning");
      return;
    }
    try {
      await window.API.post(`/complaints/${encodeURIComponent(id)}/appointment`, {
        type, dateTime, venue, instructions,
      });
    } catch (err) {
      if (err.status === 401) { this.forceLogout(); return; }
      this.showToast(err.message || 'Could not schedule the appointment.', 'error');
      return;
    }
    this.hideAppointmentForms();
    await this.refreshAndRenderActive();
    this.showToast('Appointment scheduled successfully.', "success");
  },

  toggleCompleteAppointmentForm() {
    const form = document.getElementById('ws-complete-appt-form');
    if (form) {
      form.style.display = form.style.display === 'block' ? 'none' : 'block';
    }
  },

  async submitCompleteAppointment() {
    const id = this.state.activeAdminComplaintId;
    if (!id) return;

    const complaint = this.state.complaints.find(c => c.id === id);
    if (!complaint || !complaint.appointment) return;

    const feedbackInput = document.getElementById('appt-completion-feedback');
    const feedbackText = feedbackInput ? feedbackInput.value.trim() : "";
    try {
      await window.API.put(`/complaints/${encodeURIComponent(id)}/appointment`, {
        feedback: feedbackText || 'Appointment completed successfully.',
      });
    } catch (err) {
      if (err.status === 401) { this.forceLogout(); return; }
      this.showToast(err.message || 'Could not complete the appointment.', 'error');
      return;
    }
    if (feedbackInput) feedbackInput.value = '';
    const form = document.getElementById('ws-complete-appt-form');
    if (form) form.style.display = 'none';

    await this.refreshAndRenderActive();
    this.showToast("Appointment marked as completed with feedback.", "success");
  },

  async handleQuickCheck(targetStatus, checkbox) {
    const id = this.state.activeAdminComplaintId;
    if (!id) return;

    const complaint = this.state.complaints.find(c => c.id === id);
    if (!complaint) { checkbox.checked = !checkbox.checked; return; }

    const oldStatus = complaint.status;
    let newStatus = oldStatus;
    if (checkbox.checked) {
      newStatus = targetStatus;
    } else {
      // Fallback logic when unchecking
      if (targetStatus === 'Resolved') newStatus = 'In Progress';
      else if (targetStatus === 'In Progress') newStatus = 'Under Review';
      else if (targetStatus === 'Under Review') newStatus = 'Submitted';
    }

    if (newStatus === oldStatus) return;
    try {
      await window.API.put(`/complaints/${encodeURIComponent(id)}/status`, { status: newStatus });
    } catch (err) {
      checkbox.checked = !checkbox.checked; // revert on failure
      if (err.status === 401) { this.forceLogout(); return; }
      this.showToast(err.message || 'Could not update the status.', 'error');
      return;
    }
    await this.refreshAndRenderActive();
    this.showToast(`Status updated to ${newStatus}.`, "success");
  },

  handleAnalyticsScopeChange(scope) {
    this.state.analyticsScope = scope;
    this.renderAnalytics();
  },

  // BOARD LEVEL ANALYTICS LOGIC
  renderAnalytics() {
    this.loadState();
    const staff = this.state.loggedStaff;
    if (!staff) return;

    const scope = this.state.analyticsScope || 'university';

    // 1. Render Scope Selector buttons in the UI
    const scopeContainer = document.getElementById('analytics-scope-selector-container');
    if (scopeContainer) {
      scopeContainer.innerHTML = '';
      
      if (staff.type === 'HOD') {
        // HOD Scopes: Department, University
        const btnDept = document.createElement('button');
        btnDept.className = `analytics-scope-btn ${scope === 'department' ? 'active' : ''}`;
        btnDept.textContent = `My Dept (${staff.department.replace('Department of ', '')})`;
        btnDept.onclick = () => this.handleAnalyticsScopeChange('department');

        const btnUni = document.createElement('button');
        btnUni.className = `analytics-scope-btn ${scope === 'university' ? 'active' : ''}`;
        btnUni.textContent = "Whole University";
        btnUni.onclick = () => this.handleAnalyticsScopeChange('university');

        scopeContainer.appendChild(btnDept);
        scopeContainer.appendChild(btnUni);
      } else if (staff.type === 'Dean' || staff.type === 'Finance') {
        // Dean/Finance Scopes: Faculty, University
        const btnFac = document.createElement('button');
        btnFac.className = `analytics-scope-btn ${scope === 'faculty' ? 'active' : ''}`;
        btnFac.textContent = `My Faculty (${staff.facultyKey})`;
        btnFac.onclick = () => this.handleAnalyticsScopeChange('faculty');

        const btnUni = document.createElement('button');
        btnUni.className = `analytics-scope-btn ${scope === 'university' ? 'active' : ''}`;
        btnUni.textContent = "Whole University";
        btnUni.onclick = () => this.handleAnalyticsScopeChange('university');

        scopeContainer.appendChild(btnFac);
        scopeContainer.appendChild(btnUni);
      } else {
        // IT Scope: University only
        const label = document.createElement('span');
        label.style.fontSize = '0.85rem';
        label.style.color = 'var(--text-muted)';
        label.style.fontWeight = '600';
        label.textContent = "Scope: Institutional (All Faculties)";
        scopeContainer.appendChild(label);
      }
    }

    // 2. Filter complaints based on active scope
    let filtered = [...this.state.complaints];
    let scopeTitle = "Institutional Analytics Dashboard";
    let scopeDesc = "Quantify resolution rates, monitor departmental backlog, and view trends.";

    if (scope === 'department') {
      filtered = this.state.complaints.filter(c => c.studentDept === staff.department);
      scopeTitle = `${staff.department} Analytics`;
      scopeDesc = `Performance overview and caseload mapping for ${staff.department}.`;
    } else if (scope === 'faculty') {
      filtered = this.state.complaints.filter(c => c.studentFacultyKey === staff.facultyKey);
      const facName = window.FACULTIES[staff.facultyKey] || staff.facultyKey;
      scopeTitle = `${facName} Analytics`;
      scopeDesc = `Caseload distribution, departmental metrics and resolution metrics for ${facName}.`;
    }

    document.getElementById('analytics-scope-title').textContent = scopeTitle;
    document.getElementById('analytics-scope-desc').textContent = scopeDesc;

    // 3. Compute KPI Cards for the filtered subset
    const total = filtered.length;
    const resolved = filtered.filter(c => c.status === 'Resolved').length;
    const pending = filtered.filter(c => ['Submitted', 'Under Review', 'In Progress'].includes(c.status)).length;
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
    const pendingRate = total > 0 ? Math.round((pending / total) * 100) : 0;

    document.getElementById('kpi-total').textContent = total;
    document.getElementById('kpi-resolved').textContent = resolved;
    document.getElementById('kpi-resolution-rate').textContent = `${resolutionRate}% Clearance`;
    document.getElementById('kpi-pending').textContent = pending;
    document.getElementById('kpi-pending-percent').textContent = `${pendingRate}% Active`;

    // Average resolution time
    let totalResolvedTime = 0;
    let resolvedCount = 0;
    filtered.forEach(c => {
      if (c.status === 'Resolved') {
        const start = new Date(c.createdAt);
        // Match only transitions INTO Resolved ("to Resolved"), not "from Resolved to X"
        // (which also contains the word "Resolved" but means the opposite). Take the
        // LAST such transition so a resolve -> revert -> re-resolve cycle uses the
        // most recent resolution timestamp, not the first one.
        const resLog = [...c.timeline].reverse().find(log => /\bto Resolved\b/i.test(log.message));
        const end = resLog ? new Date(resLog.date) : new Date();
        const diffDays = (end - start) / (1000 * 60 * 60 * 24);
        totalResolvedTime += Math.max(0.1, diffDays);
        resolvedCount++;
      }
    });
    const avgTime = resolvedCount > 0 ? (totalResolvedTime / resolvedCount).toFixed(1) : "0.0";
    document.getElementById('kpi-avg-time').textContent = `${avgTime}d`;

    // 4. Render Table Grid and Chart performance stats depending on scope level
    const tableBody = document.getElementById('dept-table-rows');
    tableBody.innerHTML = '';

    let statsData = [];

    if (scope === 'department') {
      // HOD scope: Compare programmes under this department
      const deptProgs = window.PROGRAMMES.filter(p => p.department === staff.department);
      
      statsData = deptProgs.map(prog => {
        const filed = filtered.filter(c => c.studentProgramme === prog.name).length;
        const solved = filtered.filter(c => c.studentProgramme === prog.name && c.status === 'Resolved').length;
        const open = filtered.filter(c => c.studentProgramme === prog.name && ['Submitted', 'Under Review', 'In Progress'].includes(c.status)).length;
        const ratio = filed > 0 ? Math.round((solved / filed) * 100) : 0;
        return { name: prog.name, filed, solved, open, ratio };
      });

      document.getElementById('chart-rank-desc').textContent = "Caseload performance tracked across course programmes.";
    } else if (scope === 'faculty') {
      // Dean scope: Compare departments under this faculty
      const facDepts = Array.from(new Set(
        window.PROGRAMMES
          .filter(p => p.facultyKey === staff.facultyKey)
          .map(p => p.department)
      ));

      statsData = facDepts.map(dept => {
        const filed = filtered.filter(c => c.studentDept === dept).length;
        const solved = filtered.filter(c => c.studentDept === dept && c.status === 'Resolved').length;
        const open = filtered.filter(c => c.studentDept === dept && ['Submitted', 'Under Review', 'In Progress'].includes(c.status)).length;
        const ratio = filed > 0 ? Math.round((solved / filed) * 100) : 0;
        return { name: dept, filed, solved, open, ratio };
      });

      document.getElementById('chart-rank-desc').textContent = "Caseload performance comparison across faculty departments.";
    } else {
      // IT/University Scope: Compare all departments
      statsData = window.DEPARTMENTS.map(dept => {
        const filed = filtered.filter(c => c.studentDept === dept).length;
        const solved = filtered.filter(c => c.studentDept === dept && c.status === 'Resolved').length;
        const open = filtered.filter(c => c.studentDept === dept && ['Submitted', 'Under Review', 'In Progress'].includes(c.status)).length;
        const ratio = filed > 0 ? Math.round((solved / filed) * 100) : 0;
        return { name: dept, filed, solved, open, ratio };
      });

      document.getElementById('chart-rank-desc').textContent = "Complaints filed vs. resolved counts by department.";
    }

    // Sort by volume
    statsData.sort((a, b) => b.filed - a.filed);

    // Populate rows
    statsData.forEach(d => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="font-weight: 500;">${d.name.replace("Department of ", "")}</td>
        <td style="text-align: center;">${d.filed}</td>
        <td style="text-align: center; color: var(--status-resolved);">${d.solved}</td>
        <td style="text-align: center; color: var(--status-progress);">${d.open}</td>
        <td style="text-align: center; font-weight: 700; color: ${d.ratio >= 75 ? 'var(--status-resolved)' : 'var(--accent)'}">${d.ratio}%</td>
      `;
      tableBody.appendChild(row);
    });

    // 5. Render Charts using the scoped subset
    this.renderCharts(statsData, filtered);
  },

  renderCharts(deptStats, filteredComplaints) {
    if (this.state.charts.performance) this.state.charts.performance.destroy();
    if (this.state.charts.category) this.state.charts.category.destroy();
    if (this.state.charts.trends) this.state.charts.trends.destroy();

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#93a89e', font: { family: 'Outfit', size: 11 } }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#93a89e', font: { family: 'Outfit' } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#93a89e', font: { family: 'Outfit' } } }
      }
    };

    // A. Chart 1: Scoped Performance rankings (Horizontal Bar)
    const ctxPerf = document.getElementById('deptPerformanceChart').getContext('2d');
    const perfLabels = deptStats.map(d => d.name.replace("Department of ", "").replace(" Engineering", " Eng.").replace("BSc ", ""));
    const dataFiled = deptStats.map(d => d.filed);
    const dataSolved = deptStats.map(d => d.solved);

    this.state.charts.performance = new Chart(ctxPerf, {
      type: 'bar',
      data: {
        labels: perfLabels,
        datasets: [
          {
            label: 'Total Filed',
            data: dataFiled,
            backgroundColor: 'rgba(255, 159, 28, 0.4)',
            borderColor: 'rgba(255, 159, 28, 1)',
            borderWidth: 1.5,
            borderRadius: 4
          },
          {
            label: 'Resolved',
            data: dataSolved,
            backgroundColor: 'rgba(46, 196, 182, 0.5)',
            borderColor: 'rgba(46, 196, 182, 1)',
            borderWidth: 1.5,
            borderRadius: 4
          }
        ]
      },
      options: {
        ...chartOptions,
        indexAxis: 'y',
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { stepSize: 1, color: '#93a89e', font: { family: 'Outfit' } } },
          y: { grid: { display: false }, ticks: { color: '#93a89e', font: { family: 'Outfit' } } }
        }
      }
    });

    // B. Chart 2: Scoped Category Breakdown (Doughnut)
    const ctxCat = document.getElementById('categoryDistributionChart').getContext('2d');
    const catCounts = window.CATEGORIES.map(cat => {
      return {
        name: cat.name,
        count: filteredComplaints.filter(c => c.category === cat.name).length
      };
    });

    this.state.charts.category = new Chart(ctxCat, {
      type: 'doughnut',
      data: {
        labels: catCounts.map(c => c.name),
        datasets: [{
          data: catCounts.map(c => c.count),
          backgroundColor: [
            '#0d522c', // Academic Green
            '#f4c430', // Fee Gold
            '#3a86c8', // IT Blue
            '#e63946', // Harassment Pink
            '#8a3ffc'  // Others Purple
          ],
          borderWidth: 1,
          borderColor: '#060b08'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#93a89e', font: { family: 'Outfit', size: 10 } }
          }
        }
      }
    });

    // C. Chart 3: Scoped Trends over time (Line)
    const ctxTrend = document.getElementById('dailySubmissionChart').getContext('2d');
    const trendLabels = [];
    const trendValues = [];
    
    for (let i = 8; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      trendLabels.push(label);
      
      const count = filteredComplaints.filter(c => c.createdAt.startsWith(dateStr)).length;
      trendValues.push(count);
    }

    this.state.charts.trends = new Chart(ctxTrend, {
      type: 'line',
      data: {
        labels: trendLabels,
        datasets: [{
          label: 'Complaints Submitted',
          data: trendValues,
          backgroundColor: 'rgba(244, 196, 48, 0.05)',
          borderColor: 'rgba(244, 196, 48, 1)',
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointBackgroundColor: 'rgba(244, 196, 48, 1)'
        }]
      },
      options: chartOptions
    });
  },

  // Semester End Report overlay controller
  generateSemesterReportView() {
    const reportView = document.getElementById('report-view');
    const actionButtons = document.getElementById('report-action-buttons');
    if (!reportView || !actionButtons) return;

    const currentDateTime = new Date();
    document.getElementById('rep-date-lbl').textContent = currentDateTime.toISOString().split('T')[0];

    const total = this.state.complaints.length;
    const resolved = this.state.complaints.filter(c => c.status === 'Resolved').length;
    const pending = this.state.complaints.filter(c => ['Submitted', 'Under Review', 'In Progress'].includes(c.status)).length;
    const rate = total > 0 ? Math.round((resolved / total) * 100) : 0;
    
    let totalResolvedTime = 0;
    let resolvedCount = 0;
    this.state.complaints.forEach(c => {
      if (c.status === 'Resolved') {
        const start = new Date(c.createdAt);
        // See renderAnalytics() for why this matches "to Resolved" and takes the last one.
        const resLog = [...c.timeline].reverse().find(log => /\bto Resolved\b/i.test(log.message));
        const end = resLog ? new Date(resLog.date) : new Date();
        const diffDays = (end - start) / (1000 * 60 * 60 * 24);
        totalResolvedTime += Math.max(0.1, diffDays);
        resolvedCount++;
      }
    });
    const avgDaysVal = resolvedCount > 0 ? (totalResolvedTime / resolvedCount).toFixed(1) : "0.0";

    // Write numerical metrics
    document.getElementById('rep-total-complaints').textContent = total;
    document.getElementById('rep-resolved-complaints').textContent = resolved;
    document.getElementById('rep-resolution-rate').textContent = `${rate}%`;
    document.getElementById('rep-avg-days').textContent = `${avgDaysVal} Days`;

    // Division matrix
    const tableBody = document.getElementById('rep-table-rows');
    tableBody.innerHTML = '';
    
    const deptStats = window.DEPARTMENTS.map(dept => {
      const filed = this.state.complaints.filter(c => c.studentDept === dept).length;
      const solved = this.state.complaints.filter(c => c.studentDept === dept && c.status === 'Resolved').length;
      const open = this.state.complaints.filter(c => c.studentDept === dept && ['Submitted', 'Under Review', 'In Progress'].includes(c.status)).length;
      const ratio = filed > 0 ? Math.round((solved / filed) * 100) : 0;
      return { name: dept, filed, solved, open, ratio };
    });
    deptStats.sort((a, b) => b.filed - a.filed);

    deptStats.forEach(d => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="font-weight: 600; color: #2d3748;">${d.name}</td>
        <td style="text-align: center; font-weight: 600;">${d.filed}</td>
        <td style="text-align: center; color: #2ec4b6; font-weight: 600;">${d.solved}</td>
        <td style="text-align: center; color: #dd6b20; font-weight: 600;">${d.open}</td>
        <td style="text-align: center; font-weight: 800; color: #0d522c;">${d.ratio}%</td>
      `;
      tableBody.appendChild(row);
    });

    // Category Distribution Analysis
    const catTableBody = document.getElementById('rep-cat-table-rows');
    catTableBody.innerHTML = '';
    
    window.CATEGORIES.forEach(cat => {
      const count = this.state.complaints.filter(c => c.category === cat.name).length;
      const share = total > 0 ? Math.round((count / total) * 100) : 0;
      let routerOffice = "";
      if (cat.routeType === 'dean') routerOffice = "Faculty Dean";
      else if (cat.routeType === 'finance') routerOffice = "Faculty Finance Officer";
      else if (cat.routeType === 'ict_dept') routerOffice = "Central IT Directorate";
      else routerOffice = "University Administration";

      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="font-weight: 600; color: #2d3748;">${cat.name}</td>
        <td style="text-align: center; font-weight: 600;">${count}</td>
        <td style="text-align: center; color: #4a5568; font-weight: 600;">${share}%</td>
        <td style="color: #4a5568; font-style: italic;">${routerOffice}</td>
      `;
      catTableBody.appendChild(row);
    });

    // Recommendation summary notes
    const summaryBox = document.getElementById('rep-executive-notes');
    let recommendation = "";

    if (total === 0) {
      recommendation = "No complaint records are logged in the ledger database during this audit window. The system reports complete operational stability.";
    } else {
      const topDept = deptStats[0];
      const maxCatObj = window.CATEGORIES.map(cat => {
        return { name: cat.name, count: this.state.complaints.filter(c => c.category === cat.name).length };
      }).sort((a, b) => b.count - a.count)[0];

      recommendation = `Analysis shows that UMaT recorded a total of ${total} grievances, yielding an overall resolution rate of ${rate}%. The highest submission load originated from the <strong>${topDept.name}</strong> (${topDept.filed} files), which holds a departmental resolution clearance index of ${topDept.ratio}%. 
      Categorically, <strong>${maxCatObj.name}</strong> disputes represent the largest area of student concern (${maxCatObj.count} cases, ${Math.round((maxCatObj.count/total)*100)}% share). 
      To improve quality service delivery, we advise that the Quality Assurance Committee focus resources on bottlenecks in resolving ${maxCatObj.name} and provide additional administrative capacity to divisions showing backlog.`;
    }

    summaryBox.innerHTML = recommendation;

    // View overlay
    reportView.style.display = 'block';
    actionButtons.style.display = 'flex';
    
    // Smooth scroll down to report view container
    reportView.scrollIntoView({ behavior: 'smooth' });
    this.showToast("Semester performance audit generated.", "success");
    
    if (window.lucide) lucide.createIcons();
  },

  closeSemesterReportView() {
    const reportView = document.getElementById('report-view');
    const actionButtons = document.getElementById('report-action-buttons');
    if (reportView && actionButtons) {
      reportView.style.display = 'none';
      actionButtons.style.display = 'none';
    }
  },

  handleLogoClick() {
    if (this.state.loggedStaff) {
      this.switchTab('workstation');
    }
  },

  // Helper Toast Notifications
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = "info";
    if (type === 'success') icon = "check-circle";
    else if (type === 'warning') icon = "alert-triangle";
    else if (type === 'error') icon = "x-circle";

    toast.innerHTML = `
      <i data-lucide="${icon}"></i>
      <span style="font-weight:600; font-size:0.88rem;">${message}</span>
    `;

    container.appendChild(toast);
    
    if (window.lucide) lucide.createIcons();

    // Animate out and remove
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      toast.style.transition = 'all 0.5s ease-out';
      setTimeout(() => {
        toast.remove();
      }, 500);
    }, 4000);
  },

  // Profile settings dropdown toggle
  toggleProfileDropdown(e) {
    if (e) e.stopPropagation();
    const currentWidget = e.currentTarget;
    const dropdown = currentWidget.querySelector('.profile-dropdown-menu');
    const isVisible = dropdown.style.display === 'block';
    
    // Close all profile dropdowns first
    document.querySelectorAll('.profile-dropdown-menu').forEach(d => d.style.display = 'none');
    document.querySelectorAll('.dashboard-profile-widget').forEach(w => w.classList.remove('active'));
    
    if (!isVisible) {
      dropdown.style.display = 'block';
      currentWidget.classList.add('active');
    }
  },

  // Themes support
  loadTheme() {
    const savedTheme = localStorage.getItem('umat_selected_theme') || 'light';
    this.changeTheme(savedTheme);
  },

  changeTheme(themeName) {
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-forest', 'theme-gold');
    if (themeName !== 'light') {
      document.body.classList.add(`theme-${themeName}`);
    }
    localStorage.setItem('umat_selected_theme', themeName);
    
    // Update all theme selectors across portals
    const themeSelects = document.querySelectorAll('#theme-selector, #theme-selector-analytics');
    themeSelects.forEach(select => {
      select.value = themeName;
    });
  },

  // Password Modals
  openChangePasswordModal(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Close dropdowns
    document.querySelectorAll('.profile-dropdown-menu').forEach(d => d.style.display = 'none');
    document.querySelectorAll('.dashboard-profile-widget').forEach(w => w.classList.remove('active'));

    const modal = document.getElementById('change-password-modal');
    if (modal) {
      document.getElementById('change-password-form').reset();
      modal.style.display = 'flex';
    }
  },

  closeChangePasswordModal() {
    const modal = document.getElementById('change-password-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  },

  async handleChangePasswordSubmit(e) {
    e.preventDefault();
    if (!this.state.loggedStaff) return;

    const currentPwd = document.getElementById('change-pwd-current').value;
    const newPwd = document.getElementById('change-pwd-new').value;
    const confirmPwd = document.getElementById('change-pwd-confirm').value;

    if (newPwd !== confirmPwd) {
      this.showToast("New passwords do not match.", "error");
      return;
    }

    try {
      await window.API.put('/auth/staff/password', { currentPassword: currentPwd, newPassword: newPwd });
    } catch (err) {
      if (err.status === 401 && err.message && /current password/i.test(err.message)) {
        this.showToast('Current password entered is incorrect.', 'error');
        return;
      }
      if (err.status === 401) { this.forceLogout(); return; }
      this.showToast(err.message || 'Could not update your password.', 'error');
      return;
    }

    this.closeChangePasswordModal();
    this.showToast("Password updated successfully!", "success");
  },

  // Utilities
  formatDate(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  getStatusColor(status) {
    if (status === 'Submitted') return '#3a86c8';
    if (status === 'Under Review') return '#f4c430';
    if (status === 'In Progress') return '#ff9f1c';
    if (status === 'Resolved') return '#2ec4b6';
    if (status === 'Rejected') return '#e71d36';
    return '#6c757d';
  },

  startAdminLoginBackgroundCycle() {
    const slides = document.querySelectorAll('#login-view .login-bg-slide');
    if (slides.length < 2) return;
    let currentSlide = 0;
    setInterval(() => {
      slides[currentSlide].classList.remove('active');
      currentSlide = (currentSlide + 1) % slides.length;
      slides[currentSlide].classList.add('active');
    }, 6000);
  },

  togglePasswordVisibility() {
    const input = document.getElementById('login-password');
    const icon = document.getElementById('password-toggle-icon');
    if (!input || !icon) return;
    if (input.type === 'password') {
      input.type = 'text';
      icon.setAttribute('data-lucide', 'eye-off');
    } else {
      input.type = 'password';
      icon.setAttribute('data-lucide', 'eye');
    }
    if (window.lucide) lucide.createIcons();
  }
};

// Dismiss dropdown on outside clicks
document.addEventListener('click', () => {
  document.querySelectorAll('.profile-dropdown-menu').forEach(d => d.style.display = 'none');
  document.querySelectorAll('.dashboard-profile-widget').forEach(w => w.classList.remove('active'));
});

// Bind to window load
window.addEventListener('DOMContentLoaded', () => {
  adminApp.init();
  window.adminApp = adminApp;
  if (window.lucide) lucide.createIcons();
});

// Re-sync from the backend when the tab regains focus, so newly filed
// complaints and student replies appear without a manual reload.
window.addEventListener('focus', () => {
  if (adminApp.state.loggedStaff) {
    adminApp.loadAndRender();
  }
});
