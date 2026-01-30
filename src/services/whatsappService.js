import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, useMultiFileAuthState } from 'baileys';
import P from 'pino';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import qrcode from 'qrcode-terminal';
const logger = P({ level: 'debug' });

export class WhatsAppService {
    instances = new Map(); // instanceId -> socket info

    constructor() {
        // Auto-cargar solo sesiones que YA están conectadas
        // Las sesiones sin conectar requieren QR manual
        this.loadExistingInstances();
    }

    async loadExistingInstances() {
        const authPath = 'baileys_auth_info';
        if (!fs.existsSync(authPath)) return;

        const folders = fs.readdirSync(authPath);
        for (const folder of folders) {
            const folderPath = `${authPath}/${folder}`;
            if (fs.lstatSync(folderPath).isDirectory()) {
                // Solo cargar si tiene credenciales válidas (sesión ya iniciada)
                const credsPath = `${folderPath}/creds.json`;
                if (fs.existsSync(credsPath)) {
                    try {
                        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                        // Solo auto-inicializar si tiene sesión activa (me existe)
                        if (creds.me && creds.me.id) {
                            let name = folder;
                            let createdAt = new Date().toISOString();

                            const metaPath = `${folderPath}/metadata.json`;
                            if (fs.existsSync(metaPath)) {
                                try {
                                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                                    name = meta.name || name;
                                    createdAt = meta.createdAt || createdAt;
                                } catch (e) { console.error("Error reading metadata", e); }
                            }

                            console.log(`✅ Cargando sesión activa: ${folder} (${creds.me.id.split(':')[0]})`);
                            this.initializeInstance(folder, name, createdAt);
                        } else {
                            console.log(`⏸️  Sesión sin conectar: ${folder} - requiere QR manual`);
                        }
                    } catch (e) {
                        console.error(`Error leyendo credenciales de ${folder}:`, e);
                    }
                }
            }
        }
    }

