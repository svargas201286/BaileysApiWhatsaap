import { whatsappService } from '../services/whatsappService.js';
import pool from '../config/db.js';
import fs from 'fs';
import path from 'path';


class WhatsAppController {
    /**
     * Envía un mensaje de WhatsApp (texto, media o documento)
     */
    async sendWhatsApp(req, res) {
        try {
            let { number, message, type, media, filename, caption, instanceId, fromNumber, mediatype, instance_id } = req.body;
            const userId = req.user.id;

            // Soporte para parámetros legacy de scripts PHP antiguos
            if (!instanceId && fromNumber) instanceId = fromNumber;
            if (!instanceId && instance_id) instanceId = instance_id;
            if (!type && mediatype) type = mediatype;

            if (!number || !type || !instanceId) {
                return res.status(400).json({ success: false, message: 'Faltan campos requeridos (number, type, instanceId)' });
            }

            // Verificar que la instancia pertenece al usuario
            const [instances] = await pool.query('SELECT * FROM instances WHERE instance_id = ? AND user_id = ?', [instanceId, userId]);
            if (instances.length === 0) {
                return res.status(403).json({ success: false, message: 'No tienes permiso sobre esta instancia' });
            }

            const targetInstance = instanceId;

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
            const userId = req.user.id;

            if (!instanceId) return res.status(400).json({ success: false, message: 'ID de instancia requerido' });

            // Guardar o actualizar en base de datos
            await pool.query(
                `INSERT INTO instances (user_id, instance_id, name) 
                 VALUES (?, ?, ?) 
                 ON DUPLICATE KEY UPDATE name = VALUES(name), user_id = VALUES(user_id)`,
                [userId, instanceId, name || instanceId]
            );

            await whatsappService.initializeInstance(instanceId, name);
            res.json({ success: true, message: `Instancia ${instanceId} inicializada` });
        } catch (error) {
            console.error('Error al crear instancia:', error);
            res.status(500).json({ success: false, message: 'Error al registrar instancia en BD' });
        }
    }

    /**
     * Reinicia una instancia (resetea contador de QR)
     */
    async restartInstance(req, res) {
        try {
            const { instanceId } = req.body;
            const userId = req.user.id;

            if (!instanceId) return res.status(400).json({ success: false, message: 'ID de instancia requerido' });

            // Verificar propiedad
            const [inst] = await pool.query('SELECT * FROM instances WHERE instance_id = ? AND user_id = ?', [instanceId, userId]);
            if (inst.length === 0) {
                return res.status(403).json({ success: false, message: 'No tienes acceso a esta instancia' });
            }

            await whatsappService.restartInstance(instanceId, inst[0].name);
            res.json({ success: true, message: `Instancia ${instanceId} reiniciada. Generando nuevo QR...` });
        } catch (error) {
            console.error('Error al reiniciar instancia:', error);
            res.status(500).json({ success: false, message: 'Error al reiniciar instancia' });
        }
    }

    /**
     * Obtiene todas las instancias del usuario autenticado
     */
    async getInstances(req, res) {
        try {
            const userId = req.user.id;
            const [dbInstances] = await pool.query('SELECT * FROM instances WHERE user_id = ?', [userId]);

            const instances = dbInstances.map(dbInst => {
                const liveStatus = whatsappService.getInstanceStatus(dbInst.instance_id);
                return {
                    id: dbInst.instance_id,
                    name: dbInst.name,
                    status: liveStatus ? liveStatus.status : 'desconectado',
                    phoneNumber: liveStatus ? liveStatus.phoneNumber : dbInst.phone,
                    createdAt: dbInst.createdAt
                };
            });

            res.json({ success: true, instances });
        } catch (error) {
            console.error('Error en getInstances:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Obtiene el estado de una instancia específica
     */
    async getStatus(req, res) {
        const { instanceId } = req.query;
        const userId = req.user.id;

        // Verificar propiedad
        const [inst] = await pool.query('SELECT * FROM instances WHERE instance_id = ? AND user_id = ?', [instanceId, userId]);
        if (inst.length === 0) {
            return res.status(403).json({ success: false, message: 'No tienes acceso a esta instancia' });
        }

        let status = whatsappService.getInstanceStatus(instanceId);

        if (!status) {
            // La instancia no está activa, devolver estado desconectado
            return res.json({
                status: 'disconnected',
                qr: null,
                phoneNumber: inst[0].phone,
                message: 'Instancia no iniciada. Haz clic en "Inicializar" para conectar.'
            });
        }

        // Si se acaba de conectar y no tenemos el teléfono en DB, actualizarlo
        if (status.status === 'connected' && status.phoneNumber && !inst[0].phone) {
            await pool.query('UPDATE instances SET phone = ? WHERE instance_id = ?', [status.phoneNumber, instanceId]);
        }

        res.json({
            status: status.status,
            qr: status.qr,
            qrTimestamp: status.qrTimestamp,
            phoneNumber: status.phoneNumber || inst[0].phone,
            message: 'Estado obtenido correctamente'
        });
    }

    /**
     * Cierra la sesión de una instancia y la elimina
     */
    async logout(req, res) {
        try {
            const { instanceId } = req.body;
            const userId = req.user.id;

            // Verificar propiedad
            const [inst] = await pool.query('SELECT * FROM instances WHERE instance_id = ? AND user_id = ?', [instanceId, userId]);
            if (inst.length === 0) {
                return res.status(403).json({ success: false, message: 'No tienes acceso a esta instancia' });
            }

            const success = await whatsappService.logout(instanceId);

            res.json({ success, message: success ? 'Sesión cerrada correctamente' : 'La sesión ya estaba cerrada' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Elimina una instancia permanentemente (BD y sesión)
     */
    async deleteInstance(req, res) {
        try {
            const { instanceId } = req.body;
            const userId = req.user.id;

            // Verificar propiedad
            const [inst] = await pool.query('SELECT * FROM instances WHERE instance_id = ? AND user_id = ?', [instanceId, userId]);
            if (inst.length === 0) {
                return res.status(403).json({ success: false, message: 'No tienes acceso a esta instancia' });
            }

            await whatsappService.logout(instanceId);
            await pool.query('DELETE FROM instances WHERE instance_id = ?', [instanceId]);

            res.json({ success: true, message: 'Instancia eliminada permanentemente' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * Envía comprobantes electrónicos (habitualmente PDF + XML)
     */
    async sendReceipt(req, res) {
        try {
            const { number, instanceId, files } = req.body;
            const userId = req.user.id;

            if (!number || !instanceId || !files || !Array.isArray(files)) {
                return res.status(400).json({ success: false, message: 'Faltan campos requeridos o formato de files inválido' });
            }

            // Verificar propiedad de la instancia
            const [inst] = await pool.query('SELECT * FROM instances WHERE instance_id = ? AND user_id = ?', [instanceId, userId]);
            if (inst.length === 0) {
                return res.status(403).json({ success: false, message: 'No tienes acceso a esta instancia' });
            }

            const results = await whatsappService.sendReceipt(instanceId, number, files);

            res.json({
                success: true,
                message: `${files.length} documentos enviados correctamente`,
                results
            });
        } catch (error) {
            console.error('Error en sendReceipt:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

export const whatsappController = new WhatsAppController();
