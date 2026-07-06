// Shared browser API client for the UMaT Complaint System.
// Wraps fetch, attaches the JWT bearer token, and normalises errors.
// Each page configures its own token storage key (student vs staff) so tokens
// do not collide in shared localStorage.
(function () {
  const API = {
    base: (window.UMAT_API_BASE || 'http://localhost:4000') + '/api',
    tokenKey: 'umat_token',

    configure(opts = {}) {
      if (opts.base) this.base = opts.base.replace(/\/$/, '') + (opts.base.endsWith('/api') ? '' : '/api');
      if (opts.tokenKey) this.tokenKey = opts.tokenKey;
    },

    getToken() { return localStorage.getItem(this.tokenKey); },
    setToken(t) { if (t) localStorage.setItem(this.tokenKey, t); else localStorage.removeItem(this.tokenKey); },
    clearToken() { localStorage.removeItem(this.tokenKey); },

    async request(method, path, body, { isFormData = false } = {}) {
      let res;
      try {
        res = await fetch(this.base + path, {
          method,
          headers: {
            // Omit Content-Type for FormData — the browser sets the
            // multipart boundary itself; setting it manually breaks upload.
            ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
            ...(this.getToken() ? { Authorization: 'Bearer ' + this.getToken() } : {}),
          },
          body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
        });
      } catch (networkErr) {
        const e = new Error('Cannot reach the server. Is the backend running on ' + this.base + '?');
        e.isNetwork = true;
        throw e;
      }
      let data = null;
      try { data = await res.json(); } catch (_) { /* empty body */ }
      if (res.status === 401) {
        this.clearToken();
        const e = new Error((data && data.error) || 'Session expired. Please log in again.');
        e.status = 401;
        throw e;
      }
      if (!res.ok) {
        const e = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
        e.status = res.status;
        e.data = data;
        throw e;
      }
      return data;
    },

    get(p) { return this.request('GET', p); },
    post(p, b) { return this.request('POST', p, b); },
    put(p, b) { return this.request('PUT', p, b); },
    del(p) { return this.request('DELETE', p); },
    postForm(p, formData) { return this.request('POST', p, formData, { isFormData: true }); },

    // Fetches a binary response (e.g. a file download) with the auth header.
    // A plain <a href> can't carry an Authorization header, so downloads are
    // triggered by fetching a Blob here and saving it via an object URL.
    async getBlob(path) {
      let res;
      try {
        res = await fetch(this.base + path, {
          headers: this.getToken() ? { Authorization: 'Bearer ' + this.getToken() } : {},
        });
      } catch (networkErr) {
        throw new Error('Cannot reach the server. Is the backend running on ' + this.base + '?');
      }
      if (!res.ok) {
        let data = null;
        try { data = await res.json(); } catch (_) { /* empty body */ }
        if (res.status === 401) this.clearToken();
        throw new Error((data && data.error) || ('Download failed (' + res.status + ')'));
      }
      return res.blob();
    },
  };

  window.API = API;

  // Shared helper: fetch a complaint's attachment as a Blob (with auth header)
  // and trigger a browser save, since a plain <a href> can't send Authorization.
  window.downloadComplaintAttachment = async (complaintId, filename, onError) => {
    try {
      const blob = await API.getBlob(`/complaints/${encodeURIComponent(complaintId)}/attachment`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'attachment';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (typeof onError === 'function') onError(err);
    }
  };
})();
