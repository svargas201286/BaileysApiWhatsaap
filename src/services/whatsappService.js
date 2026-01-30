import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, useMultiFileAuthState } from 'baileys';
import P from 'pino';
import fs from 'fs';
import qrcode from 'qrcode-terminal';
const logger = P({ level: 'debug' });
export class WhatsAppService {
    sock;
    authState;
    saveCreds;
    // Propiedades públicas para consultar estado
    qrCode;
    connectionState = 'disconnected';
    constructor() {
        this.initialize();
    }
    async initialize() {
        const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
        this.authState = state;
        this.saveCreds = saveCreds;
        const { version } = await fetchLatestBaileysVersion();
        this.sock = makeWASocket({
            version,
            logger,
            // printQRInTerminal: true, // Deprecated, removing
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

                if (connection === 'connecting') {
                    this.connectionState = 'connecting';
                    console.log('Intentando conectar...');
                }

                if (qr) {
                    this.qrCode = qr;
                    this.connectionState = 'qr_ready';
                    console.log('QR Code recibido, escanea por favor:');
                    qrcode.generate(qr, { small: true });
                }

                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('Conexión cerrada. Razón:', lastDisconnect?.error, ', Reconectando:', shouldReconnect);

                    if (shouldReconnect) {
                        this.connectionState = 'connecting'; // Mark as connecting while retrying
                        this.initialize();
                    } else {
                        console.log('Sesión cerrada (Logout). Limpiando...');
                        this.connectionState = 'logged_out';
                        this.qrCode = undefined;
                        await this.removeAuthFolder();
                        this.initialize();
                    }
                } else if (connection === 'open') {
                    this.connectionState = 'connected';
                    this.qrCode = undefined;
                    console.log('Conexión establecida exitosamente');
                }

                // console.log('Connection update:', update); // Reduce noise
            }
            if (events['creds.update']) {
                try {
                    await this.saveCreds();
                }
                catch (error) {
                    // Si falla al guardar credenciales (ej. carpeta borrada), no crashear
                    console.error('Error guardando credenciales (ignorable si se está cerrando sesión):', error);
                }
            }
        });
    }
    async sendMessage(number, text) {
        if (!this.sock)
            throw new Error('WhatsApp socket not initialized');
        const id = number + '@s.whatsapp.net';
        // Simular escribiendo...
        await this.sock.sendPresenceUpdate('composing', id);
        await new Promise(resolve => setTimeout(resolve, 500));
        const result = await this.sock.sendMessage(id, { text });
        await this.sock.sendPresenceUpdate('paused', id);
        return result;
    }
    async sendDocument(number, documentBase64, fileName, caption) {
        if (!this.sock)
            throw new Error('WhatsApp socket not initialized');
        const id = number + '@s.whatsapp.net';
        const buffer = Buffer.from(documentBase64, 'base64');
        let mimetype = 'application/octet-stream';
        if (fileName.endsWith('.pdf'))
            mimetype = 'application/pdf';
        if (fileName.endsWith('.xml'))
            mimetype = 'text/xml';
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
    async sendMedia(number, mediaBase64, type, caption) {
        if (!this.sock)
            throw new Error('WhatsApp socket not initialized');
        const id = number + '@s.whatsapp.net';
        const buffer = Buffer.from(mediaBase64, 'base64');
        await this.sock.sendPresenceUpdate('composing', id);
        await new Promise(resolve => setTimeout(resolve, 500));
        let result;
        if (type === 'image') {
            result = await this.sock.sendMessage(id, { image: buffer, caption: caption });
        }
        else if (type === 'video') {
            result = await this.sock.sendMessage(id, { video: buffer, caption: caption });
        }
        await this.sock.sendPresenceUpdate('paused', id);
        return result;
    }
    async logout() {
        try {
            // Intentar logout ordenado
            if (this.sock) {
                await this.sock.logout();
            }
        }
        catch (error) {
            console.error('Error durante sock.logout(), forzando eliminación local:', error);
        }
        finally {
            // Asegurar limpieza local
            await this.removeAuthFolder();
            this.connectionState = 'logged_out';
            this.qrCode = undefined;
            // Reiniciar para generar nuevo QR
            setTimeout(() => this.initialize(), 1000);
            return true;
        }
    }
    async removeAuthFolder() {
        try {
            const path = 'baileys_auth_info';
            if (fs.existsSync(path)) {
                fs.rmSync(path, { recursive: true, force: true });
                console.log('Carpeta de sesión eliminada correctamente');
            }
        }
        catch (error) {
            console.error('Error eliminando carpeta de sesión:', error);
        }
    }
}
export const whatsappService = new WhatsAppService();
