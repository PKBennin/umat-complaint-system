// UMaT Campus Complaint Management System - app.js (Student Portal Controller)

const app = {
  // Application State
  state: {
    complaints: [],
    activeStudentComplaintId: null,
    loggedStudent: null,
    selectedProgramme: null
  },

  // Initialize Application
  init() {
    window.API.configure({ tokenKey: 'umat_student_token' });
    this.loadTheme();
    this.checkStudentSession();
    this.populateSelectors();
    this.startClock();
    this.startHeroBackgroundCycle();
    this.startStudentLoginBackgroundCycle();
    
    // Bind hashchange for SPA routing
    window.addEventListener('hashchange', () => this.handleRouting());
    this.handleRouting();
    
    // Auto-routing preview trigger on form elements
    this.updateRoutingPreview();

    // Bind beforeunload warning for unsaved form text
    window.addEventListener('beforeunload', (e) => {
      if (this.isFormDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  },

  // State Management (backend API).
  // loadState/saveState are retained as no-ops so existing call sites keep
  // working; the authoritative complaint data now comes from refreshComplaints().
  loadState() { /* data is fetched from the API via refreshComplaints() */ },
  saveState() { /* persistence is handled server-side per mutation */ },

  // Pull this student's complaints from the backend into state.
  async refreshComplaints() {
    if (!this.state.loggedStudent) { this.state.complaints = []; return; }
    try {
      const idx = this.state.loggedStudent.index;
      this.state.complaints = await window.API.get(`/complaints/student/${encodeURIComponent(idx)}`);
    } catch (err) {
      if (err.status === 401) { this.forceLogout(); return; }
      console.error('Failed to load complaints:', err);
      this.showToast(err.message || 'Could not load your complaints.', 'error');
    }
  },

  // Refresh from the API, then re-render the student views.
  async loadAndRenderStudent() {
    await this.refreshComplaints();
    this.renderStudentHistory();
    if (this.state.activeStudentComplaintId) this.renderStudentTracker();
  },

  // Session invalid/expired — clear and return to landing.
  forceLogout() {
    window.API.clearToken();
    localStorage.removeItem('current_student_session');
    this.state.loggedStudent = null;
    this.state.activeStudentComplaintId = null;
    this.state.complaints = [];
    const badge = document.getElementById('student-session-badge');
    if (badge) badge.style.display = 'none';
    this.showToast('Your session has expired. Please sign in again.', 'warning');
    this.showView('landing');
  },

  // Check if student session is persistent
  checkStudentSession() {
    const session = localStorage.getItem('current_student_session');
    const navTabTrack = document.getElementById('nav-tab-track');
    // A restored session is only valid if we still hold a JWT.
    if (session && !window.API.getToken()) {
      localStorage.removeItem('current_student_session');
    }
    if (session && window.API.getToken()) {
      try {
        this.state.loggedStudent = JSON.parse(session);
        // Pull fresh complaints from the backend for the restored session.
        this.loadAndRenderStudent();
        // Show session badge in header
        document.getElementById('logged-student-name').textContent = this.state.loggedStudent.name;
        document.getElementById('student-session-badge').style.display = 'flex';
        
        if (navTabTrack) {
          navTabTrack.innerHTML = '<i data-lucide="layout-dashboard"></i> Dashboard';
        }
        
        const dbName = document.getElementById('db-profile-name');
        if (dbName) {
          dbName.textContent = this.state.loggedStudent.name;
        }
      } catch (e) {
        localStorage.removeItem('current_student_session');
      }
    } else {
      if (navTabTrack) {
        navTabTrack.innerHTML = '<i data-lucide="log-in"></i> Sign In';
      }
    }
    if (window.lucide) lucide.createIcons();
  },

  // Populators
  populateSelectors() {
    const catSelect = document.getElementById('comp-category');

    // Clear and fill complaint category select
    if (catSelect) {
      catSelect.innerHTML = '<option value="" disabled selected>Select category...</option>';
      window.CATEGORIES.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = cat.name;
        catSelect.appendChild(opt);
      });
    }
    
    this.initAutocompleteProgrammes();
  },

  // Programme Autocomplete Dropdown Search
  initAutocompleteProgrammes() {
    const listContainer = document.getElementById('stud-programme-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    window.PROGRAMMES.forEach(prog => {
      const div = document.createElement('div');
      div.className = 'autocomplete-item';
      div.textContent = prog.name;
      div.onclick = () => this.selectProgramme(prog.name);
      listContainer.appendChild(div);
    });
  },

  filterProgrammes() {
    const inputVal = document.getElementById('stud-programme-search').value.trim().toLowerCase();
    const listContainer = document.getElementById('stud-programme-list');
    if (!listContainer) return;

    if (!inputVal) {
      listContainer.style.display = 'none';
      this.state.selectedProgramme = null;
      this.updateRoutingPreview();
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

  showProgrammesList() {
    const listContainer = document.getElementById('stud-programme-list');
    if (listContainer) {
      listContainer.style.display = 'block';
      this.filterProgrammes();
    }
  },

  selectProgramme(programmeName) {
    const inputField = document.getElementById('stud-programme-search');
    const listContainer = document.getElementById('stud-programme-list');
    
    if (inputField) {
      inputField.value = programmeName;
    }
    if (listContainer) {
      listContainer.style.display = 'none';
    }

    const prog = window.PROGRAMMES.find(p => p.name === programmeName);
    this.state.selectedProgramme = prog || null;
    this.updateRoutingPreview();
  },

  closeAllAutocompletes() {
    const listContainer = document.getElementById('stud-programme-list');
    if (listContainer) {
      listContainer.style.display = 'none';
    }
  },

  // Real-time Auto-Routing Preview
  updateRoutingPreview() {
    const catSelect = document.getElementById('comp-category');
    const previewBox = document.getElementById('routing-preview-box');
    const previewText = document.getElementById('routing-preview-text');
    const harassmentNotice = document.getElementById('anonymous-harassment-notice');
 
    if (!catSelect || !previewBox || !previewText) return;
 
    const categoryName = catSelect.value;
    
    if (harassmentNotice) {
      harassmentNotice.style.display = categoryName === 'Harassment' ? 'block' : 'none';
      if (window.lucide) lucide.createIcons();
    }

    const prog = this.state.selectedProgramme;
 
    if (!categoryName || !prog) {
      previewBox.style.display = 'none';
      return;
    }
 
    const recipient = this.calculateRouting(categoryName, prog.name);
    
    previewText.textContent = `${recipient.role} (${recipient.name}) — Destination: ${recipient.facultyName}`;
    previewBox.style.display = 'block';
  },

  // Calculate Routing Target (Dynamic lookup of Deans/Finance/IT in STAFF_DATABASE)
  calculateRouting(categoryName, programmeName) {
    const category = window.CATEGORIES.find(c => c.name === categoryName);
    const prog = window.PROGRAMMES.find(p => p.name === programmeName);
    if (!category || !prog) {
      return { name: "General Administration Registry", role: "University Registry", deptName: "general_registry", facultyName: "Central" };
    }

    const facultyKey = prog.facultyKey;
    const facultyName = window.FACULTIES[facultyKey];

    if (category.routeType === 'dean') {
      const dean = window.STAFF_DATABASE.find(s => s.facultyKey === facultyKey && s.type === 'Dean');
      return {
        name: dean ? dean.name : "Faculty Dean",
        role: dean ? dean.portfolio : "Faculty Dean",
        deptName: dean ? dean.department : `Dean's Office (${facultyKey})`,
        facultyName: facultyName,
        facultyKey: facultyKey
      };
    } else if (category.routeType === 'finance') {
      const fin = window.STAFF_DATABASE.find(s => s.facultyKey === facultyKey && s.type === 'Finance');
      return {
        name: fin ? fin.name : "Faculty Finance Officer",
        role: fin ? fin.portfolio : "Faculty Finance Officer",
        deptName: "finance_dept",
        facultyName: facultyName,
        facultyKey: facultyKey
      };
    } else if (category.routeType === 'ict_dept') {
      const it = window.STAFF_DATABASE.find(s => s.type === 'IT');
      return {
        name: it ? it.name : "IT Directorate Director",
        role: it ? it.portfolio : "Central IT Directorate Director",
        deptName: "ict_dept",
        facultyName: "Central IT Directorate",
        facultyKey: "ict_dept"
      };
    }
    return { name: "General Administration", role: "University Registry", deptName: "general_registry", facultyName: "Central" };
  },

  // Simple SPA Routing Engine
  showView(viewName) {
    const currentView = this.state.currentView || 'landing';
    if (currentView === 'file' && viewName !== 'file' && this.isFormDirty()) {
      if (!confirm("You have unsaved changes in your complaint form. Are you sure you want to leave?")) {
        // Restore hash to file view
        if (window.location.hash !== '#file') {
          window.location.hash = '#file';
        }
        return;
      }
    }
    this.state.currentView = viewName;

    document.querySelectorAll('.view-section').forEach(view => {
      view.classList.remove('active');
    });
    document.querySelectorAll('#main-nav .nav-tab').forEach(tab => {
      tab.classList.remove('active');
    });

    if (viewName === 'track') {
      const trackView = document.getElementById('track-view');
      trackView.classList.add('active');
      const tabEl = document.getElementById('nav-tab-track');
      if (tabEl) tabEl.classList.add('active');
      window.location.hash = '#track';

      if (!this.state.loggedStudent) {
        document.getElementById('student-login-panel-container').style.display = 'flex';
        document.getElementById('student-track-workspace').style.display = 'none';
      } else {
        document.getElementById('student-login-panel-container').style.display = 'none';
        document.getElementById('student-track-workspace').style.display = 'block';
        
        this.renderStudentHistory();
        
        if (this.state.activeStudentComplaintId) {
          this.renderStudentTracker();
        } else {
          document.getElementById('student-workspace-placeholder').style.display = 'flex';
          document.getElementById('student-workspace-content').style.display = 'none';
        }
      }
    } else {
      const targetView = document.getElementById(`${viewName}-view`);
      if (targetView) {
        targetView.classList.add('active');
      }
      
      const tabEl = document.getElementById(`nav-tab-${viewName}`);
      if (tabEl) {
        tabEl.classList.add('active');
      }
      window.location.hash = `#${viewName}`;
      
      if (viewName === 'file') {
        this.resetFilingForm();
      }
    }

    if (window.lucide) {
      lucide.createIcons();
    }
  },

  handleRouting() {
    const hash = window.location.hash.substring(1) || 'landing';
    const currentView = this.state.currentView || 'landing';

    if (currentView === 'file' && hash !== 'file' && this.isFormDirty()) {
      if (!confirm("You have unsaved changes in your complaint form. Are you sure you want to leave?")) {
        window.location.hash = '#file';
        return;
      }
    }

    this.state.currentView = hash;
    if (!hash || hash === 'landing') {
      this.showView('landing');
    } else if (['file', 'track'].includes(hash)) {
      this.showView(hash);
    } else {
      this.showView('landing');
    }
  },

  isFormDirty() {
    const form = document.getElementById('complaint-form');
    if (!form) return false;
    
    const receiptVisible = document.getElementById('student-receipt-panel')?.style.display === 'block';
    if (receiptVisible) return false;
    
    const name = document.getElementById('stud-name')?.value.trim();
    const index = document.getElementById('stud-index')?.value.trim();
    const prog = document.getElementById('stud-programme-search')?.value.trim();
    const category = document.getElementById('comp-category')?.value;
    const subject = document.getElementById('comp-subject')?.value.trim();
    const desc = document.getElementById('comp-desc')?.value.trim();
    
    return !!(name || index || prog || category || subject || desc);
  },

  // Student Authentication Submit (backend JWT auth)
  async handleLoginSubmit(e) {
    if (e) e.preventDefault();
    const indexVal = document.getElementById('login-index').value.trim();
    const passwordVal = document.getElementById('login-password').value.trim();

    if (!indexVal || !passwordVal) {
      this.showToast("Please enter both index number and password.", "warning");
      return;
    }

    let result;
    try {
      result = await window.API.post('/auth/student/login', { index_number: indexVal, password: passwordVal });
    } catch (err) {
      this.showToast(err.message || 'Login failed. Check your index number and password.', 'error');
      return;
    }

    window.API.setToken(result.token);
    // Normalise to the shape the rest of the UI expects (uses .index).
    const matched = {
      index: result.student.index_number,
      name: result.student.name,
      email: result.student.email,
      phone: result.student.phone,
      level: result.student.level,
      programme: result.student.programme,
    };
    localStorage.setItem('current_student_session', JSON.stringify(matched));
    this.state.loggedStudent = matched;

    document.getElementById('logged-student-name').textContent = matched.name;
    document.getElementById('student-session-badge').style.display = 'flex';

    const navTabTrack = document.getElementById('nav-tab-track');
    if (navTabTrack) {
      navTabTrack.innerHTML = '<i data-lucide="layout-dashboard"></i> Dashboard';
    }

    const dbName = document.getElementById('db-profile-name');
    if (dbName) {
      dbName.textContent = matched.name;
    }

    await this.refreshComplaints();
    this.showView('track');
    this.showToast(`Welcome back, ${matched.name}!`, "success");
  },

  // Student Logout
  handleLogout() {
    if (!confirm("Are you sure you want to log out of the student portal?")) {
      return;
    }
    window.API.clearToken();
    localStorage.removeItem('current_student_session');
    this.state.loggedStudent = null;
    this.state.activeStudentComplaintId = null;
    this.state.complaints = [];
    
    document.getElementById('student-session-badge').style.display = 'none';
    
    const navTabTrack = document.getElementById('nav-tab-track');
    if (navTabTrack) {
      navTabTrack.innerHTML = '<i data-lucide="log-in"></i> Sign In';
    }
    
    this.showView('landing');
    this.showToast("You have been logged out successfully.", "info");
  },

  // Reset form views
  resetFilingForm() {
    document.getElementById('student-file-panel').style.display = 'block';
    document.getElementById('student-receipt-panel').style.display = 'none';
    document.getElementById('complaint-form').reset();
    this.state.selectedProgramme = null;
    document.getElementById('stud-programme-search').value = '';
    this.updateRoutingPreview();
  },

  // Form Submission (Public — no login required, per the "instant public
  // filings" FAQ. The typed name/index identify the filer.)
  async handleFormSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('stud-name').value.trim();
    const index = document.getElementById('stud-index').value.trim();
    const category = document.getElementById('comp-category').value;
    const subject = document.getElementById('comp-subject').value.trim();
    const desc = document.getElementById('comp-desc').value.trim();
    const urgency = document.getElementById('comp-urgency').value;

    const prog = this.state.selectedProgramme;
    if (!prog) {
      this.showToast("Please search and select your Programme of study.", "warning");
      return;
    }

    const recipient = this.calculateRouting(category, prog.name);

    const fileInput = document.getElementById('comp-file');
    const file = fileInput && fileInput.files[0];
    if (file && file.size > 5 * 1024 * 1024) {
      this.showToast("Attachment is too large. Maximum size is 5MB.", "warning");
      return;
    }

    const formData = new FormData();
    formData.append('studentName', name);
    formData.append('studentIndex', index);
    formData.append('subject', subject);
    formData.append('category', category);
    formData.append('urgency', urgency);
    formData.append('description', desc);
    formData.append('programmeName', prog.name);
    if (file) formData.append('attachment', file);

    let ticket;
    try {
      ticket = await window.API.postForm('/complaints', formData);
    } catch (err) {
      this.showToast(err.message || 'Could not submit your complaint.', 'error');
      return;
    }

    const uniqueId = ticket.id;
    await this.refreshComplaints();

    // Populate receipt page
    document.getElementById('receipt-track-code').textContent = uniqueId;
    document.getElementById('receipt-stud-name').textContent = ticket.studentName;
    document.getElementById('receipt-stud-index').textContent = ticket.studentIndex;
    document.getElementById('receipt-programme').textContent = prog.name;
    document.getElementById('receipt-faculty').textContent = recipient.facultyName;
    document.getElementById('receipt-category').textContent = category;
    document.getElementById('receipt-routed-to').textContent = `${recipient.role} (${recipient.name})`;

    const attRow = document.getElementById('receipt-attachment-row');
    const attLink = document.getElementById('receipt-attachment-link');
    if (ticket.attachment) {
      attRow.style.display = 'flex';
      attLink.textContent = ticket.attachment.originalName;
      attLink.onclick = (ev) => {
        ev.preventDefault();
        window.downloadComplaintAttachment(ticket.id, ticket.attachment.originalName,
          (err) => this.showToast(err.message || 'Could not download the attachment.', 'error'));
      };
    } else {
      attRow.style.display = 'none';
    }

    // Toggle panels
    document.getElementById('student-file-panel').style.display = 'none';
    document.getElementById('student-receipt-panel').style.display = 'block';
    
    this.state.activeStudentComplaintId = uniqueId;
    this.showToast("Grievance registered and routed successfully!", "success");
    
    if (window.lucide) lucide.createIcons();
  },

  copyReceiptCode() {
    const code = document.getElementById('receipt-track-code').textContent;
    navigator.clipboard.writeText(code).then(() => {
      this.showToast("Tracking code copied to clipboard!", "info");
    }).catch(err => {
      console.error("Clipboard copy failed: ", err);
    });
  },

  goToTrackAfterFiling() {
    this.showView('track');
  },

  // Student Search (Deprecated / Redirects to history load)
  searchStudentComplaints() {
    this.renderStudentHistory();
  },

  handleSearch() {
    this.renderStudentHistory();
  },

  renderStudentHistory() {
    const list = document.getElementById('student-history-list');
    if (!list || !this.state.loggedStudent) return;

    this.loadState();
    const studentIndex = this.state.loggedStudent.index;
    let studentComplaints = this.state.complaints.filter(c => c.studentIndex === studentIndex);

    // Apply search filter if query is present
    const searchInput = document.getElementById('student-search-input');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (query) {
      studentComplaints = studentComplaints.filter(c => 
        c.id.toLowerCase().includes(query) || 
        c.subject.toLowerCase().includes(query)
      );
    }

    // Sort complaints by newest updated/resent first
    studentComplaints.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    list.innerHTML = '';

    const placeholder = document.getElementById('student-workspace-placeholder');
    const content = document.getElementById('student-workspace-content');

    if (studentComplaints.length === 0) {
      list.innerHTML = `
        <div class="no-complaints-fallback animate-fade-in">
          <i data-lucide="inbox"></i>
          <p>No complaints filed yet.</p>
        </div>
      `;
      if (placeholder) placeholder.style.display = 'flex';
      if (content) content.style.display = 'none';
    } else {
      // Auto-load active student complaint if not set
      if (!this.state.activeStudentComplaintId && studentComplaints.length > 0) {
        this.state.activeStudentComplaintId = studentComplaints[0].id;
      }

      studentComplaints.forEach(c => {
        const item = document.createElement('div');
        item.className = `complaint-list-item animate-fade-in ${this.state.activeStudentComplaintId === c.id ? 'active' : ''}`;
        
        // Calculate delay parameters to show a quick "Resend Alert" button in history list
        let isDelayed = false;
        if (c.status !== 'Resolved' && c.status !== 'Rejected') {
          let limitHours = 72; // default medium
          if (c.urgency === 'Urgent' || c.urgency === 'Critical') limitHours = 24;
          else if (c.urgency === 'High') limitHours = 48;
          else if (c.urgency === 'Low') limitHours = 120;

          const start = new Date(c.lastRemindedAt || c.createdAt);
          const now = new Date();
          const diffHours = (now - start) / (1000 * 60 * 60);
          if (diffHours >= limitHours) {
            isDelayed = true;
          }
        }

        item.onclick = (e) => {
          // If clicked the resend button itself, prevent selecting
          if (e.target.closest('.btn-resend-inline')) return;
          
          this.state.activeStudentComplaintId = c.id;
          document.querySelectorAll('#student-history-list .complaint-list-item').forEach(el => el.classList.remove('active'));
          item.classList.add('active');
          this.renderStudentTracker();
        };

        item.innerHTML = `
          <div class="item-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
            <span class="item-id" style="font-weight: 700; color: var(--accent);">${c.id}</span>
            <span class="item-date" style="font-size: 0.75rem; color: var(--text-muted);">${this.formatDate(c.createdAt)}</span>
          </div>
          <div class="item-subject" style="font-weight: 600; margin-bottom: 0.25rem;">${c.subject}</div>
          <div class="item-details" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-muted);">
            <span class="badge badge-urgency-${c.urgency.toLowerCase()}">${c.urgency}</span>
            <span class="badge badge-status-${c.status.replace(' ', '-').toLowerCase()}">${c.status}</span>
          </div>
        `;

        if (isDelayed) {
          const delayBanner = document.createElement('div');
          delayBanner.className = 'btn-resend-inline';
          delayBanner.style.marginTop = '0.5rem';
          delayBanner.style.padding = '0.4rem 0.6rem';
          delayBanner.style.background = 'rgba(229, 62, 62, 0.08)';
          delayBanner.style.border = '1px solid rgba(229, 62, 62, 0.2)';
          delayBanner.style.borderRadius = '6px';
          delayBanner.style.display = 'flex';
          delayBanner.style.justifyContent = 'space-between';
          delayBanner.style.alignItems = 'center';
          delayBanner.style.gap = '0.5rem';

          delayBanner.innerHTML = `
            <span style="font-size: 0.75rem; color: var(--status-rejected); font-weight: 600;">Delayed Resolution</span>
            <button class="btn btn-danger" onclick="app.resendComplaint('${c.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; text-transform: none; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;">
              <i data-lucide="refresh-cw" style="width: 10px; height: 10px;"></i> Resend
            </button>
          `;
          item.appendChild(delayBanner);
        }

        list.appendChild(item);
      });
    }

    if (window.lucide) lucide.createIcons();
  },

  // Render Student Tracker Workspace
  renderStudentTracker() {
    const id = this.state.activeStudentComplaintId;
    const placeholder = document.getElementById('student-workspace-placeholder');
    const content = document.getElementById('student-workspace-content');

    if (!id) {
      if (placeholder) placeholder.style.display = 'flex';
      if (content) content.style.display = 'none';
      return;
    }

    this.loadState();
    const complaint = this.state.complaints.find(c => c.id === id);
    if (!complaint) {
      if (placeholder) placeholder.style.display = 'flex';
      if (content) content.style.display = 'none';
      return;
    }

    if (placeholder) placeholder.style.display = 'none';
    if (content) content.style.display = 'flex';

    // Populate Metadata
    document.getElementById('track-meta-id').textContent = complaint.id;
    document.getElementById('track-meta-category').textContent = complaint.category;
    document.getElementById('track-meta-date').textContent = this.formatDate(complaint.createdAt);
    document.getElementById('track-meta-owner').textContent = complaint.assignedTo || "Unassigned";

    // Filer Info Metadata
    const nameEl = document.getElementById('track-meta-student-name');
    const indexEl = document.getElementById('track-meta-student-index');
    const progEl = document.getElementById('track-meta-student-prog');
    const levelEl = document.getElementById('track-meta-student-level');
    if (nameEl) nameEl.textContent = complaint.studentName || "N/A";
    if (indexEl) indexEl.textContent = complaint.studentIndex || "N/A";
    if (progEl) progEl.textContent = complaint.studentProgramme || "N/A";
    if (levelEl) levelEl.textContent = (complaint.studentLevel || "N/A") + " L";
    
    // Status Badge
    const badgeContainer = document.getElementById('track-status-badge-container');
    badgeContainer.innerHTML = `<span class="badge badge-status-${complaint.status.replace(' ', '-').toLowerCase()}">${complaint.status}</span>`;

    // Urgency Badge
    const urgSpan = document.getElementById('track-meta-urgency');
    urgSpan.className = `badge badge-urgency-${complaint.urgency.toLowerCase()}`;
    urgSpan.textContent = complaint.urgency;

    // Division
    document.getElementById('track-meta-department').textContent = complaint.studentFaculty;

    // Subject & Desc
    document.getElementById('track-subject-lbl').textContent = complaint.subject;
    document.getElementById('track-desc-body').textContent = complaint.description;

    // Supporting attachment
    const trackAttRow = document.getElementById('track-attachment-row');
    if (complaint.attachment) {
      trackAttRow.style.display = 'block';
      document.getElementById('track-attachment-name').textContent = complaint.attachment.originalName;
      document.getElementById('track-attachment-link').onclick = (ev) => {
        ev.preventDefault();
        window.downloadComplaintAttachment(complaint.id, complaint.attachment.originalName,
          (err) => this.showToast(err.message || 'Could not download the attachment.', 'error'));
      };
    } else {
      trackAttRow.style.display = 'none';
    }

    // Render Unresolved delay reminder
    this.renderDelayReminder(complaint);

    // Render Appointment notice card
    this.renderAppointmentCard(complaint);

    // Render Timeline Progress Bar
    const statusSequence = ["Submitted", "Under Review", "In Progress", "Resolved"];
    const timelineProgress = document.getElementById('track-timeline-progress');
    const nodes = {
      "Submitted": document.getElementById('node-submitted'),
      "Under Review": document.getElementById('node-review'),
      "In Progress": document.getElementById('node-progress'),
      "Resolved": document.getElementById('node-resolved')
    };

    Object.keys(nodes).forEach(k => {
      if (nodes[k]) nodes[k].classList.remove('active', 'completed');
    });

    let activeStepIndex = statusSequence.indexOf(complaint.status);
    if (complaint.status === "Rejected") {
      activeStepIndex = 3;
      if (nodes["Resolved"]) {
        nodes["Resolved"].querySelector('.timeline-label').textContent = "Rejected";
        nodes["Resolved"].querySelector('.timeline-label').style.color = 'var(--status-rejected)';
        nodes["Resolved"].querySelector('.timeline-icon').style.background = 'var(--status-rejected)';
        nodes["Resolved"].querySelector('.timeline-icon').style.borderColor = 'var(--status-rejected)';
      }
    } else {
      if (nodes["Resolved"]) {
        nodes["Resolved"].querySelector('.timeline-label').textContent = "Resolved";
        nodes["Resolved"].querySelector('.timeline-label').style.color = '';
        nodes["Resolved"].querySelector('.timeline-icon').style.background = '';
        nodes["Resolved"].querySelector('.timeline-icon').style.borderColor = '';
      }
    }

    if (activeStepIndex >= 0) {
      const widthPercent = (activeStepIndex / 3) * 100;
      timelineProgress.style.width = `${widthPercent}%`;

      for (let i = 0; i <= activeStepIndex; i++) {
        const stepVal = statusSequence[i];
        const node = nodes[stepVal];
        if (node) {
          if (i === activeStepIndex && complaint.status !== "Resolved" && complaint.status !== "Rejected") {
            node.classList.add('active');
          } else {
            node.classList.add('completed');
          }
        }
      }
    }

    // Render Activity History Log
    const logsContainer = document.getElementById('track-timeline-logs');
    logsContainer.innerHTML = '';
    
    complaint.timeline.forEach((log, index) => {
      const entry = document.createElement('div');
      entry.className = `timeline-log-entry ${index === complaint.timeline.length - 1 ? 'primary' : ''}`;
      
      entry.innerHTML = `
        <div class="timeline-log-header">
          <span class="timeline-log-title">${log.action}</span>
          <span class="timeline-log-date">${this.formatDate(log.date)}</span>
        </div>
        <p class="timeline-log-message">${log.message}</p>
        <span class="timeline-log-by">by ${log.by}</span>
      `;
      logsContainer.appendChild(entry);
    });

    // Render Administrative Instructions Logs (One-way feedback)
    const instructionsLog = document.getElementById('track-instructions-log');
    if (instructionsLog) {
      instructionsLog.innerHTML = '';
      const officialComments = complaint.comments.filter(c => c.isAdmin);
      
      if (officialComments.length === 0) {
        instructionsLog.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 1rem 0; font-style: italic; margin: 0;">No official administrative directions logged yet.</p>`;
      } else {
        officialComments.forEach(c => {
          const entry = document.createElement('div');
          entry.style.background = '#ffffff';
          entry.style.border = '1px solid var(--border-color)';
          entry.style.borderRadius = '6px';
          entry.style.padding = '1rem';
          entry.style.boxShadow = 'var(--shadow-sm)';
          
          entry.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem; border-bottom: 1px dashed var(--border-color); padding-bottom: 0.25rem;">
              <span style="font-weight: 700; color: var(--accent);"><i data-lucide="shield" style="width: 12px; height: 12px; vertical-align: middle; display: inline-block; margin-right: 3px;"></i> Official instruction from ${c.by}</span>
              <span>${this.formatDate(c.date)}</span>
            </div>
            <div style="font-size: 0.9rem; line-height: 1.5; color: #1b3024; font-weight: 500; white-space: pre-wrap;">${c.message}</div>
          `;
          instructionsLog.appendChild(entry);
        });
      }
    }

    // Render Directives Checklist (Student Side)
    const directivesBox = document.getElementById('track-directives-box');
    const directivesList = document.getElementById('track-directives-list');
    
    if (directivesBox && directivesList) {
      if (!complaint.directives) complaint.directives = [];
      
      if (complaint.directives.length === 0) {
        directivesBox.style.display = 'none';
      } else {
        directivesBox.style.display = 'block';
        directivesList.innerHTML = '';
        
        complaint.directives.forEach(dir => {
          const div = document.createElement('div');
          div.style.display = 'flex';
          div.style.alignItems = 'center';
          div.style.justifyContent = 'space-between';
          div.style.background = '#ffffff';
          div.style.border = '1px solid var(--border-color)';
          div.style.padding = '0.75rem 1rem';
          div.style.borderRadius = '8px';
          
          const labelSpan = document.createElement('span');
          labelSpan.textContent = dir.text;
          if (dir.completed) {
            labelSpan.style.textDecoration = 'line-through';
            labelSpan.style.color = 'var(--text-muted)';
          } else {
            labelSpan.style.fontWeight = '600';
          }
          
          const statusBadge = document.createElement('span');
          if (dir.completed) {
            statusBadge.className = 'badge badge-status-resolved';
            statusBadge.textContent = 'Completed';
          } else {
            statusBadge.className = 'badge badge-status-review';
            statusBadge.textContent = 'Action Required';
          }
          
          const leftWrapper = document.createElement('div');
          leftWrapper.style.display = 'flex';
          leftWrapper.style.alignItems = 'center';
          leftWrapper.style.gap = '0.75rem';
          
          const icon = document.createElement('i');
          icon.setAttribute('data-lucide', dir.completed ? 'check-circle' : 'circle');
          icon.style.stroke = dir.completed ? 'var(--status-resolved)' : 'var(--status-review)';
          icon.style.width = '18px';
          icon.style.height = '18px';
          
          leftWrapper.appendChild(icon);
          leftWrapper.appendChild(labelSpan);
          
          div.appendChild(leftWrapper);
          div.appendChild(statusBadge);
          
          directivesList.appendChild(div);
        });
      }
    }

    if (window.lucide) lucide.createIcons();
  },

  // Calculate delay metrics and toggle reminder alerts
  renderDelayReminder(complaint) {
    const reminderBox = document.getElementById('track-delay-reminder');
    const textLabel = document.getElementById('delay-reminder-text');
    const resendBtn = document.getElementById('btn-resend-complaint');
    if (!reminderBox || !textLabel || !resendBtn) return;

    if (complaint.status === 'Resolved' || complaint.status === 'Rejected') {
      reminderBox.style.display = 'none';
      return;
    }

    // Urgency rules in hours: Critical (24h), High (48h), Medium (72h), Low (120h)
    let limitHours = 72; // default medium
    if (complaint.urgency === 'Urgent' || complaint.urgency === 'Critical') limitHours = 24;
    else if (complaint.urgency === 'High') limitHours = 48;
    else if (complaint.urgency === 'Low') limitHours = 120;

    const start = new Date(complaint.lastRemindedAt || complaint.createdAt);
    const now = new Date();
    const diffHours = (now - start) / (1000 * 60 * 60);

    if (diffHours >= limitHours) {
      const daysCount = (diffHours / 24).toFixed(1);
      textLabel.innerHTML = `This ticket has been unresolved for <strong>${daysCount} days</strong> (Urgency threshold: ${limitHours} hours). You can click below to resend a reminder to the resolving office's active desk.`;
      resendBtn.onclick = () => this.resendComplaint(complaint.id);
      reminderBox.style.display = 'block';
    } else {
      reminderBox.style.display = 'none';
    }
  },

  async resendComplaint(complaintId) {
    try {
      await window.API.post(`/complaints/${encodeURIComponent(complaintId)}/remind`);
    } catch (err) {
      if (err.status === 401) { this.forceLogout(); return; }
      this.showToast(err.message || 'Could not send the reminder.', 'error');
      return;
    }
    await this.refreshComplaints();
    this.renderStudentHistory();
    this.renderStudentTracker();
    this.showToast("Ledger reminder sent to resolving officer successfully!", "success");
  },

  printHistory() {
    this.loadState();
    const studentIndex = this.state.loggedStudent.index;
    const studentComplaints = this.state.complaints.filter(c => c.studentIndex === studentIndex);

    if (studentComplaints.length === 0) {
      this.showToast("No complaints in your history to print.", "warning");
      return;
    }

    let html = `
      <div style="text-align: center; margin-bottom: 2rem; font-family: sans-serif;">
        <h2 style="color: #0d522c; margin-bottom: 0.25rem;">UNIVERSITY OF MINES AND TECHNOLOGY (UMaT)</h2>
        <h3 style="margin-top: 0; color: #4a5568;">Student Grievance History Summary Report</h3>
        <p style="font-size: 0.9rem; color: #718096;">Filer Name: <strong>${this.state.loggedStudent.name}</strong> | Index: <strong>${studentIndex}</strong> | Date: ${new Date().toLocaleDateString()}</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 0.9rem; margin-top: 1.5rem;">
        <thead>
          <tr style="background: #edf2f7; border-bottom: 2px solid #cbd5e0;">
            <th style="padding: 0.75rem; text-align: left; border: 1px solid #cbd5e0;">Ticket ID</th>
            <th style="padding: 0.75rem; text-align: left; border: 1px solid #cbd5e0;">Date Filed</th>
            <th style="padding: 0.75rem; text-align: left; border: 1px solid #cbd5e0;">Category</th>
            <th style="padding: 0.75rem; text-align: left; border: 1px solid #cbd5e0;">Subject</th>
            <th style="padding: 0.75rem; text-align: left; border: 1px solid #cbd5e0;">Status</th>
          </tr>
        </thead>
        <tbody>
    `;

    studentComplaints.forEach(c => {
      html += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 0.75rem; border: 1px solid #e2e8f0; font-weight: bold; color: #0d522c;">${c.id}</td>
          <td style="padding: 0.75rem; border: 1px solid #e2e8f0;">${this.formatDate(c.createdAt)}</td>
          <td style="padding: 0.75rem; border: 1px solid #e2e8f0;">${c.category}</td>
          <td style="padding: 0.75rem; border: 1px solid #e2e8f0;">${c.subject}</td>
          <td style="padding: 0.75rem; border: 1px solid #e2e8f0; font-weight: bold;">${c.status}</td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
      <div style="margin-top: 3rem; text-align: right; font-size: 0.8rem; color: #a0aec0; border-top: 1px solid #e2e8f0; padding-top: 1rem;">
        Generated by UMaT Campus Complaint System student tracking desk.
      </div>
    `;

    // Inject into print container
    let container = document.getElementById('print-history-table-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'print-history-table-container';
      container.className = 'print-only';
      document.body.appendChild(container);
    }
    container.innerHTML = html;

    // Toggle body class, trigger print, and restore
    document.body.classList.add('print-history-active');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('print-history-active');
    }, 500);
  },

  // Render appointment notice card
  renderAppointmentCard(complaint) {
    const card = document.getElementById('track-appointment-card');
    const typeLabel = document.getElementById('appt-type-lbl');
    const timeLabel = document.getElementById('appt-time-lbl');
    const venueLabel = document.getElementById('appt-venue-lbl');
    const instLabel = document.getElementById('appt-instructions-lbl');

    if (!card || !typeLabel || !timeLabel || !venueLabel || !instLabel) return;

    if (complaint.appointment) {
      typeLabel.textContent = complaint.appointment.type === 'in-person' ? 'In-Person Meeting' : 'Guidance Counselor Session';
      timeLabel.textContent = this.formatDate(complaint.appointment.dateTime);
      venueLabel.textContent = complaint.appointment.venue;
      
      if (complaint.appointment.completed) {
        card.style.borderColor = 'var(--status-resolved)';
        card.style.background = 'rgba(46, 196, 182, 0.03)';
        card.querySelector('.badge').className = 'badge badge-status-resolved';
        card.querySelector('.badge').textContent = 'Completed';
        card.querySelector('h3').style.color = 'var(--status-resolved)';
        card.querySelector('h3').innerHTML = `<i data-lucide="check-circle" style="stroke: var(--status-resolved); width: 20px; height: 20px; vertical-align: middle;"></i> Meeting Completed`;
        
        instLabel.innerHTML = `<strong>Outcome & Feedback:</strong> ${complaint.appointment.feedback || "The meeting was successfully held."}`;
      } else {
        card.style.borderColor = 'var(--status-review)';
        card.style.background = 'rgba(183, 121, 31, 0.03)';
        card.querySelector('.badge').className = 'badge badge-status-review';
        card.querySelector('.badge').textContent = 'Action Required';
        card.querySelector('h3').style.color = 'var(--status-review)';
        card.querySelector('h3').innerHTML = `<i data-lucide="calendar" style="stroke: var(--status-review); width: 20px; height: 20px; vertical-align: middle;"></i> Scheduled Action: Appointment Set`;
        
        instLabel.textContent = complaint.appointment.instructions || "No special instructions logged.";
      }
      
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
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

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      toast.style.transition = 'all 0.5s ease-out';
      setTimeout(() => {
        toast.remove();
      }, 500);
    }, 4000);
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

  // Profile settings dropdown toggle
  toggleProfileDropdown(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('db-profile-dropdown');
    const widget = document.querySelector('.dashboard-profile-widget');
    if (dropdown) {
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';
      if (widget) {
        widget.classList.toggle('active', !isVisible);
      }
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
    
    // Update all theme dropdown elements in DOM
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
    
    // Close the dropdown first
    const dropdown = document.getElementById('db-profile-dropdown');
    const widget = document.querySelector('.dashboard-profile-widget');
    if (dropdown) dropdown.style.display = 'none';
    if (widget) widget.classList.remove('active');

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
    if (!this.state.loggedStudent) return;

    const currentPwd = document.getElementById('change-pwd-current').value;
    const newPwd = document.getElementById('change-pwd-new').value;
    const confirmPwd = document.getElementById('change-pwd-confirm').value;

    if (newPwd !== confirmPwd) {
      this.showToast("New passwords do not match.", "error");
      return;
    }

    try {
      await window.API.put('/auth/student/password', { currentPassword: currentPwd, newPassword: newPwd });
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

  startClock() {
    // Dismiss dropdown on outside clicks
    document.addEventListener('click', () => {
      const dropdown = document.getElementById('db-profile-dropdown');
      const widget = document.querySelector('.dashboard-profile-widget');
      if (dropdown) dropdown.style.display = 'none';
      if (widget) widget.classList.remove('active');
    });
  },

  startHeroBackgroundCycle() {
    const slides = document.querySelectorAll('.hero-bg-slide');
    if (slides.length < 2) return;
    let currentSlide = 0;
    setInterval(() => {
      slides[currentSlide].classList.remove('active');
      currentSlide = (currentSlide + 1) % slides.length;
      slides[currentSlide].classList.add('active');
    }, 6000);
  },

  startStudentLoginBackgroundCycle() {
    const slides = document.querySelectorAll('.student-login-bg-container .login-bg-slide');
    if (slides.length < 2) return;
    let currentSlide = 0;
    setInterval(() => {
      slides[currentSlide].classList.remove('active');
      currentSlide = (currentSlide + 1) % slides.length;
      slides[currentSlide].classList.add('active');
    }, 6000);
  }
};

// Bind to window load
window.addEventListener('DOMContentLoaded', () => {
  app.init();
  window.app = app;
});

// Re-sync from the backend when the tab regains focus, so staff updates
// (status changes, directives, appointments) show up for the student.
window.addEventListener('focus', () => {
  if (app.state.loggedStudent) {
    app.loadAndRenderStudent();
  }
});