    async initializeInstance(instanceId, name = null, createdAt = null) {
        // Prevent concurrent initializations
        if (this.instances.has(instanceId)) {
            const existing = this.instances.get(instanceId);
            if (existing.isInitializing) return existing;
            if (existing.sock && existing.connectionState === 'connected') return existing;

            // If it exists but not connected/initializing, clean up before restart
            if (existing.sock) {
                try { existing.sock.ws.close(); } catch (e) { }
                existing.sock.ev.removeAllListeners();
            }
        }

        const authPath = `baileys_auth_info/${instanceId}`;
        if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { version } = await fetchLatestBaileysVersion();

        // Persist metadata
        const metaPath = `${authPath}/metadata.json`;
        const metadata = {
            name: name || instanceId,
            createdAt: createdAt || new Date().toISOString()
        };
        if (!fs.existsSync(metaPath)) {
            fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
        }

        const sock = makeWASocket({
            version,
            logger,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            browser: ["willayAPI", "Chrome", "1.0.0"],
            syncFullHistory: false,
            linkPreviewHighQuality: true,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            markOnlineOnConnect: true,
        });

        const instanceData = {
            id: instanceId,
            sock,
            qrCode: undefined,
            qrAttempts: 0,
            maxQrAttempts: 3,
            connectionState: 'connecting',
            phoneNumber: state.creds?.me?.id?.split(':')[0] || null,
            name: metadata.name,
            createdAt: metadata.createdAt,
            isInitializing: true
        };

        this.instances.set(instanceId, instanceData);

        sock.ev.process(async (events) => {
            if (events['connection.update']) {
                const update = events['connection.update'];
                const { connection, lastDisconnect, qr } = update;

                if (connection === 'connecting') {
                    instanceData.connectionState = 'connecting';
                }

                if (qr) {
                    instanceData.qrAttempts = (instanceData.qrAttempts || 0) + 1;
                    instanceData.qrCode = qr;
                    instanceData.qrTimestamp = Date.now();
                    instanceData.connectionState = 'qr_ready';
                    instanceData.isInitializing = false;
                    console.log(`[${instanceId}] QR ready (intento ${instanceData.qrAttempts}/${instanceData.maxQrAttempts})`);

                    // Si alcanzó el límite de intentos, marcar para no reconectar
                    if (instanceData.qrAttempts >= instanceData.maxQrAttempts) {
                        console.log(`[${instanceId}] ⚠️  Límite de intentos QR alcanzado. Requiere inicio manual.`);
                        instanceData.qrLimitReached = true;
                    }
                }

                if (connection === 'close') {
                    instanceData.isInitializing = false;
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    console.log(`[${instanceId}] Connection closed (${statusCode}). Reconnecting:`, shouldReconnect);

                    // No reconectar si alcanzó el límite de QR
                    if (instanceData.qrLimitReached) {
                        console.log(`[${instanceId}] ⛔ No se reconectará automáticamente. Límite de QR alcanzado.`);
                        instanceData.connectionState = 'qr_limit_reached';
                        instanceData.qrCode = undefined;
                        sock.ev.removeAllListeners();
                        return;
                    }

                    if (shouldReconnect) {
                        instanceData.connectionState = 'connecting';
                        // Essential cleanup before reconnection
                        sock.ev.removeAllListeners();
                        setTimeout(() => this.initializeInstance(instanceId, instanceData.name, instanceData.createdAt), 3000);
                    } else {
                        // Desvinculado desde el celular - mantener en memoria pero marcar como logged_out
                        console.log(`[${instanceId}] 📱 Sesión desvinculada desde WhatsApp. Limpiando credenciales...`);
                        instanceData.connectionState = 'logged_out';
                        instanceData.qrCode = undefined;
                        instanceData.phoneNumber = null;
                        instanceData.qrAttempts = 0; // Resetear contador
                        instanceData.qrLimitReached = false;
                        sock.ev.removeAllListeners();

                        // Eliminar carpeta de autenticación para forzar nuevo QR
                        await this.removeAuthFolder(instanceId);

                        // NO eliminar de memoria - mantener para que el usuario pueda reiniciar
                        // this.instances.delete(instanceId); // ❌ Comentado
                    }
                } else if (connection === 'open') {
                    instanceData.connectionState = 'connected';
                    instanceData.qrCode = undefined;
                    instanceData.isInitializing = false;
                    instanceData.phoneNumber = sock.user.id.split(':')[0];
                    console.log(`[${instanceId}] Connection established for ${instanceData.phoneNumber}`);
                }
            }
            if (events['creds.update']) {
                await saveCreds();
            }
        });

        return instanceData;
    }

    async sendMessage(instanceId, number, text) {
        const instance = this.instances.get(instanceId);
        if (!instance || !instance.sock) throw new Error('Instancia no inicializada');

        const id = number + '@s.whatsapp.net';
        await instance.sock.sendPresenceUpdate('composing', id);
        await new Promise(resolve => setTimeout(resolve, 500));
        const result = await instance.sock.sendMessage(id, { text });
        await instance.sock.sendPresenceUpdate('paused', id);
        return result;
    }

    async sendDocument(instanceId, number, documentBase64, fileName, caption) {
        const instance = this.instances.get(instanceId);
        if (!instance || !instance.sock) throw new Error('Instancia no inicializada');

        const id = number + '@s.whatsapp.net';
        const buffer = Buffer.from(documentBase64, 'base64');
        let mimetype = 'application/octet-stream';
        if (fileName.endsWith('.pdf')) mimetype = 'application/pdf';
        if (fileName.endsWith('.xml')) mimetype = 'text/xml';

        await instance.sock.sendPresenceUpdate('composing', id);
        await new Promise(resolve => setTimeout(resolve, 500));
        const result = await instance.sock.sendMessage(id, {
            document: buffer,
            mimetype: mimetype,
            fileName: fileName,
            caption: caption
        });
        await instance.sock.sendPresenceUpdate('paused', id);
        return result;
    }

