import { Boom } from '@hapi/boom'
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
  proto
} from 'baileys'
import P from 'pino'
import fs from 'fs'
import qrcode from 'qrcode-terminal'

const logger = P({ level: 'debug' })

export class WhatsAppService {
  private sock: WASocket | undefined;
  private authState: any;
  private saveCreds: any;

  // Propiedades públicas para consultar estado
  public qrCode: string | undefined;
  public connectionState: string = 'disconnected';

  constructor() {
    this.initialize();
  }

  private async initialize() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    this.authState = state;
    this.saveCreds = saveCreds;

    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: true,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      generateHighQualityLinkPreview: true,
    });

    this.sock.ev.process(async (events) => {
      if (events['connection.update']) {
        const update = events['connection.update'];
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrCode = qr;
          this.connectionState = 'qr_ready';
          console.log('QR Code recibido, escanea por favor:');
          qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

          console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);

          if (shouldReconnect) {
            this.initialize();
          } else {
            console.log('Logged out. Cleaning up session...');
            this.connectionState = 'logged_out';
            this.qrCode = undefined;
            // Si es logout oficial, limpiamos y reiniciamos para mostrar QR nuevo
            await this.removeAuthFolder();
            this.initialize();
          }
        } else if (connection === 'open') {
          this.connectionState = 'connected';
          this.qrCode = undefined;
          console.log('Conexión establecida exitosamente');
        }

        console.log('Connection update:', update);
      }

      if (events['creds.update']) {
        try {
          await this.saveCreds();
        } catch (error) {
          // Si falla al guardar credenciales (ej. carpeta borrada), no crashear
          console.error('Error guardando credenciales (ignorable si se está cerrando sesión):', error);
        }
      }
    });
  }

  public async sendMessage(number: string, text: string) {
    if (!this.sock) throw new Error('WhatsApp socket not initialized');
    const id = number + '@s.whatsapp.net';

    // Simular escribiendo...
    await this.sock.sendPresenceUpdate('composing', id);
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await this.sock.sendMessage(id, { text });

    await this.sock.sendPresenceUpdate('paused', id);
    return result;
  }

  public async sendDocument(number: string, documentBase64: string, fileName: string, caption: string) {
    if (!this.sock) throw new Error('WhatsApp socket not initialized');
    const id = number + '@s.whatsapp.net';
    const buffer = Buffer.from(documentBase64, 'base64');

    let mimetype = 'application/octet-stream';
    if (fileName.endsWith('.pdf')) mimetype = 'application/pdf';
    if (fileName.endsWith('.xml')) mimetype = 'text/xml';

    await this.sock.sendPresenceUpdate('composing', id);
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await this.sock.sendMessage(id, {
      document: buffer,
      mimetype: mimetype,
      fileName: fileName,
      caption: caption
    });

    await this.sock.sendPresenceUpdate('paused', id);
    return result;
  }

  public async sendMedia(number: string, mediaBase64: string, type: 'image' | 'video', caption: string) {
    if (!this.sock) throw new Error('WhatsApp socket not initialized');
    const id = number + '@s.whatsapp.net';
    const buffer = Buffer.from(mediaBase64, 'base64');

    await this.sock.sendPresenceUpdate('composing', id);
    await new Promise(resolve => setTimeout(resolve, 500));

    let result;
    if (type === 'image') {
      result = await this.sock.sendMessage(id, { image: buffer, caption: caption });
    } else if (type === 'video') {
      result = await this.sock.sendMessage(id, { video: buffer, caption: caption });
    }

    await this.sock.sendPresenceUpdate('paused', id);
    return result;
  }

  public async logout() {
    try {
      // Intentar logout ordenado
      if (this.sock) {
        await this.sock.logout();
      }
    } catch (error) {
      console.error('Error durante sock.logout(), forzando eliminación local:', error);
    } finally {
      // Asegurar limpieza local
      await this.removeAuthFolder();
      this.connectionState = 'logged_out';
      this.qrCode = undefined;
      // Reiniciar para generar nuevo QR
      setTimeout(() => this.initialize(), 1000);
      return true;
    }
  }

  private async removeAuthFolder() {
    try {
      const path = 'baileys_auth_info';
      if (fs.existsSync(path)) {
        fs.rmSync(path, { recursive: true, force: true });
        console.log('Carpeta de sesión eliminada correctamente');
      }
    } catch (error) {
      console.error('Error eliminando carpeta de sesión:', error);
    }
  }
}

export const whatsappService = new WhatsAppService();
