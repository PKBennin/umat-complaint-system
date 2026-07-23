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
  async init() {
    window.API.configure({ tokenKey: 'umat_student_token' });
    this.loadTheme();
    await this.initMetadata();
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

    if (window.lucide) lucide.createIcons();
  },

  async initMetadata() {
    try {
      const data = await window.API.get('/meta');
      this.state.dbProgrammes = data.programmes;
      this.state.dbFaculties = {};
      data.faculties.forEach(f => {
        this.state.dbFaculties[f.faculty_key] = f.name;
      });
    } catch (err) {
      console.error('Failed to load DB metadata:', err);
      // Fallback: build temporary database mapping from local seedData
      this.state.dbProgrammes = window.PROGRAMMES.map((p, idx) => ({
        id: idx + 1,
        name: p.name,
        facultyKey: p.facultyKey,
        department: p.department
      }));
      this.state.dbFaculties = window.FACULTIES;
    }
  },

  // Navigate to filing form with selected category pre-filled
  selectCategoryAndFile(category) {
    this.state.preSelectedCategory = category;
    this.showView('file');
  },

  // Handle floating quick complaint button click by routing to landing and scrolling to submission options
  handleQuickComplaintClick() {
    if (this.state.loggedStudent) {
      this.showView('file');
      return;
    }
    this.showView('landing');
    setTimeout(() => {
      const section = document.getElementById('submit-methods-section');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 80);
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
      this.checkNotifications(this.state.complaints);
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
    this.renderStudentDashboard();
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
    this.resetStudentUI();
    this.showToast('Your session has expired. Please sign in again.', 'warning');
    this.showView('landing');
  },

  resetStudentUI() {
    const welcomeTitle = document.getElementById('dash-welcome-title');
    if (welcomeTitle) welcomeTitle.textContent = "Welcome back, Student";
    
    const countAwaiting = document.getElementById('dash-count-awaiting');
    if (countAwaiting) countAwaiting.textContent = '0';
    
    const countProgress = document.getElementById('dash-count-progress');
    if (countProgress) countProgress.textContent = '0';
    
    const countResolved = document.getElementById('dash-count-resolved');
    if (countResolved) countResolved.textContent = '0';

    const loggedName = document.getElementById('logged-student-name');
    if (loggedName) loggedName.textContent = 'Student';

    const dbName = document.getElementById('db-profile-name');
    if (dbName) dbName.textContent = 'Student';

    const notifBadge = document.getElementById('student-notification-badge');
    if (notifBadge) notifBadge.style.display = 'none';
    const notifBtn = document.getElementById('student-notification-btn');
    if (notifBtn) notifBtn.classList.remove('pulse');
    const notifList = document.getElementById('student-notification-list');
    if (notifList) {
      notifList.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          No notifications yet.
        </div>
      `;
    }
  },

  formatStudentName(name) {
    if (!name) return 'STUDENT';
    if (name.includes(',')) return name;
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return name.toUpperCase();
    const lastName = parts[parts.length - 1].toUpperCase();
    const otherParts = parts.slice(0, parts.length - 1).map(p => {
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    });
    return `${lastName}, ${otherParts.join(' ')}`;
  },

  checkNotifications(newComplaints) {
    if (!this.state.loggedStudent) return;
    const studentIdx = this.state.loggedStudent.index;
    const cacheKeyStatus = `past_complaint_statuses_${studentIdx}`;
    const cacheKeyNotifs = `student_notifications_${studentIdx}`;
    
    let pastStatuses = JSON.parse(localStorage.getItem(cacheKeyStatus) || '{}');
    let notifications = JSON.parse(localStorage.getItem(cacheKeyNotifs) || '[]');
    
    const isFirstRun = Object.keys(pastStatuses).length === 0;
    let updatedStatuses = {};
    let hasNewNotification = false;
    
    newComplaints.forEach(c => {
      updatedStatuses[c.id] = c.status;
      
      if (!isFirstRun && pastStatuses[c.id] && pastStatuses[c.id] !== c.status) {
        notifications.unshift({
          id: Date.now() + Math.random().toString(36).substr(2, 5),
          complaintId: c.id,
          text: `Your complaint ${c.id} status has been updated to ${c.status}.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          unread: true
        });
        hasNewNotification = true;
      }
    });
    
    localStorage.setItem(cacheKeyStatus, JSON.stringify(updatedStatuses));
    localStorage.setItem(cacheKeyNotifs, JSON.stringify(notifications));
    
    this.renderNotifications();
    if (hasNewNotification) {
      this.showToast('You have a new status update notification!', 'info');
    }
  },

  renderNotifications() {
    if (!this.state.loggedStudent) {
      const widget = document.getElementById('student-notification-widget');
      if (widget) widget.style.display = 'none';
      const badge = document.getElementById('student-notification-badge');
      if (badge) badge.style.display = 'none';
      const btn = document.getElementById('student-notification-btn');
      if (btn) btn.classList.remove('pulse');
      const list = document.getElementById('student-notification-list');
      if (list) {
        list.innerHTML = `
          <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
            No notifications yet.
          </div>
        `;
      }
      return;
    }
    
    const studentIdx = this.state.loggedStudent.index;
    const cacheKeyNotifs = `student_notifications_${studentIdx}`;
    const notifications = JSON.parse(localStorage.getItem(cacheKeyNotifs) || '[]');
    
    const widget = document.getElementById('student-notification-widget');
    if (widget) widget.style.display = 'flex';
    
    const btn = document.getElementById('student-notification-btn');
    const badge = document.getElementById('student-notification-badge');
    const list = document.getElementById('student-notification-list');
    
    const unreadCount = notifications.filter(n => n.unread).length;
    
    if (unreadCount > 0) {
      if (badge) {
        badge.style.display = 'block';
        badge.textContent = unreadCount;
      }
      if (btn) btn.classList.add('pulse');
    } else {
      if (badge) badge.style.display = 'none';
      if (btn) btn.classList.remove('pulse');
    }
    
    if (list) {
      list.innerHTML = '';
      if (notifications.length === 0) {
        list.innerHTML = `
          <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
            No notifications yet.
          </div>
        `;
      } else {
        notifications.forEach(n => {
          const item = document.createElement('div');
          item.className = `notification-item ${n.unread ? 'unread' : ''}`;
          item.innerHTML = `
            <span class="notification-item-text">${n.text}</span>
            <span class="notification-item-time">${n.timestamp}</span>
          `;
          item.onclick = () => {
            this.handleNotificationClick(n);
          };
          list.appendChild(item);
        });
      }
    }
  },

  handleNotificationClick(notification) {
    if (!this.state.loggedStudent) return;
    const studentIdx = this.state.loggedStudent.index;
    const cacheKeyNotifs = `student_notifications_${studentIdx}`;
    let notifications = JSON.parse(localStorage.getItem(cacheKeyNotifs) || '[]');
    const notif = notifications.find(n => n.id === notification.id);
    if (notif) notif.unread = false;
    localStorage.setItem(cacheKeyNotifs, JSON.stringify(notifications));
    
    const dropdown = document.getElementById('student-notification-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    
    this.state.activeStudentComplaintId = notification.complaintId;
    this.loadAndRenderStudent();
    this.showView('track');
    
    this.renderNotifications();
  },

  markAllNotificationsRead() {
    if (!this.state.loggedStudent) return;
    const studentIdx = this.state.loggedStudent.index;
    const cacheKeyNotifs = `student_notifications_${studentIdx}`;
    let notifications = JSON.parse(localStorage.getItem(cacheKeyNotifs) || '[]');
    notifications.forEach(n => n.unread = false);
    localStorage.setItem(cacheKeyNotifs, JSON.stringify(notifications));
    
    this.renderNotifications();
  },

  toggleNotificationDropdown(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const dropdown = document.getElementById('student-notification-dropdown');
    if (dropdown) {
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';
    }
    const profileDropdown = document.getElementById('db-profile-dropdown');
    if (profileDropdown) profileDropdown.style.display = 'none';
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
        
        // Check if student profile is incomplete
        if (this.state.loggedStudent && !this.state.loggedStudent.is_profile_complete) {
          this.showProfileCompletionModal();
        } else {
          this.closeProfileCompletionModal();
          // Pull fresh complaints from the backend for the restored session.
          this.loadAndRenderStudent();
        }

        // Show session badge in header
        document.getElementById('logged-student-name').textContent = this.formatStudentName(this.state.loggedStudent.name);
        document.getElementById('student-session-badge').style.display = 'flex';
        this.renderNotifications();
        
        if (navTabTrack) {
          navTabTrack.innerHTML = '<i data-lucide="layout-dashboard"></i> Dashboard';
        }
        
        const dbName = document.getElementById('db-profile-name');
        if (dbName) {
          dbName.textContent = this.formatStudentName(this.state.loggedStudent.name);
        }
      } catch (e) {
        localStorage.removeItem('current_student_session');
      }
    } else {
      if (navTabTrack) {
        navTabTrack.innerHTML = '<i data-lucide="log-in"></i> Sign In';
      }
      this.closeProfileCompletionModal();
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
    if (this.state.loggedStudent && !this.state.loggedStudent.is_profile_complete) {
      this.showProfileCompletionModal();
      return;
    }
    this.closeProfileCompletionModal();

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
    
    // Toggle body class helper for CSS targeting
    if (viewName === 'file') {
      document.body.classList.add('viewing-file-form');
    } else {
      document.body.classList.remove('viewing-file-form');
    }
    if (viewName === 'track') {
      document.body.classList.add('view-track-active');
      document.documentElement.classList.add('view-track-active');
    } else {
      document.body.classList.remove('view-track-active');
      document.documentElement.classList.remove('view-track-active');
    }

    
    // Hide floating action button on the filing form page itself
    const floatingBtn = document.querySelector('.btn-floating-quick');
    if (floatingBtn) {
      floatingBtn.style.display = (viewName === 'file') ? 'none' : 'flex';
    }

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

      if (!this.state.loggedStudent && !this.state.activeStudentComplaintId) {
        document.getElementById('student-login-panel-container').style.display = 'flex';
        document.getElementById('student-track-workspace').style.display = 'none';
      } else {
        document.getElementById('student-login-panel-container').style.display = 'none';
        document.getElementById('student-track-workspace').style.display = 'block';

        // Always default to the empty state first. Only renderStudentTracker()
        // (once it confirms a real, loaded complaint) is allowed to reveal
        // #student-workspace-content — this prevents the unpopulated
        // template (all "-" placeholders / "Subject Title") from ever
        // flashing on screen before a ticket has actually loaded.
        document.getElementById('student-workspace-placeholder').style.display = 'flex';
        document.getElementById('student-workspace-content').style.display = 'none';

        if (this.state.loggedStudent) {
          this.renderStudentHistory();
        }

        if (this.state.activeStudentComplaintId) {
          this.renderStudentTracker();
        } else {
          this.renderStudentDashboard();
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
      
      if (viewName === 'file' && currentView !== 'file') {
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
    
    const subject = document.getElementById('comp-subject')?.value.trim();
    const desc = document.getElementById('comp-desc')?.value.trim();
    
    return !!(subject || desc);
  },

  // Student Authentication / Anonymous Ticket Checking Submit
  async handleLoginSubmit(e) {
    if (e) e.preventDefault();
    const ticketIdInput = document.getElementById('login-index');
    const ticketIdVal = ticketIdInput ? ticketIdInput.value.trim().toUpperCase() : '';

    if (!ticketIdVal) return;

    if (!ticketIdVal.startsWith('UMAT-')) {
      this.showToast("Please enter a valid Ticket ID (e.g., UMAT-2026-0001). To sign in with your student account, click 'Sign In' in the header.", "warning");
      return;
    }

    try {
      const ticket = await window.API.get(`/complaints/public/track/${encodeURIComponent(ticketIdVal)}`);
      if (!ticket) {
        this.showToast("No ticket found with that Ticket ID.", "error");
        return;
      }
      
      // Load into state as the single complaint
      this.state.complaints = [ticket];
      this.state.activeStudentComplaintId = ticket.id;
      this.state.loggedStudent = null; // guest mode
      
      // Hide session badges
      document.getElementById('student-session-badge').style.display = 'none';
      
      // Reset nav tab wording if present
      const navTabTrack = document.getElementById('nav-tab-track');
      if (navTabTrack) {
        navTabTrack.innerHTML = '<i data-lucide="log-in"></i> Sign In';
      }
      
      // Toggle view
      this.showView('track');
      this.showToast("Ticket status loaded successfully!", "success");
    } catch (err) {
      this.showToast(err.message || 'Ticket not found. Check the Ticket ID.', 'error');
    }
  },

  // Student Account Login Modal Submission
  async handleStudentLoginSubmit(e) {
    if (e) e.preventDefault();
    const indexVal = document.getElementById('signin-student-id').value.trim();
    const passwordVal = document.getElementById('signin-password').value.trim();

    if (!indexVal || !passwordVal) {
      this.showToast("Please enter both student ID and password.", "warning");
      return;
    }

    let result;
    try {
      result = await window.API.post('/auth/student/login', { index_number: indexVal, password: passwordVal });
    } catch (err) {
      this.showToast(err.message || 'Login failed. Check your student ID and password.', 'error');
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
      reference_number: result.student.reference_number,
      is_profile_complete: result.student.is_profile_complete,
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

    this.closeSignInModal();
    this.checkStudentSession();

    if (this.state.loggedStudent && this.state.loggedStudent.is_profile_complete) {
      await this.refreshComplaints();
      if (this.state.preSelectedCategoryAfterLogin) {
        const cat = this.state.preSelectedCategoryAfterLogin;
        this.state.preSelectedCategoryAfterLogin = null;
        this.setAnonymous(false);
        this.selectCategoryAndFile(cat);
      } else {
        this.showView('track');
      }
      this.showToast(`Welcome back, ${matched.name}!`, "success");
    }
  },

  togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      btnEl.innerHTML = '<i data-lucide="eye-off" style="width: 18px; height: 18px;"></i>';
    } else {
      input.type = 'password';
      btnEl.innerHTML = '<i data-lucide="eye" style="width: 18px; height: 18px;"></i>';
    }
    if (window.lucide) lucide.createIcons();
  },

  setStudentAuthMode(mode) {
    const tabLogin = document.getElementById('auth-tab-login');
    const tabSignup = document.getElementById('auth-tab-signup');
    const formLogin = document.getElementById('student-login-form');
    const formSignup = document.getElementById('student-signup-form');
    const headerTitle = document.getElementById('student-auth-title');
    const headerDesc = document.getElementById('student-auth-desc');
    
    if (mode === 'signup') {
      if (tabLogin) {
        tabLogin.style.color = 'var(--text-muted)';
        tabLogin.style.borderBottomColor = 'transparent';
        tabLogin.style.fontWeight = '600';
      }
      if (tabSignup) {
        tabSignup.style.color = 'var(--accent)';
        tabSignup.style.borderBottomColor = 'var(--accent)';
        tabSignup.style.fontWeight = '700';
      }
      if (formLogin) formLogin.style.display = 'none';
      if (formSignup) formSignup.style.display = 'block';
      if (headerTitle) headerTitle.textContent = 'Student Sign Up';
      if (headerDesc) headerDesc.textContent = 'Create an account using your school email to file and track grievances.';
    } else {
      if (tabLogin) {
        tabLogin.style.color = 'var(--accent)';
        tabLogin.style.borderBottomColor = 'var(--accent)';
        tabLogin.style.fontWeight = '700';
      }
      if (tabSignup) {
        tabSignup.style.color = 'var(--text-muted)';
        tabSignup.style.borderBottomColor = 'transparent';
        tabSignup.style.fontWeight = '600';
      }
      if (formLogin) formLogin.style.display = 'block';
      if (formSignup) formSignup.style.display = 'none';
      if (headerTitle) headerTitle.textContent = 'Student Sign In';
      if (headerDesc) headerDesc.textContent = 'Sign in with your student credentials to view and manage all your complaints.';
    }
    if (window.lucide) lucide.createIcons();
  },

  async handleStudentSignupSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    
    if (!email.toLowerCase().endsWith('@st.umat.edu.gh')) {
      this.showToast('Please use your official student email address ending with @st.umat.edu.gh', 'error');
      return;
    }
    
    try {
      const result = await window.API.post('/auth/student/signup', {
        email, password
      });
      
      window.API.setToken(result.token);
      this.state.loggedStudent = result.student;
      localStorage.setItem('current_student_session', JSON.stringify(result.student));
      
      this.closeSignInModal();
      this.checkStudentSession();
      this.showView('track');
      this.showToast('Registration successful! Please complete your profile details.', 'success');
    } catch (err) {
      this.showToast(err.message || 'Registration failed.', 'error');
    }
  },

  showProfileCompletionModal() {
    const modal = document.getElementById('profile-completion-modal');
    if (modal) {
      this.state.isProfileViewMode = false;

      // Restore editable states
      const fnInput = document.getElementById('onboarding-profile-firstname');
      const mnInput = document.getElementById('onboarding-profile-middlename');
      const lnInput = document.getElementById('onboarding-profile-lastname');
      const phoneInput = document.getElementById('onboarding-profile-phone');
      const refInput = document.getElementById('onboarding-profile-ref-num');
      const levelSelect = document.getElementById('onboarding-profile-level');
      const progInput = document.getElementById('onboarding-profile-prog-search');
      const facInput = document.getElementById('onboarding-profile-faculty-search');
      const deptInput = document.getElementById('onboarding-profile-dept-search');

      if (fnInput) {
        fnInput.value = '';
        fnInput.readOnly = false;
        fnInput.style.background = '#ffffff';
        fnInput.style.cursor = 'text';
      }
      if (mnInput) {
        mnInput.value = '';
        mnInput.readOnly = false;
        mnInput.style.background = '#ffffff';
        mnInput.style.cursor = 'text';
      }
      if (lnInput) {
        lnInput.value = '';
        lnInput.readOnly = false;
        lnInput.style.background = '#ffffff';
        lnInput.style.cursor = 'text';
      }
      if (phoneInput) {
        phoneInput.value = this.state.loggedStudent ? this.state.loggedStudent.phone || '' : '';
        phoneInput.readOnly = false;
        phoneInput.style.background = '#ffffff';
        phoneInput.style.cursor = 'text';
      }
      if (refInput) {
        refInput.value = '';
        refInput.readOnly = false;
        refInput.style.background = '#ffffff';
        refInput.style.cursor = 'text';
      }
      if (levelSelect) {
        levelSelect.value = '';
        levelSelect.disabled = false;
        levelSelect.style.background = '#ffffff';
        levelSelect.style.cursor = 'pointer';
      }
      if (progInput) {
        progInput.value = '';
        progInput.readOnly = false;
        progInput.style.background = '#ffffff';
        progInput.style.cursor = 'text';
      }
      if (facInput) {
        facInput.value = '';
        facInput.readOnly = false;
        facInput.style.background = '#ffffff';
        facInput.style.cursor = 'text';
      }
      if (deptInput) {
        deptInput.value = '';
        deptInput.readOnly = false;
        deptInput.style.background = '#ffffff';
        deptInput.style.cursor = 'text';
      }

      // Restore double panels
      const leftPanel = document.querySelector('.onboarding-left-panel');
      const rightPanel = document.querySelector('.onboarding-right-panel');
      if (leftPanel) leftPanel.style.display = 'flex';
      if (rightPanel) {
        rightPanel.style.width = '';
        rightPanel.style.flex = '';
      }

      // Restore Title & Subtitle
      const titleSpan = document.querySelector('.onboarding-right-panel span');
      const titleH3 = document.querySelector('.onboarding-right-panel h3');
      const titleP = document.querySelector('.onboarding-right-panel p');
      if (titleSpan) titleSpan.textContent = 'Step 2 of 3';
      if (titleH3) titleH3.textContent = 'Complete your student profile';
      if (titleP) titleP.textContent = 'This helps us route complaints to the right office and verify who submitted them.';

      // Restore Submit Button
      const submitBtn = document.querySelector('.onboarding-btn-submit');
      if (submitBtn) {
        submitBtn.innerHTML = '<span>Save and continue</span> <i data-lucide="arrow-right" style="width: 18px; height: 18px;"></i>';
      }

      // Restore Navigation tabs
      const nav = document.getElementById('onboarding-nav');
      if (nav) {
        nav.innerHTML = `
          <button class="nav-tab active" style="background: var(--accent); color: #ffffff; border: none; padding: 0.5rem 1.25rem; border-radius: 30px; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem; font-family: inherit; cursor: not-allowed;" disabled>
            <i data-lucide="user-cog" style="width: 16px; height: 16px; stroke: #ffffff;"></i> Account Setup
          </button>
        `;
      }

      modal.style.display = 'flex';
      if (this.state.loggedStudent) {
        const onboardingNameEl = document.getElementById('onboarding-logged-name');
        if (onboardingNameEl) {
          onboardingNameEl.textContent = this.formatStudentName(this.state.loggedStudent.name || 'Student');
        }
      }
      if (window.lucide) lucide.createIcons();
    }
  },

  toggleOnboardingDropdown(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('onboarding-profile-dropdown');
    if (dropdown) {
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';
    }
  },

  closeProfileCompletionModal() {
    const modal = document.getElementById('profile-completion-modal');
    if (modal) modal.style.display = 'none';
  },

  handleProfileProgSearch(input) {
    const inputVal = input.value.trim().toLowerCase();
    const listContainer = document.getElementById('onboarding-profile-prog-autocomplete-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    if (!inputVal) {
      listContainer.style.display = 'none';
      this.state.selectedProfileProgramme = null;
      document.getElementById('onboarding-profile-faculty-search').value = '';
      document.getElementById('onboarding-profile-dept-search').value = '';
      return;
    }
    
    const programmes = this.state.dbProgrammes || [];
    const matches = programmes.filter(p => p.name.toLowerCase().includes(inputVal));
    
    if (matches.length === 0) {
      listContainer.style.display = 'none';
      return;
    }
    
    matches.slice(0, 10).forEach(prog => {
      const div = document.createElement('div');
      div.className = 'autocomplete-item';
      div.textContent = prog.name;
      div.onclick = () => {
        input.value = prog.name;
        listContainer.style.display = 'none';
        this.state.selectedProfileProgramme = prog;
        
        // Auto-populate searchable Faculty and Department inputs
        const facultyName = this.state.dbFaculties[prog.facultyKey] || prog.facultyKey || 'General';
        document.getElementById('onboarding-profile-faculty-search').value = facultyName;
        document.getElementById('onboarding-profile-dept-search').value = prog.department || '';
      };
      listContainer.appendChild(div);
    });
    
    listContainer.style.display = 'block';
  },

  handleProfileFacultySearch(input) {
    const inputVal = input.value.trim().toLowerCase();
    const listContainer = document.getElementById('onboarding-profile-faculty-autocomplete-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    if (!inputVal) {
      listContainer.style.display = 'none';
      return;
    }
    
    const faculties = this.state.dbFacultiesList || [];
    const matches = faculties.filter(f => f.name.toLowerCase().includes(inputVal));
    
    if (matches.length === 0) {
      listContainer.style.display = 'none';
      return;
    }
    
    matches.slice(0, 5).forEach(f => {
      const div = document.createElement('div');
      div.className = 'autocomplete-item';
      div.textContent = f.name;
      div.onclick = () => {
        input.value = f.name;
        listContainer.style.display = 'none';
      };
      listContainer.appendChild(div);
    });
    
    listContainer.style.display = 'block';
  },

  handleProfileDeptSearch(input) {
    const inputVal = input.value.trim().toLowerCase();
    const listContainer = document.getElementById('onboarding-profile-dept-autocomplete-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    if (!inputVal) {
      listContainer.style.display = 'none';
      return;
    }
    
    const departments = this.state.dbDepartments || [];
    const matches = departments.filter(d => d.name.toLowerCase().includes(inputVal));
    
    if (matches.length === 0) {
      listContainer.style.display = 'none';
      return;
    }
    
    matches.slice(0, 5).forEach(d => {
      const div = document.createElement('div');
      div.className = 'autocomplete-item';
      div.textContent = d.name;
      div.onclick = () => {
        input.value = d.name;
        listContainer.style.display = 'none';
      };
      listContainer.appendChild(div);
    });
    
    listContainer.style.display = 'block';
  },

  closeAllAutocompletes() {
    const listProg = document.getElementById('onboarding-profile-prog-autocomplete-list');
    const listFaculty = document.getElementById('onboarding-profile-faculty-autocomplete-list');
    const listDept = document.getElementById('onboarding-profile-dept-autocomplete-list');
    if (listProg) listProg.style.display = 'none';
    if (listFaculty) listFaculty.style.display = 'none';
    if (listDept) listDept.style.display = 'none';
  },

  async handleProfileCompletionSubmit(e) {
    e.preventDefault();
    const firstname = document.getElementById('onboarding-profile-firstname').value.trim();
    const middlename = document.getElementById('onboarding-profile-middlename').value.trim();
    const lastname = document.getElementById('onboarding-profile-lastname').value.trim();

    if (!firstname) {
      this.showToast('Please enter your First Name.', 'warning');
      return;
    }
    if (!lastname) {
      this.showToast('Please enter your Last Name.', 'warning');
      return;
    }

    const titleCase = (str) => {
      if (!str) return '';
      return str.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    };
    const cleanMiddleName = (str) => {
      const val = str.trim().toLowerCase();
      if (!val || ['non', 'none', 'n/a', '-', 'nil'].includes(val)) {
        return '';
      }
      return str.trim();
    };
    
    const formattedLastName = lastname.toUpperCase();
    const formattedFirstName = titleCase(firstname);
    const mname = cleanMiddleName(middlename);
    const formattedMiddleName = mname ? titleCase(mname) : '';
    const name = `${formattedLastName}, ${formattedMiddleName ? formattedMiddleName + ' ' : ''}${formattedFirstName}`;
    const phone = document.getElementById('onboarding-profile-phone').value.trim();
    const level = document.getElementById('onboarding-profile-level').value;
    const ref_num = document.getElementById('onboarding-profile-ref-num').value.trim();
    let prog = this.state.selectedProfileProgramme;
    if (!prog) {
      const progInput = document.getElementById('onboarding-profile-prog-search');
      if (progInput) {
        const query = progInput.value.trim().toLowerCase();
        if (query) {
          const programmes = this.state.dbProgrammes || [];
          const match = programmes.find(p => p.name.toLowerCase() === query) ||
                        programmes.find(p => p.name.toLowerCase().includes(query));
          if (match) {
            prog = match;
            this.state.selectedProfileProgramme = match;
            progInput.value = match.name;
            const facultyName = this.state.dbFaculties[match.facultyKey] || match.facultyKey || 'General';
            const facInput = document.getElementById('onboarding-profile-faculty-search');
            const deptInput = document.getElementById('onboarding-profile-dept-search');
            if (facInput) facInput.value = facultyName;
            if (deptInput) deptInput.value = match.department || '';
          }
        }
      }
    }
    
    if (!ref_num) {
      this.showToast('Please enter your Reference Number.', 'warning');
      return;
    }
    if (!/^\d{10}$/.test(ref_num)) {
      this.showToast('Reference Number must be exactly 10 digits.', 'warning');
      return;
    }
    
    if (!prog) {
      this.showToast('Please search and select a valid course/programme from the list.', 'warning');
      return;
    }
    
    try {
      console.log('[Onboarding] Submitting payload:', {
        name,
        index_number: ref_num,
        phone,
        level,
        programme_id: prog.id,
        reference_number: ref_num
      });
      const result = await window.API.post('/auth/student/complete-profile', {
        name,
        index_number: ref_num,
        phone,
        level,
        programme_id: prog.id,
        reference_number: ref_num
      });
      
      // Update JWT token if re-signed
      if (result.token) {
        window.API.setToken(result.token);
      }
      
      this.state.loggedStudent = result.student;
      localStorage.setItem('current_student_session', JSON.stringify(result.student));
      
      this.closeProfileCompletionModal();
      this.checkStudentSession();
      this.loadAndRenderStudent();
      this.showView('track');
      this.showToast('Profile completed successfully! Welcome to your dashboard.', 'success');
    } catch (err) {
      console.error('[Onboarding] Profile completion failed:', err);
      let detailMsg = '';
      if (err.data && err.data.details) {
        detailMsg = '\n\nDetails:\n' + err.data.details.map(d => `- ${d.path || d.param}: ${d.msg}`).join('\n');
      }
      alert('Error during submission: ' + (err.message || 'Unknown network error') + detailMsg);
      this.showToast(err.message || 'Failed to save profile.', 'error');
    }
  },



  // Student Logout
  handleLogout() {
    window.API.clearToken();
    localStorage.removeItem('current_student_session');
    this.state.loggedStudent = null;
    this.state.activeStudentComplaintId = null;
    this.state.complaints = [];
    
    document.getElementById('student-session-badge').style.display = 'none';
    this.renderNotifications();
    this.resetStudentUI();
    
    const navTabTrack = document.getElementById('nav-tab-track');
    if (navTabTrack) {
      navTabTrack.innerHTML = '<i data-lucide="log-in"></i> Sign In';
    }
    
    this.showView('landing');
    this.showToast("You have been logged out successfully.", "info");
  },

  // Handle category selection from home pills (checks for Harassment warning)
  handleCategoryPillClick(category) {
    if (category === 'Harassment') {
      const modal = document.getElementById('harassment-priority-modal');
      if (modal) modal.style.display = 'flex';
      if (window.lucide) lucide.createIcons();
    } else {
      this.selectCategory(category);
    }
  },

  closeHarassmentModal() {
    const modal = document.getElementById('harassment-priority-modal');
    if (modal) modal.style.display = 'none';
  },

  proceedToChoiceFromHarassment() {
    this.closeHarassmentModal();
    this.selectCategory('Harassment');
  },

  selectCategory(category) {
    this.state.tempSelectedCategory = category;
    const lede = document.getElementById('catEntryLede');
    if (lede) {
      if (category === 'Harassment') {
        lede.textContent = 'Signing in lets the Title IX coordinator follow up directly, which matters most for this category.';
      } else {
        lede.textContent = 'Both options are reviewed the same way — the difference is whether the office can follow up with you directly.';
      }
    }
    const modal = document.getElementById('submit-method-choice-modal');
    if (modal) modal.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
  },

  closeChoiceModal() {
    const modal = document.getElementById('submit-method-choice-modal');
    if (modal) modal.style.display = 'none';
  },

  choiceContinueWithId() {
    this.closeChoiceModal();
    if (this.state.loggedStudent) {
      // Already logged in, go straight to form with ID
      this.setAnonymous(false);
      this.selectCategoryAndFile(this.state.tempSelectedCategory);
    } else {
      // Save choice and prompt login
      this.state.preSelectedCategoryAfterLogin = this.state.tempSelectedCategory;
      this.showSignInModal();
    }
  },

  choiceContinueAnonymously() {
    this.closeChoiceModal();
    this.setAnonymous(true);
    this.selectCategoryAndFile(this.state.tempSelectedCategory);
  },

  setAnonymous(isAnon) {
    this.state.isAnonymousSubmission = isAnon;
    const chip = document.getElementById('idchip');

    if (isAnon) {
      if (chip) {
        chip.style.background = 'rgba(229, 62, 62, 0.08)';
        chip.style.color = 'var(--status-rejected)';
        chip.style.borderColor = 'rgba(229, 62, 62, 0.2)';
        chip.innerHTML = '<i data-lucide="user-minus"></i> <span id="idchip-text">Submitting anonymously</span>';
      }
      
      // Load anonymous default values under-the-hood
      const inputName = document.getElementById('stud-name');
      const inputIndex = document.getElementById('stud-index');
      const inputProg = document.getElementById('stud-programme-search');
      if (inputName) inputName.value = 'Anonymous Student';
      if (inputIndex) inputIndex.value = '9099999999';
      if (inputProg) inputProg.value = 'BSc Computer Science and Engineering';
      this.state.selectedProgramme = { name: 'BSc Computer Science and Engineering' };
    } else {
      const name = this.formatStudentName(this.state.loggedStudent ? this.state.loggedStudent.name : 'Bennin Paa Kofi');
      if (chip) {
        chip.style.background = 'rgba(34, 197, 94, 0.08)';
        chip.style.color = 'var(--accent)';
        chip.style.borderColor = 'rgba(34, 197, 94, 0.2)';
        chip.innerHTML = `<i data-lucide="id-badge"></i> <span id="idchip-text">Signed in as ${name}</span>`;
      }
      
      // Use logged-in student credentials
      if (this.state.loggedStudent) {
        const inputName = document.getElementById('stud-name');
        const inputIndex = document.getElementById('stud-index');
        const inputProg = document.getElementById('stud-programme-search');
        if (inputName) inputName.value = this.formatStudentName(this.state.loggedStudent.name);
        if (inputIndex) inputIndex.value = this.state.loggedStudent.index;
        if (inputProg) inputProg.value = this.state.loggedStudent.programme;
        
        const matchedProg = window.PROGRAMMES.find(p => p.name === this.state.loggedStudent.programme);
        this.state.selectedProgramme = matchedProg || { name: this.state.loggedStudent.programme };
      }
    }
    if (window.lucide) lucide.createIcons();
  },

  goToAnonymousForm() {
    this.setAnonymous(true);
    this.showView('file');
  },

  showLoginOverlayFromTracker(e) {
    if (e) e.preventDefault();
    
    let prefillIndex = '';
    if (this.state.activeStudentComplaintId) {
      const activeComp = this.state.complaints.find(c => c.id === this.state.activeStudentComplaintId);
      if (activeComp && activeComp.studentIndex !== '9099999999') {
        prefillIndex = activeComp.studentIndex;
      }
    }

    this.showSignInModal(prefillIndex);
  },

  showSignInModal(prefilledIndex = '') {
    if (prefilledIndex && typeof prefilledIndex === 'object') {
      // Handle event argument if called from event handler
      if (prefilledIndex.preventDefault) prefilledIndex.preventDefault();
      prefilledIndex = '';
    }

    if (this.state.loggedStudent) {
      this.showView('track');
      return;
    }

    const modal = document.getElementById('student-signin-modal');
    if (modal) {
      modal.style.display = 'flex';
      const idInput = document.getElementById('signin-student-id');
      const passInput = document.getElementById('signin-password');
      if (idInput) {
        idInput.value = prefilledIndex;
      }
      if (passInput) {
        passInput.value = '';
      }
      if (window.lucide) lucide.createIcons();
    }
  },

  closeSignInModal() {
    const modal = document.getElementById('student-signin-modal');
    if (modal) modal.style.display = 'none';
    this.setStudentAuthMode('login');
  },

  // Reset form views
  resetFilingForm() {
    document.getElementById('student-file-panel').style.display = 'block';
    document.getElementById('student-receipt-panel').style.display = 'none';
    document.getElementById('complaint-form').reset();
    
    // Dynamically apply any saved category selection state from routing/home pills
    if (window.debugLog) window.debugLog(`[resetFilingForm] preSelectedCategory at start: ${this.state.preSelectedCategory}`);
    if (this.state.preSelectedCategory) {
      const categorySelect = document.getElementById('comp-category');
      if (categorySelect) {
        const options = Array.from(categorySelect.options);
        const targetCategory = this.state.preSelectedCategory;
        if (window.debugLog) window.debugLog(`[resetFilingForm] Available options: ${options.map(o => o.value).join(', ')}`);
        const match = options.find(opt => {
          const val = opt.value.toLowerCase();
          if (!val) return false;
          const txt = opt.text.toLowerCase();
          const target = targetCategory.toLowerCase();
          const isFinanceMatch = (target.includes('finan') || target.includes('finac')) && (val.includes('finance') || val.includes('fees'));
          const res = val === target || txt.includes(target) || target.includes(val) || isFinanceMatch;
          if (window.debugLog) window.debugLog(`Compare: val='${val}' txt='${txt}' target='${target}' -> res=${res}`);
          return res;
        });
        if (window.debugLog) window.debugLog(`[resetFilingForm] Found match: ${match ? match.value : 'none'}`);
        if (match) {
          categorySelect.value = match.value;
          if (window.debugLog) window.debugLog(`[resetFilingForm] Set value to: ${categorySelect.value}`);
        }
      }
      this.state.preSelectedCategory = null;
    }
    
    // Reset custom file upload zone text
    const fileTxt = document.getElementById('file-upload-text');
    if (fileTxt) {
      fileTxt.textContent = 'Click to upload evidence, screenshots, or documents';
      fileTxt.style.color = 'var(--text-muted)';
    }
    
    const groupName = document.getElementById('group-stud-name');
    const groupIndex = document.getElementById('group-stud-index');
    const groupProg = document.getElementById('group-stud-programme');
    const inputName = document.getElementById('stud-name');
    const inputIndex = document.getElementById('stud-index');
    const inputProg = document.getElementById('stud-programme-search');

    if (this.state.loggedStudent) {
      // Prefill with session state
      if (inputName) {
        inputName.value = this.state.loggedStudent.name;
        inputName.removeAttribute('required');
      }
      if (inputIndex) {
        inputIndex.value = this.state.loggedStudent.index;
        inputIndex.removeAttribute('required');
      }
      if (inputProg) {
        inputProg.value = this.state.loggedStudent.programme;
        inputProg.removeAttribute('required');
      }
      const matchedProg = window.PROGRAMMES.find(p => p.name === this.state.loggedStudent.programme);
      this.state.selectedProgramme = matchedProg || { name: this.state.loggedStudent.programme };
    } else {
      // Under-the-hood fallback for anonymous submission
      if (inputName) {
        inputName.value = 'Anonymous Student';
        inputName.removeAttribute('required');
      }
      if (inputIndex) {
        inputIndex.value = '9099999999';
        inputIndex.removeAttribute('required');
      }
      if (inputProg) {
        inputProg.value = 'BSc Computer Science and Engineering';
        inputProg.removeAttribute('required');
      }
      this.state.selectedProgramme = { name: 'BSc Computer Science and Engineering' };
    }

    // Always hide personal details fields (either prefilled from session or submitted anonymously)
    if (groupName) groupName.style.display = 'none';
    if (groupIndex) groupIndex.style.display = 'none';
    if (groupProg) groupProg.style.display = 'none';

    // Submitter Identity Selector (Visible only when student is logged in)
    const identitySelector = document.getElementById('submitter-identity-selector');
    if (identitySelector) {
      if (this.state.loggedStudent) {
        identitySelector.style.display = 'block';
        const radioReal = document.getElementById('filing-id-real');
        const radioAnon = document.getElementById('filing-id-anon');
        if (radioReal) radioReal.checked = true;
        if (radioAnon) radioAnon.checked = false;
        this.toggleFilingIdentity('real');
      } else {
        identitySelector.style.display = 'none';
        this.setAnonymous(true);
      }
    }
    
    this.updateRoutingPreview();
  },

  toggleFilingIdentity(mode) {
    if (!this.state.loggedStudent) return;
    
    const idchip = document.getElementById('idchip');
    const idchipText = document.getElementById('idchip-text');
    const metaText = document.getElementById('identity-meta-text');
    
    const studName = document.getElementById('stud-name');
    const studIndex = document.getElementById('stud-index');
    const studProg = document.getElementById('stud-programme-search');
    
    if (mode === 'anon') {
      this.state.isAnonymousSubmission = true;
      if (studName) studName.value = 'Anonymous Student';
      if (studIndex) studIndex.value = '9099999999';
      if (studProg) studProg.value = this.state.loggedStudent.programme || 'BSc Computer Science and Engineering';
      
      const matchedProg = window.PROGRAMMES.find(p => p.name === studProg.value);
      this.state.selectedProgramme = matchedProg || { name: studProg.value };
      
      if (idchipText) idchipText.textContent = 'Submitting anonymously';
      if (idchip) {
        idchip.style.borderColor = 'rgba(229, 62, 62, 0.2)';
        idchip.style.color = 'var(--status-rejected)';
        idchip.style.background = 'rgba(229, 62, 62, 0.08)';
        idchip.innerHTML = '<i data-lucide="user-minus"></i> <span id="idchip-text">Submitting anonymously</span>';
      }
      if (metaText) metaText.textContent = 'Your student details are hidden; this complaint will be filed anonymously.';
      if (window.lucide) lucide.createIcons();
    } else {
      this.state.isAnonymousSubmission = false;
      const formattedName = this.formatStudentName(this.state.loggedStudent.name);
      if (studName) studName.value = formattedName;
      if (studIndex) studIndex.value = this.state.loggedStudent.index;
      if (studProg) studProg.value = this.state.loggedStudent.programme || 'BSc Computer Science and Engineering';
      
      const matchedProg = window.PROGRAMMES.find(p => p.name === studProg.value);
      this.state.selectedProgramme = matchedProg || { name: studProg.value };
      
      const capitalizedProgram = (this.state.loggedStudent.programme || '').replace('BSc ', '');
      if (idchipText) idchipText.textContent = `Signed in as ${formattedName}`;
      if (idchip) {
        idchip.style.borderColor = 'rgba(34, 197, 94, 0.2)';
        idchip.style.color = 'var(--accent)';
        idchip.style.background = 'rgba(34, 197, 94, 0.08)';
        idchip.innerHTML = `<i data-lucide="id-badge"></i> <span id="idchip-text">Signed in as ${formattedName}</span>`;
      }
      if (metaText) metaText.textContent = `Submitting as: ${formattedName} (${this.state.loggedStudent.index}) — ${capitalizedProgram}`;
      if (window.lucide) lucide.createIcons();
    }
    this.updateRoutingPreview();
  },

  // Handle custom drag-zone file uploads
  handleFileSelectionChange(input) {
    const text = document.getElementById('file-upload-text');
    if (text) {
      if (input.files && input.files[0]) {
        text.textContent = `Selected file: ${input.files[0].name}`;
        text.style.color = 'var(--accent)';
      } else {
        text.textContent = 'Click to upload evidence, screenshots, or documents';
        text.style.color = 'var(--text-muted)';
      }
    }
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

    // Dynamic Confirmation screen wording toggle
    const recTitle = document.getElementById('receipt-title');
    const recSubtitle = document.getElementById('receipt-subtitle');
    const recLabel = document.getElementById('receipt-label-title');
    const warningNote = document.getElementById('receipt-anonymous-warning-note');

    const filerItems = document.querySelectorAll('.receipt-filer-item');
    filerItems.forEach(item => {
      item.style.display = this.state.isAnonymousSubmission ? 'none' : 'flex';
    });

    if (this.state.isAnonymousSubmission) {
      if (recTitle) recTitle.textContent = 'Complaint submitted anonymously';
      if (recSubtitle) recSubtitle.textContent = "Your identity was not recorded. Save the code below — it's the only way to check this complaint's status.";
      if (recLabel) recLabel.textContent = 'Your reference code';
      if (warningNote) warningNote.style.display = 'flex';
    } else {
      if (recTitle) recTitle.textContent = 'Complaint submitted';
      if (recSubtitle) recSubtitle.textContent = "Your complaint has been received and routed to the appropriate office. You'll be notified as it moves through review.";
      if (recLabel) recLabel.textContent = 'Ticket ID';
      if (warningNote) warningNote.style.display = 'none';
    }

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

  showDashboardOverview() {
    this.state.activeStudentComplaintId = null;
    document.querySelectorAll('.complaint-list-item').forEach(el => el.classList.remove('active'));
    this.renderStudentTracker();
  },

  renderStudentDashboard() {
    if (!this.state.loggedStudent) return;
    
    // Extract Last Name (before comma if formatted, else last word)
    const fullName = this.state.loggedStudent.name || 'Student';
    let displayLastName = 'STUDENT';
    if (fullName.includes(',')) {
      displayLastName = fullName.split(',')[0].trim().toUpperCase();
    } else {
      const parts = fullName.trim().split(/\s+/).filter(Boolean);
      displayLastName = parts[parts.length - 1].toUpperCase();
    }
    
    const welcomeTitle = document.getElementById('dash-welcome-title');
    if (welcomeTitle) {
      welcomeTitle.textContent = `Welcome, ${displayLastName}`;
    }
    
    // Count student complaints by status
    const studentIndex = this.state.loggedStudent.index;
    const studentComplaints = this.state.complaints.filter(c => c.studentIndex === studentIndex);
    
    const awaitingCount = studentComplaints.filter(c => c.status === 'Submitted').length;
    const progressCount = studentComplaints.filter(c => c.status === 'In Review' || c.status === 'In Progress').length;
    const resolvedCount = studentComplaints.filter(c => c.status === 'Resolved').length;
    
    const countAwaiting = document.getElementById('dash-count-awaiting');
    const countProgress = document.getElementById('dash-count-progress');
    const countResolved = document.getElementById('dash-count-resolved');
    
    if (countAwaiting) countAwaiting.textContent = awaitingCount;
    if (countProgress) countProgress.textContent = progressCount;
    if (countResolved) countResolved.textContent = resolvedCount;
    
    if (window.lucide) lucide.createIcons();
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
      // Nothing exists to show — make sure no stale complaint id lingers.
      this.state.activeStudentComplaintId = null;
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

      // We now have complaints and a resolved active id — let
      // renderStudentTracker() populate + reveal the content pane.
      // (Called explicitly here as a safety net in case a caller invokes
      // renderStudentHistory() without a follow-up renderStudentTracker().)
      if (this.state.activeStudentComplaintId) {
        this.renderStudentTracker();
      }
    }

    if (window.lucide) lucide.createIcons();
  },

  renderStudentTracker() {
    const id = this.state.activeStudentComplaintId;
    const placeholder = document.getElementById('student-workspace-placeholder');
    const content = document.getElementById('student-workspace-content');
    const dashHeader = document.getElementById('student-dashboard-header');

    if (!id) {
      if (placeholder) placeholder.style.display = 'flex';
      if (content) content.style.display = 'none';
      if (dashHeader) dashHeader.style.display = this.state.loggedStudent ? 'flex' : 'none';
      return;
    }

    this.loadState();
    const complaint = this.state.complaints.find(c => c.id === id);
    if (!complaint) {
      if (placeholder) placeholder.style.display = 'flex';
      if (content) content.style.display = 'none';
      if (dashHeader) dashHeader.style.display = this.state.loggedStudent ? 'flex' : 'none';
      return;
    }

    if (placeholder) placeholder.style.display = 'none';
    if (content) content.style.display = 'flex';
    if (dashHeader) dashHeader.style.display = this.state.loggedStudent ? 'flex' : 'none';

    // Toggle anonymous layout view (hides sidebar for single ticket guest tracking)
    const workspace = document.getElementById('student-track-workspace');
    if (workspace) {
      if (!this.state.loggedStudent) {
        workspace.classList.add('anonymous-tracking-mode');
      } else {
        workspace.classList.remove('anonymous-tracking-mode');
      }
    }

    // Populate Metadata
    document.getElementById('track-meta-id').textContent = complaint.id;
    document.getElementById('track-meta-category').textContent = complaint.category;
    document.getElementById('track-meta-date').textContent = this.formatDate(complaint.createdAt);
    document.getElementById('track-meta-owner').textContent = complaint.assignedTo || "Unassigned";

    // Filer Info Metadata
    const isAnonymousTicket = (complaint.studentIndex === '9099999999' || complaint.studentName === 'Anonymous Student');
    const filerRow = document.getElementById('track-meta-student-info-row');
    if (filerRow) {
      filerRow.style.display = isAnonymousTicket ? 'none' : 'grid';
    }

    const nameEl = document.getElementById('track-meta-student-name');
    const indexEl = document.getElementById('track-meta-student-index');
    const progEl = document.getElementById('track-meta-student-prog');
    const levelEl = document.getElementById('track-meta-student-level');
    if (nameEl) nameEl.textContent = complaint.studentName || "N/A";
    if (indexEl) indexEl.textContent = complaint.studentIndex || "N/A";
    if (progEl) progEl.textContent = complaint.studentProgramme || "N/A";
    if (levelEl) levelEl.textContent = (complaint.studentLevel && complaint.studentLevel !== 'N/A') ? (complaint.studentLevel + " L") : "N/A";
    
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
    const isGuestMode = !this.state.loggedStudent;
    // A guest checking a genuinely anonymous complaint has no account to log
    // into, so it should show full details. Only a guest checking a *regular*
    // student's ticket (by ID, while logged out) gets the "log in for more" gate.
    const isGuestTrackingRegularTicket = (isGuestMode && !isAnonymousTicket);
    const timelineProgress = document.getElementById('track-timeline-progress');
    const nodeSubmitted = document.getElementById('node-submitted');
    const nodeReview = document.getElementById('node-review');
    const nodeProgress = document.getElementById('node-progress');
    const nodeResolved = document.getElementById('node-resolved');

    const lbl1 = document.getElementById('lbl-node-1');
    const lbl2 = document.getElementById('lbl-node-2');
    const lbl3 = document.getElementById('lbl-node-3');
    const lbl4 = document.getElementById('lbl-node-4');

    if (isGuestMode) {
      // 3-step timeline: Received -> Under review -> Resolved
      if (nodeProgress) nodeProgress.style.display = 'none';
      if (lbl1) lbl1.textContent = 'Received';
      if (lbl2) lbl2.textContent = 'Under review';
      if (lbl4) lbl4.textContent = (complaint.status === 'Rejected') ? 'Rejected' : 'Resolved';

      // Reset classes
      [nodeSubmitted, nodeReview, nodeResolved].forEach(node => {
        if (node) node.classList.remove('active', 'completed');
      });

      let progressWidth = 0;
      if (complaint.status === 'Submitted') {
        progressWidth = 0;
        if (nodeSubmitted) nodeSubmitted.classList.add('active');
      } else if (complaint.status === 'Under Review' || complaint.status === 'In Progress') {
        progressWidth = 50;
        if (nodeSubmitted) nodeSubmitted.classList.add('completed');
        if (nodeReview) nodeReview.classList.add('active');
      } else if (complaint.status === 'Resolved' || complaint.status === 'Rejected') {
        progressWidth = 100;
        if (nodeSubmitted) nodeSubmitted.classList.add('completed');
        if (nodeReview) nodeReview.classList.add('completed');
        if (nodeResolved) nodeResolved.classList.add('completed');
        
        // Handle Rejected color style
        if (complaint.status === 'Rejected') {
          if (nodeResolved) {
            nodeResolved.querySelector('.timeline-label').style.color = 'var(--status-rejected)';
            nodeResolved.querySelector('.timeline-icon').style.background = 'var(--status-rejected)';
            nodeResolved.querySelector('.timeline-icon').style.borderColor = 'var(--status-rejected)';
          }
        } else {
          if (nodeResolved) {
            nodeResolved.querySelector('.timeline-label').style.color = '';
            nodeResolved.querySelector('.timeline-icon').style.background = '';
            nodeResolved.querySelector('.timeline-icon').style.borderColor = '';
          }
        }
      }
      if (timelineProgress) timelineProgress.style.width = `${progressWidth}%`;
    } else {
      // 4-step timeline: Submitted -> Under Review -> In Progress -> Resolved
      if (nodeProgress) nodeProgress.style.display = 'flex';
      if (lbl1) lbl1.textContent = 'Submitted';
      if (lbl2) lbl2.textContent = 'Under Review';
      if (lbl3) lbl3.textContent = 'In Progress';
      if (lbl4) lbl4.textContent = (complaint.status === 'Rejected') ? 'Rejected' : 'Resolved';

      const statusSequence = ["Submitted", "Under Review", "In Progress", "Resolved"];
      const nodes = {
        "Submitted": nodeSubmitted,
        "Under Review": nodeReview,
        "In Progress": nodeProgress,
        "Resolved": nodeResolved
      };

      Object.keys(nodes).forEach(k => {
        if (nodes[k]) nodes[k].classList.remove('active', 'completed');
      });

      let activeStepIndex = statusSequence.indexOf(complaint.status);
      if (complaint.status === "Rejected") {
        activeStepIndex = 3;
        if (nodeResolved) {
          nodeResolved.querySelector('.timeline-label').style.color = 'var(--status-rejected)';
          nodeResolved.querySelector('.timeline-icon').style.background = 'var(--status-rejected)';
          nodeResolved.querySelector('.timeline-icon').style.borderColor = 'var(--status-rejected)';
        }
      } else {
        if (nodeResolved) {
          nodeResolved.querySelector('.timeline-label').style.color = '';
          nodeResolved.querySelector('.timeline-icon').style.background = '';
          nodeResolved.querySelector('.timeline-icon').style.borderColor = '';
        }
      }

      if (activeStepIndex >= 0) {
        const widthPercent = (activeStepIndex / 3) * 100;
        if (timelineProgress) timelineProgress.style.width = `${widthPercent}%`;

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
    }

    // Dynamic status text message banner population
    const msgCard = document.getElementById('track-status-message-card');
    const msgText = document.getElementById('track-status-message-text');
    if (msgCard && msgText) {
      let customMsg = "";
      if (complaint.status === 'Submitted') {
        customMsg = "Your complaint has been successfully received by the department and is awaiting initial review.";
      } else if (complaint.status === 'Under Review' || complaint.status === 'In Progress') {
        if (complaint.category === 'Harassment') {
          customMsg = "The Title IX coordinator is currently reviewing this case. You'll be notified when a decision is made.";
        } else {
          customMsg = "The department is currently reviewing this case. You'll be notified when a decision is made.";
        }
      } else if (complaint.status === 'Resolved') {
        customMsg = "This grievance has been resolved. You can check the final response details.";
      } else if (complaint.status === 'Rejected') {
        customMsg = "This grievance has been closed/rejected. Please contact the department for further guidance.";
      }
      
      msgText.textContent = customMsg;
      msgCard.style.display = isGuestTrackingRegularTicket ? 'none' : 'block';
    }

    // Show/hide 'Login to see all tickets' banner and 'Full Details Area':
    // hidden only for a guest checking a regular student's ticket (they need
    // to log in to see it); shown for signed-in students and for anonymous
    // tickets, which have no account to gate behind.
    const fullDetailsArea = document.getElementById('track-full-details-area');
    if (fullDetailsArea) {
      fullDetailsArea.style.display = isGuestTrackingRegularTicket ? 'none' : 'block';
    }

    const loginBanner = document.getElementById('track-login-banner');
    if (loginBanner) {
      if (isGuestTrackingRegularTicket) {
        loginBanner.style.display = 'flex';
        const bannerTitle = loginBanner.querySelector('h5');
        if (bannerTitle) {
          bannerTitle.textContent = "This complaint is associated with a student account. Please log in to view the full details, description, and admin guidelines.";
        }
      } else {
        loginBanner.style.display = 'none';
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

  // Dynamic Print-Only Complaint Document Formatter
  printComplaintTicket() {
    const id = this.state.activeStudentComplaintId;
    if (!id) return;
    const complaint = this.state.complaints.find(c => c.id === id);
    if (!complaint) return;

    // Helper functions for formatting dates in professional style
    const formatPrintDate = (isoString) => {
      if (!isoString) return '—';
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      const day = date.getDate();
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
    };

    const formatPrintDateTime = (isoString) => {
      if (!isoString) return '—';
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      const day = date.getDate();
      const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${day} ${shortMonths[date.getMonth()]} ${date.getFullYear()}, ${hours}:${minutes} ${ampm}`;
    };

    // Populate print template fields
    document.getElementById('print-ticket-id').textContent = `Ticket ${complaint.id}`;
    document.getElementById('print-date-filed').textContent = formatPrintDate(complaint.createdAt);
    document.getElementById('print-department').textContent = complaint.routingDept || 'General';
    document.getElementById('print-priority').textContent = complaint.urgency || 'Normal';
    
    const statusEl = document.getElementById('print-status');
    statusEl.textContent = complaint.status;
    statusEl.className = `print-status-badge print-status-${complaint.status.replace(' ', '-').toLowerCase()}`;

    // Student Info
    const isAnon = (complaint.studentIndex === '9099999999' || complaint.studentName === 'Anonymous Student');
    document.getElementById('print-student-name').textContent = complaint.studentName || '—';
    
    let refVal = '—';
    if (isAnon) {
      refVal = 'N/A';
    } else if (complaint.studentRef && complaint.studentRef !== 'N/A') {
      refVal = complaint.studentRef;
    } else if (this.state.loggedStudent && this.state.loggedStudent.reference_number) {
      refVal = this.state.loggedStudent.reference_number;
    }
    document.getElementById('print-ref-number').textContent = refVal;
    document.getElementById('print-phone-number').textContent = complaint.studentPhone || '—';
    document.getElementById('print-level').textContent = isAnon ? 'N/A' : (complaint.studentLevel || '—');
    document.getElementById('print-faculty').textContent = complaint.studentFaculty || '—';
    document.getElementById('print-dept').textContent = complaint.studentDept || '—';

    // Subject & Description
    document.getElementById('print-subject').textContent = complaint.subject || 'No Subject';
    document.getElementById('print-description').textContent = complaint.description || 'No Description';

    // Tags
    const tagsContainer = document.getElementById('print-tags');
    tagsContainer.innerHTML = '';
    if (complaint.category) {
      const catSpan = document.createElement('span');
      catSpan.className = 'print-tag';
      catSpan.textContent = complaint.category;
      tagsContainer.appendChild(catSpan);
    }
    if (complaint.studentProgramme && complaint.studentProgramme !== 'N/A') {
      const progSpan = document.createElement('span');
      progSpan.className = 'print-tag';
      progSpan.textContent = complaint.studentProgramme;
      tagsContainer.appendChild(progSpan);
    }

    // Processing logs
    const logRowsContainer = document.getElementById('print-log-rows');
    logRowsContainer.innerHTML = '';
    
    // Sort timeline logs chronologically
    const sortedTimeline = [...complaint.timeline].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (sortedTimeline.length === 0) {
      logRowsContainer.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #718096; font-style: italic;">No actions logged yet.</td></tr>`;
    } else {
      sortedTimeline.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${formatPrintDateTime(log.date)}</td>
          <td>${log.message}</td>
          <td>${log.by}</td>
        `;
        logRowsContainer.appendChild(tr);
      });
    }

    // Open browser native print utility
    window.print();
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

  toggleOnboardingDropdown(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('onboarding-profile-dropdown');
    const widget = document.getElementById('onboarding-profile-badge');
    if (dropdown) {
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';
      if (widget) {
        widget.classList.toggle('active', !isVisible);
      }
    }
  },

  closeProfileCompletionModal() {
    const modal = document.getElementById('profile-completion-modal');
    if (modal) {
      modal.style.display = 'none';
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
    const themeSelects = document.querySelectorAll('#theme-selector, #theme-selector-analytics, #theme-selector-onboarding');
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

  // Profile Modals
  openProfileModal(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Close the dropdown first
    const dropdown = document.getElementById('db-profile-dropdown');
    const widget = document.querySelector('.dashboard-profile-widget');
    if (dropdown) dropdown.style.display = 'none';
    if (widget) widget.classList.remove('active');

    if (!this.state.loggedStudent) return;

    // Prefill modal form
    document.getElementById('profile-index').value = this.state.loggedStudent.index || this.state.loggedStudent.index_number || '';
    document.getElementById('profile-name').value = this.formatStudentName(this.state.loggedStudent.name || '');
    document.getElementById('profile-programme').value = this.state.loggedStudent.programme || '';
    document.getElementById('profile-level').value = this.state.loggedStudent.level || '';
    document.getElementById('profile-phone').value = this.state.loggedStudent.phone || '';
    document.getElementById('profile-email').value = this.state.loggedStudent.email || '';

    const modal = document.getElementById('student-profile-modal');
    if (modal) {
      modal.style.display = 'flex';
    }
    if (window.lucide) lucide.createIcons();
  },

  closeProfileModal() {
    const modal = document.getElementById('student-profile-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  },

  async handleProfileUpdateSubmit(e) {
    e.preventDefault();
    if (!this.state.loggedStudent) return;

    const phone = document.getElementById('profile-phone').value.trim();
    const email = this.state.loggedStudent.email;

    try {
      const result = await window.API.put('/auth/student/profile', { phone, email });
      if (result.ok && result.student) {
        // Update local session
        const updated = {
          index: result.student.index_number,
          name: result.student.name,
          email: result.student.email,
          phone: result.student.phone,
          level: result.student.level,
          programme: result.student.programme,
          reference_number: result.student.reference_number,
          is_profile_complete: result.student.is_profile_complete,
        };
        localStorage.setItem('current_student_session', JSON.stringify(updated));
        this.state.loggedStudent = updated;
        
        // Update header UI
        document.getElementById('logged-student-name').textContent = updated.name;
        const dbName = document.getElementById('db-profile-name');
        if (dbName) dbName.textContent = updated.name;

        // Sync quick complaint form if open
        this.resetFilingForm();
        
        this.closeProfileModal();
        this.showToast("Profile details updated successfully!", "success");
      }
    } catch (err) {
      if (err.status === 401) { this.forceLogout(); return; }
      this.showToast(err.message || 'Could not update your profile details.', 'error');
    }
  },

  startClock() {
    // Dismiss dropdown on outside clicks
    document.addEventListener('click', () => {
      const dropdown = document.getElementById('db-profile-dropdown');
      const widget = document.querySelector('.dashboard-profile-widget');
      if (dropdown) dropdown.style.display = 'none';
      if (widget) widget.classList.remove('active');

      const onboardingDropdown = document.getElementById('onboarding-profile-dropdown');
      if (onboardingDropdown) onboardingDropdown.style.display = 'none';

      const notifDropdown = document.getElementById('student-notification-dropdown');
      if (notifDropdown) notifDropdown.style.display = 'none';
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