    async sendMedia(instanceId, number, mediaBase64, type, caption) {
        const instance = this.instances.get(instanceId);
        if (!instance || !instance.sock) throw new Error('Instancia no inicializada');

        const id = number + '@s.whatsapp.net';
        const buffer = Buffer.from(mediaBase64, 'base64');
        await instance.sock.sendPresenceUpdate('composing', id);
        await new Promise(resolve => setTimeout(resolve, 500));

        let result;
        if (type === 'image') {
            result = await instance.sock.sendMessage(id, { image: buffer, caption: caption });
        } else if (type === 'video') {
            result = await instance.sock.sendMessage(id, { video: buffer, caption: caption });
        }
        await instance.sock.sendPresenceUpdate('paused', id);
        return result;
    }

    async logout(instanceId) {
        const instance = this.instances.get(instanceId);
        if (!instance) return false;

        try {
            if (instance.sock) {
                await instance.sock.logout();
            }
        } catch (error) {
            console.error(`Error logging out ${instanceId}:`, error);
        } finally {
            await this.removeAuthFolder(instanceId);
            this.instances.delete(instanceId);
            return true;
        }
    }

    async removeAuthFolder(instanceId) {
        try {
            const path = `baileys_auth_info/${instanceId}`;
            if (fs.existsSync(path)) {
                fs.rmSync(path, { recursive: true, force: true });
                console.log(`Carpeta de sesión ${instanceId} eliminada`);
            }
        } catch (error) {
            console.error('Error eliminando carpeta:', error);
        }
    }

    /**
     * Reinicia manualmente una instancia (resetea contador de QR)
     */
    async restartInstance(instanceId, name = null) {
        const instance = this.instances.get(instanceId);

        // Cerrar conexión existente si la hay
        if (instance && instance.sock) {
            try {
                instance.sock.ws.close();
                instance.sock.ev.removeAllListeners();
            } catch (e) {
                console.log(`Error cerrando socket de ${instanceId}:`, e.message);
            }
            this.instances.delete(instanceId);
        }

        // Reinicializar desde cero (resetea contador de QR)
        console.log(`🔄 Reiniciando instancia ${instanceId} manualmente...`);
        return await this.initializeInstance(instanceId, name);
    }

    getAllInstances() {
        return Array.from(this.instances.values()).map(inst => ({
            id: inst.id,
            name: inst.name,
            status: inst.connectionState,
            phoneNumber: inst.phoneNumber,
            createdAt: inst.createdAt
        }));
    }

    getInstanceStatus(instanceId) {
        const instance = this.instances.get(instanceId);
        return instance ? {
            status: instance.connectionState,
            qr: instance.qrCode,
            qrTimestamp: instance.qrTimestamp,
            phoneNumber: instance.phoneNumber
        } : null;
    }

    /**
     * Descarga un archivo desde una URL y lo devuelve como base64
     */
    async downloadFile(url) {
        try {
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            return Buffer.from(response.data).toString('base64');
        } catch (error) {
            console.error('Error downloading file:', error.message);
            throw new Error(`No se pudo descargar el archivo de la URL: ${url}`);
        }
    }

    /**
     * Envía un comprobante (habitualmente PDF + XML)
     */
    async sendReceipt(instanceId, number, files) {
        const instance = this.instances.get(instanceId);
        if (!instance || !instance.sock) throw new Error('Instancia no inicializada');

        const results = [];
        for (const file of files) {
            let base64 = file.media;

            // Si es una URL, descargar primero
            if (file.type === 'url') {
                base64 = await this.downloadFile(file.media);
            }

            const res = await this.sendDocument(
                instanceId,
                number,
                base64,
                file.filename,
                file.caption
            );
            results.push(res);

            // Pequeño retraso entre archivos para evitar bloqueos
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        return results;
    }
}

export const whatsappService = new WhatsAppService();
