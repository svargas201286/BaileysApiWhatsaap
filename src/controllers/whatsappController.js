import { whatsappService } from '../services/whatsappService.js';
import fs from 'fs';
import path from 'path';


class WhatsAppController {
    /**
     * Envía un mensaje de WhatsApp (texto, media o documento)
     */
    async sendWhatsApp(req, res) {
        try {
            const { number, message, type, media, filename, caption, instanceId } = req.body;

            if (!number || !type) {
                return res.status(400).json({ success: false, message: 'Faltan campos requeridos (number, type)' });
            }

            const targetInstance = instanceId || 'primary';

            let result;
            if (type === 'text') {
                result = await whatsappService.sendMessage(targetInstance, number, message);
            } else if (type === 'media' || type === 'media_url') {
                const mediaType = filename?.endsWith('.mp4') ? 'video' : 'image';
                result = await whatsappService.sendMedia(targetInstance, number, media, mediaType, caption || '');
            } else if (type === 'document') {
                result = await whatsappService.sendDocument(targetInstance, number, media, filename, caption || '');
            } else {
                return res.status(400).json({ success: false, message: 'Tipo de mensaje no válido' });
            }

            res.json({
                success: true,
                message: 'Mensaje enviado correctamente',
                id: result?.key?.id
            });
        } catch (error) {
            console.error('Error en sendWhatsApp:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Crea o inicializa una nueva instancia
     */
    async createInstance(req, res) {
        try {
            const { instanceId, name } = req.body;
            if (!instanceId) return res.status(400).json({ success: false, message: 'ID de instancia requerido' });

            await whatsappService.initializeInstance(instanceId, name);
            res.json({ success: true, message: `Instancia ${instanceId} inicializada` });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Obtiene todas las instancias
     */
    async getInstances(req, res) {
        try {
            const instances = whatsappService.getAllInstances();
            res.json({ success: true, instances });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Obtiene el estado de una instancia específica
     */
    getStatus(req, res) {
        const { instanceId } = req.query;
        const status = whatsappService.getInstanceStatus(instanceId || 'primary');

        if (!status) {
            return res.status(404).json({ success: false, message: 'Instancia no encontrada' });
        }

        res.json({
            status: status.status,
            qr: status.qr,
            phoneNumber: status.phoneNumber,
            message: 'Estado obtenido correctamente'
        });
    }

    /**
     * Cierra la sesión de una instancia
     */
    async logout(req, res) {
        try {
            const { instanceId } = req.body;
            const success = await whatsappService.logout(instanceId || 'primary');
            res.json({ success, message: success ? 'Sesión cerrada correctamente' : 'Error al cerrar sesión' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Obtiene el perfil del usuario (hardcoded para demo/Samuel por ahora)
     */
    async getProfile(req, res) {
        try {
            // En una app real, buscaríamos por el token del middleware.
            // Para Samuel, devolvemos el primer usuario de nuestro config.
            const usersPath = path.join(process.cwd(), 'src', 'config', 'users.json');
            const data = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
            const user = data.users[0]; // Retorna el perfil de Samuel
            res.json({ success: true, user });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener perfil' });
        }
    }
}

export const whatsappController = new WhatsAppController();
