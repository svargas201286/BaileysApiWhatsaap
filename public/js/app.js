const app = {
  elements: {
    connectionStatus: document.getElementById('connectionStatus'),
    qrContainer: document.getElementById('qrContainer'),
    qrcodeElement: document.getElementById('qrcode'),
    connectedState: document.getElementById('connectedState'),
    loader: document.getElementById('loader'),
    btnLogout: document.getElementById('btnLogout'),
    testForm: document.getElementById('testForm'),
    testNumber: document.getElementById('testNumber'),
    tabs: document.querySelectorAll('.tab'),
    tabContents: document.querySelectorAll('.tab-content'),
    // Inputs
    testMessage: document.getElementById('testMessage'),
    mediaFile: document.getElementById('mediaFile'),
    mediaCaption: document.getElementById('mediaCaption'),
    documentFile: document.getElementById('documentFile'),
    documentCaption: document.getElementById('documentCaption'),
    messageTypeInput: document.getElementById('messageType')
  },

  state: {
    isConnected: false,
    qrCode: null,
    pollingInterval: null
  },

  init() {
    this.addEventListeners();
    this.startPolling();
  },

  addEventListeners() {
    this.elements.btnLogout.addEventListener('click', () => this.handleLogout());
    this.elements.testForm.addEventListener('submit', (e) => this.handleTestSend(e));

    // Tab Switching
    this.elements.tabs.forEach(tab => {
      tab.addEventListener('click', () => this.handleTabSwitch(tab));
    });
  },

  handleTabSwitch(selectedTab) {
    // Update Tabs UI
    this.elements.tabs.forEach(tab => tab.classList.remove('active'));
    selectedTab.classList.add('active');

    // Update Content Visibility
    const target = selectedTab.dataset.tab;
    this.elements.tabContents.forEach(content => content.style.display = 'none');
    document.getElementById(`tabContent-${target}`).style.display = 'block';

    // Update Hidden Input Type
    this.elements.messageTypeInput.value = target;
  },

  async startPolling() {
    this.checkStatus();
    this.state.pollingInterval = setInterval(() => this.checkStatus(), 3000);
  },

  async checkStatus() {
    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      this.updateUI(data.status);
    } catch (error) {
      console.error('Error verificando estado:', error);
      this.updateUI('error');
    }
  },

  async updateUI(status) {
    if (status === 'connected') {
      this.elements.connectionStatus.textContent = 'Conectado';
      this.elements.connectionStatus.className = 'status-badge connected';
      this.showConnectedState();
    } else {
      let displayStatus = status;
      if (status === 'disconnected') displayStatus = 'Desconectado';
      if (status === 'logged_out') displayStatus = 'Sesión Cerrada (Reiniciando...)';

      this.elements.connectionStatus.textContent = displayStatus;
      this.elements.connectionStatus.className = 'status-badge';

      if (status === 'qr_ready' || status === 'disconnected' || status === 'logged_out') {
        await this.fetchQr();
      }
    }
  },

  async fetchQr() {
    try {
      const response = await fetch('/api/qr');
      const data = await response.json();

      if (data.success && data.qr) {
        if (this.state.qrCode !== data.qr) {
          this.state.qrCode = data.qr;
          this.renderQr(data.qr);
        }
        this.showQrState();
      }
    } catch (error) {
      console.error('Error obteniendo QR:', error);
    }
  },

  renderQr(qrData) {
    this.elements.qrcodeElement.innerHTML = '';
    new QRCode(this.elements.qrcodeElement, {
      text: qrData,
      width: 256,
      height: 256,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  },

  showConnectedState() {
    this.elements.qrContainer.style.display = 'none';
    this.elements.loader.style.display = 'none';
    this.elements.connectedState.style.display = 'flex';
    this.state.isConnected = true;
  },

  showQrState() {
    this.elements.qrContainer.style.display = 'flex';
    this.elements.loader.style.display = 'none';
    this.elements.connectedState.style.display = 'none';
    this.state.isConnected = false;
  },

  showLoader() {
    this.elements.qrContainer.style.display = 'none';
    this.elements.connectedState.style.display = 'none';
    this.elements.loader.style.display = 'block';
  },

  async handleLogout() {
    const result = await Swal.fire({
      title: '¿Cerrar sesión?',
      text: "¿Estás seguro que deseas desconectar el dispositivo?",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, desconectar',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;
    try {
      const response = await fetch('/api/logout', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Sesión cerrada',
          text: 'Te has desconectado correctamente',
          timer: 2000,
          showConfirmButton: false
        });
        this.state.qrCode = null;
        this.showLoader();
      }
    } catch (error) {
      Swal.fire('Error', 'No se pudo cerrar la sesión', 'error');
    }
  },

  async handleTestSend(e) {
    e.preventDefault();
    const number = this.elements.testNumber.value;
    const type = this.elements.messageTypeInput.value;

    if (!number) {
      Swal.fire('Campo requerido', 'Por favor ingresa un número de destino', 'warning');
      return;
    }

    let payload = { number, type };

    try {
      if (type === 'text') {
        const message = this.elements.testMessage.value;
        if (!message) throw new Error('Escribe un mensaje');
        payload.message = message;

      } else if (type === 'media') {
        const fileInput = this.elements.mediaFile;
        if (fileInput.files.length === 0) throw new Error('Selecciona una imagen o video');

        const file = fileInput.files[0];
        const base64 = await this.fileToBase64(file);

        payload.media = base64;
        payload.filename = file.name;
        payload.caption = this.elements.mediaCaption.value;

      } else if (type === 'document') {
        const fileInput = this.elements.documentFile;
        if (fileInput.files.length === 0) throw new Error('Selecciona un documento');

        const file = fileInput.files[0];
        const base64 = await this.fileToBase64(file);

        payload.media = base64;
        payload.filename = file.name;
        payload.caption = this.elements.documentCaption.value;
      }

      // UI Loading
      const activeTabButton = document.querySelector(`.tab-content[style*="block"] button`);
      const originalText = activeTabButton ? activeTabButton.textContent : 'Enviando...';

      if (activeTabButton) {
        activeTabButton.disabled = true;
        activeTabButton.textContent = 'Enviando...';
      }

      const response = await fetch('/api/send-whatsap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.success) {
        console.log('Mensaje enviado con éxito. ID:', data.id);

        const Toast = Swal.mixin({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true,
          didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer)
            toast.addEventListener('mouseleave', Swal.resumeTimer)
          }
        });

        Toast.fire({
          icon: 'success',
          title: 'Mensaje enviado correctamente'
        });

        // Limpiar inputs
        this.elements.testMessage.value = '';
        this.elements.mediaFile.value = '';
        this.elements.documentFile.value = '';
        this.elements.mediaCaption.value = '';
        this.elements.documentCaption.value = '';
      } else {
        Swal.fire('Error', data.message || 'No se pudo enviar el mensaje', 'error');
        // Restaurar botón inmediatamente en error
        if (activeTabButton) {
          activeTabButton.disabled = false;
          activeTabButton.textContent = originalText;
        }
      }

    } catch (error) {
      Swal.fire('Error de Conexión', error.message || 'Error desconocido al intentar enviar', 'error');
      console.error(error);
    }
  },

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
