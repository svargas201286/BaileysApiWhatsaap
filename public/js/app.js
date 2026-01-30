class WhatsAppDashboard {
  constructor() {
    this.elements = {
      // Sidebar & Navigation
      navWhatsApp: document.getElementById('navWhatsApp'),
      subMenuWhatsApp: document.getElementById('subMenuWhatsApp'),
      subItems: document.querySelectorAll('.sub-item'),
      viewSections: document.querySelectorAll('.view-section'),

      // Device Table
      devicesTableBody: document.getElementById('devicesTableBody'),
      btnAddDevice: document.getElementById('btnAddDevice'),

      // Token / Connection View
      connectionStatus: document.getElementById('connectionStatus'),
      qrContainer: document.getElementById('qrContainer'),
      qrcode: document.getElementById('qrcode'),
      connectedState: document.getElementById('connectedState'),
      btnLogout: document.getElementById('btnLogout'),
      instanceSelect: document.getElementById('instanceSelect'),
      btnCopyToken: document.getElementById('btnCopyToken'),
      tokenDisplay: document.getElementById('tokenDisplay'),

      // Test Form
      testForm: document.getElementById('testForm'),
      messageType: document.getElementById('messageType'),
      testTabs: document.querySelectorAll('.tab'),
      tabContents: document.querySelectorAll('.tab-content'),

      // Modals
      modalAddDevice: document.getElementById('modalAddDevice'),
      btnCancelAdd: document.getElementById('btnCancelAdd'),
      btnConfirmAdd: document.getElementById('btnConfirmAdd'),
      newInstanceName: document.getElementById('newInstanceName'),
      newInstanceId: document.getElementById('newInstanceId')
    };

    this.selectedInstanceId = '';
    this.currentView = 'dispositivos'; // Empieza en dispositivos según index.html active class
    this.pollInterval = null;
    this.lastQr = null;
    this.lastInstancesJson = '';
    this.isTableHovered = false;
    this.apiToken = ''; // Store the JWT here

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.startPolling();
    this.fetchProfile();
  }

  async fetchProfile() {
    try {
      const res = await fetch('/api/profile');
      const data = await res.json();
      if (data.success) {
        this.apiToken = data.user.token;
        this.updateProfileUI(data.user);
        this.fetchInstances(); // Fetch instances after token is ready
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  }

  updateProfileUI(user) {
    if (this.elements.tokenDisplay) {
      // El token debe ser completo sin ese mensaje "(Token de Acceso)"
      this.elements.tokenDisplay.textContent = user.token;
    }

    // Opcional: Actualizar otros datos en el Dashboard si existen
    const planEl = document.querySelector('.card:first-child .info-value'); // Plan
    const licEl = document.querySelector('.card:nth-child(2) .info-value'); // Licencia

    if (planEl) planEl.textContent = user.plan;
    if (licEl) licEl.textContent = user.license;

    // Actualizar nombre de usuario arriba a la derecha si existe
    const userNameEl = document.querySelector('.user-info span:first-child');
    if (userNameEl) userNameEl.textContent = user.name;
  }

  setupEventListeners() {
    // Sidebar Accordion
    this.elements.navWhatsApp.addEventListener('click', () => {
      this.elements.navWhatsApp.classList.toggle('open');
      this.elements.subMenuWhatsApp.classList.toggle('active');
    });

    // View Switching
    this.elements.subItems.forEach(item => {
      item.addEventListener('click', () => {
        const view = item.getAttribute('data-view');
        this.switchView(view);
      });
    });

    // Device Table Interaction
    if (this.elements.devicesTableBody) {
      this.elements.devicesTableBody.addEventListener('mouseenter', () => this.isTableHovered = true);
      this.elements.devicesTableBody.addEventListener('mouseleave', () => this.isTableHovered = false);
    }

    // Global click listener to close dropdowns
    document.addEventListener('click', () => this.closeAllDropdowns());

    // Tabs logic (Test Form)
    this.elements.testTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.elements.testTabs.forEach(t => t.classList.remove('active'));
        this.elements.tabContents.forEach(c => c.style.display = 'none');

        tab.classList.add('active');
        const contentId = `tabContent-${tab.dataset.tab}`;
        const contentEl = document.getElementById(contentId);
        if (contentEl) contentEl.style.display = 'block';
        this.elements.messageType.value = tab.dataset.tab;
      });
    });

    // Test Send
    this.elements.testForm.addEventListener('submit', (e) => this.handleTestSend(e));

    // Logout
    this.elements.btnLogout.addEventListener('click', () => this.handleLogout(this.selectedInstanceId));

    // Modals
    this.elements.btnAddDevice.addEventListener('click', () => {
      this.elements.newInstanceId.value = this.generateToken(12);
      this.elements.modalAddDevice.classList.add('active');
    });

    this.elements.btnCancelAdd.addEventListener('click', () => {
      this.elements.modalAddDevice.classList.remove('active');
    });

    this.elements.btnConfirmAdd.addEventListener('click', () => this.handleCreateInstance());

    // Copy Token
    if (this.elements.btnCopyToken) {
      this.elements.btnCopyToken.addEventListener('click', () => {
        const token = this.elements.tokenDisplay.textContent;
        navigator.clipboard.writeText(token).then(() => {
          this.Toast.fire({ icon: 'success', title: 'Token copiado' });
        });
      });
    }

    // Dropdown Instance Selection
    if (this.elements.instanceSelect) {
      this.elements.instanceSelect.addEventListener('change', (e) => {
        this.selectedInstanceId = e.target.value;
        if (this.selectedInstanceId) {
          this.fetchStatus(this.selectedInstanceId);
        } else {
          this.updateTokenUI(null);
        }
      });
    }

    // Toast configuration
    this.Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true
    });
  }

  switchView(view) {
    this.currentView = view;

    // Update Sidebar
    this.elements.subItems.forEach(item => {
      if (item.getAttribute('data-view') === view) item.classList.add('active');
      else item.classList.remove('active');
    });

    // Update Sections
    this.elements.viewSections.forEach(section => {
      if (section.id === `view-${view}`) section.classList.add('active');
      else section.classList.remove('active');
    });

    if (view === 'dispositivos') {
      this.fetchInstances();
    } else if (view === 'token') {
      if (this.selectedInstanceId) {
        this.fetchStatus(this.selectedInstanceId);
      } else {
        this.updateTokenUI(null);
      }
    }
  }

  async startPolling() {
    this.fetchInstances();
    this.pollInterval = setInterval(() => {
      if (this.currentView === 'dispositivos') {
        this.fetchInstances();
      } else if (this.currentView === 'token' && this.selectedInstanceId) {
        this.fetchStatus(this.selectedInstanceId);
      }
    }, 3000);
  }

  async fetchInstances() {
    if (!this.apiToken) return;
    try {
      const res = await fetch('/api/instances', {
        headers: { 'Authorization': `Bearer ${this.apiToken}` }
      });
      const data = await res.json();
      if (data.success) {
        const json = JSON.stringify(data.instances);
        const isAnyDropdownOpen = !!document.querySelector('.actions-dropdown.active');

        // Only render if data changed AND user is not interacting with the table or dropdowns
        if (json !== this.lastInstancesJson && !this.isTableHovered && !isAnyDropdownOpen) {
          this.renderDevicesTable(data.instances);
          this.lastInstancesJson = json;
        }
        this.updateInstanceSelect(data.instances);
      }
    } catch (err) {
      console.error('Error fetching instances:', err);
    }
  }

  renderDevicesTable(instances) {
    if (!this.elements.devicesTableBody) return;

    const footerStatus = document.getElementById('tableFooterStatus');
    if (footerStatus) footerStatus.textContent = `${instances.length} registros en total`;

    if (instances.length === 0) {
      this.elements.devicesTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-light);">No hay dispositivos configurados</td></tr>`;
      return;
    }

    this.elements.devicesTableBody.innerHTML = instances.map(inst => {
      const isConnected = inst.status === 'connected';
      const statusClass = isConnected ? 'session-open' : 'session-closed';
      const statusText = isConnected ? 'Sesión abierta' : 'Sesión cerrada';
      const formattedDate = inst.createdAt ? new Date(inst.createdAt).toLocaleString('es-PE', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: true
      }).replace(',', '') : '-';

      return `
                <tr>
                    <td>${inst.name}</td>
                    <td>${inst.phoneNumber || '-'}</td>
                    <td>${formattedDate}</td>
                    <td><span class="token-id">${inst.id}</span></td>
                    <td>
                        <span class="status-badge ${statusClass}">
                            ${statusText}
                        </span>
                    </td>
                    <td>
                        <div class="actions-dropdown">
                            <button class="btn-actions" onclick="app.toggleDropdown(event)">
                                <i class="fa-solid fa-ellipsis-vertical"></i>
                            </button>
                            <div class="dropdown-content">
                                ${isConnected ? `
                                  <a onclick="app.handleLogout('${inst.id}'); app.closeAllDropdowns();" style="color: #64748b;">
                                      <i class="fa-solid fa-right-from-bracket"></i> Cerrar sesión
                                  </a>
                                ` : `
                                  <a onclick="app.selectForToken('${inst.id}'); app.closeAllDropdowns();">
                                      <i class="fa-solid fa-right-to-bracket"></i> Iniciar sesión
                                  </a>
                                `}
                                <a onclick="app.selectForToken('${inst.id}'); app.closeAllDropdowns();">
                                    <i class="fa-regular fa-pen-to-square"></i> Ver/Editar
                                </a>
                                <a onclick="app.handleLogout('${inst.id}'); app.closeAllDropdowns();" style="color: #ef4444;">
                                    <i class="fa-solid fa-trash"></i> Eliminar
                                </a>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
    }).join('');
  }

  toggleDropdown(event) {
    event.stopPropagation();
    const dropdown = event.currentTarget.parentElement;
    const wasActive = dropdown.classList.contains('active');

    this.closeAllDropdowns();

    if (!wasActive) {
      dropdown.classList.add('active');
    }
  }

  closeAllDropdowns() {
    document.querySelectorAll('.actions-dropdown.active').forEach(d => {
      d.classList.remove('active');
    });
  }


  updateInstanceSelect(instances) {
    if (!this.elements.instanceSelect) return;
    const currentVal = this.elements.instanceSelect.value;
    this.elements.instanceSelect.innerHTML = '<option value="">Seleccionar dispositivo...</option>' +
      instances.map(inst => `<option value="${inst.id}" ${inst.id === currentVal ? 'selected' : ''}>${inst.name} (${inst.id})</option>`).join('');
  }

  formatStatus(status) {
    const map = {
      'connected': 'Sesión abierta',
      'qr_ready': 'Esperando QR',
      'connecting': 'Conectando...',
      'logged_out': 'Sesión cerrada',
      'disconnected': 'Sesión cerrada'
    };
    return map[status] || status;
  }

  selectForToken(instanceId) {
    this.selectedInstanceId = instanceId;
    if (this.elements.instanceSelect) this.elements.instanceSelect.value = instanceId;
    this.switchView('token');
  }

  async fetchStatus(instanceId) {
    if (!this.apiToken) return;
    try {
      const res = await fetch(`/api/status?instanceId=${instanceId}`, {
        headers: { 'Authorization': `Bearer ${this.apiToken}` }
      });
      if (res.status === 404) {
        this.updateTokenUI(null);
        return;
      }
      const data = await res.json();
      this.updateTokenUI(data);
    } catch (err) {
      console.error('Error fetching status:', err);
    }
  }

  updateTokenUI(data) {
    if (!data) {
      this.elements.connectionStatus.textContent = 'Selecciona una instancia';
      this.elements.connectionStatus.className = 'status-badge';
      this.elements.connectedState.style.display = 'none';
      this.elements.qrContainer.style.display = 'flex';
      this.elements.qrcode.innerHTML = '<p style="color: var(--text-light); text-align:center; padding: 2rem;">Selecciona una instancia para ver QR</p>';
      return;
    }

    const { status, qr } = data;

    // Update Status Badge
    this.elements.connectionStatus.textContent = this.formatStatus(status);
    this.elements.connectionStatus.className = `status-badge ${status === 'connected' ? 'connected' : ''}`;

    if (status === 'connected') {
      this.elements.qrContainer.style.display = 'none';
      this.elements.connectedState.style.display = 'flex';
    } else {
      this.elements.connectedState.style.display = 'none';
      this.elements.qrContainer.style.display = 'flex';

      if (qr) {
        this.renderQr(qr);
      } else {
        this.elements.qrcode.innerHTML = '<p style="color: var(--text-light); text-align:center; padding: 2rem;">Buscando QR...</p>';
      }
    }
  }

  renderQr(qrText) {
    this.elements.qrcode.innerHTML = '';
    try {
      if (typeof QRCode !== 'undefined') {
        new QRCode(this.elements.qrcode, {
          text: qrText,
          width: 256,
          height: 256,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      } else {
        this.elements.qrcode.innerHTML = '<p style="color: red;">Error: Librería QRCode no cargada</p>';
        console.error('QRCode is not defined');
      }
    } catch (e) {
      console.error('Error rendering QR:', e);
    }
  }

  async handleLogout(instanceId) {
    if (!instanceId) return;
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: `Se cerrará la sesión de la instancia: ${instanceId}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6366f1',
      confirmButtonText: 'Sí, cerrar sesión',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        const res = await fetch('/api/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiToken}`
          },
          body: JSON.stringify({ instanceId })
        });
        const data = await res.json();
        if (data.success) {
          this.Toast.fire({ icon: 'success', title: 'Sesión cerrada' });
          this.fetchInstances();
          if (this.selectedInstanceId === instanceId) {
            this.selectedInstanceId = '';
            this.updateTokenUI(null);
          }
        } else {
          Swal.fire('Error', data.message, 'error');
        }
      } catch (err) {
        console.error('Error logout:', err);
        Swal.fire('Error', err.message, 'error');
      }
    }
  }

  showModalAdd() {
    this.elements.modalAddDevice.classList.add('active');
    this.elements.newInstanceName.value = '';
    this.elements.newInstanceId.value = '';
  }

  hideModalAdd() {
    this.elements.modalAddDevice.classList.remove('active');
  }

  async handleCreateInstance() {
    const name = this.elements.newInstanceName.value.trim();
    const id = this.elements.newInstanceId.value.trim();

    if (!name || !id) {
      Swal.fire('Campos requeridos', 'Por favor completa todos los campos', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/instances', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        },
        body: JSON.stringify({ instanceId: id, name })
      });
      const data = await res.json();
      if (data.success) {
        this.hideModalAdd();
        this.Toast.fire({ icon: 'success', title: 'Instancia creada' });
        this.selectForToken(id);
      } else {
        Swal.fire('Error', data.message, 'error');
      }
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  }

  generateToken(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return btoa(result).replace(/=/g, ''); // Base64-like look
  }

  async handleTestSend(e) {
    e.preventDefault();
    const instanceId = this.elements.instanceSelect.value;
    const number = document.getElementById('testNumber').value;
    const type = this.elements.messageType.value;

    if (!instanceId) {
      Swal.fire('Falta instancia', 'Selecciona un dispositivo para enviar', 'warning');
      return;
    }

    const payload = {
      instanceId,
      number: number.startsWith('51') ? number : '51' + number,
      type: type === 'document' ? 'document' : 'media'
    };

    if (type === 'text') {
      payload.type = 'text';
      payload.message = document.getElementById('testMessage').value;
      if (!payload.message) return Swal.fire('Error', 'Ingresa un mensaje', 'warning');
    } else if (type === 'media') {
      const file = document.getElementById('mediaFile').files[0];
      if (!file) return Swal.fire('Error', 'Selecciona una imagen', 'warning');
      payload.media = await this.fileToBase64(file);
      payload.filename = file.name;
      payload.caption = document.getElementById('mediaCaption').value;
    } else if (type === 'document') {
      const file = document.getElementById('docFile').files[0];
      if (!file) return Swal.fire('Error', 'Selecciona un documento', 'warning');
      payload.media = await this.fileToBase64(file);
      payload.filename = file.name;
      payload.caption = document.getElementById('docCaption').value;
    }

    try {
      const res = await fetch('/api/send-whatsap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.Toast.fire({ icon: 'success', title: 'Mensaje enviado' });
        this.resetTestForm();
      } else {
        Swal.fire('Error', data.message, 'error');
      }
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  }

  resetTestForm() {
    this.elements.testForm.reset();
    document.getElementById('testMessage').value = '';
    document.getElementById('mediaCaption').value = '';
    document.getElementById('docCaption').value = '';
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = error => reject(error);
    });
  }
}

// Global instance for onclick handlers
window.app = new WhatsAppDashboard();
